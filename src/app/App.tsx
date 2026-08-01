import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Drawer,
  HapticsProvider,
  IconButton,
  LocaleProvider,
  NavBar,
  NavBarItem,
  Pill,
  SidebarItem,
  Spinner,
  TitleBar,
  ToastProvider,
  Tooltip,
  VisualFeedbackProvider,
  direction,
} from '@glacier/react';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  House,
  Library,
  Paintbrush,
  Play,
  Settings,
  User,
  Users,
} from '@glacier/icons';
import { PlayingCardPack, PlayingCardStack, PlayingCardSwap } from './icons/cards.ts';
import {
  applyPanelDock,
  applyPreferences,
  loadPreferences,
  savePreferences,
  type Preferences,
} from './preferences.ts';
import { useT } from './i18n.ts';
import { useRoute, type Route } from './router.ts';
import { useHistoryNav } from './historyNav.ts';
import {
  TITLEBAR_DOCK_CENTER_ID,
  TITLEBAR_DOCK_END_ID,
  TITLEBAR_DOCK_START_ID,
} from './titlebarDock.ts';
import { isTauri } from './tauri.ts';
import { useApp } from './state/appStore.ts';
import { useGame } from './state/gameStore.ts';
import { useUi } from './state/uiStore.ts';
import { joinCodeFromHash, rememberPendingJoin } from './data/pendingJoin.ts';
import { motion, MotionConfig } from 'motion/react';
import { CardPopupProvider } from './components/CardPopup.tsx';
import { HoverCardLayer } from './components/HoverCard.tsx';
import { Notifier } from './components/Notifier.tsx';
import { InvitePopup } from './components/InvitePopup.tsx';
import { WhatsNewHost } from './components/WhatsNewHost.tsx';
import UpdateHost from './components/UpdateHost.tsx';
import { DownloadBanner } from './components/DownloadBanner.tsx';
import { useMobileLayout } from './hooks/useIsPhone.ts';
import { usePreference } from './hooks/usePreference.ts';
import { loadAltArtCatalog } from './data/scryfall.ts';
import { DEFAULT_PLAYMAT, isCustomPlaymat, playmatUrl } from './data/playmats.ts';
// The base rules every docked panel is styled against. Loaded with the shell
// rather than by a component, because the panels that use them live in lazy
// route chunks and the contract has to exist before any of them arrives.
import './components/panels.css';

