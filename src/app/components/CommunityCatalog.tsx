import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, SearchField, Size, Text, TextTone } from '@glacier/react';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import {
  archidektFormatName,
  fetchArchidektDeck,
  parseArchidektRef,
  searchArchidektPage,
  type ArchidektHit,
} from '../data/archidekt.ts';
import { BrowseTile, type BrowseDeck } from './BrowseCatalog.tsx';
import { EmptyFan } from './Skeletons.tsx';
import '../pages/browse.css';

/**
 * Discover's community shelf: decks people have published on Archidekt,
 * searchable without leaving the app.
 *
 * This is a SEARCH, not a catalog. The bundled precons ship in the bundle and
 * can be filtered locally; Archidekt has millions of decks and answers one page
 * of 24 at a time, so there is nothing to sort or group here - the page is
 * whatever the query returned, in Archidekt's own popularity order.
 *
 * Rows arrive without their card lists. Pulling 24 decklists to render a grid
 * nobody has clicked would be 24 requests per keystroke-settled search, so each
 * tile carries a loadCards() that fires the first time it is previewed or
 * added (see BrowseDeck.loadCards).
 *
 * Moxfield is not an option here: its API root says it "is not intended for
 * public use" and its search answers a Cloudflare challenge. Moxfield keeps its
 * import-by-URL path in the deck builder for anyone who already has a link.
 */
export function CommunityCatalog() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ArchidektHit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  // Reported by the server rather than assumed: Archidekt answers 60 rows a
  // page whatever page size is asked of it, so a constant here would put the
  // page count out by a factor of two and a half.
  const [pageSize, setPageSize] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ownedDecks = useApp((state) => state.decks);
  const ownedNames = useMemo(() => new Set(ownedDecks.map((d) => d.name.toLowerCase())), [ownedDecks]);

  const term = query.trim();
  // A pasted deck URL is not a search term - it is the deck itself, and the
  // name search would return nothing for it.
  const pastedRef = parseArchidektRef(term);

  // One request per settled term. The sequence guard is what stops a slow
  // earlier response from landing on top of a newer one; the same pattern the
  // deck builder's import dialog uses.
  const seq = useRef(0);
  useEffect(() => {
    if (pastedRef || term.length < 2) {
      setHits([]);
      setTotal(null);
      setFailed(false);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    setFailed(false);
    const timer = window.setTimeout(() => {
      searchArchidektPage(term, page)
        .then((body) => {
          if (mine !== seq.current) return;
          setHits(body.results);
          setTotal(body.total);
          // A short page is the last one; keep the size the full pages set.
          if (body.pageSize && (pageSize == null || body.pageSize > pageSize)) setPageSize(body.pageSize);
        })
        .catch(() => {
          if (mine !== seq.current) return;
          setHits([]);
          setFailed(true);
        })
        .finally(() => {
          if (mine === seq.current) setBusy(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [term, page, pastedRef]);

  // A new term starts at page 1; changing the page must not reset itself.
  useEffect(() => {
    setPage(1);
  }, [term]);

  const decks: BrowseDeck[] = useMemo(
    () =>
      hits.map((hit) => {
        const format = archidektFormatName(hit.format);
        return {
          id: `archidekt-${hit.id}`,
          name: hit.name,
          subtitle: hit.owner ? `${t('brByAuthor')} ${hit.owner}` : undefined,
          cover: hit.featured ?? undefined,
          art: hit.featured ?? undefined,
          badge: format ?? undefined,
          metaText: `${hit.size} ${t('decksCards')}${hit.updatedAt ? ` · ${hit.updatedAt.slice(0, 10)}` : ''}`,
          facets: [],
          groups: {},
          sortDate: hit.updatedAt ?? '',
          cards: [],
          game: 'mtg',
          // Archidekt's own format when it names one, so a Commander deck is
          // not imported as a 60-card Standard list and told it is short.
          format: format ?? 'Commander',
          loadCards: async () => (await fetchArchidektDeck(hit.id)).cards,
        };
      }),
    [hits, t],
  );

  /** A pasted archidekt.com link resolves straight to that one deck. */
  const pasted: BrowseDeck[] = useMemo(() => {
    if (!pastedRef) return [];
    return [
      {
        id: `archidekt-${pastedRef}`,
        name: t('brPastedDeck'),
        metaText: `archidekt.com/decks/${pastedRef}`,
        facets: [],
        groups: {},
        sortDate: '',
        cards: [],
        game: 'mtg',
        format: 'Commander',
        loadCards: async () => (await fetchArchidektDeck(pastedRef)).cards,
      },
    ];
  }, [pastedRef, t]);

  const shown = pastedRef ? pasted : decks;
  const lastPage = total != null && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : null;
  // Without a known page size the only sure sign of the end is a short page.
  const atEnd = lastPage != null ? page >= lastPage : pageSize != null && shown.length < pageSize;

  return (
    <>
      <div className="browseToolbar" role="group" aria-label={t('brCommunitySearch')}>
        <div className="browseSearch">
          <SearchField
            value={query}
            onValueChange={setQuery}
            placeholder={t('brCommunitySearch')}
            aria-label={t('brCommunitySearch')}
          />
        </div>
        <Text size={Size.Small} tone={TextTone.Subtle}>
          {t('brCommunityNote')}
        </Text>
      </div>

      <div className="browseCount" aria-live="polite">
        <Text as="span" size={Size.Small} tone={TextTone.Subtle}>
          {busy
            ? t('brSearching')
            : pastedRef
              ? t('brPastedHint')
              : term.length < 2
                ? t('brCommunityPrompt')
                : total != null
                  ? t('brCountSome').replace('{n}', String(shown.length)).replace('{all}', String(total))
                  : t('brCountAll').replace('{n}', String(shown.length))}
        </Text>
      </div>

      {failed ? (
        <EmptyFan quip={t('brCommunityFailed')} />
      ) : shown.length === 0 ? (
        term.length >= 2 && !busy ? <EmptyFan quip={t('esUntapped')} /> : null
      ) : (
        <div className="browseGrid">
          {shown.map((deck, index) => (
            <BrowseTile key={deck.id} deck={deck} index={index} owned={ownedNames.has(deck.name.toLowerCase())} />
          ))}
        </div>
      )}

      {/* Archidekt pages server-side, so this walks its pages rather than
          growing one list - "load more" would mean holding every page of a
          million-deck site in one grid. */}
      {!pastedRef && shown.length > 0 && (
        <div className="browsePager">
          <Button size="sm" variant="soft" disabled={page <= 1 || busy} onClick={() => setPage((n) => Math.max(1, n - 1))}>
            {t('brPrevPage')}
          </Button>
          <Text as="span" size={Size.Small} tone={TextTone.Subtle} mono>
            {lastPage ? `${page} / ${lastPage}` : String(page)}
          </Text>
          <Button size="sm" variant="soft" disabled={busy || atEnd} onClick={() => setPage((n) => n + 1)}>
            {t('brNextPage')}
          </Button>
        </div>
      )}
    </>
  );
}
