import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  HapticsProvider,
  IconButton,
  LocaleProvider,
  NavBar,
  NavBarItem,
  Pill,
  Spinner,
  TitleBar,
  ToastProvider,
  VisualFeedbackProvider,
  direction,
} from '@glacier/react';
import { Compass, House, Layers, PanelLeft, Paintbrush, Settings, Swords, User, Users } from '@glacier/icons';
import {
  applyPreferences,
  loadPreferences,
  savePreferences,
  type Preferences,
} from './preferences.ts';
import { useT } from './i18n.ts';
import { useRoute, type Route } from './router.ts';
import { isTauri } from './tauri.ts';
import { RouteSidebar } from './RouteSidebar.tsx';
import { useApp } from './state/appStore.ts';
import { useGame } from './state/gameStore.ts';
import { useUi } from './state/uiStore.ts';
import { joinCodeFromHash, rememberPendingJoin } from './data/pendingJoin.ts';
import { motion, MotionConfig } from 'motion/react';
import { CardPopupProvider } from './components/CardPopup.tsx';
import { HoverCardLayer } from './components/HoverCard.tsx';
import { Notifier } from './components/Notifier.tsx';
import { InvitePopup } from './components/InvitePopup.tsx';
import { DownloadBanner } from './components/DownloadBanner.tsx';

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
const FriendsPage = lazy(() => import('./pages/FriendsPage.tsx').then((m) => ({ default: m.FriendsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx').then((m) => ({ default: m.ProfilePage })));
const TablePage = lazy(() => import('./pages/TablePage.tsx').then((m) => ({ default: m.TablePage })));
const JoinTablePage = lazy(() => import('./pages/JoinTablePage.tsx').then((m) => ({ default: m.JoinTablePage })));
const DownloadPage = lazy(() => import('./pages/DownloadPage.tsx').then((m) => ({ default: m.DownloadPage })));
const SettingsModal = lazy(() => import('./SettingsModal.tsx').then((m) => ({ default: m.SettingsModal })));
const CustomizeModal = lazy(() => import('./CustomizeModal.tsx').then((m) => ({ default: m.CustomizeModal })));

/** One-time flag: the customize modal greets the player on their first launch. */
const CUSTOMIZED_KEY = 'pc.customized';

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

const SIDEBAR_LABEL: Record<Route, 'sbPlayTables' | 'sbDecksLibrary' | 'sbBrowseCatalog' | 'sbFriendsPeople' | 'sbProfileYou'> = {
  home: 'sbPlayTables',
  play: 'sbPlayTables',
  decks: 'sbDecksLibrary',
  browse: 'sbBrowseCatalog',
  friends: 'sbFriendsPeople',
  profile: 'sbProfileYou',
  download: 'sbProfileYou',
};

/** Title-bar sidebar toggle with a hover flyout preview (see the starter). */
function SidebarToggle({
  route,
  collapsed,
  onToggle,
}: {
  route: Route;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const [hovering, setHovering] = useState(false);
  const previewOpen = collapsed && hovering;
  return (
    <div
      className="sidebarToggleWrap"
      data-no-drag
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <IconButton variant="ghost" size="sm" aria-label={t('toggleSidebar')} onClick={onToggle}>
        <PanelLeft size={18} />
      </IconButton>
      <div className="sidebarPreview" data-open={previewOpen || undefined} aria-hidden={!previewOpen}>
        <div className="sidebarPreviewCard">
          <RouteSidebar key={route} route={route} desktop={false} />
        </div>
      </div>
    </div>
  );
}

/** The far-left activity rail; Settings pinned to the bottom. */
function AppRail({
  route,
  onNavigate,
  onOpenSettings,
  onOpenCustomize,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  onOpenSettings: () => void;
  onOpenCustomize: () => void;
}) {
  const t = useT();
  const incoming = useApp((state) => state.friends.incoming.length);
  return (
    <NavBar
      orientation="vertical"
      aria-label={t('navPrimary')}
      className="appRail"
      end={
        <>
          <NavBarItem icon={<Paintbrush size={20} />} label={t('navCustomize')} onClick={onOpenCustomize} />
          <NavBarItem icon={<Settings size={20} />} label={t('navSettings')} onClick={onOpenSettings} />
        </>
      }
    >
      <NavBarItem
        icon={<House size={20} />}
        label={t('navHome')}
        active={route === 'home'}
        onClick={() => onNavigate('home')}
      />
      <NavBarItem
        icon={<Swords size={20} />}
        label={t('navPlay')}
        active={route === 'play'}
        onClick={() => onNavigate('play')}
      />
      <NavBarItem
        icon={<Layers size={20} />}
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

function Shell({
  preferences,
  onPreferencesChange,
}: {
  preferences: Preferences;
  onPreferencesChange: (patch: Partial<Preferences>) => void;
}) {
  const t = useT();
  const [route, navigate] = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // First launch opens the table-setup modal; afterwards it lives behind the
  // Customize rail button.
  const [customizeOpen, setCustomizeOpen] = useState(() => localStorage.getItem(CUSTOMIZED_KEY) == null);
  // The modals are lazy: mount each only once it has been opened, then keep it
  // mounted so its close animation can still play. Latching on a ref (rather
  // than always rendering) is what actually defers loading the modal's chunk.
  const settingsSeen = useRef(false);
  const customizeSeen = useRef(false);
  settingsSeen.current ||= settingsOpen;
  customizeSeen.current ||= customizeOpen;
  const identity = useApp((state) => state.identity);
  const connected = useApp((state) => state.connected);
  const inRoom = useGame((state) => state.room !== null);
  const pendingJoin = useUi((state) => state.pendingJoin);

  // Deep surfaces (the in-game toolbar) open these modals via window events,
  // avoiding prop-drilling through the whole table tree.
  useEffect(() => {
    const openCustomize = () => setCustomizeOpen(true);
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener('pc:open-customize', openCustomize);
    window.addEventListener('pc:open-settings', openSettings);
    return () => {
      window.removeEventListener('pc:open-customize', openCustomize);
      window.removeEventListener('pc:open-settings', openSettings);
    };
  }, []);

  const closeCustomize = () => {
    localStorage.setItem(CUSTOMIZED_KEY, '1');
    setCustomizeOpen(false);
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
  ) : route === 'play' ? (
    <PlayPage />
  ) : route === 'decks' ? (
    <DecksPage />
  ) : route === 'browse' ? (
    <BrowsePage />
  ) : route === 'friends' ? (
    <FriendsPage />
  ) : route === 'download' ? (
    <DownloadPage />
  ) : (
    <ProfilePage />
  );

  const collapsed = (DESKTOP && preferences.sidebarCollapsed) || inRoom;

  return (
    <div
      className="appWindow"
      data-layout={preferences.layout}
      data-sidebar={collapsed ? 'collapsed' : 'open'}
      data-in-game={inRoom || undefined}
    >
      {/* The chosen playmat backs the whole window; the shell's rail, sidebar,
          and content panels float over it as glass. A scrim keeps text legible
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
            !inRoom && (
              <SidebarToggle
                route={route}
                collapsed={preferences.sidebarCollapsed}
                onToggle={() => onPreferencesChange({ sidebarCollapsed: !preferences.sidebarCollapsed })}
              />
            )
          }
          end={
            <div className="titleBarActions" data-no-drag>
              {!connected && <Pill size="sm" tone="warning">offline</Pill>}
              {identity && <Avatar name={identity.username} size="sm" />}
            </div>
          }
        />
      )}
      {/* Web-only prompt to install the desktop app (self-guards to null under
          Tauri, and once dismissed). */}
      {!inRoom && <DownloadBanner />}
      <div className="appBody">
        {!inRoom && (
          <AppRail
            route={route}
            onNavigate={navigate}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenCustomize={() => setCustomizeOpen(true)}
          />
        )}
        {!inRoom && (
          <aside className="appSidebar" aria-label={t(SIDEBAR_LABEL[route])}>
            <RouteSidebar key={route} route={route} desktop={DESKTOP} />
          </aside>
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
      </div>
      {settingsSeen.current && (
        <Suspense fallback={null}>
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            preferences={preferences}
            onChange={onPreferencesChange}
          />
        </Suspense>
      )}
      {customizeSeen.current && (
        <Suspense fallback={null}>
          <CustomizeModal
            open={customizeOpen}
            onClose={closeCustomize}
            preferences={preferences}
            onChange={onPreferencesChange}
          />
        </Suspense>
      )}
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

  useEffect(() => {
    applyPreferences(preferences);
    savePreferences(preferences);
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
