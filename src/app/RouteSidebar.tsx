import { Sidebar, SidebarItem, SidebarSection, StatusDot } from '@glacier/react';
import { CalendarDays, Layers, Plus, Sparkles, User, Users } from '@glacier/icons';
import { useT } from './i18n.ts';
import type { Route } from './router.ts';
import { useApp } from './state/appStore.ts';
import { useUi } from './state/uiStore.ts';
import { catalogByYear } from './data/catalog.ts';

const APP_NAME = 'PrettyCardboard';

/**
 * The contextual sidebar for each route - live data, not mock items: the deck
 * library under Decks, who's online under Play/Friends, sections under Profile.
 */
export function RouteSidebar({ route, desktop }: { route: Route; desktop: boolean }) {
  const t = useT();
  const decks = useApp((state) => state.decks);
  const friends = useApp((state) => state.friends);
  const selectedDeckId = useUi((state) => state.selectedDeckId);
  const selectDeck = useUi((state) => state.selectDeck);

  const online = friends.friends.filter((friend) => friend.online);

  return (
    <Sidebar
      header={
        // The brand doubles as a window drag handle under Tauri.
        <div className="brand" data-tauri-drag-region={desktop ? '' : undefined}>
          <img className="brandLogo" src={`${import.meta.env.BASE_URL}brand/logo.png`} alt={APP_NAME} draggable={false} />
        </div>
      }
    >
      {route === 'browse' ? (
        <SidebarSection title={t('sbBrowseCatalog')}>
          <SidebarItem
            icon={<Sparkles size={17} />}
            onClick={() => document.querySelector('.browsePage section')?.scrollIntoView({ behavior: 'smooth' })}
          >
            {t('brFeatured')}
          </SidebarItem>
          {catalogByYear().map(({ year, decks: yearDecks }) => (
            <SidebarItem
              key={year}
              icon={<CalendarDays size={17} />}
              onClick={() => document.getElementById(`browse-${year}`)?.scrollIntoView({ behavior: 'smooth' })}
            >
              {year} · {yearDecks.length}
            </SidebarItem>
          ))}
        </SidebarSection>
      ) : route === 'decks' ? (
        <SidebarSection title={`${t('sbDecksLibrary')} · ${decks.length}`}>
          <SidebarItem icon={<Plus size={17} />} onClick={() => selectDeck(null)}>
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
      ) : route === 'friends' || route === 'play' || route === 'home' ? (
        <SidebarSection title={t('frOnline')}>
          {online.length === 0 ? (
            <SidebarItem icon={<Users size={17} />}>0</SidebarItem>
          ) : (
            online.map((friend) => (
              <SidebarItem key={friend.userId} icon={<StatusDot tone="success" size="sm" />}>
                {friend.username}
              </SidebarItem>
            ))
          )}
        </SidebarSection>
      ) : (
        <SidebarSection title={t('sbProfileYou')}>
          <SidebarItem icon={<User size={17} />} active>
            {t('pfTitle')}
          </SidebarItem>
        </SidebarSection>
      )}
    </Sidebar>
  );
}
