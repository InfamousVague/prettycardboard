import type { GameId } from './games.ts';
import type { MessageKey } from '../i18n.ts';

/**
 * Configurable table keyboard shortcuts.
 *
 * A shortcut is keyed by KeyboardEvent.code (the physical key position, e.g.
 * "KeyT", "Space", "Equal") - layout-stable and immune to Shift/CapsLock, so a
 * single-key binding never double-books. Bindings are per game; the stored map
 * is SPARSE (only user-changed entries), and any action absent from it falls
 * back to the catalog default here - so adding a new action needs no migration.
 */

/** A physical key (KeyboardEvent.code). '' = intentionally unbound. */
export type KeyCode = string;

export type ActionId =
  | 'passTurn'
  | 'tapHovered'
  | 'flipHovered'
  | 'draw'
  | 'shuffle'
  | 'untapAll'
  | 'createToken'
  | 'cloneHovered'
  | 'rollD20'
  | 'lifeUp'
  | 'lifeDown'
  | 'secondaryUp'
  | 'secondaryDown'
  | 'endCombat'
  | 'stormUp'
  | 'cycleDayNight'
  | 'concede';

/** The guard the handler checks before firing an action. */
export type BindGuard = 'canAct' | 'myTurn' | 'hoveredMine' | 'hoveredToken' | 'combat';

export type KeybindGroup = 'common' | 'turn' | 'vitals' | 'combat' | 'markers' | 'danger';

export interface KeybindDef {
  action: ActionId;
  labelKey: MessageKey;
  group: KeybindGroup;
  /** Which games surface (and allow) this binding. */
  games: GameId[];
  /** Default physical key; '' means unbound by default. */
  defaultCode: KeyCode;
  guard: BindGuard;
}

export const KEYBIND_DEFS: KeybindDef[] = [
  // common
  { action: 'tapHovered', labelKey: 'kbTap', group: 'common', games: ['mtg', 'cyberpunk'], defaultCode: 'KeyT', guard: 'hoveredMine' },
  { action: 'flipHovered', labelKey: 'kbFlip', group: 'common', games: ['mtg', 'cyberpunk'], defaultCode: 'KeyF', guard: 'hoveredMine' },
  { action: 'draw', labelKey: 'tblDraw', group: 'common', games: ['mtg', 'cyberpunk'], defaultCode: 'KeyD', guard: 'canAct' },
  { action: 'shuffle', labelKey: 'tblShuffle', group: 'common', games: ['mtg', 'cyberpunk'], defaultCode: 'KeyS', guard: 'canAct' },
  { action: 'untapAll', labelKey: 'tblUntapAll', group: 'common', games: ['mtg'], defaultCode: 'KeyU', guard: 'canAct' },
  { action: 'createToken', labelKey: 'kbToken', group: 'common', games: ['mtg'], defaultCode: 'KeyK', guard: 'canAct' },
  { action: 'cloneHovered', labelKey: 'kbClone', group: 'common', games: ['mtg'], defaultCode: 'KeyC', guard: 'hoveredToken' },
  { action: 'rollD20', labelKey: 'kbRollD20', group: 'common', games: ['mtg'], defaultCode: 'KeyR', guard: 'canAct' },
  // turn
  { action: 'passTurn', labelKey: 'kbPass', group: 'turn', games: ['mtg', 'cyberpunk'], defaultCode: 'Space', guard: 'myTurn' },
  // vitals (labels rendered game-aware in the UI: Life/Net, Poison/RAM)
  { action: 'lifeUp', labelKey: 'kbLifeUp', group: 'vitals', games: ['mtg', 'cyberpunk'], defaultCode: 'Equal', guard: 'canAct' },
  { action: 'lifeDown', labelKey: 'kbLifeDown', group: 'vitals', games: ['mtg', 'cyberpunk'], defaultCode: 'Minus', guard: 'canAct' },
  { action: 'secondaryUp', labelKey: 'kbSecondaryUp', group: 'vitals', games: ['mtg', 'cyberpunk'], defaultCode: '', guard: 'canAct' },
  { action: 'secondaryDown', labelKey: 'kbSecondaryDown', group: 'vitals', games: ['mtg', 'cyberpunk'], defaultCode: '', guard: 'canAct' },
  // combat / markers (MTG)
  { action: 'endCombat', labelKey: 'kbEndCombat', group: 'combat', games: ['mtg'], defaultCode: 'KeyE', guard: 'combat' },
  { action: 'stormUp', labelKey: 'kbStorm', group: 'markers', games: ['mtg'], defaultCode: '', guard: 'canAct' },
  { action: 'cycleDayNight', labelKey: 'kbDayNight', group: 'markers', games: ['mtg'], defaultCode: '', guard: 'canAct' },
  // danger - unbound by default; routes through the concede confirm dialog
  { action: 'concede', labelKey: 'tblConcede', group: 'danger', games: ['mtg', 'cyberpunk'], defaultCode: '', guard: 'canAct' },
];

export const KEYBIND_DEF: Record<ActionId, KeybindDef> = Object.fromEntries(
  KEYBIND_DEFS.map((d) => [d.action, d]),
) as Record<ActionId, KeybindDef>;

export const KEYBIND_GROUPS: KeybindGroup[] = ['common', 'turn', 'vitals', 'combat', 'markers', 'danger'];

export const KEYBIND_GROUP_LABEL: Record<KeybindGroup, MessageKey> = {
  common: 'kbGroupCommon',
  turn: 'kbGroupTurn',
  vitals: 'kbGroupVitals',
  combat: 'kbGroupCombat',
  markers: 'kbGroupMarkers',
  danger: 'kbGroupDanger',
};

/** actionId -> code for ONE game. A missing action means "use the catalog default". */
export type GameKeybinds = Partial<Record<ActionId, KeyCode>>;
/** SPARSE per-game overrides only. A missing game means "all defaults". */
export type Keybinds = Partial<Record<GameId, GameKeybinds>>;

/** The bound code for an action in a game: an override wins (including an
 *  explicit '' unbind), otherwise the catalog default. */
export function effectiveCode(binds: Keybinds, game: GameId, action: ActionId): KeyCode {
  const override = binds[game]?.[action];
  return override !== undefined ? override : KEYBIND_DEF[action].defaultCode;
}

/** The active game's bindings as a code->action lookup for the keydown handler.
 *  Catalog order breaks any tie (only reachable via hand-edited storage). */
export function resolveKeybinds(binds: Keybinds, game: GameId): Map<KeyCode, ActionId> {
  const map = new Map<KeyCode, ActionId>();
  for (const def of KEYBIND_DEFS) {
    if (!def.games.includes(game)) continue;
    const code = effectiveCode(binds, game, def.action);
    if (code && !map.has(code)) map.set(code, def.action);
  }
  return map;
}

const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
};

/** A readable chip label for a code: KeyU->U, Digit3->3, Equal->=, arrows->glyphs. */
export function keyLabel(code: KeyCode): string {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return NAMED_KEYS[code] ?? code;
}
