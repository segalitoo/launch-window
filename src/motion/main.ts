// Motion library: every unit animation and interaction on one page, for review.
// Plays at game speed under the night grades, using the game's own frame choice
// (src/render/unitAnim.ts), so a card shows exactly what the game would show.

import {
  CARRY_OFFSET,
  CRAWL_MULT,
  DRAG_MULT,
  DUR_DOOR,
  HIT_FLASH,
  SPEED_COMBAT,
  SPEED_LURE,
  SPEED_PATROL,
  SPEED_SAPPER,
  SPEED_SHADOW,
  TAKEDOWN_REACH,
  TAKEDOWN_SIDE,
  THROW_BUSY,
} from '@/sim';
import { toScreen } from '@/render/iso';
import { type AnimState, draggedFrameName, frameName, guardFrameName, ONE_SHOT, TAKEDOWN_IMPACT } from '@/render/unitAnim';
import './motion.css';

const NIGHT = [0.36, 0.43, 0.6];
const UNIT_GRADE = [0.62, 0.68, 0.82];
const D45 = Math.PI / 4;

// ---------- atlases ----------

interface AtlasFrame {
  page: number;
  frame: { x: number; y: number; w: number; h: number };
  sss: { x: number; y: number };
}
interface Atlas {
  frames: Map<string, AtlasFrame>;
  pages: HTMLCanvasElement[]; // graded with the unit tint
  anchor: [number, number];
  ss: number;
  anims: Record<string, number>;
  sources: Record<string, string>;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = fail;
    im.src = src;
  });

