import { useEffect, useState } from 'react';

/** The routed pages. Settings opens in a modal; the live table is not a route -
 * it takes over the shell whenever the player is seated (or spectating). */
export const ROUTES = ['home', 'play', 'decks', 'browse', 'friends', 'profile', 'download'] as const;
export type Route = (typeof ROUTES)[number];

const DEFAULT_ROUTE: Route = 'home';

function fromHash(): Route {
  const id = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as readonly string[]).includes(id) ? (id as Route) : DEFAULT_ROUTE;
}

/** The current route plus a setter that also updates the URL hash. */
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(fromHash);

  useEffect(() => {
    const onHash = () => setRoute(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (next: Route) => {
    window.location.hash = `/${next}`;
    setRoute(next);
  };

  return [route, navigate];
}
