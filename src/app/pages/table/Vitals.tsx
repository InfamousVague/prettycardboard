import { useRef, useState } from 'react';
import { Button, IconButton, Input, Menu, MenuItem, Tooltip } from '@glacier/react';
import {
  Cpu,
  Minus,
  Paintbrush,
  PlayingCardHand,
  PlayingCardPack,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
  Skull,
  Sparkles,
  Star,
  Swords,
} from '../../icons/backfilled.tsx';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { getGame } from '../../data/games.ts';
import { EMPTY_MANA, MANA_ORDER, ManaSymbol } from '../../components/Mana.tsx';
import { juicePulse } from './juice.ts';
import { useTableUi } from './tableUi.ts';
import { formatFor } from '../../data/formats.ts';
import type { ManaColor, ManaPool, RoomState, TablePlayer } from '../../net/types.ts';

/* The life readout's shared derivations, used by BOTH the floating life card
   and the rail's vitals - one source so the two can never grade the same
   total differently. */
function lifeMeta(me: TablePlayer, room: RoomState, fallbackLabel: string) {
  // Vitals are game-driven. MTG's `life`/`poison` slots are relabeled per the
  // registry: Cyberpunk shows Net (primary) + RAM (secondary), no poison-lethal;
  // Yu-Gi-Oh shows LP only (no secondary resource) and steps in LP-sized bites;
  // Mood Swings shows Rounds won + Score, both of which count UP.
  const cyber = room.game === 'cyberpunk';
  const yugioh = room.game === 'yugioh';
  const gdef = getGame(room.game);
  const primary = gdef.resources.find((r) => r.primary);
  const primaryLabel = primary?.label ?? fallbackLabel;
  // Only Magic's dial goes uncaptioned: there the number IS the life total,
  // sitting in a circle between a minus and a plus. Every other primary
  // resource is not life and needs naming.
  const named = (primary?.id ?? 'life') !== 'life';
  // A resource that counts up toward a goal is never "running out", so it gets
  // none of the pool grading below - Mood Swings opens on 0 rounds, which the
  // life dial would otherwise paint as dead on turn one.
  const countsUp = primary?.up === true;
  // Yu-Gi-Oh life moves in hundreds; a ±1 stepper would be 30 clicks per attack.
  const lifeStep = yugioh ? 100 : 1;

  // How much of the pool is left, as a fraction - so the readout can go
  // bloodied and then critical. A ratio rather than a threshold on the number
  // itself, because the same "10 left" is a scratch at Commander's 40, half a
  // life at Standard's 20, and a rounding error at Yu-Gi-Oh's 8000. The
  // starting value is whatever the table was actually set to, falling back to
  // the game registry's own default for the format.
  const primaryStart = primary?.start ?? 20;
  const startLife =
    room.settings?.startingLife ??
    (typeof primaryStart === 'function' ? primaryStart(room.format ?? '') : primaryStart);
  const lifeFrac = startLife > 0 ? me.life / startLife : 1;
  const lifeState = countsUp
    ? 'ok'
    : me.life <= 0
      ? 'out'
      : lifeFrac <= 0.25
        ? 'critical'
        : lifeFrac <= 0.5
          ? 'bloodied'
          : 'ok';
  return { cyber, yugioh, primaryLabel, named, countsUp, lifeStep, lifeState };
}

/**
 * The player's own resource card: the big total with its steppers (and
 * Yu-Gi-Oh's LP-sized quick steps), with the floating-mana pad directly under
 * it. On desktop the pair floats top-left of the playmat; on a phone it stays
 * inside Vitals in the bottom sheet.
 *
 * Mana sits with life because both are pools you spend down over a turn and
 * read at a glance - they belong to the same question ("what have I got
 * left?"). The my-turn ACTIONS that used to sit between them are board actions,
 * so they went to the board's own floating tools instead (see QuickControls).
 */
