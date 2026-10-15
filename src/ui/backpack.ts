// The selected operator's backpack (Phase 3, Ran): one square per item with an icon, how
// many are left and its key. It replaces the old tool button row and shows on every screen.
// Used-up items stay, greyed with 0, so the player always sees the whole kit.
// Icons are placeholder line drawings (24 x 24, stroke = currentColor) until the Phase 6 UI art.

import type { Unit } from '@/sim';

export interface PackItem {
  id: string;
  /** The key it presses, the same path as the keyboard. */
  key: string;
  label: string;
  /** How many are left, or null when it does not run out. */
  count: number | null;
  disabled: boolean;
  /** Its mode is active (throwing, tying...), or it is in use (uniform on, charge planted). */
  on: boolean;
  icon: string;
}

/** What the controller is doing right now, as far as the backpack shows it. */
export interface PackModes {
  mode: string | null;
}

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Readonly<Record<string, string>> = {
  // a coil of rope with a loose end
  tie: svg('<ellipse cx="11" cy="12" rx="7" ry="5"/><ellipse cx="11" cy="12" rx="4" ry="2.6"/><path d="M18 12c2 1 3 3 2 6"/>'),
  // a stone and the noise it makes
  decoy: svg('<path d="M5 17l2-4 4-1 2 3-2 3H6z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>'),
  // a grenade can under a cloud
  smoke: svg('<rect x="9" y="13" width="6" height="8" rx="1"/><path d="M10 13v-2h4v2"/><path d="M6 9a3 3 0 0 1 3-4 3.5 3.5 0 0 1 6 0 3 3 0 0 1 3 4"/>'),
  // two barrels and a bridge
  bino: svg('<circle cx="7" cy="15" r="4"/><circle cx="17" cy="15" r="4"/><path d="M7 11V6h3v5M17 11V6h-3v5M10 9h4"/>'),
  // a uniform shirt with a cap above
  uniform: svg('<path d="M8 8l-4 3 2 3 2-1v8h8v-8l2 1 2-3-4-3"/><path d="M8 8a4 2 0 0 0 8 0"/><path d="M9 5h6l1 1H8z"/>'),
  // two pegs and the wire between them
  wire: svg('<path d="M4 19l2-9M20 19l-2-9"/><path d="M6 12h12" stroke-dasharray="2 2"/><path d="M3 19h4M17 19h4"/>'),
  // a block of explosive with a receiver and its antenna
  charge: svg('<rect x="4" y="11" width="13" height="8" rx="1"/><path d="M8 11v8M12 11v8"/><path d="M17 14h2l1-8"/><circle cx="20" cy="5" r="1"/>'),
  // a hand detonator: body, button, antenna
  detonate: svg('<rect x="7" y="9" width="10" height="12" rx="2"/><circle cx="12" cy="14" r="2.2"/><path d="M14 9V3"/><path d="M4 6l2 1M20 6l-2 1"/>'),
};

export function packOf(u: Unit, m: PackModes): PackItem[] {
  const item = (id: string, key: string, label: string, count: number | null, extra: Partial<PackItem> = {}): PackItem => ({
    id, key, label, count, disabled: count === 0, on: false, icon: ICONS[id]!, ...extra,
  });
  switch (u.id) {
    case 'shadow':
      return [item('tie', 'g', 'Tie', null, { on: m.mode === 'tie' })];
    case 'lure':
      return [
        item('decoy', 't', 'Decoy', u.charges, { on: m.mode === 'throw' }),
        item('smoke', 'v', 'Smoke', u.smokes, { on: m.mode === 'smoke' }),
        item('bino', 'b', 'Binoc.', null, { on: m.mode === 'bino' }),
        item('uniform', 'u', 'Uniform', null, { on: u.disguised }),
      ];
    case 'sapper':
      return [
        item('wire', 'j', 'Wire', u.wires),
        // once planted the charge is gone from the pack; the detonator lights up instead
        item('charge', 'k', 'Charge', u.remotes),
        item('detonate', 'l', 'Detonate', null, { disabled: !u.remote, on: !!u.remote }),
      ];
  }
}