/** Multiplies an image by an RGB tint, keeping its alpha (what Phaser's setTint does). */
function graded(im: HTMLImageElement, tint: number[], keepAlpha: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const g = c.getContext('2d')!;
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${tint.map((v) => Math.round(v * 255)).join(',')})`;
  g.fillRect(0, 0, c.width, c.height);
  if (keepAlpha) {
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(im, 0, 0);
  }
  return c;
}

async function loadAtlas(name: string): Promise<Atlas> {
  const json = await (await fetch(`units/${name}.json`)).json();
  const frames = new Map<string, AtlasFrame>();
  const pages: HTMLCanvasElement[] = [];
  for (const [i, tex] of json.textures.entries()) {
    pages.push(graded(await loadImage(`units/${tex.image}`), UNIT_GRADE, true));
    for (const f of tex.frames) frames.set(f.filename, { page: i, frame: f.frame, sss: f.spriteSourceSize });
  }
  const u = json.meta.unit;
  return { frames, pages, anchor: u.anchor, ss: u.supersample, anims: u.anims, sources: u.sources ?? {} };
}

// ---------- a card: one animation or interaction ----------

/** Something to draw: a frame of an atlas standing at a sim position (tiles). */
interface Sprite {
  atlas: Atlas;
  frame: string;
  x: number;
  y: number;
  shadow?: boolean;
}

interface Card {
  group: string;
  name: string;
  note: string;
  /** Animations whose source the card shows. */
  shows: [Atlas, string][];
  sprites(t: number, dir: number): Sprite[];
}

const W = 170; // card size in world px at 1x
const H = 96;

function drawCard(ctx: CanvasRenderingContext2D, ground: HTMLCanvasElement, card: Card, t: number, dir: number, zoom: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  // ground: a patch of the painted yard at the game's scale (painting is 2x)
  ctx.drawImage(ground, 520, 560, W * 2, H * 2, 0, 0, W * zoom, H * zoom);
  // world origin at the card's centre, a little low
  ctx.setTransform(zoom, 0, 0, zoom, W * zoom * 0.5, H * zoom * 0.7);
  const list = card.sprites(t, dir).sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const s of list) {
    const p = toScreen(s.x, s.y);
    if (s.shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x + 1, p.y + 0.5, 11, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const f = s.atlas.frames.get(s.frame);
    if (!f) continue;
    const k = 1 / s.atlas.ss;
    const dx = p.x + (f.sss.x - s.atlas.anchor[0] * s.atlas.ss) * k;
    const dy = p.y + (f.sss.y - s.atlas.anchor[1] * s.atlas.ss) * k;
    ctx.drawImage(s.atlas.pages[f.page]!, f.frame.x, f.frame.y, f.frame.w, f.frame.h, dx, dy, f.frame.w * k, f.frame.h * k);
  }
}

// ---------- the library ----------

function cards(yoav: Atlas, noa: Atlas, itai: Atlas, guard: Atlas): Card[] {
  const base: AnimState = {
    ang: 0, alive: true, crawl: false, moving: false, carrying: false, walked: 0,
    t: 0, diedAt: null, takedownAt: null, grabAt: null, hitT: 0,
  };
  const y = (s: Partial<AnimState>): string => frameName({ ...base, ...s }, yoav.anims);
  const ang = (dir: number): number => dir * D45;
  /** One-shot timeline: wait, play, hold, repeat. */
  const loop = (t: number, len: number): number => t % (0.5 + len + 1.3);
  const unit = (atlas: Atlas, frame: string, x = 0, yy = 0, shadow = true): Sprite => ({ atlas, frame, x, y: yy, shadow });
  const ahead = (dir: number, d: number): [number, number] => [Math.cos(ang(dir)) * d, Math.sin(ang(dir)) * d];
  const gf = (s: Partial<Parameters<typeof guardFrameName>[0]>): string =>
    guardFrameName({ ang: 0, down: false, moving: false, running: false, walked: 0, t: 0, downAt: null, ...s }, guard.anims);

  const run = SPEED_SHADOW;
  /** The moves every operator has: idle, run, crawl, death. */
  const squad = (group: string, a: Atlas, speed: number, kit: string): Card[] => {
    const f = (st: Partial<AnimState>): string => frameName({ ...base, ...st }, a.anims);
    return [
      { group, name: 'Idle', note: kit, shows: [[a, 'idle']], sprites: (t, d) => [unit(a, f({ ang: ang(d), t }))] },
      { group, name: 'Run', note: `Normal move, ${speed.toFixed(1)} tiles/s.`, shows: [[a, 'run']],
        sprites: (t, d) => [unit(a, f({ ang: ang(d), moving: true, walked: t * speed }))] },
      { group, name: 'Crawl', note: `C, ${(speed * CRAWL_MULT).toFixed(1)} tiles/s.`, shows: [[a, 'crawl']],
        sprites: (t, d) => [unit(a, f({ ang: ang(d), crawl: true, moving: true, walked: t * speed * CRAWL_MULT }), 0, 0, false)] },
      { group, name: 'Death', note: 'Operator down.', shows: [[a, 'death']],
        sprites: (t, d) => {
          const k = loop(t, ONE_SHOT.death);
          return [unit(a, f({ ang: ang(d), t: k, alive: k < 0.5, diedAt: k < 0.5 ? null : 0.5 }), 0, 0, k < 0.5)];
        } },
    ];
  };
  const nf = (st: Partial<AnimState>): string => frameName({ ...base, ...st }, noa.anims);
  const itf = (st: Partial<AnimState>): string => frameName({ ...base, ...st }, itai.anims);
  return [
    { group: 'Yoav', name: 'Idle', note: 'Standing, carbine at low ready, breathing.', shows: [[yoav, 'idle']],
      sprites: (t, d) => [unit(yoav, y({ ang: ang(d), t }))] },
    { group: 'Yoav', name: 'Run', note: `Normal move, ${run.toFixed(1)} tiles/s.`, shows: [[yoav, 'run']],
      sprites: (t, d) => [unit(yoav, y({ ang: ang(d), moving: true, walked: t * run }))] },
    { group: 'Yoav', name: 'Crawl', note: `C, ${(run * CRAWL_MULT).toFixed(1)} tiles/s.`, shows: [[yoav, 'crawl']],
      sprites: (t, d) => [unit(yoav, y({ ang: ang(d), crawl: true, moving: true, walked: t * run * CRAWL_MULT }), 0, 0, false)] },
    { group: 'Yoav', name: 'Crawl, still', note: 'Lying flat.', shows: [[yoav, 'crawl_idle']],
      sprites: (_t, d) => [unit(yoav, y({ ang: ang(d), crawl: true }), 0, 0, false)] },
    { group: 'Yoav', name: 'Hit', note: 'Shot but alive: a flinch over the hit flash.', shows: [[yoav, 'hit']],
      sprites: (t, d) => {
        const k = t % 1.5;
        return [unit(yoav, y({ ang: ang(d), hitT: k < HIT_FLASH ? HIT_FLASH - k : 0 }))];
      } },
    { group: 'Yoav', name: 'Death', note: 'Operator down.', shows: [[yoav, 'death']],
      sprites: (t, d) => {
        const k = loop(t, ONE_SHOT.death);
        return [unit(yoav, y({ ang: ang(d), t: k, alive: k < 0.5, diedAt: k < 0.5 ? null : 0.5 }), 0, 0, k < 0.5)];
      } },

    ...squad('Noa', noa, SPEED_LURE, 'Helmet with headset, radio with a tall antenna, binoculars, black carbine.'),
    { group: 'Noa', name: 'Throw', note: `Decoy throw, over the ${THROW_BUSY} s she stops for it.`, shows: [[noa, 'throw']],
      sprites: (t, d) => {
        const k = loop(t, THROW_BUSY) - 0.5;
        return [unit(noa, nf({ ang: ang(d), t, busy: k >= 0 && k < THROW_BUSY ? THROW_BUSY - k : 0 }))];
      } },
    ...squad('Itai', itai, SPEED_SAPPER, 'Rucksack with a ladder and a breaching bar, charge bag, black shotgun.'),
    { group: 'Itai', name: 'Work', note: `Squats and works with both hands: a door takes ${DUR_DOOR} s.`, shows: [[itai, 'work_in'], [itai, 'work']],
      sprites: (t, d) => {
        const k = loop(t, DUR_DOOR) - 0.5;
        return [unit(itai, itf({ ang: ang(d), t, workT: k >= 0 && k < DUR_DOOR ? k : null }))];
      } },

    { group: 'Interactions', name: 'Takedown', note: 'From the back-right: hand over the mouth, knife raised, thrust into the side, lowered to the ground.', shows: [[yoav, 'takedown'], [guard, 'knockout']],
      sprites: (t, d) => {
        const k = loop(t, ONE_SHOT.takedown);
        const [fx, fy] = ahead(d, TAKEDOWN_REACH);
        const gx = fx + Math.sin(ang(d)) * TAKEDOWN_SIDE;
        const gy = fy - Math.cos(ang(d)) * TAKEDOWN_SIDE;
        const down = k >= 0.5;
        return [
          unit(yoav, y({ ang: ang(d), t: k, takedownAt: 0.5 })),
          unit(guard, gf({ ang: ang(d), down, t: k, downAt: down ? 0.5 : null, koAt: down ? 0.5 : null }), gx, gy, k < 0.5 + TAKEDOWN_IMPACT),
        ];
      } },
    { group: 'Interactions', name: 'Grab', note: 'Yoav picks up a body, then holds it.', shows: [[yoav, 'grab'], [guard, 'dragged']],
      sprites: (t, d) => {
        const k = loop(t, ONE_SHOT.grab + 0.6);
        const holding = k >= 0.5;
        const [gx, gy] = ahead(d, holding ? CARRY_OFFSET : 0.75);
        const body = holding
          ? unit(guard, draggedFrameName(Math.atan2(-gy, -gx), 0, guard.anims), ...grip(gx, gy), false)
          : unit(guard, gf({ ang: ang(d) + Math.PI, down: true }), gx, gy, false);
        return [unit(yoav, y({ ang: ang(d) + (holding ? Math.PI : 0), t: k, carrying: holding, grabAt: holding ? 0.5 : null })), body];
      } },
    { group: 'Interactions', name: 'Drag', note: `Walking backwards with a body, ${(run * DRAG_MULT).toFixed(1)} tiles/s.`, shows: [[yoav, 'drag'], [guard, 'dragged']],
      sprites: (t, d) => {
        // moving toward direction d; the body trails behind, Yoav faces it
        const [bx, by] = ahead(d, -CARRY_OFFSET);
        const walked = t * run * DRAG_MULT;
        return [
          unit(yoav, y({ ang: ang(d), moving: true, carrying: true, walked })),
          unit(guard, draggedFrameName(Math.atan2(-by, -bx), walked, guard.anims), ...grip(bx, by), false),
        ];
      } },

    { group: 'Guard', name: 'Idle', note: 'On post, breathing.', shows: [[guard, 'idle']],
      sprites: (t, d) => [unit(guard, gf({ ang: ang(d), t }))] },
    { group: 'Guard', name: 'Walk', note: `Patrol, ${SPEED_PATROL.toFixed(1)} tiles/s.`, shows: [[guard, 'walk']],
      sprites: (t, d) => [unit(guard, gf({ ang: ang(d), moving: true, walked: t * SPEED_PATROL }))] },
    { group: 'Guard', name: 'Run', note: `Investigate and combat, up to ${SPEED_COMBAT.toFixed(1)} tiles/s.`, shows: [[guard, 'run']],
      sprites: (t, d) => [unit(guard, gf({ ang: ang(d), moving: true, running: true, walked: t * SPEED_COMBAT }))] },
    { group: 'Guard', name: 'Death', note: 'Shot: falls backward.', shows: [[guard, 'death']],
      sprites: (t, d) => {
        const k = loop(t, ONE_SHOT.death);
        const down = k >= 0.5;
        return [unit(guard, gf({ ang: ang(d), down, t: k, downAt: down ? 0.5 : null }), 0, 0, !down)];
      } },
  ];
}

/** Where a dragged body is drawn: its neck at the dragger's hands (as in unitSprites.ts). */
function grip(bx: number, by: number): [number, number] {
  const len = Math.hypot(bx, by) || 1;
  return [(bx / len) * 0.25, (by / len) * 0.25];
}

// ---------- page ----------

async function main(): Promise<void> {
  const [yoav, noa, itai, guard, day] = await Promise.all([
    loadAtlas('yoav'), loadAtlas('noa'), loadAtlas('itai'), loadAtlas('guard'), loadImage('yard/yard_day.jpg'),
  ]);
  // Phase 2 look test: Yoav in look A (tools/blender/looks.py, cel_black), right under the
  // current Yoav, with his interactions, to judge the drawn look in motion
  const yoavA = await loadAtlas('yoav_a');
  const all = cards(yoav, noa, itai, guard);
  const lookA = cards(yoavA, noa, itai, guard)
    .filter((c) => c.group === 'Yoav' || c.group === 'Interactions')
    .map((c) => ({ ...c, group: `${c.group}, look A (test)` }));
  const lastYoav = all.map((c) => c.group).lastIndexOf('Yoav');
  const list = [...all.slice(0, lastYoav + 1), ...lookA, ...all.slice(lastYoav + 1)];
  const ground = graded(day, NIGHT, false);
  const grid = document.getElementById('grid')!;
  const sel = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;
  let zoom = Number(sel('zoom').value);
  let paused = false;

  const views: { card: Card; canvas: HTMLCanvasElement }[] = [];
  let group = '';
  for (const card of list) {
    if (card.group !== group) {
      group = card.group;
      grid.insertAdjacentHTML('beforeend', `<h2 class="group">${group}</h2>`);
    }
    const el = document.createElement('article');
    el.className = 'card';
    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    const srcs = card.shows
      .map(([a, anim]) => {
        const s = a.sources[anim] ?? 'unknown';
        return `<div class="src ${s.startsWith('motion') ? 'mocap' : 'formula'}">${anim}: ${s}</div>`;
      })
      .join('');
    el.insertAdjacentHTML('beforeend', `<div class="meta"><div class="name">${card.name}</div><div class="note">${card.note}</div>${srcs}</div>`);
    grid.appendChild(el);
    views.push({ card, canvas });
  }

  const resize = (): void => {
    for (const v of views) {
      v.canvas.width = W * zoom;
      v.canvas.height = H * zoom;
    }
    document.documentElement.style.setProperty('--card-w', `${W * Math.max(zoom, 2)}px`);
  };
  resize();
  sel('zoom').addEventListener('change', () => {
    zoom = Number(sel('zoom').value);
    resize();
  });
  const pause = document.getElementById('pause') as HTMLButtonElement;
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Play' : 'Pause';
  });

  let t = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) t += dt * Number(sel('speed').value);
    const dv = sel('dir').value;
    const dir = dv === 'rotate' ? Math.floor(t / 2.5) % 8 : Number(dv);
    for (const v of views) drawCard(v.canvas.getContext('2d')!, ground, v.card, t, dir, zoom);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // handle for checks in the browser console
  (window as unknown as { motion: unknown }).motion = { views, step: (s: number) => (t += s) };
}

void main();
