import { useRef, useState } from 'react';
import { Button, IconButton, Input, Menu, MenuItem, Pill, Tooltip } from '@glacier/react';
import {
  Cpu,
  Dices,
  Hand as HandIcon,
  Minus,
  PackageOpen,
  Paintbrush,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
  Skull,
  Sparkles,
  Swords,
} from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { getGame } from '../../data/games.ts';
import { EMPTY_MANA, MANA_ORDER, ManaSymbol } from '../../components/Mana.tsx';
import { DICE_SIDES, DiceIcon } from '../../components/DiceIcon.tsx';
import { juicePulse } from './juice.ts';
import { useTableUi } from './tableUi.ts';
import { formatFor } from '../../data/formats.ts';
import type { ManaColor, ManaPool, RoomState, TablePlayer } from '../../net/types.ts';

/**
 * The personal vitals + conveniences cluster in the right rail: life (or the
 * game's primary resource), the draw/untap/shuffle/token/settings row, the
 * token-create form, the floating-mana pad (MTG only), and the damage tracker
 * (commander damage per opponent, then poison). Rendered only for the seated
 * player, so all of its actions target `me`.
 */
export function Vitals({ me, room }: { me: TablePlayer; room: RoomState }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [tokenPT, setTokenPT] = useState('1/1');
  const lifeRef = useRef<HTMLSpanElement>(null);
  // Commander damage I've taken from each opponent's commander (21 = lethal).
  // Manual, like all damage now: steppers adjust cmdDamage[fromSeat].
  const cmdFoes = formatFor(room.format).hasCommander
    ? room.players.filter((p) => p.seat !== me.seat && !p.conceded)
    : [];

  // Vitals are game-driven. MTG's `life`/`poison` slots are relabeled per the
  // registry: Cyberpunk shows Net (primary) + RAM (secondary), no poison-lethal;
  // Yu-Gi-Oh shows LP only (no secondary resource) and steps in LP-sized bites.
  const cyber = room.game === 'cyberpunk';
  const yugioh = room.game === 'yugioh';
  const gdef = getGame(room.game);
  const primaryLabel = gdef.resources.find((r) => r.primary)?.label ?? t('tblLife');
  const secondary = gdef.resources.find((r) => !r.primary);
  const secondaryLabel = secondary?.label ?? t('tblPoison');
  // Yu-Gi-Oh life moves in hundreds; a ±1 stepper would be 30 clicks per attack.
  const lifeStep = yugioh ? 100 : 1;

  return (
    <div className="myVitals" data-game={room.game || 'mtg'}>
      {(cyber || yugioh) && <div className="vitalCaption">{primaryLabel}</div>}
      <div className="lifeBlock">
        <IconButton
          size="sm"
          variant="ghost"
          aria-label={`-${lifeStep}`}
          onClick={() => {
            act({ kind: 'life.add', delta: -lifeStep });
            juicePulse(lifeRef.current, 0.8);
          }}
        >
          <Minus size={14} />
        </IconButton>
        <span className="lifeBig" ref={lifeRef}>
          {me.life}
        </span>
        <IconButton
          size="sm"
          variant="ghost"
          aria-label={`+${lifeStep}`}
          onClick={() => {
            act({ kind: 'life.add', delta: lifeStep });
            juicePulse(lifeRef.current, 0.8);
          }}
        >
          <Plus size={14} />
        </IconButton>
      </div>
      {yugioh && (
        <div className="lifeQuick" role="group" aria-label={primaryLabel}>
          {[-1000, -500, 500, 1000].map((delta) => (
            <button
              key={delta}
              type="button"
              className="lifeQuickBtn"
              onClick={() => {
                act({ kind: 'life.add', delta });
                juicePulse(lifeRef.current, 0.8);
              }}
            >
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>
      )}
      <div className="convenience">
        <Tooltip content={`${t('tblDraw')} 1`}>
          <IconButton size="sm" variant="soft" aria-label={t('tblDraw')} onClick={() => act({ kind: 'draw', count: 1 })}>
            <HandIcon size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('tblUntapAll')}>
          <IconButton size="sm" variant="soft" aria-label={t('tblUntapAll')} onClick={() => act({ kind: 'untap.all' })}>
            <RefreshCw size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('tblShuffle')}>
          <IconButton size="sm" variant="soft" aria-label={t('tblShuffle')} onClick={() => act({ kind: 'shuffle' })}>
            <Shuffle size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('tblToken')}>
          <IconButton
            size="sm"
            variant={tokenOpen ? 'solid' : 'soft'}
            aria-label={t('tblToken')}
            // MTG opens the full token picker (search + deck tokens); the other
            // games have no token catalogue, so they keep the plain name form
            // (Yu-Gi-Oh's Sheep/Kuriboh tokens are freeform names + stats).
            onClick={() => (cyber || yugioh ? setTokenOpen(!tokenOpen) : window.dispatchEvent(new Event('pc:create-token')))}
          >
            <Sparkles size={15} />
          </IconButton>
        </Tooltip>
        {/* Undo/redo/replay moved to the dedicated TimelineCard below vitals. */}
        <Menu
          aria-label={t('gpTableSettings')}
          placement="top-end"
          trigger={
            <IconButton size="sm" variant="soft" aria-label={t('gpTableSettings')}>
              <Settings size={15} />
            </IconButton>
          }
        >
          <MenuItem onSelect={() => window.dispatchEvent(new Event('pc:open-customize'))}>
            <Paintbrush size={14} /> {t('navCustomize')}
          </MenuItem>
          <MenuItem onSelect={() => window.dispatchEvent(new Event('pc:open-settings'))}>
            <Settings size={14} /> {t('navSettings')}
          </MenuItem>
          {/* The pack dock's own launcher can be hidden, and at a table there
              is no rail to bring it back - so the way back to packs lives here,
              in the one menu a seated player always has. */}
          <MenuItem
            onSelect={() => {
              // Latched as well as dispatched, the same way App.tsx asks: the
              // dock is code-split, so a request made while its chunk is still
              // streaming would land on no listener and be lost.
              (window as { __pcPackDock?: 'open' | 'show' }).__pcPackDock = 'open';
              window.dispatchEvent(new CustomEvent('pc:open-packdock', { detail: { open: true } }));
            }}
          >
            <PackageOpen size={14} /> {t('navBoosters')}
          </MenuItem>
        </Menu>
      </div>

      {tokenOpen && (
        <form
          className="tokenForm"
          onSubmit={(event) => {
            event.preventDefault();
            const [power, toughness] = tokenPT.split('/');
            act({
              kind: 'token.create',
              name: tokenName || 'Token',
              power: power?.trim(),
              toughness: toughness?.trim(),
              x: 0.5,
              y: 0.55,
            });
            setTokenOpen(false);
            setTokenName('');
          }}
        >
          <Input size="sm" value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="Treasure" />
          <Input size="sm" value={tokenPT} onChange={(event) => setTokenPT(event.target.value)} placeholder="1/1" style={{ width: '4.5rem' }} />
          <Button size="sm" type="submit">
            +
          </Button>
        </form>
      )}

      {/* Floating-mana pool (MTG only; the component self-gates on the game
        registry). The authenticated seat owns updates; room state shares it. */}
      <ManaBar room={room} mana={me.mana} />

      {/* Dice tray (non-Cyberpunk; Cyberpunk rolls from its Fixer panel). Rolls a
         real 3D physics die on the mat and logs the result. */}
      {!cyber && (
        <div className="diceTray" role="group" aria-label={t('tblRollDice')}>
          <span className="diceTrayLabel">
            <Dices size={12} /> {t('tblDice')}
          </span>
          <div className="diceTrayDice">
            {DICE_SIDES.map((sides) => (
              <Tooltip key={sides} content={`${t('tblRollDice')} d${sides}`}>
                <button
                  type="button"
                  className="diceTrayDie"
                  aria-label={`${t('tblRollDice')} d${sides}`}
                  onClick={() => act({ kind: 'dice.roll', sides })}
                >
                  <DiceIcon sides={sides} size={24} />
                </button>
              </Tooltip>
            ))}
            <button
              type="button"
              className="diceTrayDie diceTrayCoin"
              onClick={() => act({ kind: 'dice.roll', sides: 2 })}
            >
              {t('tblCoin')}
            </button>
          </div>
        </div>
      )}

      {/* Damage tracker: one row per commander (21 = lethal), then poison
         (10 = lethal), so several kinds of damage read the same way. */}
      <div className="dmgTrack">
        {cmdFoes.map((foe) => {
          const taken = me.cmdDamage[String(foe.seat)] ?? 0;
          // My OWN commander damage taken. With one opponent it's just my
          // counter; with several, name the source so 21-from-one still reads.
          const label = cmdFoes.length === 1 ? t('tblCmdDamage') : `${t('tblCmdDamage')}: ${foe.username}`;
          return (
            <div key={foe.userId} className="dmgRow" data-lethal={taken >= 21 || undefined}>
              <span className="dmgLabel" title={label}>
                <Swords size={11} /> {label}
              </span>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={`-1 ${label}`}
                onClick={() => act({ kind: 'cmd.damage', fromSeat: foe.seat, delta: -1 })}
              >
                <Minus size={12} />
              </IconButton>
              <span className="dmgVal">{taken}</span>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label={`+1 ${label}`}
                onClick={() => act({ kind: 'cmd.damage', fromSeat: foe.seat, delta: 1 })}
              >
                <Plus size={12} />
              </IconButton>
            </div>
          );
        })}
        {/* Games without a secondary resource (Yu-Gi-Oh) skip the row entirely. */}
        {secondary && (
          <div className="dmgRow" data-lethal={(!cyber && me.poison >= 10) || undefined}>
            <span className="dmgLabel" title={secondaryLabel}>
              {cyber ? <Cpu size={11} /> : <Skull size={11} />} {secondaryLabel}
            </span>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={`-1 ${secondaryLabel}`}
              onClick={() => act({ kind: 'poison.add', delta: -1 })}
            >
              <Minus size={12} />
            </IconButton>
            <span className="dmgVal">{me.poison}</span>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={`+1 ${secondaryLabel}`}
              onClick={() => act({ kind: 'poison.add', delta: 1 })}
            >
              <Plus size={12} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Floating-mana pool - a server-authoritative play aid for freeform MTG.
 * Tapping a land has no rules engine to feed a mana pool, so this lets a player
 * bank the mana they produce and spend it down as they cast. Only this seat can
 * mutate its pool; every room viewer receives the public value. Left-tap a pip to add one; the
 * little minus badge (or right-click / ArrowDown, or hold the minus to repeat)
 * spends one; the X empties the whole pool the way mana clears between phases.
 *
 * MTG-only by registry: it renders only for games whose GameDef declares a
 * `mana` stat. The server owns the pool on this authenticated player's seat and
 * broadcasts it to every player and spectator.
 */
function ManaBar({ room, mana = EMPTY_MANA }: { room: RoomState; mana?: ManaPool }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const holdRef = useRef<number | null>(null);
  // Set once a press-and-hold has actually started spending, so the click that
  // ends the hold doesn't also add one back.
  const heldRef = useRef(false);

  if (!getGame(room.game).stats.some((s) => s.id === 'mana')) return null;

  const total = MANA_ORDER.reduce((n, c) => n + mana[c], 0);
  const active = total > 0;

  const bump = (c: ManaColor, d: number, el?: HTMLElement | null) => {
    act({ kind: 'mana.add', color: c, delta: d });
    if (d > 0 && el) juicePulse(el, 0.6);
  };
  const endHold = () => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };
  // Press-and-hold a pip to spend it (and auto-repeat, so paying a generic {N}
  // is one press). Right-click spends one too; a plain tap adds one.
  const startHold = (c: ManaColor) => {
    endHold();
    heldRef.current = false;
    holdRef.current = window.setTimeout(function tick() {
      heldRef.current = true;
      act({ kind: 'mana.add', color: c, delta: -1 });
      holdRef.current = window.setTimeout(tick, 140);
    }, 380);
  };

  return (
    <div className="manaBar" data-active={active || undefined} role="group" aria-label={t('tblFloatingMana')}>
      <div className="manaPips">
        {MANA_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            className="manaPip"
            data-color={c}
            data-has={mana[c] > 0 || undefined}
            aria-label={`${c}: ${mana[c]} — tap to add, hold or right-click to spend`}
            onPointerDown={(e) => {
              // Primary button only: a mouse right-press must not arm the hold,
              // or the contextmenu guard below swallows the spend on platforms
              // that fire contextmenu before pointerup (macOS/Linux). Touch and
              // pen report button 0, so the Android double-fire guard still sees
              // the armed timer.
              if (e.button === 0) startHold(c);
            }}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onClick={(e) => {
              // A hold already spent; don't add one back on the release-click.
              if (heldRef.current) {
                heldRef.current = false;
                return;
              }
              bump(c, +1, e.currentTarget);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              // Android touch long-press fires BOTH our 380ms hold-to-spend
              // AND native contextmenu (~500ms) - don't double-decrement.
              if (holdRef.current !== null || heldRef.current) return;
              bump(c, -1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === '+') {
                e.preventDefault();
                bump(c, +1, e.currentTarget);
              } else if (e.key === 'ArrowDown' || e.key === '-') {
                e.preventDefault();
                bump(c, -1);
              }
            }}
          >
            <ManaSymbol symbol={c} size={active ? 24 : 20} />
            {mana[c] > 0 && <span className="manaCount">{mana[c]}</span>}
          </button>
        ))}
      </div>
      {/* The tail row is always present (reserving its height) so banking the
         first mana only fills it in rather than growing the bar and shoving the
         poison row below it down. */}
      <div className="manaTail">
        {active && (
          <Tooltip content={t('tblClearMana')}>
            {/* One native Pill carries both the running total and, via its built-in
               onRemove affordance, the clear-pool button - the "empties between
               phases" gesture. Clicking the number does nothing; only the x clears,
               so the pool is never nuked by accident. */}
            <Pill
              className="manaTotalPill"
              size="sm"
              tone="accent"
              variant="soft"
              onRemove={() => act({ kind: 'mana.clear' })}
              aria-label={`${t('tblFloatingTotal')}: ${total}`}
            >
              {total}
            </Pill>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
