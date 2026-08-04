import { useEffect, useState, type CSSProperties } from 'react';
import { Button, EmptyState, Heading, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import {
  Download,
  PlayingCardDeck,
  Plus,
  Swords,
  Trophy,
} from '../icons/backfilled.tsx';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import * as api from '../net/api.ts';
import { bracketKey } from '../data/brackets.ts';
import { resolveCardImage } from '../data/games.ts';
import { DEFAULT_PLAYMAT, playmatBackground } from '../data/playmats.ts';
import { deckSummaryArt } from '../data/deckCover.ts';
import { winRate } from '../data/ranks.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
import { usePhoneViewport } from '../hooks/useIsPhone.ts';
import type { DeckSummary, MyDeckStats } from '../net/types.ts';
import { GameCard } from '../components/GameCard.tsx';
import { GameTag } from '../components/GameTag.tsx';
import { DeckEditor } from './deckbuilder/DeckEditor.tsx';
import { ImportDialog } from './deckbuilder/ImportDialog.tsx';
import { NewDeckWizard } from './deckbuilder/NewDeckWizard.tsx';
import { DeckInspector } from './deckbuilder/DeckInspector.tsx';
import '../components/gamecard.css';
import './deckbuilder/decks.css';

/**
 * Decks: the armory. A full-bleed headline band (the most recent deck's art
 * behind a directional scrim) carries the big NEW DECK action and the arsenal
 * read-out — deck count, battles fought, most-played deck; below it the
 * library grid shows every deck as a hero-scale loadout tile, the most recent
 * one spanning wide. Selection still lives in uiStore so the sidebar and this
 * page stay in step; picking a deck opens the editor exactly as before.
 */
export function DecksPage() {
  const selectedDeckId = useUi((state) => state.selectedDeckId);
  // Remount the editor per deck so its load/save state never bleeds across.
  return selectedDeckId ? <DeckEditor key={selectedDeckId} deckId={selectedDeckId} /> : <DeckLibrary />;
}

function DeckLibrary() {
  const t = useT();
  const allDecks = useApp((state) => state.decks);
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  const [importOpen, setImportOpen] = useState(false);
  const [newDeckOpen, setNewDeckOpen] = useState(false);
  // Right-click a deck to inspect its summary (stats/colors/bracket, not cards).
  const [inspecting, setInspecting] = useState<DeckSummary | null>(null);
  // One fetch feeds the band's read-out and every tile's record.
  const [deckStats, setDeckStats] = useState<Map<string, MyDeckStats> | null>(null);
  // WIP games' decks are hidden entirely unless the dev toggle is on.
  const games = useVisibleGames();
  const decks = allDecks.filter((deck) => games.some((g) => g.id === (deck.game || 'mtg')));
  // Which game's decks to show. 'all' spans every game.
  const [gameFilter, setGameFilter] = useState('all');
  const shown = gameFilter === 'all' ? decks : decks.filter((deck) => (deck.game || 'mtg') === gameFilter);

  useEffect(() => {
    refreshDecks().catch(() => {
      // Offline is fine - the store keeps whatever it had.
    });
  }, [refreshDecks]);

  useEffect(() => {
    let live = true;
    api
      .myDeckStats()
      .then((rows) => {
        if (live) setDeckStats(new Map(rows.map((row) => [row.deckId, row])));
      })
      .catch(() => {
        // Offline: the band shows em dashes, the tiles skip their records.
      });
    return () => {
      live = false;
    };
  }, []);

  // A "New deck" action from elsewhere clears the intent but deliberately does
  // NOT open the wizard: landing on this page cold with a modal over it hid
  // the armory it was navigating to. The big forge button is the next click.
  const newDeckIntent = useUi((state) => state.newDeckIntent);
  const clearNewDeckIntent = useUi((state) => state.clearNewDeckIntent);
  useEffect(() => {
    if (newDeckIntent) clearNewDeckIntent();
  }, [newDeckIntent, clearNewDeckIntent]);

  return (
    <div className="page decksPage">
      <ArmoryBand
        decks={decks}
        deckStats={deckStats}
        onNewDeck={() => setNewDeckOpen(true)}
        onImport={() => setImportOpen(true)}
      />

      {decks.length > 0 && (
        <div className="decksFilter">
          <SegmentedControl
            value={gameFilter}
            onValueChange={setGameFilter}
            options={[
              { value: 'all', label: t('decksAllGames') },
              ...games.map((g) => ({ value: g.id, label: g.name.replace('Magic: The Gathering', 'Magic') })),
            ]}
          />
        </div>
      )}

      {decks.length === 0 ? (
        <EmptyState
          icon={<PlayingCardDeck size={22} />}
          title={t('decksTitle')}
          description={t('decksEmpty')}
          action={
            <Button onClick={() => setNewDeckOpen(true)}>
              <Plus size={16} />
              {t('decksNew')}
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={<PlayingCardDeck size={22} />} title={t('decksTitle')} description={t('playNoDecksForGame')} />
      ) : (
        <div className="deckGrid">
          {shown.map((deck, index) => (
            <DeckTile
              key={deck.id}
              deck={deck}
              index={index}
              // The server lists decks most-recently-touched first, so the
              // first tile is the latest build and earns the wide showcase.
              showcase={index === 0}
              stats={deckStats?.get(deck.id) ?? null}
              onOpen={() => selectDeck(deck.id)}
              onInspect={() => setInspecting(deck)}
            />
          ))}
        </div>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <NewDeckWizard open={newDeckOpen} onClose={() => setNewDeckOpen(false)} />
      {inspecting && (
        <DeckInspector deck={inspecting} open={inspecting != null} onClose={() => setInspecting(null)} />
      )}
    </div>
  );
}

/**
 * The headline band: the most recently touched deck's wide art (or the default
 * felt) behind a directional scrim, the page's big type and the one unmissable
 * NEW DECK action on the heavy side, the arsenal read-out plates on the thin
 * side. Presentation only — the deck list and stats arrive from DeckLibrary's
 * existing fetching.
 */
function ArmoryBand({
  decks,
  deckStats,
  onNewDeck,
  onImport,
}: {
  decks: DeckSummary[];
  deckStats: Map<string, MyDeckStats> | null;
  onNewDeck: () => void;
  onImport: () => void;
}) {
  const t = useT();

  // The most recently touched deck dresses the band; a fresh account gets the
  // default felt the tables use.
  const recent = [...decks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const wide = recent ? deckSummaryArt(recent) : '';
  const art = wide ? `url("${wide}")` : playmatBackground(DEFAULT_PLAYMAT);

  // Battles fought across every deck, and the deck that fought the most.
  let battles = 0;
  let mostPlayed: MyDeckStats | null = null;
  if (deckStats) {
    for (const row of deckStats.values()) {
      battles += row.played;
      if (row.played > 0 && (mostPlayed == null || row.played > mostPlayed.played)) mostPlayed = row;
    }
  }
  const mostPlayedName =
    mostPlayed == null
      ? null
      : mostPlayed.name ?? decks.find((deck) => deck.id === mostPlayed?.deckId)?.name ?? '—';
  const mostPlayedWr = mostPlayed ? winRate(mostPlayed) : null;

  return (
    <section className="dkBand" aria-label={t('decksTitle')}>
      <div className="dkBandArt" style={{ backgroundImage: art }} aria-hidden />
      <div className="dkBandScrim" aria-hidden />

      <div className="dkIntro">
        <span className="dkKicker">{t('dkArmory')}</span>
        <Heading level={1} noMargin className="dkTitle">
          {t('decksTitle')}
        </Heading>
        <Text size={Size.Large} tone={TextTone.Muted} className="dkLede">
          {t('decksLede')}
        </Text>
        <div className="dkActions">
          <button type="button" className="dkForge pcSlant pcEdge pcSweep" onClick={onNewDeck}>
            <span className="dkForgeInner pcSlantInner">
              <Plus size={26} className="dkForgeIcon" aria-hidden />
              <span className="dkForgeText">
                <span className="dkForgeTitle">{t('decksNew')}</span>
                <span className="dkForgeSub">{t('dkForgeSub')}</span>
              </span>
            </span>
          </button>
          {/* Import wears the same forge plate as New deck - quieter tone, same
              family - instead of a kit button that read as an afterthought. */}
          <button type="button" className="dkForge dkForgeQuiet pcSlant pcEdge pcSweep" onClick={onImport}>
            <span className="dkForgeInner pcSlantInner">
              <Download size={26} className="dkForgeIcon" aria-hidden />
              <span className="dkForgeText">
                <span className="dkForgeTitle">{t('decksImport')}</span>
                <span className="dkForgeSub">{t('dkImportSub')}</span>
              </span>
            </span>
          </button>
        </div>
      </div>

      <div className="dkPlates">
        <div className="dkPlate pcSlant">
          <span className="dkPlateInner pcSlantInner">
            <span className="dkPlateValue">{decks.length}</span>
            <span className="dkPlateLabel">
              <PlayingCardDeck size={13} aria-hidden />
              {t('decksTitle')}
            </span>
          </span>
        </div>
        <div className="dkPlate pcSlant">
          <span className="dkPlateInner pcSlantInner">
            <span className="dkPlateValue">{deckStats ? battles : '—'}</span>
            <span className="dkPlateLabel">
              <Swords size={13} aria-hidden />
              {t('dkBattles')}
            </span>
          </span>
        </div>
        <div className="dkPlate dkPlateWide pcSlant">
          <span className="dkPlateMain pcSlantInner">
            <span className="dkPlateText">
              <span className="dkPlateValue dkPlateDeckName">{mostPlayedName ?? '—'}</span>
              <span className="dkPlateSub">
                {mostPlayed ? (
                  <>
                    <span className="dkNum">{mostPlayed.played}</span> {t('dkGames')} ·{' '}
                    <span className="dkNum">
                      {mostPlayed.wins}–{mostPlayed.losses}
                    </span>
                  </>
                ) : (
                  t('dkNoBattles')
                )}
              </span>
            </span>
            {mostPlayedWr != null && (
              <span
                className="dkRing"
                style={{ ['--dk-ring' as string]: `${mostPlayedWr}%` }}
                role="img"
                aria-label={`${t('hmWinRate')} ${mostPlayedWr}%`}
              >
                <span className="dkRingNum">{mostPlayedWr}%</span>
              </span>
            )}
          </span>
          <span className="dkPlateLabel">
            <Trophy size={13} aria-hidden />
            {t('dkMostPlayed')}
          </span>
        </div>
      </div>
    </section>
  );
}

function DeckTile({
  deck,
  index,
  showcase,
  stats,
  onOpen,
  onInspect,
}: {
  deck: DeckSummary;
  index: number;
  showcase: boolean;
  stats: MyDeckStats | null;
  onOpen: () => void;
  onInspect: () => void;
}) {
  const t = useT();
  // Raw viewport state, in lockstep with the stylesheet's PHONE_QUERY rules
  // (the table's mobile-layout preference must not desync art from CSS).
  const phone = usePhoneViewport();
  // MTG ships a Scryfall cover URL; Cyberpunk resolves its bundled art from the
  // cover card id.
  const cover = deck.coverImageUrl || (deck.coverCardId ? resolveCardImage(deck.game, deck.coverCardId) : undefined);
  const played = stats != null && stats.played > 0;
  const pct = played && stats ? winRate(stats) : null;
  return (
    <button
      type="button"
      className="deckTile"
      data-showcase={showcase || undefined}
      // A deck that brings its own mat to the table wears it here too, so the
      // list shows at a glance which deck plays on what.
      data-mat={deck.playmat ? '' : undefined}
      style={
        {
          // CSS-only staggered entrance; the delay caps so a long library
          // doesn't keep late rows waiting.
          ['--dk-delay' as string]: `${Math.min(index, 8) * 40}ms`,
          ...(deck.playmat ? { ['--pc-deck-mat' as string]: playmatBackground(deck.playmat) } : null),
        } as CSSProperties
      }
      onClick={onOpen}
      onContextMenu={(event) => {
        event.preventDefault();
        onInspect();
      }}
    >
      <div className="deckTileArt">
        <GameCard
          name={deck.commander || deck.name}
          imageUrl={cover}
          width={phone ? 116 : showcase ? 250 : 190}
          foil
          glow={showcase}
          tilt={7}
        />
        <GameTag game={deck.game} showName={false} className="deckTileGame" />
        {/* The server sends a bracket only for MTG Commander decks; everything
            else gets no chip at all rather than an empty slot. */}
        {deck.bracket && (
          <span
            className="deckTileBracket"
            data-bracket={deck.bracket.bracket}
            // A bare numeral means nothing read aloud, so name what it is - the
            // same sentence the editor's bracket stat carries.
            role="img"
            aria-label={`${t('bkBracket')} ${deck.bracket.bracket}: ${t(bracketKey(deck.bracket.bracket))} (${t('bkEstimate')})`}
            title={
              deck.bracket.gameChangers.length > 0
                ? `${t('bkGameChangers')}: ${deck.bracket.gameChangers.join(', ')}`
                : t('bkNote')
            }
          >
            <span className="deckTileBracketNum">{deck.bracket.bracket}</span>
            <span className="deckTileBracketName">{t(bracketKey(deck.bracket.bracket))}</span>
          </span>
        )}
      </div>
      <div className="deckTileInfo">
        {showcase && <span className="deckTileLatest">{t('dkLatest')}</span>}
        <span className="deckTileName">{deck.name}</span>
        {deck.commander && (
          <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckTileCommander">
            {deck.commander}
          </Text>
        )}
        <span className="deckTileMeta">
          <span className="deckTilePlate deckTileFormat">{deck.format}</span>
          <span className="deckTilePlate">
            {deck.cardCount} {t('decksCards')}
          </span>
          {played && stats && (
            <span className="deckTilePlate deckTileRecord">
              {stats.wins}–{stats.losses}
              {pct != null && <span className="deckTileWr">{pct}%</span>}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
