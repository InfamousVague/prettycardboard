import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue } from 'motion/react';
import {
  Button,
  IconButton,
  Pill,
  ResizableSplitPane,
  SearchField,
  SegmentedControl,
  Size,
  Skeleton,
  Spinner,
  Text,
  TextTone,
} from '@glacier/react';
import { PackageOpen, Percent, Sparkles, X } from '@glacier/icons';
import { useT, type MessageKey } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import { GameCard } from './GameCard.tsx';
import { PackFan, SetIcon, pullKey, useBoosterArt } from './packVisuals.tsx';
import { PullFeed } from './PullFeed.tsx';
import {
  boosterArtUrl,
  boosterCardUrl,
  loadBoosterSets,
  loadSetPool,
  poolReady,
  type BoosterSet,
  type SetPool,
} from '../data/boosterSets.ts';
import { cardBackUrl, effectiveCardBack } from '../data/cardBacks.ts';
import {
  RARITY_RANK,
  cardOdds,
  foilChancePerPack,
  mythicChance,
  openPack,
  specFor,
  type PackCard,
} from '../data/boosters.ts';
import { recordPack } from '../data/packRecord.ts';
import {
  loadPackIndex,
  loadSealedProducts,
  openCollated,
  openSealed,
  type PackIndex,
  type SealedProduct,
} from '../data/packs.ts';
import { usePhoneViewport } from '../hooks/useIsPhone.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import { useApp } from '../state/appStore.ts';
import './packDock.css';

/**
 * The floating pack dock: a pack to rip from ANYWHERE in the app.
 *
 * Waiting is most of a multiplayer game - for the last seat to join, for the
 * turn to come back round - and this is what you do with those minutes. It
 * mounts once, high in the tree, so the same dock follows the player from the
 * lobby to the table, and it collapses to one small button that remembers its
 * own state between sessions.
 *
 * Three rules shape everything below:
 *
 *   1. It must never cost anyone a game. The dock lives on the inline-START
 *      edge at mid-height, clear of the phone's thumb corners: End turn owns
 *      bottom-inline-end, the zone piles own bottom-inline-start. Incoming
 *      notifications are pointer-events:none, so a cheer can never eat a tap.
 *   2. The pack maths is not reimplemented here. `specFor`/`openPack` and the
 *      Scryfall pools are the booster page's, imported as-is - one collation
 *      model for the whole app.
 *   3. The SERVER decides what is new and what is notable. It owns the
 *      collection and the one `is_notable` rule, so the dock celebrates what
 *      comes back from /api/collection/pulls rather than guessing locally.
 */

/** Limited Edition Alpha: where Black Lotus and the Power Nine live. */
const DEFAULT_SET_CODE = 'lea';

/**
 * What to offer before anyone has typed anything. An empty search box in front
 * of ~700 products is a dead end, so the list opens on things actually worth
 * ripping: the Power Nine, the two Modern Horizons, the Ring, and a Secret Lair
 * drop to advertise that the picker now reaches past boosters.
 *
 * Codes that Scryfall does not return are skipped rather than rendered blank,
 * and the list is topped up with the newest releases so it is never short.
 */
const RECOMMENDED_CODES = ['lea', 'mh3', 'ltr', 'sld', 'mh2', 'fdn'];

/** How many recommendations to show, padding included. */
const RECOMMENDED_MAX = 8;

/** A search hands back a list to scan, not a catalogue to browse. */
const RESULT_MAX = 60;

/**
 * One thing you can open: a set, or a single Secret Lair drop.
 *
 * The two have to share a list because they are the same gesture, but they are
 * not the same object - Scryfall has no drop objects at all, so a drop's
 * identity is its MTGJSON product uuid while its ARTWORK, its set symbol and
 * its collection record all still belong to the parent `sld` set. Hence both
 * `key` (what the picker selects) and `code` (what everything else uses).
 */
interface Pick {
  /** A set code, or `sld:<uuid>` for a drop. Set codes contain no colon. */
  key: string;
  /** The parent set: artwork, set symbol, and what a pull is recorded against. */
  code: string;
  name: string;
  released: string;
  setType: string;
  iconUrl: string;
  preview: boolean;
  /** Present on drops: the sealed product to deal. */
  dropId?: string;
  /** True when Wizards' real collation is on disk for this set. */
  exact?: boolean;
  /** Lowercased text the search box matches against. */
  haystack: string;
}

/** The floor on a pack opening, so the button cannot be spammed and the tear
 *  animation always gets to play through. It has to outlast the whole
 *  choreography - the top strip tearing off, then the stack sliding out of the
 *  wrapper - or the fan would cut the opening short on a warm pool cache. */
const MIN_RIP_MS = 1500;

/** How many face-down cards slide up out of the wrapper while it is torn. */
const RIP_CARDS = 5;

/** The set's three showcase cards, fanned out of the box on the shelf. */
const SHOWCASE = [0, 1, 2];

/**
 * How long a set has to stay selected before its pool is fetched for the pull
 * rates. The results list is a thing you scrub - arrow keys, a run of clicks
 * looking for the right expansion - and a cold set costs five Scryfall
 * searches, so firing on every selection would rate-limit the picker to
 * display a number nobody paused long enough to read. A set already in the
 * session cache skips the wait entirely.
 */
const RATES_DEBOUNCE_MS = 400;

/** Placeholder rows held while the pool for the per-card odds is in flight. */
const ODDS_SKELETON = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * A per-card pull chance as a percentage.
 *
 * These land between about a tenth of a percent (a mythic in a big set) and
 * ten percent (a common in a small one), and a fixed number of decimals is
 * wrong at one end or the other of that: two decimals turns every common into
 * noise, one turns half the mythics into "0.1%". So the precision follows the
 * magnitude, which keeps two significant figures across the whole range and
 * keeps the column the same width.
 */
function formatChance(chance: number): string {
  const percent = chance * 100;
  if (percent >= 10) return `${percent.toFixed(0)}%`;
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  return `${percent.toFixed(2)}%`;
}

/** Collapsed/expanded state and the last set, so the dock reopens where it was. */
/**
 * Where the dock remembers itself.
 *
 * Bumped to v2 when the resting position moved from mid-inline-start to the
 * bottom-inline-end corner: a stored `pos` is an OFFSET from wherever the
 * stylesheet parks the dock, so every offset saved against the old anchor
 * would now be measured from a corner two thirds of the screen away and fling
 * the pill somewhere no one put it. Retiring the key is cheaper and more
 * honest than migrating a number whose frame of reference no longer exists.
 */
const MEMORY_KEY = 'pc.packdock.v2';

/** How long an incoming pull notification stays on screen. */
const NOTICE_MS = 6500;

/** At most this many notifications stack at once; the oldest ages out first. */
const NOTICE_MAX = 3;

/** Keep at least this much of the pill inside the viewport. An off-screen pill
 *  cannot be grabbed back, and its position outlives the session. */
const PILL_EDGE = 8;

/** The panel gets a wider margin than the pill. It is a reading surface rather
 *  than a grab handle, and a panel flush against the bezel reads as cut off
 *  even when every pixel of it is technically on screen.
 *
 *  Mirrored by `--pd-panel-edge` in packDock.css, which subtracts BOTH gutters
 *  from the panel's width caps so a fitting placement always exists. The two
 *  are documented as a pair, and `fitAxis` gives the margin up rather than the
 *  screen edge if they ever drift apart anyway. */
const PANEL_EDGE = 12;

/** A correction smaller than this is measurement noise, not a box off the
 *  screen: the engine quantises rects, so a box parked exactly on the gutter
 *  re-measures a few billionths of a pixel outside it and would otherwise
 *  re-render, re-persist and creep on every single load. */
const SETTLE_EPSILON = 0.05;

/**
 * The SMALLEST translation that brings `box` fully inside `view`, keeping
 * `gutter` px of margin on every edge the viewport has room for. A box that
 * already sits inside gets `{ dx: 0, dy: 0 }`: this is a nudge, never a
 * re-park, so a dock the player dragged somewhere deliberate stays as near to
 * there as the viewport allows.
 *
 * Being ON SCREEN outranks the margin. A box wider than `view - 2 * gutter`
 * but still narrower than `view` is placed fully inside with the leftover
 * split evenly, rather than pinned to one edge with the other hanging off -
 * "fully inside" is the contract, the gutter is the preference.
 *
 * A box too big for the viewport ITSELF has no fully-inside placement at all:
 * that one pins to the NEAR edge (top / inline-start), keeps its margin there
 * and is left to scroll. The range is never inverted, because inverting it is
 * exactly how "rendered off screen" turned into "stuck off screen": the far
 * edge would win, the close button would sit outside the window, and the bad
 * offset is persisted.
 *
 * Plain numbers in, plain numbers out - no DOM, no globals. This is the one
 * piece of the dock that has to be right at every window size, orientation and
 * writing mode, and that is only checkable in isolation.
 */
