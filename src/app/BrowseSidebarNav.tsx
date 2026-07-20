import { SidebarItem, SidebarSection } from '@glacier/react';
import { CalendarDays, Sparkles } from '@glacier/icons';
import { useT } from './i18n.ts';
import { catalogByYear } from './data/catalog.ts';

/**
 * The Browse route's catalog jump-nav (Featured + one item per release year).
 * Split into its own module so the 700KB bundled catalog it reads never lands
 * in the initial payload - RouteSidebar loads this lazily, only on Browse.
 */
export function BrowseSidebarNav() {
  const t = useT();
  return (
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
  );
}
