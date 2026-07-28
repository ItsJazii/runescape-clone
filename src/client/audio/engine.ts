/**
 * Procedural audio. There are no sound files: every instrument and effect is
 * synthesised from oscillators and filtered noise at runtime, the same way the
 * item icons, character models and the world itself are generated rather than
 * shipped as assets.
 *
 * Browsers refuse to start an AudioContext until the user has interacted with
 * the page, so nothing exists until `start()` is called from a real gesture -
 * the login button click.
 */

import type { CompiledTrack } from './tracks.ts';

/** Timbres the sequencer can address. */
export type Instrument = 'pluck' | 'flute' | 'strings' | 'bass' | 'bell' | 'drum';

export interface CompiledNote {
  /** Offset from the start of the loop, in beats. */
  beat: number;
  instrument: Instrument;
  freq: number;
  /** Length in beats. */
  beats: number;
  gain: number;
}

/** How far ahead of the clock notes are scheduled, in seconds. */
const LOOKAHEAD = 0.5;

/** Seconds to fade the old track out / new track in when the area changes. */
const CROSSFADE = 1.5;

/** Identical effects closer together than this are dropped as duplicates. */
const SFX_DEBOUNCE = 0.05;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  musicVolume = 0.45;
  sfxVolume = 0.7;
  musicEnabled = true;
  sfxEnabled = true;

  private track: CompiledTrack | null = null;
  private trackName: string | null = null;
  /** Context time the current loop iteration started at. */
  private loopStart = 0;
  private noteIndex = 0;
  private readonly lastPlayed = new Map<string, number>();

  get ready(): boolean {
    return this.ctx !== null;
  }

  get playing(): string | null {
    return this.trackName;
  }

  /** Must be called from a user gesture, or the context stays suspended. */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicEnabled ? this.musicVolume : 0;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxEnabled ? this.sfxVolume : 0;
    this.sfxBus.connect(this.master);

    // One second of white noise, reused by every percussive effect.
    const frames = Math.floor(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicBus && this.musicEnabled) this.musicBus.gain.value = this.musicVolume;
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxBus && this.sfxEnabled) this.sfxBus.gain.value = this.sfxVolume;
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    if (this.musicBus) this.musicBus.gain.value = on ? this.musicVolume : 0;
    if (!on) this.stopTrack();
  }

  setSfxEnabled(on: boolean): void {
    this.sfxEnabled = on;
    if (this.sfxBus) this.sfxBus.gain.value = on ? this.sfxVolume : 0;
  }

  /* ---------------------------------------------------------------- */
  /* Music                                                             */
  /* ---------------------------------------------------------------- */

  playTrack(name: string, track: CompiledTrack): void {
    if (!this.ctx || !this.musicEnabled) return;
    if (this.trackName === name) return;
    const ctx = this.ctx;
    this.track = track;
    this.trackName = name;
    this.noteIndex = 0;
    this.loopStart = ctx.currentTime + 0.08;
    // Fade in rather than punching in mid-phrase.
    if (this.musicBus) {
      const g = this.musicBus.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(0, ctx.currentTime);
      g.linearRampToValueAtTime(this.musicVolume, ctx.currentTime + CROSSFADE);
    }
  }

  stopTrack(): void {
    this.track = null;
    this.trackName = null;
  }

  /**
   * Pumps the scheduler. Called once per frame: everything due inside the
   * lookahead window is handed to the WebAudio clock, which is sample accurate
   * and so immune to frame-rate jitter.
   */
  update(): void {
    const ctx = this.ctx;
    const track = this.track;
    if (!ctx || !track || track.notes.length === 0 || !this.musicEnabled) return;
    const spb = 60 / track.bpm;
    const loopSeconds = track.loopBeats * spb;
    const horizon = ctx.currentTime + LOOKAHEAD;

    // Bounded so a long stall (a backgrounded tab) cannot spin here.
    for (let guard = 0; guard < 512; guard++) {
      const note = track.notes[this.noteIndex];
      if (!note) {
        this.noteIndex = 0;
        this.loopStart += loopSeconds;
        continue;
      }
      const at = this.loopStart + note.beat * spb;
      if (at > horizon) return;
      // Skip anything already well in the past instead of dumping the whole
      // backlog at once when the tab regains focus.
      if (at > ctx.currentTime - 0.25) this.voice(note, at, spb);
      this.noteIndex++;
    }
  }

  private voice(note: CompiledNote, at: number, spb: number): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const dur = Math.max(0.05, note.beats * spb);
    const gain = ctx.createGain();
    gain.connect(bus);

    switch (note.instrument) {
      case 'pluck': {
        // Harp/lute: bright attack, exponential decay, no sustain.
        const body = Math.min(dur * 1.6, 0.9);
        this.envelope(gain, at, note.gain, 0.004, body, 0);
        this.osc('triangle', note.freq, at, body, gain);
        this.osc('triangle', note.freq * 2, at, body * 0.5, gain, 0.28);
        break;
      }
      case 'flute': {
        const hold = dur * 0.92;
        this.envelope(gain, at, note.gain, 0.07, hold, 0.12);
        this.osc('sine', note.freq, at, hold + 0.12, gain);
        // A touch detuned so the tone breathes rather than sitting dead still.
        this.osc('sine', note.freq * 1.004, at, hold + 0.12, gain, 0.5);
        break;
      }
      case 'strings': {
        const hold = dur * 0.98;
        this.envelope(gain, at, note.gain, 0.16, hold, 0.3);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1400;
        filter.connect(gain);
        this.osc('sawtooth', note.freq, at, hold + 0.3, filter, 0.5);
        this.osc('sawtooth', note.freq * 0.997, at, hold + 0.3, filter, 0.4);
        break;
      }
      case 'bass': {
        const body = Math.min(dur * 1.1, 1.4);
        this.envelope(gain, at, note.gain, 0.012, body, 0.06);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        filter.connect(gain);
        this.osc('triangle', note.freq, at, body, filter);
        this.osc('square', note.freq, at, body, filter, 0.18);
        break;
      }
      case 'bell': {
        const body = Math.min(dur * 2.2, 1.8);
        this.envelope(gain, at, note.gain, 0.004, body, 0);
        this.osc('sine', note.freq, at, body, gain);
        // 2.76x is the first inharmonic partial of a struck bell.
        this.osc('sine', note.freq * 2.76, at, body * 0.6, gain, 0.22);
        break;
      }
      case 'drum': {
        this.envelope(gain, at, note.gain, 0.002, 0.09, 0);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = note.freq;
        filter.Q.value = 0.8;
        filter.connect(gain);
        this.burst(at, 0.09, filter);
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sound effects                                                     */
  /* ---------------------------------------------------------------- */

  sfx(name: string): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || !this.sfxEnabled) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < SFX_DEBOUNCE) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'hit':
        this.thump(now, 150, 0.09, 0.7);
        this.noiseHit(now, 'lowpass', 900, 0.07, 0.4);
        break;
      case 'block':
        this.noiseHit(now, 'bandpass', 2600, 0.06, 0.35);
        break;
      case 'chop':
        this.noiseHit(now, 'bandpass', 420, 0.07, 0.5);
        this.thump(now + 0.01, 190, 0.07, 0.3);
        break;
      case 'mine':
        this.noiseHit(now, 'bandpass', 3200, 0.05, 0.4);
        this.ring(now, 1750, 0.22, 0.18);
        break;
      case 'fishnet':
      case 'fishrod':
        this.splash(now);
        break;
      case 'firemaking':
        // A handful of crackles rather than one hit.
        for (let i = 0; i < 6; i++) this.noiseHit(now + i * 0.055, 'bandpass', 1400 + i * 320, 0.035, 0.22);
        break;
      case 'cook':
        this.noiseHit(now, 'lowpass', 2600, 0.45, 0.16);
        break;
      case 'smith':
        this.ring(now, 950, 0.5, 0.3);
        this.ring(now, 1430, 0.35, 0.16);
        this.noiseHit(now, 'bandpass', 3600, 0.05, 0.3);
        break;
      case 'craft':
      case 'bury':
        this.noiseHit(now, 'lowpass', 700, 0.09, 0.3);
        break;
      case 'pickup':
        this.blip(now, 620, 900, 0.09, 0.28);
        break;
      case 'eat':
        this.noiseHit(now, 'bandpass', 1100, 0.06, 0.35);
        this.noiseHit(now + 0.12, 'bandpass', 900, 0.06, 0.3);
        break;
      case 'coins':
        for (let i = 0; i < 3; i++) this.ring(now + i * 0.045, 2200 + i * 480, 0.14, 0.14);
        break;
      case 'pray':
        this.ring(now, 880, 1.1, 0.2);
        this.ring(now, 1320, 0.9, 0.1);
        break;
      case 'cast':
        this.sweep(now, 260, 1500, 0.28, 0.22, 'sawtooth');
        break;
      case 'teleport':
        this.sweep(now, 200, 2200, 0.6, 0.22, 'triangle');
        this.ring(now + 0.25, 1760, 0.7, 0.14);
        break;
      case 'death':
        this.sweep(now, 420, 90, 0.7, 0.28, 'sawtooth');
        break;
      case 'levelup':
        // Rising arpeggio, the one moment worth a fanfare.
        [0, 4, 7, 12].forEach((semi, i) => this.ring(now + i * 0.11, 523.25 * Math.pow(2, semi / 12), 0.7, 0.22));
        break;
      case 'door':
        this.creak(now);
        break;
      default:
        this.blip(now, 440, 560, 0.08, 0.2);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Synthesis primitives                                              */
  /* ---------------------------------------------------------------- */

  private osc(
    type: OscillatorType,
    freq: number,
    at: number,
    dur: number,
    dest: AudioNode,
    level = 1,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (level === 1) {
      osc.connect(dest);
    } else {
      const trim = ctx.createGain();
      trim.gain.value = level;
      trim.connect(dest);
      osc.connect(trim);
    }
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** Attack / hold / release shape on a gain node. */
  private envelope(gain: GainNode, at: number, peak: number, attack: number, hold: number, release: number): void {
    const g = gain.gain;
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    if (release > 0) {
      g.setValueAtTime(Math.max(0.0002, peak), at + attack + hold);
      g.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    } else {
      g.exponentialRampToValueAtTime(0.0001, at + attack + hold);
    }
  }

  private burst(at: number, dur: number, dest: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.connect(dest);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.01);
  }

  private noiseHit(at: number, type: BiquadFilterType, freq: number, dur: number, level: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const gain = ctx.createGain();
    gain.connect(bus);
    this.envelope(gain, at, level, 0.002, dur, 0);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = type === 'bandpass' ? 1.4 : 0.7;
    filter.connect(gain);
    this.burst(at, dur, filter);
  }

  /** Pitched thud: a sine whose frequency drops away, i.e. a drum. */
  private thump(at: number, freq: number, dur: number, level: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const gain = ctx.createGain();
    gain.connect(bus);
    this.envelope(gain, at, level, 0.002, dur, 0);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, at + dur);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** Struck metal: sine pair with a long decay. */
  private ring(at: number, freq: number, dur: number, level: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const gain = ctx.createGain();
    gain.connect(bus);
    this.envelope(gain, at, level, 0.003, dur, 0);
    this.osc('sine', freq, at, dur, gain);
    this.osc('sine', freq * 2.4, at, dur * 0.5, gain, 0.2);
  }

  private blip(at: number, from: number, to: number, dur: number, level: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const gain = ctx.createGain();
    gain.connect(bus);
    this.envelope(gain, at, level, 0.004, dur, 0);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.linearRampToValueAtTime(to, at + dur);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private sweep(at: number, from: number, to: number, dur: number, level: number, type: OscillatorType): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const gain = ctx.createGain();
    gain.connect(bus);
    this.envelope(gain, at, level, 0.02, dur * 0.7, dur * 0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    filter.connect(gain);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    osc.connect(filter);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  /** Wood swinging on a dry hinge: low buzz with a wobbling pitch. */
  private creak(at: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const gain = ctx.createGain();
    gain.connect(bus);
    this.envelope(gain, at, 0.2, 0.03, 0.34, 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 320;
    filter.Q.value = 6;
    filter.connect(gain);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, at);
    osc.frequency.linearRampToValueAtTime(128, at + 0.3);
    osc.connect(filter);
    osc.start(at);
    osc.stop(at + 0.45);
    this.burst(at, 0.3, filter);
  }

  private splash(at: number): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const gain = ctx.createGain();
    gain.connect(bus);
    this.envelope(gain, at, 0.32, 0.005, 0.3, 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3800, at);
    filter.frequency.exponentialRampToValueAtTime(420, at + 0.32);
    filter.connect(gain);
    this.burst(at, 0.4, filter);
  }
}
