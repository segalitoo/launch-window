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
  /** Phase 4: the area's tiles (inclusive) and how many tiles it fades over at each side
   *  (west, north, east, south). With a fade the painting is clipped by <name>_mask.png. */
  region?: [number, number, number, number];
  fade?: [number, number, number, number];
  /** Faded image border, painting px (default FEATHER; thinner for areas with a region mask). */
  feather?: number;
}

/** Which tiles an area may draw structures for: the area drawn on top owns a tile. */
export type Owns = (x: number, y: number) => boolean;

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

/** An "open" patch for a door in the painting (tools/door_patch.py, `<name>_doors.json`). */
interface DoorPatch {
  x: number; // sim tile of the door
  y: number;
  image: string;
  px: number; // where the patch goes in the painting, px
  py: number;
}

export class PaintedArea {
  readonly manifest: Manifest;
  private readonly allOccluders: { key: string; occ: Occluder }[] = [];
  /** Occluder sprites by tile ("x,y"), hidden when that tile's door is open. */
  private readonly tileImages = new Map<string, Phaser.GameObjects.Image[]>();
  private readonly doors: DoorPatch[];
  /** Doors whose open patch is painted in now ("x,y"). */
  private openDoors = new Set<string>();
  /** Redraws the graded painting and occluder atlases from the daylight painting. */
  private readonly repaint: () => void;
  /** Tiles whose structure comes from the painting (no placeholder block). */
  readonly paintedTiles = new Set<string>();
  /** The lit version over the lamp pools (ground and wall pieces), faded by setLamps. */
  private readonly lamps: { im: Phaser.GameObjects.Image; tile: string | null }[] = [];
  /** World-space rectangle covered by the painting. */
  readonly rect: { x: number; y: number; w: number; h: number };

  static preload(scene: Phaser.Scene, name: string): void {
    scene.load.json(`${name}_meta`, `${name}/${name}.json`);
    // door patches: the list says which images to load
    scene.load.once(`filecomplete-json-${name}_doors`, (_k: string, _t: string, doors: DoorPatch[]) => {
      for (const d of doors) scene.load.image(`${name}_door_${d.x}_${d.y}`, `${name}/${d.image}`);
    });
    scene.load.json(`${name}_doors`, `${name}/${name}_doors.json`);
    scene.load.image(`${name}_day`, `${name}/${name}_day.jpg`);
    scene.load.image(`${name}_light`, `${name}/${name}_light.png`);
    scene.load.image(`${name}_mask`, `${name}/${name}_mask.png`);
    scene.load.image(`${name}_occmask`, `${name}/${name}_occ.png`);
  }

