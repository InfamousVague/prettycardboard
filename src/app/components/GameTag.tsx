import { Pill, Tooltip } from '@glacier/react';
import { getGame } from '../data/games.ts';
import { GameMark } from './GameMark.tsx';
import './GameTag.css';

/**
 * A compact identity chip - game icon + name in the game's accent - shown
 * anywhere it is otherwise ambiguous which card game a deck, room, or match
 * belongs to. Pass showName={false} for an icon-only badge in tight spots.
 *
 * It is the kit's Pill underneath (shape, size steps, glass/skeleton support);
 * only the hue is ours, since a game's accent is not one of the kit's tones.
 */
export function GameTag({
  game,
  showName = true,
  /** The mark's edge length. Icon-only chips get a bigger mark than a label
   *  chip does - with no name beside it the glyph IS the whole message. */
  size,
  className,
}: {
  game: string | undefined | null;
  showName?: boolean;
  size?: number;
  className?: string;
}) {
  const def = getGame(game);
  const mark = size ?? (showName ? 15 : 22);
  const pill = (
    <Pill
      size="sm"
      variant="soft"
      className={`gameTag${className ? ` ${className}` : ''}`}
      data-game={def.id}
      data-iconly={showName ? undefined : ''}
      aria-label={showName ? undefined : def.name}
      icon={<GameMark game={def.id} size={mark} />}
      style={{ ['--game-accent' as string]: def.accent }}
    >
      {showName && <span className="gameTagName">{def.name}</span>}
    </Pill>
  );
  // With the name already on the chip there is nothing for a tooltip to add.
  // Icon-only gets the kit Tooltip instead of a `title`, which the browser
  // renders as a slow, unstyled OS bubble that never matches the app.
  return showName ? pill : <Tooltip content={def.name}>{pill}</Tooltip>;
}

/**
 * The game's mark as a solid square tile in its accent - a compact "logo" for a
 * table/deck row (which card game it belongs to). Falls back to the MTG glyph
 * for a game not yet in the registry.
 */
export function GameBadge({
  game,
  size = 26,
  className,
}: {
  game: string | undefined | null;
  size?: number;
  className?: string;
}) {
  const def = getGame(game);
  return (
    <Tooltip content={def.name}>
      <span
        className={`gameBadge${className ? ` ${className}` : ''}`}
        data-game={def.id}
        aria-label={def.name}
        style={{ ['--game-accent' as string]: def.accent }}
      >
        <GameMark game={def.id} size={size} />
      </span>
    </Tooltip>
  );
}