export function fitIntoViewport(
  box: { left: number; top: number; width: number; height: number },
  view: { width: number; height: number },
  gutter: number,
): { dx: number; dy: number } {
  return {
    dx: fitAxis(box.left, box.width, view.width, gutter),
    dy: fitAxis(box.top, box.height, view.height, gutter),
  };
}

/** One axis of `fitIntoViewport`. */
function fitAxis(start: number, size: number, view: number, gutter: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(size) || !Number.isFinite(view)) return 0;
  // A gutter wider than half the viewport would push the box off the far side
  // in the name of margin, so it is capped: the function stays total.
  const pad = Number.isFinite(gutter) ? Math.min(Math.max(gutter, 0), Math.max(view, 0) / 2) : 0;
  const slack = view - size;
  // Bigger than the whole viewport: nothing fits, so pin to the near edge with
  // its margin. Never invert the range onto the far edge.
  if (slack < 0) return pad - start;
  // Not enough room for two full gutters: keep the box fully inside and split
  // what is left evenly, so the margin shrinks symmetrically instead of one
  // edge hanging off in the name of the other's margin.
  const lo = Math.min(pad, slack / 2);
  return Math.min(Math.max(start, lo), slack - lo) - start;
}

/**
 * `fitIntoViewport` for the dock, with the gutter capped per axis at the margin
 * the STYLESHEET's own resting position already leaves.
 *
 * `.pdDock` parks itself `--glacier-space-2` from the inline edge - about
 * 10.5px at desktop density, less than PANEL_EDGE. A clamp that insisted on a
 * wider margin than the design's own would shove the dock off its anchor the
 * very first time the panel opened, and persist an offset the player never
 * dragged. The clamp is a rescue, not a re-park: it never asks for more room
 * than the resting position has.
 *
 * `offset` is the translate `box` was measured with, so the resting box is the
 * measured one minus it.
 */
function fitDock(
  box: { left: number; top: number; width: number; height: number },
  offset: { x: number; y: number },
  view: { width: number; height: number },
  gutter: number,
): { dx: number; dy: number } {
  return {
    dx: fitAxis(box.left, box.width, view.width, restPad(gutter, box.left - offset.x, box.width, view.width)),
    dy: fitAxis(box.top, box.height, view.height, restPad(gutter, box.top - offset.y, box.height, view.height)),
  };
}

/** One axis of `fitDock`'s gutter: never wider than the tighter of the two
 *  margins the untranslated dock already sits with. */
function restPad(want: number, rest: number, size: number, view: number): number {
  const nearest = Math.min(rest, view - rest - size);
  if (!Number.isFinite(nearest)) return want;
  return Math.max(0, Math.min(want, nearest));
}

/** The viewport, as `fitIntoViewport` wants it. */
function viewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The element's own border box, in CSS pixels and untouched by any transform.
 *
 * `offsetWidth`/`offsetHeight` are the obvious source and are what the size
 * checks below still use, but the engine ROUNDS them to whole pixels: a panel
 * that is really 422.39px wide reports 422, and a clamp against the far edge
 * then lands ~0.4px short of the gutter it promised. The computed size is the
 * exact used value and - unlike `getBoundingClientRect` - is not scaled by the
 * springs this dock is always part-way through. Content-box sizing would make
 * it mean something else entirely, so that falls back.
 */
function layoutSize(el: HTMLElement): { width: number; height: number } {
  const style = window.getComputedStyle(el);
  if (style.boxSizing === 'border-box') {
    const width = Number.parseFloat(style.width);
    const height = Number.parseFloat(style.height);
    if (width > 0 && height > 0) return { width, height };
  }
  return { width: el.offsetWidth, height: el.offsetHeight };
}

/**
 * `el`'s layout offset from `dock`, or null if it is not laid out inside it.
 *
 * The whole chain is walked rather than checking `el.offsetParent === dock`,
 * because motion puts a transform on the wrapper it animates and a TRANSFORMED
 * element becomes its descendants' `offsetParent` in Chrome. The pill is one
 * such wrapper deep, so during its enter spring the direct check failed, the
 * caller fell through to the painted rect, and the clamp measured the pill
 * mid-`scale: 0.8` - 18px narrower than it lands - and left it hanging off the
 * edge it was supposed to be rescued from. `offsetLeft` itself is pure layout,
 * so summing the chain is transform-proof.
 */
function offsetWithin(dock: HTMLElement, el: HTMLElement): { left: number; top: number } | null {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== dock) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === dock ? { left, top } : null;
}

/**
 * The box `el` occupies in viewport coordinates, optionally shifted by a dock
 * offset that has not been applied yet.
 *
 * Measured from LAYOUT (`offsetLeft` + the computed size) rather than from
 * `getBoundingClientRect`, because everything in this dock is mid-animation
 * when a clamp runs: the panel springs in from `scale: 0.94, x: -10`, the pill
 * springs in from `scale: 0.8`, and the pill is measured again at the end of a
 * drag while motion is still carrying the gesture as a transform. Layout
 * ignores all of it. `.pdDock`'s own rect carries the only transform that
 * counts - the pure translate this component sets - so adding the two is exact.
 */
function boxAt(
  dock: HTMLElement,
  el: HTMLElement,
  shift?: { x: number; y: number },
): { left: number; top: number; width: number; height: number } {
  const dx = shift?.x ?? 0;
  const dy = shift?.y ?? 0;
  const dockRect = dock.getBoundingClientRect();
  const offset = offsetWithin(dock, el);
  if (offset) {
    const size = layoutSize(el);
    return {
      left: dockRect.left + offset.left + dx,
      top: dockRect.top + offset.top + dy,
      width: size.width,
      height: size.height,
    };
  }
  // Not laid out against the dock at all (the phone panel is position:fixed):
  // fall back to the painted rect. A repeat clamp settles whatever an in-flight
  // animation skewed.
  const rect = el.getBoundingClientRect();
  return { left: rect.left + dx, top: rect.top + dy, width: rect.width, height: rect.height };
}

/** The relaunch request, latched on `window` as well as dispatched: this
 *  component is code-split, so an ask made while its chunk was still loading
 *  would otherwise land with no listener at all and be lost. */
type PackDockLatch = { __pcPackDock?: 'open' | 'show' };

interface Memory {
  open: boolean;
  /** Dismissed entirely: the pill is gone until relaunched from the sidebar. */
  dismissed: boolean;
  /** Where the player dragged the pill, as a viewport offset. */
  pos: { x: number; y: number } | null;
  set: string;
}

function loadMemory(): Memory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Memory>) : {};
    return {
      open: parsed.open === true,
      set: typeof parsed.set === 'string' ? parsed.set : '',
      dismissed: parsed.dismissed === true,
      pos:
        parsed.pos && typeof parsed.pos === 'object'
          ? { x: Number((parsed.pos as { x: number }).x) || 0, y: Number((parsed.pos as { y: number }).y) || 0 }
          : null,
    };
  } catch {
    return { open: false, set: '', dismissed: false, pos: null };
  }
}

function saveMemory(memory: Memory): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Private mode / quota: the dock just forgets between sessions.
  }
}

/** One transient "they pulled something" notification. */
interface Notice {
  id: string;
  username: string;
  name: string;
  scryfallId: string;
  rarity: string;
  foil: boolean;
}