export function LifeCard({ me, room }: { me: TablePlayer; room: RoomState }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const lifeRef = useRef<HTMLSpanElement>(null);
  const { yugioh, primaryLabel, named, lifeStep, lifeState } = lifeMeta(me, room, t('tblLife'));
  // The damage plate only earns its place when there is something behind it:
  // commander damage at a Commander table, or a secondary resource. Yu-Gi-Oh
  // has neither, and was opening an empty menu.
  const secondary = getGame(room.game).resources.find((r) => !r.primary);
  const hasCmd = formatFor(room.format).hasCommander;
  const trackerLabel = hasCmd ? t('tblCmdDamage') : (secondary?.label ?? t('tblPoison'));
  return (
    // Chrome-free on purpose: inside the rail's vitals grid it dissolves
    // (display: contents), and the floating wrapper supplies the card look.
    <div className="lifeCard" data-game={room.game || 'mtg'}>
      {named && <div className="vitalCaption">{primaryLabel}</div>}
      {/* The label rides with the number: on a board full of counters, a bare
          figure with two steppers does not say WHAT it counts. */}
      {/* Three slanted plates - step down, the total, step up - cut from the same
          shape as the mana plates below them, so the card reads as one stack of
          the app's plate vocabulary rather than a kit toolbar sitting on top of
          one. Plain <button>s rather than kit IconButtons: the plates need the
          skew and the counter-skewed inner, and the kit's own hashed rules would
          have to be out-specified property by property to get there. */}
      {/* How many characters the total actually needs. Yu-Gi-Oh opens on 8000
          and Magic on 20, so the dial has to hold anything from one glyph to
          five ("-1200"), and a size that suits "20" buries "8000". The CSS
          shrinks the number only when the count demands it - see --pc-life-fit
          in table.css - so Magic's dial is untouched. */}
      <div
        className="lifeBlock"
        data-state={lifeState}
        style={{ ['--pc-life-len' as string]: String(me.life).length }}
      >
        <button
          type="button"
          className="lifeStep pcSlant"
          aria-label={`-${lifeStep}`}
          onClick={() => {
            act({ kind: 'life.add', delta: -lifeStep });
            juicePulse(lifeRef.current, 0.8);
          }}
        >
          <span className="lifeStepInner">
            <Minus size={15} />
          </span>
        </button>
        <span className="lifeTotal pcSlant">
          <span className="lifeTotalInner">
            <span className="lifeBig" ref={lifeRef}>
              {me.life}
            </span>
            {/* No "LIFE" caption on the Magic dial: the number IS the life
                total, sitting in a circle between a minus and a plus, and the
                word only crowded the disc. Every other game captions its
                primary - Net, LP, Rounds - because there the resource is not
                life and needs naming (rendered above, via .vitalCaption). */}
          </span>
        </span>
        <button
          type="button"
          className="lifeStep pcSlant"
          aria-label={`+${lifeStep}`}
          onClick={() => {
            act({ kind: 'life.add', delta: lifeStep });
            juicePulse(lifeRef.current, 0.8);
          }}
        >
          <span className="lifeStepInner">
            <Plus size={15} />
          </span>
        </button>
        {/* Damage taken hangs off the counter it eats. A fourth plate rather
            than a fourth row: commander damage and poison are worth a look a
            few times a game, not permanent height. */}
        {(hasCmd || secondary) && (
          <Menu
            aria-label={trackerLabel}
            placement="bottom-end"
            trigger={
              <button type="button" className="lifeStep pcSlant" aria-label={trackerLabel}>
                <span className="lifeStepInner">
                  <Swords size={15} />
                </span>
              </button>
            }
          >
            <div className="lifeDmgMenu">
              <DamageTracker me={me} room={room} />
            </div>
          </Menu>
        )}
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

      {/* Floating-mana pool (MTG only; the component self-gates on the game
        registry). The authenticated seat owns updates; room state shares it. */}
      <ManaBar room={room} mana={me.mana} />
    </div>
  );
}

/**
 * The my-turn conveniences: draw one, untap all, shuffle, make a token, and the
 * table settings menu.
 *
 * It has two homes and they are not a fallback for each other. On desktop it
 * joins the floating board tools at the top-inline-end of the mat, beside Edit
 * mat layout and the card-size steppers - board actions belong with board
 * actions. A phone has no room to float a second toolbar, so there it stays in
 * the bottom sheet under the life total.
 */
