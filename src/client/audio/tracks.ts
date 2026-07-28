/**
 * The music. Each track is written as a key, a chord progression and a melody
 * in scale degrees rather than as a raw list of notes, and a small compiler
 * turns that into the bass line, pad, arpeggio and lead the sequencer plays.
 * Writing it this way keeps the data readable and the harmony consistent - the
 * accompaniment cannot drift out of the key it was written in.
 *
 * The titles are the ones the music player already listed; the music itself is
 * original, since RuneScape's own recordings are not ours to ship.
 */

import type { CompiledNote, Instrument } from './engine.ts';

export interface CompiledTrack {
  bpm: number;
  /** Length of one loop in beats. */
  loopBeats: number;
  /** Sorted by beat, so the scheduler can walk it in order. */
  notes: CompiledNote[];
}

/** A melody note: beat offset from the start of the loop, degree, length. */
type MelodyNote = [beat: number, degree: number, beats: number];

interface TrackDef {
  bpm: number;
  /** MIDI note of the tonic. 60 is middle C. */
  root: number;
  /** Semitone offsets of the scale, low to high. */
  scale: number[];
  /** Chord root for each bar, as a scale degree. One entry per 4/4 bar. */
  progression: number[];
  melody: MelodyNote[];
  lead: Instrument;
  pad: Instrument;
  /** Arpeggio note length in beats; 0 leaves the arpeggio out. */
  arp: number;
  drums: boolean;
  /** Overall level, for tracks that want to sit back. */
  level?: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
/** Double harmonic, the "Arabian" sound used for Al Kharid. */
const HIJAZ = [0, 1, 4, 5, 7, 8, 11];

const BEATS_PER_BAR = 4;

const TRACK_DEFS: Record<string, TrackDef> = {
  /* Lumbridge: the theme you hear the most, so it stays gentle and diatonic. */
  Harmony: {
    bpm: 84,
    root: 60,
    scale: MAJOR,
    progression: [0, 5, 3, 4, 0, 5, 4, 0],
    melody: [
      [0, 4, 1], [1, 2, 1], [2, 0, 2],
      [4, 2, 1], [5, 4, 1], [6, 5, 2],
      [8, 4, 1], [9, 3, 1], [10, 2, 2],
      [12, 1, 1], [13, 2, 1], [14, 4, 2],
      [16, 7, 1], [17, 6, 1], [18, 4, 2],
      [20, 5, 1], [21, 4, 1], [22, 2, 2],
      [24, 4, 1], [25, 5, 1], [26, 7, 2],
      [28, 4, 2], [30, 0, 2],
    ],
    lead: 'flute',
    pad: 'strings',
    arp: 1,
    drums: false,
  },

  /* The tune a brand new account starts on: short, bright, unthreatening. */
  'Newbie Melody': {
    bpm: 96,
    root: 65,
    scale: MAJOR,
    progression: [0, 3, 4, 0],
    melody: [
      [0, 0, 1], [1, 2, 1], [2, 4, 2],
      [4, 3, 1], [5, 2, 1], [6, 0, 2],
      [8, 4, 1], [9, 5, 1], [10, 4, 1], [11, 2, 1],
      [12, 1, 1], [13, 0, 3],
    ],
    lead: 'pluck',
    pad: 'strings',
    arp: 0.5,
    drums: false,
  },

  /* Open road: marching, and the only track with a real drum pattern. */
  Adventure: {
    bpm: 104,
    root: 62,
    scale: MINOR,
    progression: [0, 0, 5, 5, 3, 4, 0, 0],
    melody: [
      [0, 0, 1], [1, 4, 1], [2, 7, 2],
      [4, 6, 1], [5, 4, 1], [6, 2, 2],
      [8, 4, 1], [9, 5, 1], [10, 7, 1], [11, 9, 1],
      [12, 7, 2], [14, 4, 2],
      [16, 2, 1], [17, 4, 1], [18, 5, 2],
      [20, 4, 1], [21, 2, 1], [22, 0, 2],
      [24, 7, 1], [25, 6, 1], [26, 4, 1], [27, 2, 1],
      [28, 4, 2], [30, 0, 2],
    ],
    lead: 'strings',
    pad: 'strings',
    arp: 0.5,
    drums: true,
  },

  /* Draynor: wistful, dorian so it never quite settles into plain minor. */
  'Autumn Voyage': {
    bpm: 76,
    root: 57,
    scale: DORIAN,
    progression: [0, 3, 6, 4, 0, 3, 4, 0],
    melody: [
      [0, 4, 2], [2, 2, 2],
      [4, 0, 2], [6, 2, 2],
      [8, 5, 2], [10, 4, 2],
      [12, 2, 3], [15, 1, 1],
      [16, 0, 2], [18, 4, 2],
      [20, 6, 2], [22, 4, 2],
      [24, 2, 2], [26, 1, 2],
      [28, 2, 2], [30, 0, 2],
    ],
    lead: 'flute',
    pad: 'strings',
    arp: 1,
    drums: false,
  },

  /* Draynor Manor: slow, bells, and a flat sixth to keep it uneasy. */
  Yesteryear: {
    bpm: 60,
    root: 50,
    scale: MINOR,
    progression: [0, 0, 5, 5, 1, 1, 4, 0],
    melody: [
      [0, 0, 3], [3, 1, 1],
      [4, 2, 2], [6, 0, 2],
      [8, 5, 3], [11, 4, 1],
      [12, 2, 4],
      [16, 1, 2], [18, 0, 2],
      [20, 4, 2], [22, 2, 2],
      [24, 5, 2], [26, 4, 2],
      [28, 2, 2], [30, 0, 2],
    ],
    lead: 'bell',
    pad: 'strings',
    arp: 0,
    drums: false,
    level: 0.85,
  },

  /* Wizards' Tower: lydian, so the raised fourth does the magic. */
  'Book of Spells': {
    bpm: 72,
    root: 64,
    scale: LYDIAN,
    progression: [0, 4, 3, 0, 5, 4, 3, 0],
    melody: [
      [0, 0, 2], [2, 3, 2],
      [4, 4, 2], [6, 6, 2],
      [8, 7, 2], [10, 4, 2],
      [12, 3, 2], [14, 0, 2],
      [16, 4, 1], [17, 6, 1], [18, 7, 2],
      [20, 9, 2], [22, 7, 2],
      [24, 6, 2], [26, 4, 2],
      [28, 3, 2], [30, 0, 2],
    ],
    lead: 'bell',
    pad: 'strings',
    arp: 0.5,
    drums: false,
  },

  /* Al Kharid: double harmonic scale and a hand-drum pulse. */
  'Al Kharid': {
    bpm: 92,
    root: 62,
    scale: HIJAZ,
    progression: [0, 0, 4, 4, 0, 3, 4, 0],
    melody: [
      [0, 0, 1], [1, 1, 1], [2, 2, 1], [3, 1, 1],
      [4, 0, 2], [6, 4, 2],
      [8, 5, 1], [9, 4, 1], [10, 2, 2],
      [12, 1, 1], [13, 2, 1], [14, 0, 2],
      [16, 7, 1], [17, 6, 1], [18, 5, 2],
      [20, 4, 1], [21, 2, 1], [22, 1, 2],
      [24, 2, 1], [25, 4, 1], [26, 5, 2],
      [28, 2, 2], [30, 0, 2],
    ],
    lead: 'pluck',
    pad: 'strings',
    arp: 0.5,
    drums: true,
  },

  /* Mines and caves: almost no melody, just weight. */
  'Deep Below': {
    bpm: 58,
    root: 48,
    scale: MINOR,
    progression: [0, 0, 4, 4, 5, 5, 0, 0],
    melody: [
      [0, 0, 4],
      [8, 4, 4],
      [16, 5, 4],
      [24, 2, 2], [26, 0, 6],
    ],
    lead: 'strings',
    pad: 'strings',
    arp: 0,
    drums: false,
    level: 0.8,
  },

  /* Jaunty, quick, and the one that sounds like a shanty. */
  'Sea Shanty 2': {
    bpm: 112,
    root: 67,
    scale: MAJOR,
    progression: [0, 4, 0, 4, 3, 0, 4, 0],
    melody: [
      [0, 0, 1], [1, 0, 1], [2, 2, 1], [3, 4, 1],
      [4, 2, 1], [5, 4, 1], [6, 5, 2],
      [8, 4, 1], [9, 2, 1], [10, 0, 1], [11, 2, 1],
      [12, 4, 2], [14, 2, 2],
      [16, 5, 1], [17, 4, 1], [18, 2, 1], [19, 4, 1],
      [20, 5, 1], [21, 7, 1], [22, 5, 2],
      [24, 4, 1], [25, 2, 1], [26, 4, 1], [27, 5, 1],
      [28, 4, 2], [30, 0, 2],
    ],
    lead: 'pluck',
    pad: 'strings',
    arp: 0.5,
    drums: true,
  },

  /* The swamp: an arpeggio study, barely any tune at all. */
  'Lumbridge Arpeggio': {
    bpm: 88,
    root: 57,
    scale: MINOR,
    progression: [0, 3, 4, 0],
    melody: [
      [0, 7, 2], [2, 4, 2],
      [4, 5, 2], [6, 2, 2],
      [8, 4, 2], [10, 6, 2],
      [12, 2, 2], [14, 0, 2],
    ],
    lead: 'flute',
    pad: 'strings',
    arp: 0.5,
    drums: false,
    level: 0.9,
  },
};

/**
 * Which track plays in each of the world's named areas. Areas come from
 * `namedAreas()` in the world builder, so the keys must match those names.
 */
export const AREA_TRACKS: Record<string, string> = {
  Lumbridge: 'Harmony',
  'Lumbridge Swamp': 'Lumbridge Arpeggio',
  'Al Kharid': 'Al Kharid',
  'Al Kharid Mine': 'Deep Below',
  'Draynor Village': 'Autumn Voyage',
  'Draynor Manor': 'Yesteryear',
  "Wizards' Tower": 'Book of Spells',
  'Lumbridge Swamp Caves': 'Deep Below',
  'The Wilderness Road': 'Adventure',
};

/** Played anywhere that is not inside a named area. */
export const DEFAULT_TRACK = 'Adventure';

/** Available from the first login; the rest unlock by visiting their area. */
export const STARTING_TRACKS = ['Newbie Melody', 'Sea Shanty 2', DEFAULT_TRACK];

/** Track names in the order the music player lists them. */
export const TRACK_NAMES = Object.keys(TRACK_DEFS).sort((a, b) => a.localeCompare(b));

export function trackExists(name: string): boolean {
  return name in TRACK_DEFS;
}

/* ------------------------------------------------------------------ */
/* Compiler                                                            */
/* ------------------------------------------------------------------ */

function midiOfDegree(root: number, scale: number[], degree: number): number {
  const n = scale.length;
  const octave = Math.floor(degree / n);
  return root + octave * 12 + scale[degree - octave * n];
}

function freqOfDegree(root: number, scale: number[], degree: number): number {
  return 440 * Math.pow(2, (midiOfDegree(root, scale, degree) - 69) / 12);
}

const compiled = new Map<string, CompiledTrack>();

/** Compiles (once) and returns a track, or null if the name is unknown. */
export function track(name: string): CompiledTrack | null {
  const cached = compiled.get(name);
  if (cached) return cached;
  const def = TRACK_DEFS[name];
  if (!def) return null;

  const level = def.level ?? 1;
  const notes: CompiledNote[] = [];
  const add = (beat: number, instrument: Instrument, degree: number, beats: number, gain: number) => {
    notes.push({ beat, instrument, freq: freqOfDegree(def.root, def.scale, degree), beats, gain: gain * level });
  };

  def.progression.forEach((chordRoot, bar) => {
    const barStart = bar * BEATS_PER_BAR;
    // Triad built by stacking scale degrees, so it is diatonic by construction.
    const triad = [chordRoot, chordRoot + 2, chordRoot + 4];

    // Bass: root on beat 1, fifth on beat 3, an octave and a half down.
    add(barStart, 'bass', chordRoot - 14, 2, 0.5);
    add(barStart + 2, 'bass', triad[2] - 14, 2, 0.38);

    // Pad: the triad held under the whole bar.
    for (const degree of triad) add(barStart, def.pad, degree - 7, BEATS_PER_BAR, 0.1);

    // Arpeggio: chord tones cycling for the length of the bar.
    if (def.arp > 0) {
      const steps = Math.round(BEATS_PER_BAR / def.arp);
      for (let i = 0; i < steps; i++) {
        const degree = triad[i % triad.length] + (i >= triad.length * 2 ? 7 : 0);
        add(barStart + i * def.arp, 'pluck', degree, def.arp, 0.14);
      }
    }

    if (def.drums) {
      add(barStart, 'drum', 0, 0.25, 0.3);
      add(barStart + 1.5, 'drum', 14, 0.25, 0.16);
      add(barStart + 2, 'drum', 7, 0.25, 0.22);
      add(barStart + 3, 'drum', 14, 0.25, 0.16);
    }
  });

  for (const [beat, degree, beats] of def.melody) add(beat, def.lead, degree + 7, beats, 0.3);

  notes.sort((a, b) => a.beat - b.beat);
  const result: CompiledTrack = {
    bpm: def.bpm,
    loopBeats: def.progression.length * BEATS_PER_BAR,
    notes,
  };
  compiled.set(name, result);
  return result;
}

/** The named area containing a tile, or null out in the open. */
export function areaAt(
  areas: { name: string; x: number; y: number; w: number; h: number }[],
  x: number,
  y: number,
): string | null {
  for (const area of areas) {
    if (x >= area.x && y >= area.y && x < area.x + area.w && y < area.y + area.h) return area.name;
  }
  return null;
}
