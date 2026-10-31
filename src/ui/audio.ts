// Sound (Phase 7): every sound is made in the browser with WebAudio, so the game ships no
// audio files and needs no sound licences. Sounds sit where they happen: quieter and panned
// the further they are from the middle of the view. The Sound button (top bar) mutes; the
// choice is remembered in this browser.
//   footsteps  the squad, per surface (soft on sand, sharper on road, slab and yard); guards
//              nearby, quieter; crawling is silent
//   gunshots   loud or silenced, the squad's and the guards'
//   alarm      a two-tone siren while the alarm lasts
//   wind       a soft, slowly moving wind under everything (Ran, with the wind streaks)
//   blast, decoy stone, smoke hiss, dog bark, takedown scuffle
// Hebrew team radio needs recorded voices and is not here yet.

import type { GameState, SimEvent } from '@/sim';
import { toScreen } from '@/render/iso';
import type { Rect } from './minimap';

const STORE = 'lw-sound';
const HEAR = 1100; // world px: beyond this from the view's middle, nothing is heard
const STEP_TILES = 0.55;

type Surface = 'sand' | 'hard';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode; timer: number } | null = null;
  private muted: boolean;
  private paused = false;
  private readonly walked = new Map<string, { x: number; y: number; d: number }>();

  /** `view` is the camera's world rectangle (the listener stands in its middle). */
  constructor(private readonly view: () => Rect | null) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORE);
    } catch {
      /* private mode: not remembered */
    }
    this.muted = saved === 'off';
    // browsers start audio only after a user gesture
    const unlock = (): void => {
      this.start();
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(STORE, m ? 'off' : 'on');
    } catch {
      /* not remembered */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  private start(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.wind();
  }

  // ---------- placing a sound ----------

  /** Volume and pan for a sim point, or null when it is out of hearing. */
  private place(x: number, y: number): { vol: number; pan: number } | null {
    const v = this.view();
    if (!v) return null;
    const p = toScreen(x, y);
    const cx = v.x + v.w / 2;
    const cy = v.y + v.h / 2;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d > HEAR) return null;
    const vol = Math.pow(1 - d / HEAR, 1.6);
    return { vol, pan: Math.max(-0.9, Math.min(0.9, (p.x - cx) / (v.w / 2 + 1))) };
  }

  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(this.master!);
    return p;
  }

  /** A filtered noise burst: the base of steps, shots, hisses and thuds. */
  private burst(type: BiquadFilterType, freq: number, q: number, dur: number, gain: number, pan: number, attack = 0.003): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(pan));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** A pitched blip with a fall: thumps, clacks, a bark's voice. */
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, pan: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- the sounds ----------

  private step(surface: Surface, vol: number, pan: number): void {
    if (surface === 'sand') this.burst('lowpass', 650 + Math.random() * 150, 0.7, 0.09, 0.16 * vol, pan, 0.01);
    else {
      this.burst('bandpass', 1700 + Math.random() * 400, 1.4, 0.045, 0.14 * vol, pan);
      this.tone('sine', 180, 90, 0.04, 0.05 * vol, pan);
    }
  }

  private gunshot(loud: boolean, vol: number, pan: number): void {
    if (loud) {
      this.burst('lowpass', 3200, 0.5, 0.35, 0.55 * vol, pan, 0.001);
      this.tone('sine', 140, 45, 0.22, 0.45 * vol, pan);
    } else {
      // a suppressed shot: a short, dull cough
      this.burst('bandpass', 900, 1.2, 0.08, 0.22 * vol, pan, 0.001);
    }
  }

  private wind(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 380;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.028;
    // gusts: a slow wobble on the level and the pitch of the wind
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 0.016;
    lfo.connect(depth).connect(g.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.045;
    const depth2 = ctx.createGain();
    depth2.gain.value = 120;
    lfo2.connect(depth2).connect(f.frequency);
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    lfo.start();
    lfo2.start();
  }

  private sirenOn(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (on && !this.siren) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1600;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.07, ctx.currentTime, 0.2);
      osc.connect(f).connect(gain).connect(this.master!);
      let hi = false;
      const flip = (): void => {
        hi = !hi;
        osc.frequency.setTargetAtTime(hi ? 880 : 620, ctx.currentTime, 0.03);
      };
      flip();
      osc.start();
      this.siren = { osc, gain, timer: window.setInterval(flip, 650) };
    } else if (!on && this.siren) {
      const { osc, gain, timer } = this.siren;
      clearInterval(timer);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      osc.stop(ctx.currentTime + 1.5);
      this.siren = null;
    }
  }

  // ---------- hooks (src/main.ts) ----------

  onEvents(events: SimEvent[], s: GameState): void {
    if (!this.ctx || this.muted) return;
    for (const e of events) {
      switch (e.type) {
        case 'fired': {
          const u = s.squad.find((q) => q.id === e.unit);
          const at = u && this.place(u.x, u.y);
          if (at) this.gunshot(e.loud, at.vol, at.pan);
          break;
        }
        case 'shot': {
          const g = s.guards[e.guard];
          const at = g && this.place(g.x, g.y);
          if (at) this.gunshot(true, at.vol, at.pan);
          break;
        }
        case 'blast': {
          const at = this.place(e.x, e.y) ?? { vol: 0.35, pan: 0 }; // a blast carries
          this.burst('lowpass', 900, 0.4, 1.4, 0.9 * at.vol, at.pan, 0.002);
          this.tone('sine', 90, 28, 1.0, 0.8 * at.vol, at.pan);
          break;
        }
        case 'noise': {
          // the decoy stone lands: two small clacks
          const at = this.place(e.x, e.y);
          if (at) {
            this.tone('square', 1900, 1200, 0.03, 0.08 * at.vol, at.pan);
            setTimeout(() => this.ctx && this.tone('square', 1500, 1000, 0.025, 0.05 * at.vol, at.pan), 90);
          }
          break;
        }
        case 'smoke': {
          const at = this.place(e.x, e.y);
          if (at) this.burst('highpass', 2500, 0.5, 1.6, 0.12 * at.vol, at.pan, 0.15);
          break;
        }
        case 'bark': {
          const at = this.place(e.x, e.y);
          if (at) {
            for (const dt of [0, 160]) {
              setTimeout(() => {
                if (!this.ctx) return;
                this.tone('sawtooth', 520, 260, 0.11, 0.12 * at.vol, at.pan);
                this.burst('bandpass', 900, 2, 0.08, 0.08 * at.vol, at.pan);
              }, dt);
            }
          }
          break;
        }
        case 'takedown': {
          const g = s.guards[e.guard];
          const at = g && this.place(g.x, g.y);
          if (at) {
            this.burst('lowpass', 500, 0.8, 0.25, 0.2 * at.vol, at.pan, 0.02);
            this.tone('sine', 110, 60, 0.18, 0.18 * at.vol, at.pan);
          }
          break;
        }
        case 'alarmRaised':
          this.sirenOn(true);
          break;
        case 'alarmCleared':
          this.sirenOn(false);
          break;
        case 'gameOver':
          this.sirenOn(false);
          break;
      }
    }
  }

  onFrame(s: GameState, paused: boolean): void {
    if (!this.ctx) return;
    if (paused !== this.paused) {
      this.paused = paused;
      void (paused ? this.ctx.suspend() : this.ctx.resume());
    }
    if (paused || this.muted) return;
    if (!s.alarm.active && this.siren) this.sirenOn(false);
    if (s.alarm.active && !this.siren && !s.over) this.sirenOn(true);
    const walkers: { key: string; x: number; y: number; quiet: number }[] = [];
    for (const u of s.squad) if (u.alive && !u.crawl) walkers.push({ key: u.id, x: u.x, y: u.y, quiet: 1 });
    for (const g of s.guards) if (g.state !== 'down' && g.role !== 'dog') walkers.push({ key: `g${g.i}`, x: g.x, y: g.y, quiet: 0.6 });
    for (const w of walkers) {
      const last = this.walked.get(w.key);
      if (!last) {
        this.walked.set(w.key, { x: w.x, y: w.y, d: 0 });
        continue;
      }
      const moved = Math.hypot(w.x - last.x, w.y - last.y);
      last.x = w.x;
      last.y = w.y;
      if (moved > 1) continue; // a jump (restart), not a step
      last.d += moved;
      if (last.d < STEP_TILES) continue;
      last.d = 0;
      const at = this.place(w.x, w.y);
      if (!at) continue;
      const tx = Math.floor(w.x);
      const ty = Math.floor(w.y);
      const deco = tx >= 0 && ty >= 0 && tx < s.grid.cols && ty < s.grid.rows ? s.grid.deco[ty * s.grid.cols + tx] : 0;
      this.step(deco === 0 ? 'sand' : 'hard', at.vol * w.quiet, at.pan);
    }
  }
}