export function QuickControls({ me, room }: { me: TablePlayer; room: RoomState }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [tokenPT, setTokenPT] = useState('1/1');
  const gdef = getGame(room.game);
  const hasMana = gdef.stats.some((s) => s.id === 'mana');
  return (
    <>
      <div className="convenience">
        <Tooltip content={`${t('tblDraw')} 1`}>
          <IconButton size="sm" variant="soft" aria-label={t('tblDraw')} onClick={() => act({ kind: 'draw', count: 1 })}>
            <PlayingCardHand size={15} />
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
        {gdef.tokens && (
          <Tooltip content={t('tblToken')}>
            <IconButton
              size="sm"
              variant={tokenOpen ? 'solid' : 'soft'}
              aria-label={t('tblToken')}
              // MTG opens the full token picker (search + deck tokens); the other
              // games have no token catalogue, so they keep the plain name form
              // (Yu-Gi-Oh's Sheep/Kuriboh tokens are freeform names + stats).
              onClick={() =>
                gdef.tokens === 'freeform'
                  ? setTokenOpen(!tokenOpen)
                  : window.dispatchEvent(new Event('pc:create-token'))
              }
            >
              <Sparkles size={15} />
            </IconButton>
          </Tooltip>
        )}
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
          {/* Emptying the pool used to be the little x on the mana total's pill.
              That pill is gone (it appeared only once you banked mana, which
              made the card change height mid-turn), so the action lives here
              rather than being lost with it. MTG-only, like the pad itself. */}
          {!hasMana ? null : (
            <MenuItem onSelect={() => act({ kind: 'mana.clear' })}>
              <Sparkles size={14} /> {t('tblClearMana')}
            </MenuItem>
          )}
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
            <PlayingCardPack size={14} /> {t('navBoosters')}
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
    </>
  );
}

/**
 * What is left in the rail once the player's own console has moved onto the
 * mat: the dice tray and the damage tracker (commander damage per opponent,
 * then poison). Rendered only for the seated player, so all of its actions
 * target `me`.
 *
 * With `hideLife` the console is left out entirely - that is the desktop, where
 * LifeCard floats over the playmat and brings the life total, the quick
 * controls and the mana pad with it. A phone has no mat to float over, so the
 * sheet still renders LifeCard inline and gets the same cluster in one place.
 */
export function Vitals({ me, room, hideLife }: { me: TablePlayer; room: RoomState; hideLife?: boolean }) {
  return (
    <div className="myVitals" data-game={room.game || 'mtg'}>
      {!hideLife && <LifeCard me={me} room={room} />}
      {/* Phone only, and the same condition as the life card by design: where
          the sheet IS the player's console, the conveniences belong in it. On
          desktop (hideLife) they are already floating on the mat beside the
          board tools, and a second copy here would be two live toolbars. */}
      {!hideLife && <QuickControls me={me} room={room} />}
    </div>
  );
}

/**
 * Commander damage (one row per opponent, 21 = lethal) and the secondary
 * resource (poison, 10 = lethal). It hangs off the life counter as a dropdown
 * rather than sitting open in the rail: it is damage TAKEN, which belongs with
 * the life total it is eating, and most turns there is nothing to look at.
 */
export function DamageTracker({ me, room }: { me: TablePlayer; room: RoomState }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const cmdFoes = formatFor(room.format).hasCommander
    ? room.players.filter((p) => p.seat !== me.seat && !p.conceded)
    : [];
  const gdef = getGame(room.game);
  const secondary = gdef.resources.find((r) => !r.primary);
  const secondaryLabel = secondary?.label ?? t('tblPoison');
  // Poison is the only secondary that KILLS you at a number, and it is the only
  // one worth a skull. Cyberpunk's RAM is a memory pool and Mood Swings' Score
  // is a tally that counts up - flagging either as lethal at 10 would be the
  // app inventing a rule.
  const poison = secondary?.id === 'poison';
  // One row per commander, then the secondary resource, so several kinds of
  // damage read the same way.
  return (
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
          <div className="dmgRow" data-lethal={(poison && me.poison >= 10) || undefined}>
            <span className="dmgLabel" title={secondaryLabel}>
              {poison ? <Skull size={11} /> : secondary.id === 'ram' ? <Cpu size={11} /> : <Star size={11} />}{' '}
              {secondaryLabel}
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

  // Any mana banked at all - the bar's divider lights, nothing resizes.
  const active = MANA_ORDER.some((c) => mana[c] > 0);

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
            {/* Everything the plate contains rides on this ONE wrapper. Two
                reasons, and both bite without it: a skewed plate needs a single
                counter-skewed child (counter-skewing each child rotates it
                about its own centre and the stack comes out stepped), and
                WebKit is unreliable about honouring grid/flex on a <button>
                itself - which is what left the counter row painting as an empty
                capsule on iOS while the desktop looked right.
                The count is ALWAYS rendered and merely hidden at zero, so the
                glyphs cannot shift by a pixel as mana comes and goes. */}
            <span className="manaPipInner">
              <span className="manaCount" data-zero={mana[c] === 0 || undefined}>
                {mana[c]}
              </span>
              <ManaSymbol symbol={c} size={16} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
