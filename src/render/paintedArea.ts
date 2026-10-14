// A painted area of the map (Phase 1: the generator yard). Loads the daylight
// painting, grades it to night in the engine, and cuts it into one occluder sprite
// per blocking tile so units can walk behind painted walls.
// Built by tools/cut_occluders.py; files live in assets/build/<name>/.

import Phaser from 'phaser';
import { depthOf, footprint } from './iso';
import { type Occluder, maskOccluder } from './occlusion';

interface Frame {
  x: number; // sim tile
  y: number;
  sx: number; // source rect in the painting, px
  sy: number;
  w: number;
  h: number;
  ax: number; // position in the mask atlas, px
  ay: number;
}

interface Manifest {
  name: string;
  size: [number, number];
  supersample: number;
  origin_px: [number, number];
  light_scale: number;
  night_tint: [number, number, number];
  unit_tint: [number, number, number];
  frames: Frame[];
}

const toCss = (t: readonly number[]): string =>
  `rgb(${t.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;

/** Width of the faded border, in painting px. Structures crossing it use placeholder blocks. */
const FEATHER = 48;

export const toTintHex = (t: readonly number[]): number =>
  (Math.round(t[0]! * 255) << 16) | (Math.round(t[1]! * 255) << 8) | Math.round(t[2]! * 255);

/** Bounding box of an image's visible pixels, scaled by k (null if fully clear). */
function alphaBox(img: HTMLImageElement, k: number): { x: number; y: number; w: number; h: number } | null {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const a = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width;
  let y0 = c.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (a[(y * c.width + x) * 4 + 3]! > 1) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) return null;
  // one source px of margin, so the lit patch's edge never shows a seam
  const X0 = Math.max(0, Math.floor((x0 - 1) * k));
  const Y0 = Math.max(0, Math.floor((y0 - 1) * k));
  return { x: X0, y: Y0, w: Math.min(c.width * k, Math.ceil((x1 + 2) * k)) - X0, h: Math.min(c.height * k, Math.ceil((y1 + 2) * k)) - Y0 };
}

export class PaintedArea {
  readonly manifest: Manifest;
  readonly occluders: Occluder[] = [];
  /** Tiles whose structure comes from the painting (no placeholder block). */
  readonly paintedTiles = new Set<string>();
  /** The lit version over the lamp pools (ground and wall pieces), faded by setLamps. */
  private readonly lamps: Phaser.GameObjects.Image[] = [];
  /** World-space rectangle covered by the painting. */
  readonly rect: { x: number; y: number; w: number; h: number };

  static preload(scene: Phaser.Scene, name: string): void {
    scene.load.json(`${name}_meta`, `${name}/${name}.json`);
    scene.load.image(`${name}_day`, `${name}/${name}_day.jpg`);
    scene.load.image(`${name}_light`, `${name}/${name}_light.png`);
    scene.load.image(`${name}_occmask`, `${name}/${name}_occ.png`);
  }

  /** `cols` x `rows` is the map size; the painting is clipped to the map's diamond. */
  constructor(scene: Phaser.Scene, name: string, groundDepth: number, cols: number, rows: number) {
    const m = scene.cache.json.get(`${name}_meta`) as Manifest;
    this.manifest = m;
    const [W, H] = m.size;
    const ss = m.supersample;
    const ox = -m.origin_px[0] / ss;
    const oy = -m.origin_px[1] / ss;
    this.rect = { x: ox, y: oy, w: W / ss, h: H / ss };

    // 1. light canvases: night tint everywhere; the lit one has the warm lamp pools on top.
    //    The lamps run on the generator, so the area is built both ways (setLamps fades).
    const day = scene.textures.get(`${name}_day`).getSourceImage() as HTMLImageElement;
    const lightImg = scene.textures.get(`${name}_light`).getSourceImage() as HTMLImageElement;
    const lightCanvas = (lamps: boolean): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const lc = c.getContext('2d')!;
      lc.fillStyle = toCss(m.night_tint);
      lc.fillRect(0, 0, W, H);
      if (lamps) lc.drawImage(lightImg, 0, 0, W, H);
      return c;
    };

    // 2. graded painting = daylight painting x light canvas, faded and clipped to the map
    const grade = (key: string, light: HTMLCanvasElement): Phaser.Textures.CanvasTexture => {
      const tex = scene.textures.createCanvas(key, W, H)!;
      const bc = tex.context;
      bc.drawImage(day, 0, 0);
      bc.globalCompositeOperation = 'multiply';
      bc.drawImage(light, 0, 0);
      // fade the painting's rectangle into the placeholder map around it
      bc.globalCompositeOperation = 'destination-out';
      const sides: [number, number, number, number][] = [
        [0, 0, FEATHER, 0], // left: gradient from x=0 to x=FEATHER
        [W, 0, W - FEATHER, 0],
        [0, 0, 0, FEATHER],
        [0, H, 0, H - FEATHER],
      ];
      for (const [x0, y0, x1, y1] of sides) {
        const g = bc.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        bc.fillStyle = g;
        bc.fillRect(0, 0, W, H);
      }
      // clip to the map: the painting's rectangle reaches past the map edge into the void
      bc.globalCompositeOperation = 'destination-in';
      bc.fillStyle = '#000';
      bc.beginPath();
      for (const p of footprint(0, 0, cols, rows)) bc.lineTo((p.x - ox) * ss, (p.y - oy) * ss);
      bc.closePath();
      bc.fill();
      bc.globalCompositeOperation = 'source-over';
      tex.refresh();
      return tex;
    };
    const darkTex = grade(`${name}_bg`, lightCanvas(false));
    const litTex = grade(`${name}_bg_lit`, lightCanvas(true));
    scene.add.image(ox, oy, `${name}_bg`).setOrigin(0).setScale(1 / ss).setDepth(groundDepth);

    // where the lamp pools reach, in painting px: only there does the lit version differ
    const pool = alphaBox(lightImg, W / lightImg.width);
    if (pool) {
      litTex.add('pool', 0, pool.x, pool.y, pool.w, pool.h);
      this.lamps.push(
        scene.add.image(ox + pool.x / ss, oy + pool.y / ss, `${name}_bg_lit`, 'pool').setOrigin(0).setScale(1 / ss).setDepth(groundDepth + 0.5),
      );
    }

    // 3. occluder atlases (dark and lit): graded pixels, alpha from the mask atlas
    const maskImg = scene.textures.get(`${name}_occmask`).getSourceImage() as HTMLImageElement;
    const AW = maskImg.width;
    const AH = maskImg.height;
    const cut = (key: string, src: Phaser.Textures.CanvasTexture): void => {
      const occTex = scene.textures.createCanvas(key, AW, AH)!;
      const oc = occTex.context;
      for (const f of m.frames) oc.drawImage(src.canvas, f.sx, f.sy, f.w, f.h, f.ax, f.ay, f.w, f.h);
      oc.globalCompositeOperation = 'destination-in';
      oc.drawImage(maskImg, 0, 0);
      oc.globalCompositeOperation = 'source-over';
      for (const f of m.frames) occTex.add(`t${f.x}_${f.y}`, 0, f.ax, f.ay, f.w, f.h);
      occTex.refresh();
    };
    cut(`${name}_occ`, darkTex);
    cut(`${name}_occ_lit`, litTex);
    const inPool = (f: Frame): boolean =>
      !!pool && f.sx < pool.x + pool.w && f.sx + f.w > pool.x && f.sy < pool.y + pool.h && f.sy + f.h > pool.y;

    // mask alpha on the CPU, for the hidden-unit test
    const probe = document.createElement('canvas');
    probe.width = AW;
    probe.height = AH;
    const pc = probe.getContext('2d', { willReadFrequently: true })!;
    pc.drawImage(maskImg, 0, 0);
    const alpha = pc.getImageData(0, 0, AW, AH).data;

    const inside = (f: Frame): boolean => f.sx >= FEATHER && f.sy >= FEATHER && f.sx + f.w <= W - FEATHER && f.sy + f.h <= H - FEATHER;
    for (const f of m.frames) {
      if (!inside(f)) continue;
      const wx = ox + f.sx / ss;
      const wy = oy + f.sy / ss;
      const depth = depthOf(f.x + 0.5, f.y + 0.5, 0);
      scene.add.image(wx, wy, `${name}_occ`, `t${f.x}_${f.y}`).setOrigin(0).setScale(1 / ss).setDepth(depth);
      if (inPool(f)) {
        this.lamps.push(scene.add.image(wx, wy, `${name}_occ_lit`, `t${f.x}_${f.y}`).setOrigin(0).setScale(1 / ss).setDepth(depth + 0.5));
      }
      this.occluders.push(
        maskOccluder(f.x, f.y, 0, wx, wy, f.w, f.h, ss, (sx, sy) => alpha[((f.ay + sy) * AW + f.ax + sx) * 4 + 3]!),
      );
      this.paintedTiles.add(`${f.x},${f.y}`);
    }
  }

  /** Lamp brightness, 0 (off) to 1 (on). The lamps run on the generator. */
  setLamps(level: number): void {
    for (const im of this.lamps) im.setAlpha(level).setVisible(level > 0);
  }

  /** True when a tile's ground diamond lies fully inside the painting's unfaded part. */
  coversTile(tx: number, ty: number): boolean {
    const f = FEATHER / this.manifest.supersample;
    const r = { x: this.rect.x + f, y: this.rect.y + f, w: this.rect.w - 2 * f, h: this.rect.h - 2 * f };
    const corners = [
      [tx, ty],
      [tx + 1, ty],
      [tx + 1, ty + 1],
      [tx, ty + 1],
    ] as const;
    return corners.every(([x, y]) => {
      const sx = (x - y) * 32;
      const sy = (x + y) * 16;
      return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
    });
  }
}
