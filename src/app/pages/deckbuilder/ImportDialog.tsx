import { useState } from 'react';
import { Button, Callout, Modal, Size, Tabs, Text, TextTone, Textarea, Input, useToast } from '@glacier/react';
import { useT } from '../../i18n.ts';
import * as api from '../../net/api.ts';
import type { DeckCard } from '../../net/types.ts';
import { useApp } from '../../state/appStore.ts';
import { useUi } from '../../state/uiStore.ts';
import { parseDecklist } from '../../data/decklist.ts';
import { resolvePrintings } from '../../data/scryfall.ts';
import { fetchMoxfieldDeck, MoxfieldError, parseMoxfieldRef } from '../../data/moxfield.ts';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);

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
        cards.push({ scryfallId: card.id, name: card.name, quantity: entry.quantity, board: entry.board });
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
    </Modal>
  );
}
