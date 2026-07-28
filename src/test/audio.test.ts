import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AREA_TRACKS,
  DEFAULT_TRACK,
  STARTING_TRACKS,
  TRACK_NAMES,
  areaAt,
  track,
  trackExists,
} from '../client/audio/tracks.ts';
import { getWorld } from '../shared/world/index.ts';

/**
 * The track compiler is pure data work with no WebAudio in sight, which is
 * deliberate: it means the music can be tested in node, and only the thin
 * oscillator layer needs a browser.
 */
describe('music tracks', () => {
  it('lists tracks and compiles every one', () => {
    assert.ok(TRACK_NAMES.length >= 8, `expected a decent playlist, got ${TRACK_NAMES.length}`);
    for (const name of TRACK_NAMES) {
      const compiled = track(name);
      assert.ok(compiled, `${name} did not compile`);
      assert.ok(compiled.notes.length > 0, `${name} compiled to silence`);
      assert.ok(compiled.bpm >= 40 && compiled.bpm <= 200, `${name} has an implausible tempo ${compiled.bpm}`);
      assert.equal(compiled.loopBeats % 4, 0, `${name} does not loop on a bar boundary`);
    }
  });

  it('caches the compiled result', () => {
    assert.equal(track(TRACK_NAMES[0]), track(TRACK_NAMES[0]));
  });

  it('keeps every note inside the loop, in order, and audible', () => {
    for (const name of TRACK_NAMES) {
      const compiled = track(name)!;
      let last = -1;
      for (const note of compiled.notes) {
        assert.ok(note.beat >= 0 && note.beat < compiled.loopBeats, `${name}: note at beat ${note.beat} is outside the loop`);
        assert.ok(note.beat >= last, `${name}: notes are not sorted by beat`);
        last = note.beat;
        assert.ok(note.beats > 0, `${name}: note at beat ${note.beat} has no length`);
        assert.ok(note.gain > 0 && note.gain <= 1, `${name}: note gain ${note.gain} is out of range`);
        // Everything should land inside the range of a piano.
        assert.ok(note.freq > 20 && note.freq < 5000, `${name}: note frequency ${note.freq} is out of range`);
      }
    }
  });

  it('has no unknown track names in the area map', () => {
    for (const [area, name] of Object.entries(AREA_TRACKS)) {
      assert.ok(trackExists(name), `area ${area} maps to unknown track ${name}`);
    }
    assert.ok(trackExists(DEFAULT_TRACK), `the default track ${DEFAULT_TRACK} does not exist`);
    for (const name of STARTING_TRACKS) assert.ok(trackExists(name), `starting track ${name} does not exist`);
  });

  /**
   * The regression worth guarding: a typo here does not throw, the music just
   * silently never changes when you walk into the area.
   */
  it('covers every named area in the world', () => {
    const areas = getWorld().map.areas.map((a) => a.name);
    for (const name of areas) {
      assert.ok(AREA_TRACKS[name], `world area "${name}" has no music assigned`);
    }
    for (const key of Object.keys(AREA_TRACKS)) {
      assert.ok(areas.includes(key), `AREA_TRACKS names "${key}", which is not an area in the world`);
    }
  });

  it('resolves the area under a tile', () => {
    const areas = getWorld().map.areas;
    const lumbridge = areas.find((a) => a.name === 'Lumbridge')!;
    assert.equal(areaAt(areas, lumbridge.x + 1, lumbridge.y + 1), 'Lumbridge');
    // Just outside the top-right corner is outside the rectangle.
    assert.notEqual(areaAt(areas, lumbridge.x + lumbridge.w, lumbridge.y + lumbridge.h), 'Lumbridge');
    assert.equal(areaAt(areas, -5000, -5000), null);
  });

  it('rejects unknown tracks', () => {
    assert.equal(track('Not A Track'), null);
    assert.equal(trackExists('Not A Track'), false);
  });
});
