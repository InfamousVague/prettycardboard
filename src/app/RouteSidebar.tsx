import { lazy, Suspense } from 'react';
import { Avatar, Sidebar, SidebarItem, SidebarSection, StatusDot } from '@glacier/react';
import { Compass, Layers, Plus, Swords, User, UserPlus, Users } from '@glacier/icons';
import { useT } from './i18n.ts';
import type { Route } from './router.ts';
import { useApp } from './state/appStore.ts';
import { useUi } from './state/uiStore.ts';

// The Browse catalog nav pulls in the 700KB bundled catalog, so it loads lazily
// and only when the Browse route is showing - keeping it out of the shell.
const BrowseSidebarNav = lazy(() =>
  import('./BrowseSidebarNav.tsx').then((m) => ({ default: m.BrowseSidebarNav })),
);

const APP_NAME = 'PrettyCardboard';

const go = (route: string) => {
  window.location.hash = `/${route}`;
};

/**
 * The contextual sidebar for each route - live data, not mock items, and a
 * different, genuinely useful panel per page: quick actions + who's online on
 * Home/Play, the requests + roster on Friends, the deck library on Decks, the
 * catalog jump-nav on Browse. A player chip anchors the footer everywhere.
 */
export function RouteSidebar({ route, desktop }: { route: Route; desktop: boolean }) {
  const t = useT();
  const identity = useApp((state) => state.identity);
  const decks = useApp((state) => state.decks);
  const friends = useApp((state) => state.friends);
  const selectedDeckId = useUi((state) => state.selectedDeckId);
  const selectDeck = useUi((state) => state.selectDeck);
  const requestNewDeck = useUi((state) => state.requestNewDeck);

  const online = friends.friends.filter((friend) => friend.online);
  const incoming = friends.incoming ?? [];

  const onlineSection = (
    <SidebarSection title={`${t('frOnline')} · ${online.length}`}>
      {online.length === 0 ? (
        <SidebarItem icon={<Users size={17} />}>{t('hmNoFriendsOnline')}</SidebarItem>
      ) : (
        online.map((friend) => (
          <SidebarItem key={friend.userId} icon={<StatusDot tone={friend.roomId ? 'accent' : 'success'} size="sm" />}>
            {friend.username}
          </SidebarItem>
        ))
      )}
    </SidebarSection>
  );

  const quickActions = (
    <SidebarSection title={t('sbQuickActions')}>
      <SidebarItem icon={<Swords size={17} />} onClick={() => go('play')}>
        {t('playNewTable')}
      </SidebarItem>
      <SidebarItem
        icon={<Plus size={17} />}
        onClick={() => {
          requestNewDeck();
          go('decks');
        }}
      >
        {t('decksNew')}
      </SidebarItem>
      <SidebarItem icon={<Compass size={17} />} onClick={() => go('browse')}>
        {t('navBrowse')}
      </SidebarItem>
    </SidebarSection>
  );

  return (
    <Sidebar
      header={
        // The brand doubles as a window drag handle under Tauri.
        <div className="brand" data-tauri-drag-region={desktop ? '' : undefined}>
          <img className="brandLogo" src={`${import.meta.env.BASE_URL}brand/logo.png`} alt={APP_NAME} draggable={false} />
        </div>
      }
      footer={
        identity ? (
          <button type="button" className="sbPlayer" onClick={() => go('profile')} aria-label={t('pfTitle')}>
            <span className="sbPlayerAvatar">
              <Avatar name={identity.username} size="sm" />
              <StatusDot tone="success" size="sm" className="sbPlayerDot" />
            </span>
            <span className="sbPlayerName">{identity.username}</span>
          </button>
        ) : undefined
      }
    >
      {route === 'browse' ? (
        <Suspense fallback={null}>
          <BrowseSidebarNav />
        </Suspense>
      ) : route === 'decks' ? (
        <SidebarSection title={`${t('sbDecksLibrary')} · ${decks.length}`}>
          <SidebarItem icon={<Plus size={17} />} onClick={() => requestNewDeck()}>
            {t('decksNew')}
          </SidebarItem>
          {decks.map((deck) => (
            <SidebarItem
              key={deck.id}
              icon={<Layers size={17} />}
              active={deck.id === selectedDeckId}
              onClick={() => selectDeck(deck.id)}
            >
              {deck.name}
            </SidebarItem>
          ))}
        </SidebarSection>
      ) : route === 'friends' ? (
        <>
          {incoming.length > 0 && (
            <SidebarSection title={`${t('frRequests')} · ${incoming.length}`}>
              {incoming.map((request) => (
                <SidebarItem key={request.id} icon={<UserPlus size={17} />}>
                  {request.from.username}
                </SidebarItem>
              ))}
            </SidebarSection>
          )}
          {onlineSection}
          <SidebarSection title={`${t('frTitle')} · ${friends.friends.length}`}>
            <SidebarItem icon={<Plus size={17} />} onClick={() => go('friends')}>
              {t('frSearch')}
            </SidebarItem>
          </SidebarSection>
        </>
      ) : route === 'home' || route === 'play' ? (
        <>
          {quickActions}
          {onlineSection}
        </>
      ) : (
        <SidebarSection title={t('sbProfileYou')}>
          <SidebarItem icon={<User size={17} />} active>
            {t('pfTitle')}
          </SidebarItem>
          <SidebarItem icon={<Layers size={17} />} onClick={() => go('decks')}>
            {decks.length} {t('decksTitle')}
          </SidebarItem>
          <SidebarItem icon={<Swords size={17} />} onClick={() => go('play')}>
            {t('playTitle')}
          </SidebarItem>
        </SidebarSection>
      )}
    </Sidebar>
  );
}