/** Rarest first, foils ahead of their non-foil twins. */
function bestFirst(cards: PackCard[]): PackCard[] {
  return [...cards].sort(
    (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || Number(b.foil) - Number(a.foil),
  );
}

/** One figure in the pull-rate block: the number, then what it measures. */
function Rate({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="pdRate">
      <span className="pdRateValue">{value}</span>
      <span className="pdRateLabel">{label}</span>
    </span>
  );
}

/**
 * The outermost of the pack tab's two dividers - the one that gives the odds
 * cards a pane of their own to the left of everything else.
 *
 * A separate component rather than a ternary inline because a phone sheet gets
 * no third pane at all: three horizontal columns will not fit across a phone,
 * and three stacked bands leave none of them tall enough to be worth resizing.
 * There the cards fold into the controls rail instead and this renders nothing
 * but its child, so the sheet keeps exactly the one divider it has always had.
 */
function OddsSplit({
  phone,
  odds,
  label,
  children,
}: {
  phone: boolean;
  odds: ReactNode;
  label: string;
  children: ReactNode;
}) {
  if (phone) return <>{children}</>;
  return (
    <ResizableSplitPane
      className="pdSplit pdSplitOdds"
      orientation="horizontal"
      // The narrowest of the three: a card name beside its percentage is all it
      // has to fit, and it is reference material rather than somewhere you act.
      defaultRatio={0.22}
      min={0.14}
      max={0.45}
      aria-label={label}
    >
      <div className="pdOddsPane">{odds}</div>
      {children}
    </ResizableSplitPane>
  );
}

export default function PackDock() {
  const t = useT();
  const identity = useApp((state) => state.identity);

  const [memory] = useState(loadMemory);
  const [open, setOpen] = useState(memory.open);
  // Dismissed = the pill is gone entirely; the sidebar's Boosters entry brings
  // it back (see the pc:open-packdock listener below).
  const [dismissed, setDismissed] = useState(memory.dismissed);
  const [pos, setPos] = useState(memory.pos ?? { x: 0, y: 0 });
  // Phone: the stylesheet lifts the panel out of the dock and pins it to the
  // viewport with `position: fixed`, which only holds while no ancestor is
  // transformed - so the dock carries no offset at all while it is up. Read
  // back from the CSS in `settle` rather than re-declared here, so the two can
  // never drift apart.
  const [anchored, setAnchored] = useState(false);
  const [tab, setTab] = useState<'pack' | 'feed'>('pack');

  const [sets, setSets] = useState<BoosterSet[] | null>(null);
  const [setsFailed, setSetsFailed] = useState(false);
  // The bundled pack data: which sets have real collation, and every Secret
  // Lair drop. Both are static files that ship with the build, so a failure
  // here is not worth surfacing - the date-inferred simulator still works and
  // the picker just lists sets only.
  const [drops, setDrops] = useState<SealedProduct[] | null>(null);
  const [packIndex, setPackIndex] = useState<PackIndex | null>(null);
  const [pickKey, setPickKey] = useState(memory.set);
  const [query, setQuery] = useState('');

  // The set's product art can 404 for obscure sets, so the shelf tracks what
  // actually loaded and degrades to the plain name rather than a broken image.
  // A drop's key carries its parent set in front of the colon, so the artwork
  // resolves without waiting for the product list to arrive.
  const art = useBoosterArt(pickKey.split(':')[0] ?? '');
  const [shotsFailed, setShotsFailed] = useState<number[]>([]);

  const [busy, setBusy] = useState(false);
  const [poolFailed, setPoolFailed] = useState(false);
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<'idle' | 'saved' | 'offline'>('idle');

  /** The selected set's card pool, for the pull rates. Null while it loads. */
  const [ratePool, setRatePool] = useState<SetPool | null>(null);
  /** Packs torn this session, per pick. A session counter on purpose: it is a
   *  "how is this box treating me" number, not a collection statistic, and the
   *  collection page already owns the permanent one. */
  const [openedByPick, setOpenedByPick] = useState<Record<string, number>>({});

  const [feed, setFeed] = useState<api.FeedPull[] | null>(null);
  const [feedFailed, setFeedFailed] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  /** Pulls that landed while the dock was shut - the dot on the button. */
  const [unread, setUnread] = useState(0);

  // The websocket listener is mounted for the whole session, so it reads the
  // panel's state through a ref rather than re-subscribing on every toggle.
  const openRef = useRef(open);
  openRef.current = open;

  /** The container. Always mounted, whatever the dock is showing, so it is the
   *  one box that can be measured even when everything else is gone. */
  const dockRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /** Watches whichever of the two is on screen. The panel grows by a whole grid
   *  of cards when a pack is ripped, so what fitted when it opened can hang off
   *  the bottom later; the pill is smaller but it is also the only handle for
   *  getting a lost dock back, and its label changes with the language. */
  const sizeRef = useRef<ResizeObserver | null>(null);
  /** The offset the dock is rendered with right now, for the listeners and the
   *  drag handler, which both run outside the render that set it. */
  const posRef = useRef(pos);
  posRef.current = pos;
  /** A drag that ends on a pill button still fires a native click - motion
   *  does not suppress it - so that click is swallowed after a real drag. */
  const draggedRef = useRef(false);
  /**
   * The pill's in-flight drag offset, owned here rather than left to motion's
   * internal x/y.
   *
   * The gesture is carried by the PILL and then handed to the DOCK, so the
   * pill's own transform has to go back to zero at the end or the two stack.
   * `animate={{ x: 0, y: 0 }}` cannot do it: motion only runs an animation when
   * the TARGET changes, and this target is zero from the first render, so after
   * a drag the transform simply stayed at the gesture's offset - on top of the
   * dock's new translate. Measured at 1280x800: one drag to the right edge left
   * the pill painted at L2355 (a 1280px viewport) and it never came back.
   */
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  /** The panel closed from inside itself: hand focus back to the pill. */
  const restoreRef = useRef(false);
  /** False until the first render has been committed: a remembered open:true
   *  must not steal focus from whatever the player is doing on page load. */
  const bootedRef = useRef(false);

  useEffect(() => {
    saveMemory({ open, set: pickKey, dismissed, pos });
  }, [open, pickKey, dismissed, pos]);

  // Relaunch after a dismiss: the rail's Boosters entry, landing on the
  // boosters page, and the table's settings menu all fire this, so the pill is
  // never lost for good. `detail.open === false` means "just give the pill
  // back"; anything else is an explicit ask for packs and opens the panel.
  useEffect(() => {
    const latch = window as PackDockLatch;
    const relaunch = (openPanel: boolean) => {
      setDismissed(false);
      if (openPanel) setOpen(true);
    };
    // Drain a request that was latched while this chunk was still loading.
    if (latch.__pcPackDock) {
      relaunch(latch.__pcPackDock === 'open');
      delete latch.__pcPackDock;
    }
    const onRequest = (event: Event) => {
      delete latch.__pcPackDock;
      relaunch((event as CustomEvent<{ open?: boolean }>).detail?.open !== false);
    };
    window.addEventListener('pc:open-packdock', onRequest);
    return () => window.removeEventListener('pc:open-packdock', onRequest);
  }, []);

  /**
   * Move the dock to where a measurement says it belongs.
   *
   * `from` is the offset the measured box was RENDERED with, and the move is
   * absolute (`from + delta`, never `prev + delta`) and guarded on `prev` still
   * being `from`. Both matter, because several clamps land against a single
   * commit - the panel's ref callback, the mount effect and the `anchored`
   * effect all fire before React re-renders - and they all measure the same,
   * not-yet-updated DOM. Accumulating their deltas applied the SAME correction
   * two to five times over: one clamp that asked to move 2180px left moved
   * 4360px, which threw the panel off the opposite edge, persisted it, and is
   * the "stuck in a loop" this whole path exists to prevent. Stale
   * measurements now no-op instead of stacking.
   */
  const nudge = useCallback((from: { x: number; y: number }, delta: { dx: number; dy: number }) => {
    if (Math.abs(delta.dx) < SETTLE_EPSILON && Math.abs(delta.dy) < SETTLE_EPSILON) return;
    setPos((prev) =>
      prev.x === from.x && prev.y === from.y ? { x: from.x + delta.dx, y: from.y + delta.dy } : prev,
    );
  }, []);

  /**
   * Nudge the dock until whatever it is showing is fully inside the viewport:
   * the open PANEL by its own box (it is several times the pill, and the pill's
   * clamp never covered it), the pill when it is the one on screen, or - when
   * the dock is dismissed and there is nothing rendered at all - the dock's own
   * anchor, so the offset is already sane by the time the pill comes back.
   *
   * Called on mount, on open, on resize, on orientationchange and whenever the
   * panel's own box changes size.
   */
  const settle = useCallback(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const view = viewportSize();
    // The offset everything below is measured against: `posRef` is written
    // during render, so it is the offset the DOM in front of us was rendered
    // with even when a newer position is already queued.
    const from = posRef.current;
    const panel = panelRef.current;
    if (panel) {
      // Phone: the stylesheet pins the panel to the viewport itself, so a
      // transformed dock would become its containing block - the dock drops its
      // offset instead, and there is nothing left here to clamp.
      const pinned = window.getComputedStyle(panel).position === 'fixed';
      setAnchored(pinned);
      if (pinned) return;
      if (panel.offsetWidth > 0 && panel.offsetHeight > 0) {
        nudge(from, fitDock(boxAt(dock, panel), from, view, PANEL_EDGE));
        return;
      }
    } else {
      setAnchored(false);
    }
    const pill = pillRef.current;
    if (pill && pill.offsetWidth > 0 && pill.offsetHeight > 0) {
      nudge(from, fitDock(boxAt(dock, pill), from, view, PILL_EDGE));
      return;
    }
    // Dismissed: nothing is rendered to measure, but the offset outlives the
    // dismissal - settle the anchor itself so relaunching cannot hand back a
    // pill that is already off screen.
    nudge(from, fitDock(dock.getBoundingClientRect(), from, view, PILL_EDGE));
  }, [nudge]);

  /** Clamp a prospective dock offset so the pill stays reachable. `next` is
   *  where the drag would leave it, and the pill's box there is its box now
   *  plus the difference - measured from layout, so motion's in-flight drag
   *  transform never has to be backed out. */
  const clampPos = useCallback((next: { x: number; y: number }) => {
    const dock = dockRef.current;
    const pill = pillRef.current;
    if (!dock || !pill || pill.offsetWidth === 0 || pill.offsetHeight === 0) return next;
    const shift = { x: next.x - posRef.current.x, y: next.y - posRef.current.y };
    // Single-shot and absolute (`next + delta`, and `next` is where the drag
    // put it), so this one never had the mount path's stacking problem.
    const { dx, dy } = fitDock(boxAt(dock, pill, shift), next, viewportSize(), PILL_EDGE);
    return { x: next.x + dx, y: next.y + dy };
  }, []);

  /**
   * Pick the dock up from a child that has just mounted.
   *
   * React attaches CHILD refs before the parent's, so on the FIRST mount a
   * clamp fired from the panel's or the pill's own ref callback ran while
   * `dockRef` was still null and bailed out - the very mount that restores a
   * remembered position was the one mount the clamp did not cover, leaving it
   * to a passive effect that only runs after the bad frame has been painted.
   * The dock is the child's own positioned ancestor, so it can be taken from
   * the node instead of waiting a whole commit for React to hand it over.
   */
  const adoptDock = useCallback((node: HTMLElement) => {
    if (!dockRef.current) dockRef.current = node.closest<HTMLDivElement>('.pdDock');
  }, []);

  /** Re-clamp whenever what is on screen changes SIZE. Both of them do: the
   *  panel when a pack lands in it, the pill when its content finishes
   *  arriving. A box that fitted when it mounted must not grow off the edge. */
  const watchSize = useCallback(
    (node: HTMLElement) => {
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => settle());
      observer.observe(node);
      sizeRef.current = observer;
    },
    [settle],
  );

  // A position saved on a bigger window - or kept across a phone rotation -
  // can put the pill outside this viewport, and an off-screen pill can never be
  // dragged back. AnimatePresence mode="wait" mounts the pill only after the
  // panel's exit animation, so the first clamp is fired from the ref callback
  // rather than an effect that would still see a null element.
  const attachPill = useCallback(
    (node: HTMLDivElement | null) => {
      sizeRef.current?.disconnect();
      sizeRef.current = null;
      pillRef.current = node;
      if (!node) return;
      adoptDock(node);
      settle();
      watchSize(node);
      if (restoreRef.current) {
        restoreRef.current = false;
        // The button inside, not the drag wrapper: this is the control that
        // opened the panel, and the panel's close unmounted it.
        node.querySelector('button')?.focus();
      }
    },
    [adoptDock, settle, watchSize],
  );

  // NOT gated on open/dismissed any more. A stale offset has to be recovered
  // whatever state the dock comes back in: an open panel hanging off the edge
  // takes its own close button with it, and the position is persisted - which
  // is how one bad drag survived every reload.
  //
  // A LAYOUT effect: a passive one runs after the browser has painted, so a
  // remembered off-screen position would be shown for a frame before being
  // corrected. This is the only settle the dismissed dock gets (nothing is
  // rendered, so no ref callback fires), and the backstop for the other two.
  useLayoutEffect(() => {
    settle();
    window.addEventListener('resize', settle);
    window.addEventListener('orientationchange', settle);
    return () => {
      window.removeEventListener('resize', settle);
      window.removeEventListener('orientationchange', settle);
    };
  }, [settle]);

  // Crossing the phone breakpoint with the panel open changes the dock's
  // transform, so the box measured on the way through is not the box that
  // lands: settle once more after the flip has been committed. `anchored`
  // follows the stylesheet alone, so this cannot oscillate.
  useLayoutEffect(() => {
    settle();
  }, [anchored, settle]);

  useEffect(() => () => sizeRef.current?.disconnect(), []);

  // Opening the dialog moves focus into it: AnimatePresence unmounts the pill
  // that was just activated, so focus would otherwise fall to <body> and a
  // screen reader would announce nothing. A ref callback rather than an effect
  // on `open`, because mode="wait" mounts the panel only once the pill has
  // finished animating out - an effect would still see a null element. The
  // panel's clamp rides along for the same reason.
  const attachPanel = useCallback(
    (node: HTMLDivElement | null) => {
      sizeRef.current?.disconnect();
      sizeRef.current = null;
      panelRef.current = node;
      if (!node) {
        setAnchored(false);
        return;
      }
      if (bootedRef.current) node.focus();
      adoptDock(node);
      settle();
      // The panel grows as it is used - a pack of cards, a loaded feed - and a
      // panel that fitted when it opened must not grow off the screen.
      watchSize(node);
    },
    [adoptDock, settle, watchSize],
  );

  useEffect(() => {
    bootedRef.current = true;
  }, []);

  // The set list is a session-cached fetch shared with the boosters page, but
  // it is still a network call: nothing loads until the dock is first opened.
  useEffect(() => {
    if (!open || sets || setsFailed) return;
    let alive = true;
    loadBoosterSets()
      .then((list) => alive && setSets(list))
      .catch(() => alive && setSetsFailed(true));
    return () => {
      alive = false;
    };
  }, [open, sets, setsFailed]);

  // The bundled pack data, on the same trigger. Two static files that ship
  // with the build, so they resolve immediately and never rate-limit - but
  // they are still deferred to first open so the shell does not carry them.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadPackIndex()
      .then((index) => alive && setPackIndex(index))
      .catch(() => undefined);
    void loadSealedProducts()
      .then((list) => alive && setDrops(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  /**
   * Everything openable, newest first: every paper set, and every Secret Lair
   * drop as its own product.
   *
   * The drops are the point of the merge. Scryfall files all ~2600 Secret Lair
   * cards in one flat `sld` set, so before this the SpongeBob drop was not
   * missing from the picker - it did not exist as anything the picker could
   * show. Each drop borrows the parent set's symbol and artwork, and carries
   * "secret lair" in its search text because that is what people type.
   */
  const picks = useMemo<Pick[]>(() => {
    if (!sets) return [];
    const out: Pick[] = sets.map((item) => ({
      key: item.code,
      code: item.code,
      name: item.name,
      released: item.released,
      setType: item.setType,
      iconUrl: item.iconUrl,
      preview: item.preview,
      exact: !!packIndex?.specs[item.code],
      haystack: `${item.name} ${item.code}`.toLowerCase(),
    }));
    const icons = new Map(sets.map((item) => [item.code, item.iconUrl]));
    for (const drop of drops ?? []) {
      out.push({
        key: `${drop.set}:${drop.id}`,
        code: drop.set,
        name: drop.name,
        released: drop.released,
        setType: 'box',
        iconUrl: icons.get(drop.set) ?? '',
        preview: false,
        dropId: drop.id,
        haystack: `${drop.name} secret lair`.toLowerCase(),
      });
    }
    return out.sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name));
  }, [sets, drops, packIndex]);

  // A remembered set that no longer exists (or a first run) falls back to
  // Limited Edition Alpha - the first set ever printed, and the only place the
  // Power Nine come out of a pack, which is the draw. Newest-released is the
  // fallback if Alpha is somehow missing from the list.
  useEffect(() => {
    if (!sets || sets.length === 0) return;
    // A drop key is only resolvable once products.json has landed, so do not
    // discard one while that is still in flight.
    if (pickKey.includes(':') && !drops) return;
    if (picks.some((item) => item.key === pickKey)) return;
    const alpha = sets.find((entry) => entry.code === DEFAULT_SET_CODE);
    const fallback = sets.find((entry) => !entry.preview) ?? sets[0]!;
    setPickKey((alpha ?? fallback).code);
  }, [sets, drops, picks, pickKey]);

  const refreshFeed = useCallback(async () => {
    try {
      const rows = await api.pullFeed(30);
      setFeed(rows);
      setFeedFailed(false);
    } catch {
      setFeedFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== 'feed' || feed || feedFailed) return;
    void refreshFeed();
  }, [open, tab, feed, feedFailed, refreshFeed]);

  // Opening the dock clears the "something happened" dot.
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  /** Hand the pack to the server, then celebrate exactly what it flags. */
  const record = useCallback(
    async (cards: PackCard[], entry: Pick) => {
      try {
        // The POST, the table announcement and the library nudge all live in
        // data/packRecord.ts, so the boosters page records a pack exactly the
        // way the dock does.
        const result = await recordPack(cards, entry.code, entry.released);
        setNewKeys(new Set(result.new.map((card) => pullKey(card.scryfallId, card.foil))));
        setSaved('saved');
        // My own notable pulls are in the feed now; refresh so the tab agrees.
        if (result.notable.length > 0) void refreshFeed();
      } catch {
        // Offline, or signed out mid-session: the pack still opened, it just
        // did not land anywhere. Say so rather than pretending it counted.
        setSaved('offline');
      }
    },
    [refreshFeed],
  );

  /** The product on the shelf right now. */
  const entry = useMemo(() => picks.find((item) => item.key === pickKey) ?? null, [picks, pickKey]);

  /**
   * The booster this product shipped in - the slot structure the pull rates
   * describe. A Secret Lair drop has none: it is a fixed, printed card list, so
   * there is nothing to state odds about and the block says so instead of
   * quoting an expansion's rates over a product that never had any.
   */
  const spec = useMemo(
    () => (entry && !entry.dropId ? specFor(entry.released, entry.setType) : null),
    [entry],
  );

  /**
   * The pool behind the rates. Fetched off the SELECTION rather than off the
   * Open button, so the numbers are on screen while the player is still
   * deciding - and, because `loadSetPool` is session-cached, warming it here
   * also means the first rip of that set skips the wait it used to pay.
   */
  const ratesCode = entry && !entry.dropId ? entry.code : null;
  useEffect(() => {
    setRatePool(null);
    if (!open || !ratesCode) return;
    let alive = true;
    const timer = setTimeout(
      () => {
        loadSetPool(ratesCode)
          .then((loaded) => alive && setRatePool(loaded))
          // Silent: the Open button surfaces a pool failure with its own
          // notice, and a set whose pool will not load cannot be opened
          // anyway. A second error message for the same cause is noise.
          .catch(() => undefined);
      },
      poolReady(ratesCode) ? 0 : RATES_DEBOUNCE_MS,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, ratesCode]);

  /**
   * What this product actually pulls, as four numbers.
   *
   * `mythic` and `cards` wait on the pool; `foil` and `slots` fall straight out
   * of the era spec and are on screen immediately. That split is deliberate -
   * the two cheap numbers hold the block's shape so it does not pop into
   * existence a beat after the art.
   */
  const rates = useMemo(() => {
    if (!entry) return null;
    const mythic = ratePool ? mythicChance(ratePool, entry.released) : null;
    const cards = ratePool
      ? ratePool.common.length + ratePool.uncommon.length + ratePool.rare.length + ratePool.mythic.length
      : null;
    const foil = spec ? foilChancePerPack(spec) : null;
    return {
      mythic,
      cards,
      foil,
      // The tilde marks the one rate that is derived rather than published:
      // classic packs foiled a card of its own rarity, so the pack rate is a
      // roll-up of three independent slots.
      foilApprox: spec?.perRarityFoil === true,
      opened: openedByPick[entry.key] ?? 0,
      partial: ratePool?.partial === true,
    };
  }, [entry, spec, ratePool, openedByPick]);

  /**
   * Every card in the set with the chance of pulling it. Null until the pool
   * lands - the same fetch the rates above wait on, so the list arrives with
   * them rather than triggering a second round trip of its own.
   */
  const odds = useMemo(
    () => (ratePool && spec && entry ? cardOdds(ratePool, spec, entry.released) : null),
    [ratePool, spec, entry],
  );

  // The pack splits into what you flip past and what you stop on, so the stage
  // can give the good half its own, larger arc.
  const { highlights, bulk } = useMemo(() => {
    const highlights: PackCard[] = [];
    const bulk: PackCard[] = [];
    for (const card of pack ?? []) {
      if (card.slot === 'common' || card.slot === 'land') bulk.push(card);
      else highlights.push(card);
    }
    return { highlights, bulk };
  }, [pack]);

  // What the pack turned out to be, rarest first. Zero counts are dropped
  // rather than shown as "0 Mythic" - an absence is not a stat.
  const stats = useMemo(() => {
    if (!pack) return [];
    const counts = { mythic: 0, rare: 0, uncommon: 0, common: 0 };
    let foils = 0;
    for (const card of pack) {
      if (card.rarity in counts) counts[card.rarity as keyof typeof counts] += 1;
      if (card.foil) foils += 1;
    }
    const rows: { key: string; rarity?: string; count: number; label: MessageKey }[] = [
      { key: 'mythic', rarity: 'mythic', count: counts.mythic, label: 'boMythic' },
      { key: 'rare', rarity: 'rare', count: counts.rare, label: 'boRare' },
      { key: 'uncommon', rarity: 'uncommon', count: counts.uncommon, label: 'boUncommon' },
      { key: 'common', rarity: 'common', count: counts.common, label: 'boCommon' },
      { key: 'foil', count: foils, label: 'boFoil' },
    ];
    return rows.filter((row) => row.count > 0);
  }, [pack]);

  /**
   * The best thing in the pack, which is what the stage celebrates.
   *
   * A per-card glow says which card is the mythic; this says the PACK was a
   * mythic pack, which is the part worth reacting to before you have read
   * anything. Foil is tracked separately rather than folded into the rarity,
   * because a foil mythic is the rarest thing a booster can produce and
   * deserves to look unlike a plain one.
   */
  const best = useMemo(() => {
    const first = pack?.[0];
    if (!pack || !first) return null;
    let rarity = first.rarity;
    let foil = first.foil;
    for (const card of pack) {
      const rank = RARITY_RANK[card.rarity] ?? 0;
      const bestRank = RARITY_RANK[rarity] ?? 0;
      if (rank > bestRank) {
        rarity = card.rarity;
        foil = card.foil;
      } else if (rank === bestRank && card.foil) {
        foil = true;
      }
    }
    return { rarity, foil };
  }, [pack]);

  // A different set is a different product shot: give its shots a clean chance.
  // (The poster art has its own per-code probe, so it resets itself.)
  useEffect(() => {
    setShotsFailed([]);
  }, [pickKey]);

  const rip = useCallback(async () => {
    if (!entry || busy) return;
    setBusy(true);
    setPoolFailed(false);
    setSaved('idle');
    setNewKeys(new Set());
    // Clear the previous pack so the reveal animation replays from nothing
    // rather than cross-fading one pack into the next.
    setPack(null);
    const started = Date.now();
    try {
      // Three ways to fill a pack, best first.
      //
      //   a drop  its printed card list, plus the one weighted bonus card
      //   exact   Wizards' published collation: real sheets, real weights
      //   else    the date-inferred simulator, for sets MTGJSON has no
      //           booster data for (and as the safety net if a spec fails to
      //           load - a pack that opens approximately beats one that does
      //           not open at all)
      let cards: PackCard[] = [];
      if (entry.dropId) {
        cards = await openSealed(entry.dropId);
      } else if (entry.exact) {
        cards = await openCollated(entry.code).catch(() => []);
      }
      if (cards.length === 0) {
        // Cached per set for the session by the booster module, so only the
        // first pack of a set pays for the pool.
        const pool = await loadSetPool(entry.code);
        cards = openPack(pool, specFor(entry.released, entry.setType), entry.released);
      }
      cards = bestFirst(cards);
      // A pack is a moment, not a button press: hold the tear for at least
      // MIN_RIP_MS however fast the pool resolved, so the animation reads and
      // the button cannot be machine-gunned.
      const elapsed = Date.now() - started;
      if (elapsed < MIN_RIP_MS) await new Promise((resolve) => setTimeout(resolve, MIN_RIP_MS - elapsed));
      setPack(cards);
      setOpenedByPick((counts) => ({ ...counts, [entry.key]: (counts[entry.key] ?? 0) + 1 }));
      await record(cards, entry);
    } catch {
      setPoolFailed(true);
    } finally {
      setBusy(false);
    }
  }, [entry, busy, record]);

  // Other people's pulls: a transient notification, and a live row in the feed.
  useEffect(() => {
    return ws.onMessage((message) => {
      if (message.type !== 'pull') return;
      if (message.fromUserId === useApp.getState().identity?.userId) return;
      const notice: Notice = {
        id: `${message.fromUserId}:${message.ts}:${message.scryfallId}`,
        username: message.username,
        name: message.name,
        scryfallId: message.scryfallId,
        rarity: message.rarity,
        foil: message.foil,
      };
      setNotices((list) =>
        list.some((entry) => entry.id === notice.id) ? list : [...list, notice].slice(-NOTICE_MAX),
      );
      setFeed((rows) =>
        rows === null
          ? rows
          : [
              {
                id: notice.id,
                userId: message.fromUserId,
                username: message.username,
                scryfallId: message.scryfallId,
                name: message.name,
                setCode: message.setCode,
                rarity: message.rarity,
                foil: message.foil,
                ts: message.ts,
                mine: false,
              },
              ...rows.filter((row) => row.id !== notice.id),
            ].slice(0, 30),
      );
      if (!openRef.current) setUnread((count) => count + 1);
    });
  }, []);

  // Notifications age out oldest-first. Re-arming on every change is
  // deliberate: a burst of pulls stays readable instead of flashing past.
  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => setNotices((list) => list.slice(1)), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notices]);

  // What the picker lists right now. Typing filters every product on offer -
  // sets and individual Secret Lair drops together - while an empty box falls
  // back to the recommendations rather than dumping ~1400 products on someone
  // who has not asked for one.
  const { results, recommended } = useMemo(() => {
    if (picks.length === 0) return { results: [] as Pick[], recommended: false };
    const needle = query.trim().toLowerCase();
    if (needle) {
      const matches = picks.filter((item) => item.haystack.includes(needle));
      // A match at the start of the name is what was meant; "Foundations"
      // should not sit below every drop that happens to contain the word.
      // Within a tier the list keeps its newest-first order.
      matches.sort((a, b) => Number(b.name.toLowerCase().startsWith(needle)) - Number(a.name.toLowerCase().startsWith(needle)));
      return { results: matches.slice(0, RESULT_MAX), recommended: false };
    }
    const found: Pick[] = [];
    const seen = new Set<string>();
    for (const wanted of RECOMMENDED_CODES) {
      const item = picks.find((candidate) => candidate.key === wanted);
      if (!item) continue;
      found.push(item);
      seen.add(item.key);
    }
    // Pad with the newest real releases. Previews are skipped: their pools are
    // half-spoiled, which is not what you want from a recommendation. So are
    // drops, which are three cards rather than a pack and would crowd out the
    // sets purely by being numerous and recent.
    for (const item of picks) {
      if (found.length >= RECOMMENDED_MAX) break;
      if (item.preview || item.dropId || seen.has(item.key)) continue;
      found.push(item);
      seen.add(item.key);
    }
    return { results: found, recommended: true };
  }, [picks, query]);

  const newCount = newKeys.size;

  // These are Magic packs, so every face-down card in the dock wears the real
  // Magic back - never a placeholder, and never the Cyberpunk back a player may
  // have picked for their own table. Published as --pc-card-back over the pack
  // area, which is the property GameCard's face-down side reads.
  const backSrc = cardBackUrl(effectiveCardBack(undefined, 'mtg'));

  // The wrapper is coming off: the pool is resolving, or the MIN_RIP_MS floor
  // is still running. `busy` stays true a little longer while the server
  // records the pack, but by then the cards are already on screen - so the
  // tearing state keys off "no cards yet", not off `busy`.
  const ripping = busy && !pack;

  const phone = usePhoneViewport();

  // The dock is an account feature: packs land in a collection, and pulls are
  // announced under a name. Signed out, there is nothing to mount.
  if (!identity) return null;

  // Portalled to <body> like the other app-wide overlays: route frames are
  // animated, and a transformed ancestor would become the containing block for
  // position:fixed - the dock would then be trapped inside the content column.

  /**
   * The odds cards: what this product pulls overall, then what it pulls card
   * by card. Built as a value because they live in two different places
   * depending on the width - their own pane on a desktop panel, folded into
   * the controls rail on a phone sheet.
   */
  const oddsEl = (
    <>
      {/* What this product actually pulls. The two spec-derived numbers paint
          immediately; the two pool-derived ones hold a skeleton at their final
          size, so the block never changes height once the pool lands. */}
      {entry && rates && (
        <div className="pdRates">
          <span className="pdRatesHead">
            <Sparkles size={12} aria-hidden />
            {t('pdRates')}
          </span>
          <div className="pdRateGrid">
            {spec && (
              <>
                <Rate
                  label={t('boMythicRate')}
                  value={
                    rates.mythic === null ? (
                      <Skeleton variant="text" width="3.2rem" />
                    ) : rates.mythic > 0 ? (
                      `1 in ${(1 / rates.mythic).toFixed(1)}`
                    ) : (
                      '—'
                    )
                  }
                />
                <Rate
                  label={t('boFoilRate')}
                  value={
                    rates.foil === null
                      ? '—'
                      : rates.foil >= 1
                        ? `1 ${t('boPerPack')}`
                        : `${rates.foilApprox ? '~' : ''}1 in ${(1 / rates.foil).toFixed(1)}`
                  }
                />
                <Rate
                  label={t('boCards')}
                  value={
                    rates.cards === null ? (
                      <Skeleton variant="text" width="3.2rem" />
                    ) : (
                      String(rates.cards)
                    )
                  }
                />
              </>
            )}
            <Rate label={t('boPacksOpened')} value={String(rates.opened)} />
          </div>
          {/* What is being simulated, in words - the slot structure the four
              numbers above are rates over. */}
          {spec && (
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              {spec.noteKeys.map((key) => t(key)).join(' ')}
            </Text>
          )}
          {!spec && (
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              {t('pdDropFixed')}
            </Text>
          )}
          {rates.partial && (
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              {t('boPartialPool')}
            </Text>
          )}
        </div>
      )}

      {/* And the same question asked card by card: what are the odds of THIS
          one. The aggregate above answers "how good is this box"; this answers
          "will I ever see the card I want", which is the number people
          actually argue about. */}
      {entry && spec && (
        <div className="pdOdds">
          <span className="pdRatesHead">
            <Percent size={12} aria-hidden />
            {t('pdCardOdds')}
          </span>
          {odds === null ? (
            <div className="pdOddsList" aria-hidden>
              {ODDS_SKELETON.map((row) => (
                <span key={row} className="pdOddsRow">
                  <Skeleton variant="text" width="100%" />
                </span>
              ))}
            </div>
          ) : odds.length === 0 ? (
            <Text size={Size.XSmall} tone={TextTone.Muted}>
              {t('pdNoMatch')}
            </Text>
          ) : (
            <ul className="pdOddsList" aria-label={t('pdCardOdds')}>
              {odds.map((row) => (
                <li key={row.card.id} className="pdOddsRow" data-rarity={row.card.rarity}>
                  <span className="pdOddsName" title={row.card.name}>
                    {row.card.name}
                  </span>
                  <span className="pdOddsPct">{formatChance(row.chance)}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Commons are dealt colour-balanced rather than uniformly, so their
              row is a pack average rather than a promise about one card. */}
          <Text size={Size.XSmall} tone={TextTone.Subtle}>
            {t('pdCardOddsNote')}
          </Text>
        </div>
      )}
    </>
  );

  return createPortal(
    <>
      <div className="pdNotices" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {notices.map((notice) => (
            <motion.div
              key={notice.id}
              className="pdNotice"
              data-rarity={notice.rarity}
              initial={{ opacity: 0, x: -18, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -18, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <img className="pdNoticeArt" src={cardImage(notice.scryfallId)} alt="" aria-hidden />
              <span className="pdNoticeBody">
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                  {notice.username} {t('pdPulled')}
                </Text>
                <Text as="span" size={Size.XSmall} className="pdNoticeName">
                  {notice.name}
                </Text>
              </span>
              {notice.foil && (
                <Pill size="sm" variant="soft" tone="accent">
                  {t('boFoil')}
                </Pill>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* The pill can be dragged anywhere, and the panel belongs to it: the
          whole dock carries the pill's offset so the panel opens where the
          player left the pill rather than back at its parked position. */}
      <div
        className="pdDock"
        ref={dockRef}
        data-open={open || undefined}
        data-dismissed={dismissed || undefined}
        // While the phone panel is up the dock carries NO transform at all.
        // The panel is position:fixed there, and a transformed ancestor becomes
        // the containing block for fixed descendants - which is what resolved
        // its insets against this zero-width box, put its edge off screen and
        // slid it around with an offset that was only ever meant for the pill.
        style={{ translate: anchored ? 'none' : `${pos.x}px ${pos.y}px` }}
      >
        <AnimatePresence initial={false} mode="wait">
          {dismissed ? null : open ? (
            <motion.div
              key="panel"
              className="pdPanel"
              role="dialog"
              aria-label={t('pdTitle')}
              ref={attachPanel}
              tabIndex={-1}
              onKeyDown={(event) => {
                // Scoped to the panel rather than a window-level capture
                // listener: the dock can sit behind the card popup, a picker or
                // the palette, and swallowing THEIR Escape would be worse than
                // having none here. Focus is inside the panel, so this fires.
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                restoreRef.current = true;
                setOpen(false);
              }}
              initial={{ opacity: 0, scale: 0.94, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.94, x: -10 }}
              transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            >
              <div className="pdHead">
                <span className="pdHeadTitle">
                  <PackageOpen size={16} aria-hidden />
                  <Text as="span" size={Size.Small}>
                    {t('pdTitle')}
                  </Text>
                </span>
                <IconButton
                  aria-label={t('pdCloseDock')}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // This button is about to unmount with the panel; focus
                    // goes back to the pill that opened it.
                    restoreRef.current = true;
                    setOpen(false);
                  }}
                >
                  <X size={16} />
                </IconButton>
              </div>

              <SegmentedControl
                size="sm"
                fullWidth
                aria-label={t('pdTitle')}
                value={tab}
                onValueChange={(value) => setTab(value === 'feed' ? 'feed' : 'pack')}
                options={[
                  { value: 'pack', label: t('pdTabPack') },
                  { value: 'feed', label: t('pdTabFeed') },
                ]}
              />

              <div className="pdBody">
                {tab === 'pack' ? (
                  // Three panes on a panel wide enough for them: the odds on
                  // the left, the pack in the middle, the product and its
                  // picker on the right. The stage owns the largest share of
                  // what is left after the odds column - the pack, the tear and
                  // the fan it turns into are what the panel is mostly made of.
                  <OddsSplit phone={phone} odds={oddsEl} label={t('pdSplitOdds')}>
                    <ResizableSplitPane
                      className="pdSplit"
                      // Side by side needs width the phone sheet does not have,
                      // so there the stage sits above the controls instead.
                      orientation={phone ? 'vertical' : 'horizontal'}
                      // Measured against what the odds column left behind, so
                      // 0.62 lands the rail at roughly the width of the product
                      // shot at the top of it - which is as wide as the rail
                      // ever needs to be, and is also the cap .pdControls
                      // enforces, so the two agree at rest. Drag past it and
                      // the extra width goes to the stage. The phone has no
                      // odds column to take its share first, and stacks rather
                      // than splits, so there the same number would just be a
                      // shorter stage.
                      defaultRatio={phone ? 0.68 : 0.62}
                      min={phone ? 0.4 : 0.35}
                      max={0.85}
                      aria-label={t('pdSplitLabel')}
                    >
                      <div
                        className="pdStage"
                        data-phase={pack ? 'fanned' : ripping ? 'tearing' : 'sealed'}
                        // What the pack turned out to be, so the whole stage can
                        // answer a mythic rather than just the one card.
                        data-best={pack ? best?.rarity : undefined}
                        data-best-foil={(pack && best?.foil) || undefined}
                      >
                        {pack ? (
                          <>
                            {/* What was opened, and what came out of it - above
                                the fans, where the eye lands first. */}
                            <div className="pdStageHead">
                              <span className="pdStageName">
                                {entry?.iconUrl && (
                                  <SetIcon
                                    className="pdStageIcon"
                                    code={entry.code}
                                    url={entry.iconUrl}
                                  />
                                )}
                                {entry?.name ?? ''}
                              </span>
                              {stats.length > 0 && (
                                <span className="pdStageStats">
                                  {stats.map((row) => (
                                    <Pill
                                      key={row.key}
                                      size="sm"
                                      variant="soft"
                                      className="pdStat"
                                      data-rarity={row.rarity}
                                    >
                                      <b>{row.count}</b> {t(row.label)}
                                    </Pill>
                                  ))}
                                  {newCount > 0 && (
                                    <Pill
                                      size="sm"
                                      tone="accent"
                                      variant="soft"
                                      className="pdStat"
                                      data-new
                                    >
                                      <b>{newCount}</b> {t('pdNew')}
                                    </Pill>
                                  )}
                                </span>
                              )}
                            </div>

                            <div className="pdFans">
                              <PackFan
                                cards={highlights}
                                label={t('boTheGoods')}
                                feature
                                newKeys={newKeys}
                                newLabel={t('pdNew')}
                              />
                              <PackFan
                                cards={bulk}
                                label={t('boTheRest')}
                                newKeys={newKeys}
                                newLabel={t('pdNew')}
                              />
                            </div>
                            <Text
                              size={Size.XSmall}
                              tone={newCount > 0 ? TextTone.Default : TextTone.Subtle}
                            >
                              {saved === 'offline'
                                ? t('pdNotSaved')
                                : newCount > 0
                                  ? `${newCount} ${t('pdNewCards')}`
                                  : saved === 'saved'
                                    ? t('pdNoNew')
                                    : ''}
                            </Text>
                          </>
                        ) : entry ? (
                          // Sealed, then torn: the wrapper's narrow top strip
                          // rips off and flies away, and only then does the
                          // stack slide up out of what is left. The two pieces
                          // carry the SAME art, each offset so the picture
                          // stays continuous across the crimp until the moment
                          // it separates.
                          <div className="pdOpen" role={ripping ? 'status' : undefined}>
                            <div
                              className="pdOpenPack"
                              data-noart={!art || undefined}
                              data-tearing={ripping || undefined}
                            >
                              <span className="pdOpenSlide" aria-hidden>
                                {Array.from({ length: RIP_CARDS }, (_, index) => (
                                  <span
                                    className="pdOpenCard"
                                    key={index}
                                    style={{
                                      backgroundImage: `url("${backSrc}")`,
                                      animationDelay: `${620 + index * 90}ms`,
                                      // Middle card highest, so the stack reads
                                      // as a fan lifting rather than a flat slab.
                                      ['--pd-slide-x' as string]: `${(index - (RIP_CARDS - 1) / 2) * 26}%`,
                                      ['--pd-slide-r' as string]: `${(index - (RIP_CARDS - 1) / 2) * 7}deg`,
                                    }}
                                  />
                                ))}
                              </span>

                              <span className="pdOpenBody" aria-hidden>
                                {art && (
                                  <img className="pdOpenArt" src={art} alt="" decoding="async" />
                                )}
                                {entry.iconUrl && (
                                  <img className="pdOpenIcon" src={entry.iconUrl} alt="" />
                                )}
                                <span className="pdOpenName">{entry.name}</span>
                              </span>

                              <span className="pdOpenTop" aria-hidden>
                                {art && (
                                  <img className="pdOpenArt" src={art} alt="" decoding="async" />
                                )}
                                <span className="pdOpenCrimp" />
                              </span>
                            </div>

                            {!ripping && (
                              <span className="pdOpenShots" aria-hidden>
                                {SHOWCASE.map((index) =>
                                  shotsFailed.includes(index) ? (
                                    <span
                                      key={`${entry.code}-back-${index}`}
                                      className="pdOpenShot"
                                      style={{ backgroundImage: `url("${backSrc}")` }}
                                    />
                                  ) : (
                                    <img
                                      key={`${entry.code}-${index}`}
                                      className="pdOpenShot"
                                      src={boosterCardUrl(entry.code, index)}
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                      onError={() =>
                                        setShotsFailed((list) =>
                                          list.includes(index) ? list : [...list, index],
                                        )
                                      }
                                    />
                                  ),
                                )}
                              </span>
                            )}

                            <span className="pdStageTag">
                              {ripping ? t('pdTearing') : t('pdSealed')}
                            </span>
                          </div>
                        ) : (
                          <div className="pdEmpty">
                            <Spinner size="sm" />
                          </div>
                        )}
                      </div>

                      <div className="pdControls">
                        {/* The same box art the fullscreen opener leads with:
                            the product, unblurred and given real size. A 3D
                            render needed more height than this rail has. */}
                        {entry && (
                          <div className="pdShowcase">
                            {/* The real product shot, exactly as the fullscreen
                                opener and the old 3D box used it. Only if the
                                probe has exhausted its retries does the set's
                                own symbol stand in - never a card back, which
                                claims to be the product shot and is not. */}
                            <div className="pdShowcaseArt" data-empty={!art || undefined}>
                              {art ? (
                                <img src={art} alt="" aria-hidden />
                              ) : (
                                entry.iconUrl && (
                                  <SetIcon
                                    className="pdShowcaseGlyph"
                                    code={entry.code}
                                    url={entry.iconUrl}
                                  />
                                )
                              )}
                            </div>
                            <div className="pdShowcaseInfo">
                              {entry.iconUrl && (
                                <SetIcon
                                  className="pdShowcaseIcon"
                                  code={entry.code}
                                  url={entry.iconUrl}
                                />
                              )}
                              <span className="pdShowcaseName">{entry.name}</span>
                            </div>
                            {/* The product name, as the box says it. Its own
                                row: the name above is nowrap-ellipsized, and a
                                pill sharing that line would eat the half of a
                                long set name that makes it recognisable. */}
                            {spec && (
                              <span className="pdShowcaseSpec">
                                <Pill size="sm" variant="outline">
                                  {t(spec.labelKey)}
                                </Pill>
                                {entry.exact && (
                                  <Pill size="sm" variant="soft" tone="accent">
                                    {t('pdExact')}
                                  </Pill>
                                )}
                              </span>
                            )}
                          </div>
                        )}

                        {/* A phone sheet has no room for an odds column of its
                            own, so the rate cards fold in here instead - the
                            same element, in the only other place it fits. */}
                        {phone && oddsEl}

                        <Text size={Size.XSmall} tone={TextTone.Subtle}>
                          {t('pdLede')}
                        </Text>

                        {setsFailed ? (
                          <Text size={Size.XSmall} tone={TextTone.Muted}>
                            {t('boSetsFailed')}
                          </Text>
                        ) : !sets ? (
                          <div className="pdEmpty">
                            <Spinner size="sm" />
                          </div>
                        ) : (
                          <div className="pdPicker">
                            <SearchField
                              size="sm"
                              value={query}
                              onValueChange={setQuery}
                              placeholder={t('boSearch')}
                              aria-label={t('boSearch')}
                            />
                            {/* The results ARE the picker: a dropdown hid them
                                behind a click, which is a poor trade when the
                                whole point is to browse what you could open. */}
                            <span className="pdPickerHead">
                              {recommended
                                ? t('pdRecommended')
                                : `${t('pdMatches')} · ${results.length}`}
                            </span>
                            {results.length > 0 ? (
                              <ul className="pdResults" aria-label={t('pdSet')}>
                                {results.map((item) => (
                                  <li key={item.key}>
                                    <button
                                      type="button"
                                      className="pdResult"
                                      data-active={item.key === pickKey || undefined}
                                      aria-current={item.key === pickKey ? 'true' : undefined}
                                      onClick={() => setPickKey(item.key)}
                                    >
                                      {item.iconUrl && (
                                        <SetIcon
                                          className="pdResultIcon"
                                          code={item.code}
                                          url={item.iconUrl}
                                        />
                                      )}
                                      <span className="pdResultName">{item.name}</span>
                                      <span className="pdResultYear">
                                        {item.released.slice(0, 4)}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <Text size={Size.XSmall} tone={TextTone.Muted}>
                                {t('pdNoMatch')}
                              </Text>
                            )}
                          </div>
                        )}

                        {/* Pinned to the bottom of the rail: the one thing you
                            came here to press, always in the same place. */}
                        <div className="pdControlsFoot">
                          <Button
                            size="lg"
                            fullWidth
                            loading={busy}
                            disabled={!entry}
                            onClick={() => void rip()}
                          >
                            {/* While the spinner is up the package icon would
                                read as a second, competing indicator - the label
                                alone carries the state. `busy` outlives the
                                reveal by however long the server takes to record
                                the pack; the tearing label belongs to the part
                                BEFORE the cards land. */}
                            {!busy && <PackageOpen size={18} aria-hidden />}
                            {ripping ? t('pdTearing') : pack ? t('boOpenAnother') : t('boOpenPack')}
                          </Button>

                          {poolFailed && (
                            <Text size={Size.XSmall} tone={TextTone.Muted}>
                              {t('boPoolFailed')}
                            </Text>
                          )}
                        </div>
                      </div>
                    </ResizableSplitPane>
                  </OddsSplit>
                ) : (
                  <PullFeed
                    rows={feed}
                    failed={feedFailed}
                    onRetry={() => {
                      setFeedFailed(false);
                      void refreshFeed();
                    }}
                  />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="fab"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            >
              {/* A labelled pill rather than a bare icon, draggable anywhere on
                  screen, with its own dismiss. Drag is motion's, so it never
                  fights the board's own pointer handlers. */}
              <motion.div
                className="pdPill"
                ref={attachPill}
                drag
                dragMomentum={false}
                dragElastic={0.04}
                initial={false}
                // The offset lives on the dock (so the panel moves with it);
                // these two carry the in-flight gesture only, and are zeroed
                // the moment the dock takes the new position over.
                style={{ x: dragX, y: dragY }}
                onPointerDownCapture={() => {
                  draggedRef.current = false;
                }}
                onDragStart={() => {
                  draggedRef.current = true;
                }}
                onClickCapture={(event) => {
                  // Motion does not suppress the native click that ends a drag,
                  // and the pointer never leaves the button it started on - so
                  // without this, parking the pill also opens or dismisses it.
                  if (!draggedRef.current) return;
                  // One-shot: only the click that ENDED the drag is swallowed,
                  // never a later keyboard Enter on the same button.
                  draggedRef.current = false;
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onDragEnd={(_event, info) => {
                  // The hand-over, in one commit: the pill's transform drops to
                  // zero (`jump`, so nothing animates back across the screen)
                  // and the dock takes the clamped offset instead. Neither is
                  // allowed to outlive the other - together they are the pill's
                  // one position.
                  dragX.jump(0);
                  dragY.jump(0);
                  setPos(clampPos({ x: pos.x + info.offset.x, y: pos.y + info.offset.y }));
                }}
                whileDrag={{ cursor: 'grabbing', scale: 1.03 }}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="pdPillMain"
                  aria-label={t('pdOpenDock')}
                  onClick={() => setOpen(true)}
                >
                  <PackageOpen size={16} aria-hidden />
                  <span className="pdPillLabel">{t('pdOpenPacks')}</span>
                  {unread > 0 && <span className="pdPillDot" aria-hidden />}
                </Button>
                {/* Always offered, and always undoable: out of a match the rail
                    and the tab bar relaunch the dock, and at a table the side
                    nav's Boosters button does (TablePage's `navEl`, which every
                    viewer has - seated or spectating, lobby or match). */}
                <IconButton
                  size="sm"
                  variant="ghost"
                  className="pdPillClose"
                  aria-label={t('pdDismissDock')}
                  onClick={() => setDismissed(true)}
                >
                  <X size={13} aria-hidden />
                </IconButton>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>,
    document.body,
  );
}
