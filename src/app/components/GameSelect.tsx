import { MultiSelect, type ControlSize } from '@glacier/react';
import { useT } from '../i18n.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
import { GameStageTag } from './GameTag.tsx';
import './GameSelect.css';

/**
 * The one game picker. Every surface that asks "which card game?" - Browse,
 * the deck library filter, quick play, the table host form - renders this, so
 * the control reads the same everywhere and the list of games comes from one
 * place (useVisibleGames, which hides WIP games).
 *
 * It is a MultiSelect because the filtering surfaces genuinely take several
 * games at once (show me my Magic AND Yu-Gi-Oh decks). Hosting a table cannot:
 * a table is one game. `single` keeps the same control and typeahead there but
 * collapses the selection to the game picked last, so the two never look like
 * different widgets doing the same job.
 */
export function gameLabel(name: string): string {
  // The full "Magic: The Gathering" is three words of chrome in a control the
  // player is scanning for a game, not reading for a trademark.
  return name.replace('Magic: The Gathering', 'Magic');
}

export function GameSelect({
  value,
  onValueChange,
  single,
  placeholder,
  fullWidth,
  size,
  className,
  'aria-label': ariaLabel,
}: {
  /** Selected game ids. In `single` mode this is a one-element list. */
  value: string[];
  onValueChange: (value: string[]) => void;
  /** Exactly one game may be selected (hosting a table). */
  single?: boolean;
  placeholder?: string;
  fullWidth?: boolean;
  size?: ControlSize;
  className?: string;
  'aria-label'?: string;
}) {
  const t = useT();
  const games = useVisibleGames();
  const options = games.map((game) => ({
    value: game.id,
    // How finished the game is rides on the option itself, not just the
    // description: this control is the last thing between a player and a table,
    // and "Yu-Gi-Oh!" alone does not tell them the duel is half-built. The
    // chip travels into the selected tag too, so the answer stays on screen
    // after the menu closes.
    label: (
      <span className="gameSelectOption">
        {gameLabel(game.name)}
        <GameStageTag game={game.id} />
      </span>
    ),
    textValue: game.name,
    description: game.tagline,
  }));

  const handle = (next: string[]) => {
    if (!single) {
      onValueChange(next);
      return;
    }
    // Picking a second game swaps to it; clearing the tag leaves the previous
    // choice standing rather than putting the form into a gameless state that
    // nothing downstream (deck list, format, seats) can be built from.
    const added = next.find((id) => !value.includes(id));
    if (added) onValueChange([added]);
    else if (next.length > 0) onValueChange([next[next.length - 1] as string]);
  };

  return (
    <MultiSelect
      options={options}
      value={value}
      onValueChange={handle}
      placeholder={placeholder ?? t('playGame')}
      fullWidth={fullWidth}
      size={size}
      className={className}
      aria-label={ariaLabel ?? t('playGame')}
    />
  );
}
