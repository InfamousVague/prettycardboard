import { useRef, useState } from 'react';
import { Button, IconButton, Input, Menu, MenuItem, Pill, Tooltip } from '@glacier/react';
import {
  Cpu,
  Hand as HandIcon,
  Minus,
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
import { ManaSymbol } from '../../components/Mana.tsx';
import { juicePulse } from './juice.ts';
import { MANA_ORDER, useTableUi, type ManaColor } from './tableUi.ts';
import type { RoomState, TablePlayer } from '../../net/types.ts';

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
  const cmdFoes =
    room.format === 'commander' ? room.players.filter((p) => p.seat !== me.seat && !p.conceded) : [];

  // Vitals are game-driven. MTG's `life`/`poison` slots are relabeled per the
  // registry: Cyberpunk shows Net (primary) + RAM (secondary), no poison-lethal.
  const cyber = room.game === 'cyberpunk';
  const gdef = getGame(room.game);
  const primaryLabel = gdef.resources.find((r) => r.primary)?.label ?? t('tblLife');
  const secondaryLabel = gdef.resources.find((r) => !r.primary)?.label ?? t('tblPoison');

  return (
    <div className="myVitals" data-game={room.game || 'mtg'}>
      {cyber && <div className="vitalCaption">{primaryLabel}</div>}
      <div className="lifeBlock">
        <IconButton
          size="sm"
          variant="ghost"
          aria-label="-1"
          onClick={() => {
            act({ kind: 'life.add', delta: -1 });
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
          aria-label="+1"
          onClick={() => {
            act({ kind: 'life.add', delta: 1 });
            juicePulse(lifeRef.current, 0.8);
          }}
        >
          <Plus size={14} />
        </IconButton>
      </div>
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
            // MTG opens the full token picker (search + deck tokens); Cyberpunk
            // has no token catalogue, so it keeps the plain custom-name form.
            onClick={() => (cyber ? setTokenOpen(!tokenOpen) : window.dispatchEvent(new Event('pc:create-token')))}
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
         registry). A local play aid for banking mana tapped from lands. */}
      <ManaBar room={room} />

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
      </div>
    </div>
  );
}

/**
 * Floating-mana pool - a client-only play aid for freeform MTG. Tapping a land
 * has no rules engine to feed a mana pool, so this lets a player bank the mana
 * they produce and spend it down as they cast. Left-tap a pip to add one; the
 * little minus badge (or right-click / ArrowDown, or hold the minus to repeat)
 * spends one; the X empties the whole pool the way mana clears between phases.
 *
 * MTG-only by registry: it renders only for games whose GameDef declares a
 * `mana` stat, so Cyberpunk (and any future non-mana game) never sees it. State
 * lives in the table-UI store, in memory - never persisted, never server-synced
 * (it is high-frequency and ephemeral, so a restored pool would be wrong).
 */
function ManaBar({ room }: { room: RoomState }) {
  const t = useT();
  const mana = useTableUi((s) => s.mana);
  const addMana = useTableUi((s) => s.addMana);
  const clearAll = useTableUi((s) => s.clearMana);
  const holdRef = useRef<number | null>(null);

  if (!getGame(room.game).stats.some((s) => s.id === 'mana')) return null;

  const total = MANA_ORDER.reduce((n, c) => n + mana[c], 0);
  const active = total > 0;

  const bump = (c: ManaColor, d: number, el?: HTMLElement | null) => {
    addMana(c, d);
    if (d > 0 && el) juicePulse(el, 0.6);
  };
  const endHold = () => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  };
  // Press-and-hold the minus to auto-repeat, so paying a generic {N} is one press.
  const startHold = (c: ManaColor) => {
    endHold();
    holdRef.current = window.setTimeout(function tick() {
      addMana(c, -1);
      holdRef.current = window.setTimeout(tick, 125);
    }, 400);
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
            aria-label={`${c}: ${mana[c]}`}
            onClick={(e) => bump(c, +1, e.currentTarget)}
            onContextMenu={(e) => {
              e.preventDefault();
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
            <ManaSymbol symbol={c} size={active ? 20 : 16} />
            {mana[c] > 0 && <span className="manaCount">{mana[c]}</span>}
            {active && mana[c] > 0 && (
              <span
                className="manaMinus"
                role="button"
                tabIndex={-1}
                aria-hidden
                onClick={(e) => {
                  e.stopPropagation();
                  bump(c, -1);
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startHold(c);
                }}
                onPointerUp={endHold}
                onPointerLeave={endHold}
                onPointerCancel={endHold}
              >
                <Minus size={9} />
              </span>
            )}
          </button>
        ))}
      </div>
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
            onRemove={clearAll}
            aria-label={`${t('tblFloatingTotal')}: ${total}`}
          >
            {total}
          </Pill>
        </Tooltip>
      )}
    </div>
  );
}
