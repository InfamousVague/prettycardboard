import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button, IconButton, ScrollArea, SearchField, Text, Size, TextTone } from '@glacier/react';
import { Hand as HandIcon, X } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import type { CardInst } from '../../net/types.ts';
import { useTableUi } from './tableUi.ts';
import { flightAnchor } from './juice.ts';

const HAND_PAD = 44;

/**
 * The library as a scrollable side panel: search or scroll the whole deck, then
 * DRAG a card straight onto the playmat (drops onto the battlefield where you
 * release, or into the hand over the fan). A quick button also sends it to hand.
 * Opens for the `search` library intent (the deck menu's "Search library"); the
 * `peek` intent still uses the reorder modal.
 */
export function LibrarySidebar() {
  const t = useT();
  const act = useGame((state) => state.act);
  const libraryCards = useGame((state) => state.libraryCards);
  const clearLibraryCards = useGame((state) => state.clearLibraryCards);
  const libIntent = useTableUi((state) => state.libIntent);
  const setLibIntent = useTableUi((state) => state.setLibIntent);
  const popup = useCardPopup();

  const [filter, setFilter] = useState('');
  // Cards pulled out of the library this session are dropped from the list right
  // away (the fetched snapshot is otherwise stale until the next request).
  const [pulled, setPulled] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ card: CardInst; x: number; y: number } | null>(null);
  const origin = useRef<{ px: number; py: number; armed: boolean }>({ px: 0, py: 0, armed: false });
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setPulled(new Set());
    setFilter('');
  }, [libraryCards]);

  const open = libIntent === 'search' && libraryCards != null;

  const results = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const list = (libraryCards ?? []).filter((card) => !pulled.has(card.iid));
    return query ? list.filter((card) => card.name.toLowerCase().includes(query)) : list;
  }, [libraryCards, pulled, filter]);

  if (!open) return null;

  const close = () => {
    clearLibraryCards();
    setLibIntent(null);
  };

  const pull = (iid: string) => setPulled((prev) => new Set(prev).add(iid));

  const begin = (event: ReactPointerEvent, card: CardInst) => {
    if (event.button !== 0) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    origin.current = { px: event.clientX, py: event.clientY, armed: false };
    setDrag({ card, x: event.clientX, y: event.clientY });
  };

  const move = (event: ReactPointerEvent) => {
    if (!drag) return;
    if (!origin.current.armed) {
      if (Math.hypot(event.clientX - origin.current.px, event.clientY - origin.current.py) < 6) return;
      origin.current.armed = true;
    }
    setDrag((d) => (d ? { ...d, x: event.clientX, y: event.clientY } : d));
  };

  const end = (event: ReactPointerEvent) => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (!origin.current.armed) {
      // Never crossed the threshold: a click opens the full-card preview.
      popup.open({ scryfallId: d.card.scryfallId, name: d.card.name, imageUrl: d.card.imageUrl });
      return;
    }
    // A release over the sidebar itself is a cancel, even though the panel
    // overlaps the field's right edge - never play a card back onto the panel.
    const panel = asideRef.current?.getBoundingClientRect();
    if (
      panel != null &&
      event.clientX >= panel.left &&
      event.clientX <= panel.right &&
      event.clientY >= panel.top &&
      event.clientY <= panel.bottom
    ) {
      return;
    }
    const field = flightAnchor('field:mine');
    const hand = flightAnchor('hand:mine');
    const inHand =
      hand != null &&
      event.clientX >= hand.left - HAND_PAD &&
      event.clientX <= hand.right + HAND_PAD &&
      event.clientY >= hand.top - HAND_PAD &&
      event.clientY <= hand.bottom + HAND_PAD;
    if (inHand) {
      act({ kind: 'card.move', iid: d.card.iid, to: 'hand' });
      pull(d.card.iid);
    } else if (
      field != null &&
      event.clientX >= field.left &&
      event.clientX <= field.right &&
      event.clientY >= field.top &&
      event.clientY <= field.bottom
    ) {
      const x = Math.min(0.97, Math.max(0.03, (event.clientX - field.left) / field.width));
      const y = Math.min(0.9, Math.max(0.03, (event.clientY - field.top) / field.height));
      act({ kind: 'card.move', iid: d.card.iid, to: 'battlefield', x, y });
      pull(d.card.iid);
    }
    // Released outside the field/hand: no-op (the card stays in the library).
  };

  return (
    <>
      <aside ref={asideRef} className="libSidebar" onPointerMove={move} onPointerUp={end}>
        <div className="libSidebarHead">
          <span className="libSidebarTitle">
            {t('gpSearchLib')} · {results.length}
          </span>
          <IconButton size="sm" variant="ghost" aria-label={t('cpClose')} onClick={close}>
            <X size={15} />
          </IconButton>
        </div>
        <SearchField size="sm" value={filter} onValueChange={setFilter} placeholder={t('dbSearchPlaceholder')} glass />
        <Text size={Size.XSmall} tone={TextTone.Subtle} className="libSidebarHint">
          {t('gpLibDragHint')}
        </Text>
        <ScrollArea className="libSidebarScroll">
          <div className="libSidebarGrid">
            {results.map((card) => (
              <div key={card.iid} className="libSidebarCard">
                <div className="libSidebarGrab" onPointerDown={(event) => begin(event, card)}>
                  <GameCard name={card.name} imageUrl={card.imageUrl || cardImage(card.scryfallId)} width={128} tilt={0} />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    act({ kind: 'card.move', iid: card.iid, to: 'hand' });
                    pull(card.iid);
                  }}
                >
                  <HandIcon size={13} /> {t('tblHand')}
                </Button>
              </div>
            ))}
            {results.length === 0 && (
              <Text size={Size.XSmall} tone={TextTone.Subtle}>
                {t('gpNoCards')}
              </Text>
            )}
          </div>
        </ScrollArea>
      </aside>
      {drag && origin.current.armed && (
        <div className="libDragGhost" style={{ left: drag.x, top: drag.y }} aria-hidden>
          <GameCard
            name={drag.card.name}
            imageUrl={drag.card.imageUrl || cardImage(drag.card.scryfallId)}
            width={120}
            tilt={0}
          />
        </div>
      )}
    </>
  );
}