// Route pages, the whole table engine, the deck builder, the modals, and the
// command palette load on first use rather than up front - so the initial
// payload is just the shell. React.lazy wants a default export; each of these
// modules exports a named component, so the loader adapts it.
const Spotlight = lazy(() => import('./components/Spotlight.tsx').then((m) => ({ default: m.Spotlight })));
const HomePage = lazy(() => import('./pages/HomePage.tsx').then((m) => ({ default: m.HomePage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.tsx').then((m) => ({ default: m.OnboardingPage })));
const PlayPage = lazy(() => import('./pages/PlayPage.tsx').then((m) => ({ default: m.PlayPage })));
const DecksPage = lazy(() => import('./pages/DecksPage.tsx').then((m) => ({ default: m.DecksPage })));
const BrowsePage = lazy(() => import('./pages/BrowsePage.tsx').then((m) => ({ default: m.BrowsePage })));
const BoostersPage = lazy(() => import('./pages/BoostersPage.tsx').then((m) => ({ default: m.BoostersPage })));
const CollectionPage = lazy(() => import('./pages/CollectionPage.tsx').then((m) => ({ default: m.CollectionPage })));
// The floating pack dock follows the player everywhere, table included, so it
// is mounted beside the shell rather than inside a route - and lazily, since a
// player who never opens it should not pay for the booster machinery.
const PackDock = lazy(() => import('./components/PackDock.tsx'));
const FriendsPage = lazy(() => import('./pages/FriendsPage.tsx').then((m) => ({ default: m.FriendsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));
const TablePage = lazy(() => import('./pages/TablePage.tsx').then((m) => ({ default: m.TablePage })));
const JoinTablePage = lazy(() => import('./pages/JoinTablePage.tsx').then((m) => ({ default: m.JoinTablePage })));
const DownloadPage = lazy(() => import('./pages/DownloadPage.tsx').then((m) => ({ default: m.DownloadPage })));
const SettingsModal = lazy(() => import('./SettingsModal.tsx').then((m) => ({ default: m.SettingsModal })));

/** One-time flag: on first launch, Settings opens on the Customize tab.
 *  WhatsNewHost reads this too, to tell a fresh install from a returning
 *  player - App is the only writer. */
const CUSTOMIZED_KEY = 'pc.customized';

/**
 * Ask the floating pack dock to come back after a dismiss - `open` also pops
 * its panel, otherwise the pill alone returns.
 *
 * The intent is LATCHED on `window` as well as dispatched because PackDock is
 * code-split: a request made while its chunk is still streaming would land on
 * no listener at all, and the dock would stay dismissed with nothing to show
 * for the click. PackDock drains the latch on mount.
 */
function requestPackDock(open: boolean): void {
  (window as { __pcPackDock?: 'open' | 'show' }).__pcPackDock = open ? 'open' : 'show';
  window.dispatchEvent(new CustomEvent('pc:open-packdock', { detail: { open } }));
}

// Capture a #/join/CODE deep link before anything renders, so an invite opened
// cold survives the auth gate (and any reload auth triggers).
{
  const bootCode = joinCodeFromHash(window.location.hash);
  if (bootCode) rememberPendingJoin(bootCode);
}

// Window chrome (title bar + traffic lights) only makes sense as a desktop
// window, so it is off in the browser and on under Tauri.
const DESKTOP = isTauri();

/** Suspense fallback for a lazily-loaded route: a centered spinner that fills
 *  the content area so the shell never collapses while a chunk streams in. */
function PageFallback() {
  return (
    <div className="pageFallback" role="status" aria-live="polite">
      <Spinner size="lg" />
    </div>
  );
}

/** The routes that live behind the phone nav's "You" sheet - the item lights
 *  up for all of them, so the shell never shows a page with nothing selected. */
const YOU_ROUTES: readonly Route[] = ['browse', 'collection', 'friends', 'profile', 'download'];

/**
 * The app's primary navigation, in both of its shapes.
 *
 * On a desktop it is the far-left activity rail, every destination on it and
 * Settings pinned to the bottom. On a phone it is five slots and a You sheet -
 * mounted TWICE, once vertical and once horizontal, because which of the two
 * is displayed is a media query (portrait gets the bottom bar, landscape the
 * leading-edge rail) and a rotation must reflow the chrome rather than swap
 * components under an open menu.
 */
function AppRail({
  route,
  onNavigate,
  onOpenSettings,
  onOpenCustomize,
  onOpenYou,
  horizontal,
  phone,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  onOpenSettings: () => void;
  onOpenCustomize: () => void;
  /** Opens the phone nav's "You" sheet (Browse, Collection, Friends, Profile,
   *  Matches, Settings) - the five-slot bar's overflow. */
  onOpenYou: () => void;
  /** The phone bottom tab bar: the same items, horizontal, full width. The
   * kit NavBar supports both orientations, so one component serves both and
   * CSS swaps which is visible at the phone breakpoint. */
  horizontal?: boolean;
  /** The phone item set: five slots plus the You sheet. Nine destinations and
   *  a Settings gear need 449px of bar and a phone gives 346px, so five is not
   *  a taste call - it is what fits. Keyed off the phone BREAKPOINT, never off
   *  orientation: rotating a phone must not change which items exist. */
  phone?: boolean;
}) {
  const t = useT();
  const incoming = useApp((state) => state.friends.incoming.length);
  const wip = usePreference('enableWip');
  if (phone) {
    return (
      <NavBar
        orientation={horizontal ? 'horizontal' : 'vertical'}
        aria-label={t('navPrimary')}
        className={horizontal ? 'appTabBar' : 'appRail'}
        /* Enrols this bar as screen-edge chrome: the shell measures whichever
           of the two is displayed and publishes where it ends, so surfaces
           that portal out of the shell (the kit's toasts land on body) can
           stay off it. See useChromeInsets below. Phone-only - the desktop
           rail is narrow enough that a 28rem toast never reaches it, and
           desktop stays exactly as it was. */
        data-pc-chrome={horizontal ? 'block-end' : 'inline-start'}
      >
        <NavBarItem
          icon={<House size={20} />}
          label={t('navHome')}
          active={route === 'home'}
          onClick={() => onNavigate('home')}
        />
        {/* One Play slot for both table routes: it opens the way IN to a game,
            and stays lit while you are reading your own tables, which the You
            sheet reaches. */}
        <NavBarItem
          icon={<Play size={20} />}
          label={t('navNew')}
          active={route === 'new' || route === 'play'}
          onClick={() => onNavigate('new')}
        />
        <NavBarItem
          icon={<PlayingCardStack size={20} />}
          label={t('navDecks')}
          active={route === 'decks'}
          onClick={() => onNavigate('decks')}
        />
        {/* Packs is a real destination here, not a WIP entry: the floating pill
            is gone on phones, so this slot is the only way into boosters. */}
        <NavBarItem
          icon={<PlayingCardPack size={20} />}
          label={t('navBoosters')}
          active={route === 'boosters'}
          onClick={() => onNavigate('boosters')}
        />
        {/* Everything else, behind one slot - including the friend requests
            badge, which would otherwise have nowhere to show on a phone. */}
        <NavBarItem
          icon={<User size={20} />}
          // The nav owns its own label rather than borrowing the sidebar's
          // section heading: same word in all four locales today, but a slot in
          // the primary bar and a heading inside a page are free to diverge.
          label={t('navYou')}
          active={YOU_ROUTES.includes(route)}
          badge={incoming > 0 ? incoming : undefined}
          onClick={onOpenYou}
        />
      </NavBar>
    );
  }
  return (
    <NavBar
      orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-label={t('navPrimary')}
      className={horizontal ? 'appTabBar' : 'appRail'}
      end={
        horizontal ? (
          <NavBarItem icon={<Settings size={20} />} label={t('navSettings')} onClick={onOpenSettings} />
        ) : (
          <>
            <NavBarItem icon={<Paintbrush size={20} />} label={t('navCustomize')} onClick={onOpenCustomize} />
            <NavBarItem icon={<Settings size={20} />} label={t('navSettings')} onClick={onOpenSettings} />
          </>
        )
      }
    >
      {/* The brand's only home now that the sidebar is gone: the app icon at
          the head of the rail, doubling as a way back to Home. Desktop only -
          the phone bars have no room for a fifth non-destination. */}
      {!horizontal && (
        <button
          type="button"
          className="railBrand"
          aria-label={t('navHome')}
          onClick={() => onNavigate('home')}
        >
          <img src={`${import.meta.env.BASE_URL}brand/icon-192.png`} alt="" draggable={false} />
        </button>
      )}
      <NavBarItem
        icon={<House size={20} />}
        label={t('navHome')}
        active={route === 'home'}
        onClick={() => onNavigate('home')}
      />
      {/* A play button, not a plus: this route is not "add a thing", it is
          every way INTO a game - the quick-start strip, the table builder and
          the join-by-code field. */}
      <NavBarItem
        icon={<Play size={20} />}
        label={t('navNew')}
        active={route === 'new'}
        onClick={() => onNavigate('new')}
      />
      {/* And this one is the tables you have already been at - "Matches", with
          two cards trading places, so it reads as a log rather than as a second
          way to start a fight. */}
      <NavBarItem
        icon={<PlayingCardSwap size={20} />}
        label={t('navPlay')}
        active={route === 'play'}
        onClick={() => onNavigate('play')}
      />
      <NavBarItem
        icon={<PlayingCardStack size={20} />}
        label={t('navDecks')}
        active={route === 'decks'}
        onClick={() => onNavigate('decks')}
      />
      <NavBarItem
        icon={<Compass size={20} />}
        label={t('navBrowse')}
        active={route === 'browse'}
        onClick={() => onNavigate('browse')}
      />
      {/* Packs are not in the rail: the route still works and the floating
          dock still opens them, but browsing boosters is not a top-level
          errand next to playing a game. Behind the WIP toggle for the people
          still building it. */}
      {wip && (
        <NavBarItem
          icon={<PlayingCardPack size={20} />}
          label={t('navBoosters')}
          active={route === 'boosters'}
          // Additive: still navigates, and ALSO brings the floating pack dock
          // back if the player dismissed its pill (PackDock listens for this
          // event) - so Boosters is always the way back to packs.
          onClick={() => {
            onNavigate('boosters');
            requestPackDock(true);
          }}
        />
      )}
      <NavBarItem
        icon={<Library size={20} />}
        label={t('navCollection')}
        active={route === 'collection'}
        onClick={() => onNavigate('collection')}
      />
      <NavBarItem
        icon={<Users size={20} />}
        label={incoming > 0 ? `${t('navFriends')} (${incoming})` : t('navFriends')}
        active={route === 'friends'}
        onClick={() => onNavigate('friends')}
      />
      <NavBarItem
        icon={<User size={20} />}
        label={t('navProfile')}
        active={route === 'profile'}
        onClick={() => onNavigate('profile')}
      />
    </NavBar>
  );
}

/**
 * Publishes where the app's screen-edge chrome ends, in CSS pixels, on the
 * root: `--pc-chrome-block-end` (how deep the bottom edge is spoken for) and
 * `--pc-chrome-inline-start` (how far in the leading edge is). Both are 0
 * whenever nothing is enrolled, so every desktop surface reads exactly what it
 * read before.
 *
 * It exists because the surfaces that must respect the chrome are the ones
 * that cannot see it: the kit's toast layer portals to `document.body`, a
 * sibling of the shell, so nothing the shell sets on `.appWindow` reaches it -
 * and it pins itself to the bottom edge, which in portrait is the tab bar. A
 * live toast's pill (pointer-events: auto) hit-tested over ALL FIVE nav slots
 * at 375x812. That is the same bug the floating pack pill had over End turn,
 * and the answer is the same: one published measurement instead of a private
 * offset per overlay.
 *
 * Measured, not tokenised. The bar's depth moves with density, the locale's
 * label lengths, the layout preference (floating pill vs flush bar) and the
 * device safe areas; any constant would be wrong on some phone. Enrolment is
 * by `data-pc-chrome` (`block-end` / `inline-start`), so any surface that
 * takes an edge - the shell's two nav bars today, the mat's own furniture if
 * it ever needs it - opts in with one attribute and the deepest reading wins.
 * Both nav bars stay mounted in either orientation (decision 6); the hidden
 * one measures 0x0 and is skipped, so a rotation just republishes.
 */
function useChromeInsets(phone: boolean, inRoom: boolean, layout: Preferences['layout']): void {
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      // Physical rects, logical answer: under RTL the leading edge is the
      // right one, so the rail's reading is measured from there.
      const rtl = getComputedStyle(root).direction === 'rtl';
      let blockEnd = 0;
      let inlineStart = 0;
      for (const el of document.querySelectorAll<HTMLElement>('[data-pc-chrome]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue; // not displayed in this orientation
        const kinds = el.dataset.pcChrome ?? '';
        // Against innerHeight/innerWidth rather than the visual viewport: the
        // layers that read this are position:fixed, which resolves against the
        // same initial containing block.
        if (kinds.includes('block-end')) {
          blockEnd = Math.max(blockEnd, window.innerHeight - rect.top);
        }
        if (kinds.includes('inline-start')) {
          inlineStart = Math.max(inlineStart, rtl ? window.innerWidth - rect.left : rect.right);
        }
      }
      root.style.setProperty('--pc-chrome-block-end', `${Math.max(0, Math.round(blockEnd))}px`);
      root.style.setProperty('--pc-chrome-inline-start', `${Math.max(0, Math.round(inlineStart))}px`);
    };
    apply();
    // The bar resizes without the window doing so (labels, badges, density),
    // and the window resizes without the bar doing so (rotation, keyboard).
    const observer = new ResizeObserver(apply);
    for (const el of document.querySelectorAll('[data-pc-chrome]')) observer.observe(el);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
    // Re-enrol whenever the set of bars on screen can have changed: the phone
    // breakpoint mounts them, a seat at a table unmounts them, and the layout
    // preference re-shapes the bar itself.
  }, [phone, inRoom, layout]);
}

function Shell({
  preferences,
  onPreferencesChange,
}: {
  preferences: Preferences;
  onPreferencesChange: (patch: Partial<Preferences>) => void;
}) {
  const t = useT();
  const [route, navigate] = useRoute();
  // Desktop-only: the title bar's back / forward arrows. The hook stamps
  // history entries to know where in the trail we are; in a browser the
  // browser's own chrome does this job, so it stays inert there.
  const nav = useHistoryNav(DESKTOP);
  // The whole shell's phone layout keys off this one attribute rather than a
  // media query, so the Mobile-layout preference can force it either way -
  // otherwise a short desktop window puts you in the phone shell for good.
  const phoneLayout = useMobileLayout();
  useEffect(() => {
    document.documentElement.dataset.phone = phoneLayout ? 'on' : 'off';
    // The dock axis resolves from the preferences AND this breakpoint, and the
    // shell is the only place that knows the breakpoint - so restamp it here
    // whenever either moves. applyPreferences covers the preference side on
    // its own by reading the flag this line just wrote.
    applyPanelDock(preferences, phoneLayout);
  }, [phoneLayout, preferences]);
  // Load the curated alt-art catalog once at boot. Cards already sitting on one
  // of our arts cannot resolve an image URL until it lands, so the bump forces a
  // single re-render when it does rather than leaving those cards blank. Failure
  // is silent inside the loader - paper printings still work.
  const [, bumpAltArt] = useState(0);
  useEffect(() => {
    let live = true;
    loadAltArtCatalog().then(() => {
      if (live) bumpAltArt((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);
  // First launch opens Settings on the Customize tab so the player sets up their
  // playmat and card back; afterwards it lives behind the Customize rail button.
  const firstRun = useRef(localStorage.getItem(CUSTOMIZED_KEY) == null);
  const [settingsOpen, setSettingsOpen] = useState(firstRun.current);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(
    firstRun.current ? 'customize' : undefined,
  );
  // The modal is lazy: mount it only once it has been opened, then keep it
  // mounted so its close animation can still play.
  const settingsSeen = useRef(false);
  settingsSeen.current ||= settingsOpen;
  const identity = useApp((state) => state.identity);
  const connected = useApp((state) => state.connected);
  const incoming = useApp((state) => state.friends.incoming.length);
  const inRoom = useGame((state) => state.room !== null);
  const pendingJoin = useUi((state) => state.pendingJoin);
  // The phone nav's overflow sheet. It lives HERE, not inside AppRail, because
  // both nav bars (the portrait tab bar and the landscape rail) open the same
  // one: rotating the phone swaps which bar is displayed, and an open sheet
  // must survive that untouched.
  const [youOpen, setYouOpen] = useState(false);

  // Where the nav bars end, published for the layers that portal out of the
  // shell and would otherwise land on top of them.
  useChromeInsets(phoneLayout, inRoom, preferences.layout);

  // Deep surfaces (the in-game toolbar) open settings via window events,
  // avoiding prop-drilling through the whole table tree.
  useEffect(() => {
    const openCustomize = () => {
      setSettingsSection('customize');
      setSettingsOpen(true);
    };
    const openSettings = () => {
      setSettingsSection(undefined);
      setSettingsOpen(true);
    };
    window.addEventListener('pc:open-customize', openCustomize);
    window.addEventListener('pc:open-settings', openSettings);
    return () => {
      window.removeEventListener('pc:open-customize', openCustomize);
      window.removeEventListener('pc:open-settings', openSettings);
    };
  }, []);

  // A dismissed pack dock has to have a way back that does not depend on the
  // rail: the rail's Boosters entry is behind the WIP flag, and the whole rail
  // is gone at the table. Landing on the boosters page - from the collection's
  // empty state, a #/boosters link, anywhere - always returns the pill. Just
  // the pill: this page opens packs itself, so popping the panel over it would
  // only be in the way.
  useEffect(() => {
    if (route === 'boosters') requestPackDock(false);
  }, [route]);

  const closeSettings = () => {
    localStorage.setItem(CUSTOMIZED_KEY, '1');
    setSettingsOpen(false);
  };

  /** A row in the You sheet: navigate, then close the sheet behind you. */
  const goYou = (next: Route) => {
    navigate(next);
    setYouOpen(false);
  };

  // A share link brings the player to the join screen (unless they're already
  // seated). Seated (or spectating) at a table: the game takes the whole shell
  // body. The desktop title bar stays - it is window chrome.
  const page = inRoom ? (
    <TablePage />
  ) : pendingJoin ? (
    <JoinTablePage code={pendingJoin} />
  ) : route === 'home' ? (
    <HomePage />
  ) : route === 'new' ? (
    <PlayPage mode="new" />
  ) : route === 'play' ? (
    <PlayPage />
  ) : route === 'decks' ? (
    <DecksPage />
  ) : route === 'browse' ? (
    <BrowsePage />
  ) : route === 'boosters' ? (
    <BoostersPage />
  ) : route === 'collection' ? (
    <CollectionPage onOpenBoosters={() => navigate('boosters')} />
  ) : route === 'friends' ? (
    <FriendsPage />
  ) : route === 'download' ? (
    <DownloadPage />
  ) : (
    <ProfilePage />
  );

  return (
    <div
      className="appWindow"
      data-layout={preferences.layout}
      data-in-game={inRoom || undefined}
    >
      {/* The chosen playmat backs the whole window; the shell's rail and
          content panels float over it as glass. A scrim keeps text legible
          on even the brightest mats. */}
      <div className="appBackdrop" aria-hidden />

      {DESKTOP && (
        <TitleBar
          className="appTitleBar titleBarDrag"
          data-tauri-drag-region
          surface
          border
          trafficLightInset
          start={
            <>
              <div className="titleBarNav" data-no-drag>
                <Tooltip content={t('tbBack')}>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={t('tbBack')}
                    disabled={!nav.canBack}
                    onClick={nav.back}
                  >
                    <ArrowLeft size={15} />
                  </IconButton>
                </Tooltip>
                <Tooltip content={t('tbForward')}>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={t('tbForward')}
                    disabled={!nav.canForward}
                    onClick={nav.forward}
                  >
                    <ArrowRight size={15} />
                  </IconButton>
                </Tooltip>
              </div>
              {/* The table's identity cluster docks here in a match. */}
              <div id={TITLEBAR_DOCK_START_ID} className="tbDock" />
            </>
          }
          end={
            <>
              {/* The table's actions dock here, before the account chip. */}
              <div id={TITLEBAR_DOCK_END_ID} className="tbDock" />
              <div className="titleBarActions" data-no-drag>
                {!connected && <Pill size="sm" tone="warning">offline</Pill>}
                {identity && <Avatar name={identity.username} size="sm" />}
              </div>
            </>
          }
        >
          {/* The phase ribbon docks center, where the title would sit. */}
          <div id={TITLEBAR_DOCK_CENTER_ID} className="tbDock tbDockCenter" />
        </TitleBar>
      )}
      {/* Web-only prompt to install the desktop app (self-guards to null under
          Tauri, and once dismissed). */}
      {!inRoom && <DownloadBanner />}
      <div className="appBody">
        {!inRoom && (
          <AppRail
            route={route}
            phone={phoneLayout}
            onNavigate={navigate}
            onOpenYou={() => setYouOpen(true)}
            onOpenSettings={() => {
              setSettingsSection(undefined);
              setSettingsOpen(true);
            }}
            onOpenCustomize={() => {
              setSettingsSection('customize');
              setSettingsOpen(true);
            }}
          />
        )}
        <main className="appContent" data-full-bleed={inRoom || undefined}>
          {/* Keyed remount gives the enter animation; no exit choreography so
              navigation can never wait on an unfinished exit. */}
          <motion.div
            key={inRoom ? 'table' : route}
            className="routeFrame"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Suspense fallback={<PageFallback />}>{page}</Suspense>
          </motion.div>
        </main>
        {/* The shell's dock slot: panels that follow the app rather than the
            table portal in here when docked, and take real width beside the
            content instead of covering it. Empty it is not laid out at all
            (see .appDock in app.css). */}
        <div id="pc-dock-shell" className="appDock" />
      </div>
      {/* Phone bottom tab bar: same items as the rail, horizontal, full width.
          Both bars stay mounted; a media query picks which one is displayed -
          the bar in portrait, the rail in landscape (a bottom bar costs 85px
          of a 375px-tall screen, 22.7% of it; the rail measures 58px of the
          812px there is plenty of). A rotation therefore reflows the chrome
          without unmounting anything. */}
      {!inRoom && (
        <AppRail
          horizontal
          route={route}
          phone={phoneLayout}
          onNavigate={navigate}
          onOpenYou={() => setYouOpen(true)}
          onOpenSettings={() => {
            setSettingsSection(undefined);
            setSettingsOpen(true);
          }}
          onOpenCustomize={() => {
            setSettingsSection('customize');
            setSettingsOpen(true);
          }}
        />
      )}
      {/* The five-slot bar's overflow. A kit Drawer, entered from the bottom;
          in landscape app CSS re-lays it as a full-height sheet on the trailing
          edge. Same component, same open state, both orientations. */}
      {!inRoom && (
        <Drawer
          open={youOpen}
          onClose={() => setYouOpen(false)}
          side="bottom"
          size="md"
          className="youSheet"
          title={t('navYou')}
        >
          <div className="youSheetNav">
            <SidebarItem
              icon={<Compass size={18} />}
              active={route === 'browse'}
              onClick={() => goYou('browse')}
            >
              {t('navBrowse')}
            </SidebarItem>
            <SidebarItem
              icon={<Library size={18} />}
              active={route === 'collection'}
              onClick={() => goYou('collection')}
            >
              {t('navCollection')}
            </SidebarItem>
            {/* The tables you have already sat at. It has no bar slot of its
                own - the Play slot opens a NEW table - so this row is the only
                way back to the log on a phone. */}
            <SidebarItem
              icon={<PlayingCardSwap size={18} />}
              active={route === 'play'}
              onClick={() => goYou('play')}
            >
              {t('navPlay')}
            </SidebarItem>
            <SidebarItem
              icon={<Users size={18} />}
              active={route === 'friends'}
              onClick={() => goYou('friends')}
            >
              {incoming > 0 ? `${t('navFriends')} (${incoming})` : t('navFriends')}
            </SidebarItem>
            <SidebarItem
              icon={<User size={18} />}
              active={route === 'profile'}
              onClick={() => goYou('profile')}
            >
              {t('navProfile')}
            </SidebarItem>
            <SidebarItem
              icon={<Settings size={18} />}
              onClick={() => {
                setYouOpen(false);
                setSettingsSection(undefined);
                setSettingsOpen(true);
              }}
            >
              {t('navSettings')}
            </SidebarItem>
          </div>
        </Drawer>
      )}
      {settingsSeen.current && (
        <Suspense fallback={null}>
          <SettingsModal
            open={settingsOpen}
            onClose={closeSettings}
            preferences={preferences}
            onChange={onPreferencesChange}
            initialSection={settingsSection}
          />
        </Suspense>
      )}
      <WhatsNewHost />
    </div>
  );
}

/** Root: preferences drive the token look; identity gates the shell. */
export function App() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const identity = useApp((state) => state.identity);
  const bootstrapped = useApp((state) => state.bootstrapped);
  const bootstrap = useApp((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Keep the pending-join code in sync with the hash: an invite link opened
  // while the app is already running is honoured too, not just at cold start.
  useEffect(() => {
    const sync = () => {
      const code = joinCodeFromHash(window.location.hash);
      if (code) {
        rememberPendingJoin(code);
        useUi.getState().setPendingJoin(code);
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // An account keeps ONE custom mat, and a re-upload deletes the file the old
  // id named. A preference still pointing at that dead id paints nothing - a
  // blank felt with no obvious way back - so check it once on boot and fall
  // back to the default rather than leaving the player staring at emptiness.
  useEffect(() => {
    const id = preferences.playmat;
    if (!isCustomPlaymat(id)) return;
    let cancelled = false;
    void fetch(playmatUrl(id), { method: 'HEAD' })
      .then((response) => {
        if (!cancelled && !response.ok) update({ playmat: DEFAULT_PLAYMAT, customPlaymat: '' });
      })
      .catch(() => {
        // Offline: keep the id. It may well be fine once the network is back.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.playmat]);

  useEffect(() => {
    // Persist BEFORE applying: applyPreferences fires `pc:preferences`
    // synchronously, and some listeners (e.g. the table's playmat/cardback
    // sync) read loadPreferences() — so localStorage must already be current,
    // or the change lands one interaction late (the "double-click to apply" bug).
    savePreferences(preferences);
    applyPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    document.documentElement.lang = preferences.locale;
    document.documentElement.dir = direction(preferences.locale);
  }, [preferences.locale]);

  const update = (patch: Partial<Preferences>) => setPreferences((prev) => ({ ...prev, ...patch }));

  return (
    <LocaleProvider locale={preferences.locale}>
      <MotionConfig reducedMotion={preferences.reduceMotion ? 'always' : 'user'}>
        <HapticsProvider enabled={preferences.haptics}>
        <VisualFeedbackProvider
          enabled={preferences.visualFeedback}
          variant={preferences.visualFeedbackVariant}
          intensity={preferences.visualFeedbackIntensity}
        >
          <ToastProvider>
            <CardPopupProvider>
              {!bootstrapped ? null : identity ? (
                <>
                  <Shell preferences={preferences} onPreferencesChange={update} />
                  <Suspense fallback={null}>
                    <Spotlight />
                  </Suspense>
                  <Notifier />
                  <InvitePopup />
                  <UpdateHost />
                  <Suspense fallback={null}>
                    <PackDock />
                  </Suspense>
                </>
              ) : (
                <Suspense fallback={<PageFallback />}>
                  <OnboardingPage desktop={DESKTOP} />
                </Suspense>
              )}
              <HoverCardLayer />
            </CardPopupProvider>
          </ToastProvider>
        </VisualFeedbackProvider>
        </HapticsProvider>
      </MotionConfig>
    </LocaleProvider>
  );
}
