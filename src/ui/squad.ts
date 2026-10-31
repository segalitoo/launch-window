// The squad rail (Phase 6, Ran: split edges): one card per operator down the left edge, in
// squad order, so key 1, 2, 3 and the card match. Tap a card to select. Portraits come later
// (rendered from the 3D models); until then a card shows the name, colour and health.

import type { GameState, UnitId } from '@/sim';

export interface SquadCard {
  id: UnitId;
  /** The key that selects it, the same path as the keyboard. */
  key: string;
  name: string;
  color: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  selected: boolean;
}

export function squadOf(s: GameState, sel: UnitId): SquadCard[] {
  return s.squad.map((u, i) => ({
    id: u.id,
    key: String(i + 1),
    name: u.name,
    color: u.color,
    hp: u.hp,
    maxHp: u.maxHp,
    alive: u.alive,
    selected: u.id === sel,
  }));
}
