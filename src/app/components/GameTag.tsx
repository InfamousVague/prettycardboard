import { Cpu, Sparkles } from '@glacier/icons';
import { getGame } from '../data/games.ts';
import './GameTag.css';

/** Per-game glyph. Kept here (not in the data registry) since icons are React. */
const ICONS = { mtg: Sparkles, cyberpunk: Cpu } as const;

/**
 * A compact identity chip - game icon + name in the game's accent - shown
 * anywhere it is otherwise ambiguous which card game a deck, room, or match
 * belongs to. Pass showName={false} for an icon-only badge in tight spots.
 */
export function GameTag({
  game,
  showName = true,
  size = 12,
  className,
}: {
  game: string | undefined | null;
  showName?: boolean;
  size?: number;
  className?: string;
}) {
  const def = getGame(game);
  const Icon = ICONS[def.id] ?? Sparkles;
  return (
    <span
      className={`gameTag${className ? ` ${className}` : ''}`}
      data-game={def.id}
      title={def.name}
      style={{ ['--game-accent' as string]: def.accent }}
    >
      <Icon size={size} />
      {showName && <span className="gameTagName">{def.name}</span>}
    </span>
  );
}

/**
 * The game's mark as a solid square tile in its accent - a compact "logo" for a
 * table/deck row (which card game it belongs to). Falls back to the MTG glyph
 * for a game not yet in the registry.
 */
export function GameBadge({
  game,
  size = 20,
  className,
}: {
  game: string | undefined | null;
  size?: number;
  className?: string;
}) {
  const def = getGame(game);
  const Icon = ICONS[def.id] ?? Sparkles;
  return (
    <span
      className={`gameBadge${className ? ` ${className}` : ''}`}
      data-game={def.id}
      title={def.name}
      aria-label={def.name}
      style={{ ['--game-accent' as string]: def.accent }}
    >
      <Icon size={size} />
    </span>
  );
}