  /** `cols` x `rows` is the map size; the painting is clipped to the map's diamond. */
  constructor(scene: Phaser.Scene, name: string, groundDepth: number, cols: number, rows: number, owns: Owns = () => true) {
    const m = scene.cache.json.get(`${name}_meta`) as Manifest;
    this.manifest = m;
    const [W, H] = m.size;
    const ss = m.supersample;
    const ox = -m.origin_px[0] / ss;
    const oy = -m.origin_px[1] / ss;
    this.rect = { x: ox, y: oy, w: W / ss, h: H / ss };
    this.doors = (scene.cache.json.get(`${name}_doors`) as DoorPatch[] | undefined) ?? [];

    // 1. light canvases: night tint everywhere; the lit one has the warm lamp pools on top.
    //    The lamps run on the generator, so the area is built both ways (setLamps fades).
    const day = scene.textures.get(`${name}_day`).getSourceImage() as HTMLImageElement;
    const FE = m.feather ?? FEATHER;
    const mask = m.fade && scene.textures.exists(`${name}_mask`)
      ? (scene.textures.get(`${name}_mask`).getSourceImage() as HTMLImageElement)
      : null;
    this.faded = !!mask;
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
    //    Open doors are painted over the daylight painting first, so they take the same grade.
    const grade = (tex: Phaser.Textures.CanvasTexture, light: HTMLCanvasElement): void => {
      const bc = tex.context;
      bc.clearRect(0, 0, W, H);
      bc.drawImage(day, 0, 0);
      for (const d of this.doors) {
        if (!this.openDoors.has(`${d.x},${d.y}`)) continue;
        bc.drawImage(scene.textures.get(`${name}_door_${d.x}_${d.y}`).getSourceImage() as HTMLImageElement, d.px, d.py);
      }
      bc.globalCompositeOperation = 'multiply';
      bc.drawImage(light, 0, 0);
      if (mask) {
        // clip to the area's tiles, faded where another area or the placeholder takes over
        bc.globalCompositeOperation = 'destination-in';
        bc.drawImage(mask, 0, 0, W, H);
      }
      // fade the painting's rectangle into the placeholder map around it
      bc.globalCompositeOperation = 'destination-out';
      const sides: [number, number, number, number][] = [
        [0, 0, FE, 0], // left: gradient from x=0 to x=FE
        [W, 0, W - FE, 0],
        [0, 0, 0, FE],
        [0, H, 0, H - FE],
      ];
      // (with a region mask too: a region can reach past the painting's own edge)
      for (const [x0, y0, x1, y1] of sides) {
        const g = bc.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        bc.fillStyle = g;
        bc.fillRect(0, 0, W, H);
      }
      // clip to the map: the painting's rectangle reaches past the map edge. The edge is
      // softened so it melts into the desert backdrop around the map (Phase 6); a browser
      // without canvas filters gets a hard edge.
      bc.globalCompositeOperation = 'destination-in';
      bc.filter = 'blur(10px)';
      bc.fillStyle = '#000';
      bc.beginPath();
      for (const p of footprint(0, 0, cols, rows)) bc.lineTo((p.x - ox) * ss, (p.y - oy) * ss);
      bc.closePath();
      bc.fill();
      bc.filter = 'none';
      bc.globalCompositeOperation = 'source-over';
      tex.refresh();
    };
    const darkLight = lightCanvas(false);
    const litLight = lightCanvas(true);
    const darkTex = scene.textures.createCanvas(`${name}_bg`, W, H)!;
    const litTex = scene.textures.createCanvas(`${name}_bg_lit`, W, H)!;
    scene.add.image(ox, oy, `${name}_bg`).setOrigin(0).setScale(1 / ss).setDepth(groundDepth);

    // where the lamp pools reach, in painting px: only there does the lit version differ
    const pool = alphaBox(lightImg, W / lightImg.width);
    if (pool) {
      litTex.add('pool', 0, pool.x, pool.y, pool.w, pool.h);
      this.lamps.push({
        im: scene.add.image(ox + pool.x / ss, oy + pool.y / ss, `${name}_bg_lit`, 'pool').setOrigin(0).setScale(1 / ss).setDepth(groundDepth + 0.5),
        tile: null,
      });
    }

    // 3. occluder atlases (dark and lit): graded pixels, alpha from the mask atlas
    const maskImg = scene.textures.get(`${name}_occmask`).getSourceImage() as HTMLImageElement;
    const AW = maskImg.width;
    const AH = maskImg.height;
    const darkOcc = scene.textures.createCanvas(`${name}_occ`, AW, AH)!;
    const litOcc = scene.textures.createCanvas(`${name}_occ_lit`, AW, AH)!;
    for (const tex of [darkOcc, litOcc]) for (const f of m.frames) tex.add(`t${f.x}_${f.y}`, 0, f.ax, f.ay, f.w, f.h);
    const cut = (occTex: Phaser.Textures.CanvasTexture, src: Phaser.Textures.CanvasTexture): void => {
      const oc = occTex.context;
      oc.clearRect(0, 0, AW, AH);
      for (const f of m.frames) oc.drawImage(src.canvas, f.sx, f.sy, f.w, f.h, f.ax, f.ay, f.w, f.h);
      oc.globalCompositeOperation = 'destination-in';
      oc.drawImage(maskImg, 0, 0);
      oc.globalCompositeOperation = 'source-over';
      occTex.refresh();
    };
    this.repaint = (): void => {
      grade(darkTex, darkLight);
      grade(litTex, litLight);
      cut(darkOcc, darkTex);
      cut(litOcc, litTex);
    };
    this.repaint();
    const inPool = (f: Frame): boolean =>
      !!pool && f.sx < pool.x + pool.w && f.sx + f.w > pool.x && f.sy < pool.y + pool.h && f.sy + f.h > pool.y;

    // mask alpha on the CPU, for the hidden-unit test
    const probe = document.createElement('canvas');
    probe.width = AW;
    probe.height = AH;
    const pc = probe.getContext('2d', { willReadFrequently: true })!;
    pc.drawImage(maskImg, 0, 0);
    const alpha = pc.getImageData(0, 0, AW, AH).data;

    const inside = (f: Frame): boolean =>
      (!mask || owns(f.x, f.y)) && f.sx >= FE && f.sy >= FE && f.sx + f.w <= W - FE && f.sy + f.h <= H - FE;
    for (const f of m.frames) {
      if (!inside(f)) continue;
      const wx = ox + f.sx / ss;
      const wy = oy + f.sy / ss;
      const depth = depthOf(f.x + 0.5, f.y + 0.5, 0);
      const key = `${f.x},${f.y}`;
      const images = [scene.add.image(wx, wy, `${name}_occ`, `t${f.x}_${f.y}`).setOrigin(0).setScale(1 / ss).setDepth(depth)];
      if (inPool(f)) {
        const lit = scene.add.image(wx, wy, `${name}_occ_lit`, `t${f.x}_${f.y}`).setOrigin(0).setScale(1 / ss).setDepth(depth + 0.5);
        this.lamps.push({ im: lit, tile: key });
        images.push(lit);
      }
      this.tileImages.set(key, images);
      this.allOccluders.push({
        key,
        occ: maskOccluder(f.x, f.y, 0, wx, wy, f.w, f.h, ss, (sx, sy) => alpha[((f.ay + sy) * AW + f.ax + sx) * 4 + 3]!),
      });
      this.paintedTiles.add(`${f.x},${f.y}`);
    }
  }

