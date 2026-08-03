import { useEffect, useRef, useState } from 'react';
import { Button, Callout, Checkbox, Modal, Size, Tabs, Text, TextTone, Textarea, Input, useToast } from '@glacier/react';
import { useT } from '../../i18n.ts';
import * as api from '../../net/api.ts';
import type { DeckCard } from '../../net/types.ts';
import { useApp } from '../../state/appStore.ts';
import { useUi } from '../../state/uiStore.ts';
import { parseDecklist } from '../../data/decklist.ts';
import { aliasCardMeta, altArtById, altArtForFace, altArtsFor, hasAltArt, loadAltArtCatalog, resolvePrintings } from '../../data/scryfall.ts';
import { fetchMoxfieldDeck, MoxfieldError, parseMoxfieldRef } from '../../data/moxfield.ts';
import {
  archidektFormatName,
  ArchidektError,
  fetchArchidektDeck,
  parseArchidektRef,
  searchArchidekt,
  type ArchidektHit,
} from '../../data/archidekt.ts';

/**
 * The import dialog: paste a text decklist (Moxfield/MTGA-style) or pull a
 * deck straight from a Moxfield URL. Either path lands in api.createDeck and
 * the new deck opens in the editor.
 */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [tab, setTab] = useState('text');
  const [text, setText] = useState('');
  const [moxRef, setMoxRef] = useState('');
  const [arkQuery, setArkQuery] = useState('');
  const [hits, setHits] = useState<ArchidektHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);
  // Curated alt art is opt-in per import: it silently replaces the artwork on
  // every card we have one for, which is great for a proxy deck and wrong if
  // the player wanted the paper printings they listed.
  const [useAltArt, setUseAltArt] = useState(false);
  const [altAvailable, setAltAvailable] = useState(false);
  useEffect(() => {
    if (open) void loadAltArtCatalog().then(() => setAltAvailable(hasAltArt()));
  }, [open]);

  const finish = async (name: string, cards: DeckCard[]) => {
    const { id } = await api.createDeck(name, 'Commander', cards);
    await useApp.getState().refreshDecks();
    useUi.getState().selectDeck(id);
    toast({ tone: 'success', message: t('dbImported') });
    setText('');
    setMoxRef('');
    setNotFound([]);
    onClose();
  };

  const importText = async () => {
    setError(null);
    setNotFound([]);
    const parsed = parseDecklist(text);
    if (parsed.entries.length === 0) {
      setError(t('dbImportEmpty'));
      return;
    }
    setBusy(true);
    try {
      const { bySet, byName, notFound: notFoundKeys } = await resolvePrintings(
        parsed.entries.map((entry) => ({ name: entry.name, set: entry.set, collector: entry.collector })),
      );

      const cards: DeckCard[] = [];
      const misses: string[] = [];
      for (const entry of parsed.entries) {
        // Prefer the exact printing the line named; fall back to the card by name.
        const exact =
          entry.set && entry.collector ? bySet.get(`${entry.set}/${entry.collector.replace(/[★†]/gu, '')}`) : undefined;
        const card = exact ?? byName.get(entry.name.toLowerCase());
        if (!card) {
          misses.push(entry.name);
          continue;
        }
        // An explicit `[pc-…]` pointer in the file wins over the checkbox: the
        // author said which art they wanted, so honour it even unticked.
        const named = entry.art ? altArtById(entry.art) : undefined;
        let alts = named ? [named] : useAltArt ? altArtsFor(card.oracle_id) : [];
        // A two-faced card has one curated art PER FACE under a single oracle
        // identity, so the raw list is two arts of one card, not two arts to
        // choose between. Take the front: a deck opening on the back face put
        // a planeswalker in the command zone where a creature belongs, and the
        // flip had nothing left to turn to.
        if (!named && (card.card_faces?.length ?? 0) >= 2) {
          const front = altArtForFace(card.oracle_id, card.card_faces?.[0]?.name);
          alts = front ? [front] : [];
        }
        // An alt id is not a Scryfall id, so the metadata registry has to be told
        // they are the same card - otherwise the deck loses its type line, curve
        // and color identity for grouping and legality checks.
        for (const alt of alts) aliasCardMeta(card.id, alt.id);

        if (alts.length > 1 && entry.quantity > 1) {
          // Several arts for one card (basic lands): split the stack across them
          // as evenly as it divides, remainder to the earliest arts.
          const base = Math.floor(entry.quantity / alts.length);
          const extra = entry.quantity % alts.length;
          alts.forEach((alt, i) => {
            const quantity = base + (i < extra ? 1 : 0);
            if (quantity > 0) {
              cards.push({ scryfallId: alt.id, name: card.name, quantity, board: entry.board });
            }
          });
          continue;
        }
        cards.push({
          scryfallId: alts[0]?.id ?? card.id,
          name: card.name,
          quantity: entry.quantity,
          board: entry.board,
        });
      }
      void notFoundKeys;
      if (cards.length === 0) {
        setError(t('dbImportEmpty'));
        setNotFound(misses);
        return;
      }
      setNotFound(misses);
      const commander = cards.find((card) => card.board === 'commander');
      const name = parsed.name ?? commander?.name ?? t('dbUntitled');
      if (misses.length > 0) {
        // Import what resolved; the warning list stays visible only until the
        // dialog closes, so surface it as a toast too.
        toast({ tone: 'warning', message: `${t('dbImportNotFound')} ${misses.slice(0, 3).join(', ')}${misses.length > 3 ? '…' : ''}` });
      }
      await finish(name, cards);
    } catch {
      setError(t('obOffline'));
    } finally {
      setBusy(false);
    }
  };

  /** Import one Archidekt deck, whether it came from the picker or a pasted
   *  URL - both land in the same fetch. */
  const importArchidekt = async (ref: string) => {
    setError(null);
    const deckId = parseArchidektRef(ref);
    if (!deckId) {
      setError(t('dbImportBadRef'));
      return;
    }
    setBusy(true);
    try {
      const deck = await fetchArchidektDeck(deckId);
      await finish(deck.name, deck.cards);
    } catch (cause) {
      setError(cause instanceof ArchidektError ? t('dbImportArkFail') : t('obOffline'));
    } finally {
      setBusy(false);
    }
  };

  /** Search as the player types, one request per settled term. The sequence
   *  guard is what keeps a slow earlier response from overwriting a newer one -
   *  the same pattern the friends search uses. */
  const searchSeq = useRef(0);
  useEffect(() => {
    const term = arkQuery.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchArchidekt(term)
        .then((results) => {
          if (seq === searchSeq.current) setHits(results);
        })
        .catch(() => {
          if (seq === searchSeq.current) setHits([]);
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [arkQuery]);

  const importMoxfield = async () => {
    setError(null);
    const deckId = parseMoxfieldRef(moxRef);
    if (!deckId) {
      setError(t('dbImportBadRef'));
      return;
    }
    setBusy(true);
    try {
      const deck = await fetchMoxfieldDeck(deckId);
      await finish(deck.name, deck.cards);
    } catch (cause) {
      setError(cause instanceof MoxfieldError ? t('dbImportMoxFail') : t('obOffline'));
    } finally {
      setBusy(false);
    }
  };

  const errorBlock = error ? <Callout tone="danger">{error}</Callout> : null;

  return (
    <Modal open={open} onClose={onClose} title={t('dbImportTitle')} size="md">
      {/* Marker root: phones render this modal fullscreen (see app.css). */}
      <div className="pcMobileFull">
      <Tabs
        value={tab}
        onValueChange={setTab}
        aria-label={t('dbImportTitle')}
        tabs={[
          {
            value: 'text',
            label: t('dbImportTabText'),
            content: (
              <div className="importPane">
                <Text size={Size.Small} tone={TextTone.Muted}>
                  {t('dbImportPaste')}
                </Text>
                <Textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={10}
                  placeholder={'Commander\n1 Atraxa, Praetors’ Voice\n\nDeck\n1 Sol Ring\n1 Arcane Signet'}
                  aria-label={t('dbImportTabText')}
                  className="importTextarea"
                />
                {altAvailable && (
                  <Checkbox
                    label={t('dbImportAltArt')}
                    checked={useAltArt}
                    onCheckedChange={setUseAltArt}
                  />
                )}
                {errorBlock}
                {notFound.length > 0 && (
                  <Callout tone="warning" title={t('dbImportNotFound')}>
                    {notFound.join(', ')}
                  </Callout>
                )}
                <div className="importActions">
                  <Button variant="ghost" onClick={onClose}>
                    {t('dbCancel')}
                  </Button>
                  <Button onClick={importText} loading={busy} disabled={text.trim().length === 0}>
                    {t('dbImportRun')}
                  </Button>
                </div>
              </div>
            ),
          },
          {
            value: 'archidekt',
            label: t('dbImportTabArchidekt'),
            content: (
              <div className="importPane">
                <Text size={Size.Small} tone={TextTone.Muted}>
                  {t('dbImportArkHint')}
                </Text>
                <Input
                  value={arkQuery}
                  onChange={(event) => setArkQuery(event.target.value)}
                  placeholder={t('dbImportArkPlaceholder')}
                  aria-label={t('dbImportTabArchidekt')}
                />
                {/* A pasted URL is still a URL: skip the picker and import it,
                    so one field answers both ways of arriving here. */}
                {parseArchidektRef(arkQuery) ? (
                  <div className="importActions">
                    <Button variant="ghost" onClick={onClose}>
                      {t('dbCancel')}
                    </Button>
                    <Button onClick={() => importArchidekt(arkQuery)} loading={busy}>
                      {t('dbImportRun')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="importHits" role="list">
                      {hits.map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          role="listitem"
                          className="importHit"
                          disabled={busy}
                          onClick={() => importArchidekt(hit.id)}
                        >
                          <span className="importHitName">{hit.name}</span>
                          <span className="importHitMeta">
                            {[
                              archidektFormatName(hit.format),
                              `${hit.size} ${t('dbImportArkCards')}`,
                              hit.owner ? `@${hit.owner}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </button>
                      ))}
                    </div>
                    {searching && (
                      <Text size={Size.XSmall} tone={TextTone.Subtle}>
                        {t('dbImportArkSearching')}
                      </Text>
                    )}
                    {!searching && arkQuery.trim().length >= 2 && hits.length === 0 && (
                      <Text size={Size.XSmall} tone={TextTone.Subtle}>
                        {t('dbImportArkNone')}
                      </Text>
                    )}
                  </>
                )}
                {errorBlock}
              </div>
            ),
          },
          {
            value: 'moxfield',
            label: t('dbImportTabMoxfield'),
            content: (
              <div className="importPane">
                <Text size={Size.Small} tone={TextTone.Muted}>
                  {t('dbImportUrl')}
                </Text>
                <Input
                  value={moxRef}
                  onChange={(event) => setMoxRef(event.target.value)}
                  placeholder="https://moxfield.com/decks/…"
                  aria-label={t('dbImportUrl')}
                />
                {errorBlock}
                <div className="importActions">
                  <Button variant="ghost" onClick={onClose}>
                    {t('dbCancel')}
                  </Button>
                  <Button onClick={importMoxfield} loading={busy} disabled={moxRef.trim().length === 0}>
                    {t('dbImportRun')}
                  </Button>
                </div>
              </div>
            ),
          },
        ]}
      />
      </div>
    </Modal>
  );
}
