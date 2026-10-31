// The selected operator's backpack (Phase 3, Ran): one square per item with an icon, how
// many are left and its key. It replaces the old tool button row and shows on every screen.
// Used-up items stay, greyed with 0, so the player always sees the whole kit.
// Icons: the field-kit stencils (Phase 6, src/ui/kitIcons.ts).

import type { Unit } from '@/sim';
import { KIT_ICONS } from './kitIcons';

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

/** Field-kit stencil icons (Phase 6, src/ui/kitIcons.ts). */
export const ICONS = KIT_ICONS;

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