  /** Occluders for the hidden-unit test. An open door's tile no longer hides anyone: its
   *  mask is the closed door's shape. */
  get occluders(): Occluder[] {
    return this.allOccluders.filter((o) => !this.openDoors.has(o.key)).map((o) => o.occ);
  }

  /** Lamp brightness, 0 (off) to 1 (on). The lamps run on the generator. */
  setLamps(level: number): void {
    for (const { im, tile } of this.lamps) im.setAlpha(level).setVisible(level > 0 && !(tile && this.openDoors.has(tile)));
  }

  /** Paints doors open or closed to match the sim (`isOpen` for a door tile). Repaints only
   *  when something changed. */
  syncDoors(isOpen: (x: number, y: number) => boolean): void {
    const open = new Set(this.doors.filter((d) => isOpen(d.x, d.y)).map((d) => `${d.x},${d.y}`));
    if (open.size === this.openDoors.size && [...open].every((k) => this.openDoors.has(k))) return;
    this.openDoors = open;
    this.repaint();
    for (const [key, images] of this.tileImages) {
      if (!this.doors.some((d) => `${d.x},${d.y}` === key)) continue;
      for (const im of images) im.setVisible(!open.has(key));
    }
  }

  /** Clipped by a region mask (Phase 4) rather than a feathered rectangle. */
  private faded = false;

  /** True when (x, y) lies in the area's region (tiles, inclusive). */
  inRegion(x: number, y: number): boolean {
    const r = this.manifest.region;
    return !!r && x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
  }

  /** True when a tile's ground diamond lies fully inside the painting's unfaded part. */
  coversTile(tx: number, ty: number): boolean {
    if (this.faded) {
      const r = this.manifest.region!;
      const f = this.manifest.fade!;
      if (!(tx >= r[0] + f[0] && ty >= r[1] + f[1] && tx + 1 <= r[2] + 1 - f[2] && ty + 1 <= r[3] + 1 - f[3])) return false;
    }
    const f = (this.manifest.feather ?? FEATHER) / this.manifest.supersample;
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
