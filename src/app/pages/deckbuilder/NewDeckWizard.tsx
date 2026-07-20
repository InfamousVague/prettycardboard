import { useState } from 'react';
import { Modal, Text, Size, TextTone } from '@glacier/react';
import { ArrowLeft, Plus } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import * as api from '../../net/api.ts';
import { useApp } from '../../state/appStore.ts';
import { useUi } from '../../state/uiStore.ts';
import { FORMATS } from '../../data/formats.ts';
import { GAME_LIST, getGame } from '../../data/games.ts';
import { cyberpunkCatalog, cyberpunkImage } from '../../data/cyberpunk.ts';
import { GameBadge } from '../../components/GameTag.tsx';
import type { DeckCard } from '../../net/types.ts';
import './newDeckWizard.css';

/**
 * New-deck wizard: pick the card GAME first, then a starting point for that
 * game (an MTG format, or a Cyberpunk blank/color starter), then drop into the
 * game-aware deck editor. Replaces the old MTG-only "pick a format" menu so the
 * flow scales to every game in the registry.
 */
export function NewDeckWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  const [game, setGame] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setGame(null);
    setBusy(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const create = async (opts: { game: string; format: string; name: string; cards?: DeckCard[] }) => {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await api.createDeck(opts.name, opts.format, opts.cards ?? [], null, opts.game);
      await refreshDecks();
      selectDeck(id);
      close();
    } catch {
      setBusy(false);
    }
  };

  const chosen = game ? getGame(game) : null;

  return (
    <Modal open={open} onClose={close} title={chosen ? t('ndwPickKind') : t('ndwPickGame')} size="md">
      {!chosen ? (
        <div className="ndwStep">
          <Text size={Size.Small} tone={TextTone.Muted}>
            {t('ndwPickGameHint')}
          </Text>
          <div className="ndwGames">
            {GAME_LIST.map((g) => (
              <button
                key={g.id}
                type="button"
                className="ndwGameCard"
                style={{ ['--game-accent' as string]: g.accent }}
                onClick={() => setGame(g.id)}
              >
                <GameBadge game={g.id} />
                <span className="ndwGameName">{g.name}</span>
                <span className="ndwGameTagline">{g.tagline}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="ndwStep">
          <button type="button" className="ndwBack" onClick={reset}>
            <ArrowLeft size={14} /> {chosen.name}
          </button>
          <div className="ndwKinds" aria-busy={busy || undefined}>
            {game === 'cyberpunk'
              ? [
                  <button
                    key="blank"
                    type="button"
                    className="ndwKind ndwKindBlank"
                    disabled={busy}
                    onClick={() => create({ game: 'cyberpunk', format: 'Standard', name: t('dbUntitled') })}
                  >
                    <span className="ndwKindIcon">
                      <Plus size={20} />
                    </span>
                    <span className="ndwKindBody">
                      <span className="ndwKindName">{t('ndwBlank')}</span>
                      <span className="ndwKindDesc">{t('ndwBlankHint')}</span>
                    </span>
                  </button>,
                  ...cyberpunkCatalog().map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      className="ndwKind"
                      style={{ ['--game-accent' as string]: chosen.accent }}
                      disabled={busy}
                      onClick={() =>
                        create({ game: 'cyberpunk', format: 'Standard', name: starter.name, cards: starter.cards })
                      }
                    >
                      <span
                        className="ndwKindArt"
                        style={{ backgroundImage: `url("${cyberpunkImage(starter.legend.id)}")` }}
                        aria-hidden
                      />
                      <span className="ndwKindBody">
                        <span className="ndwKindName">{starter.name}</span>
                        <span className="ndwKindDesc">{starter.color} · starter deck</span>
                      </span>
                    </button>
                  )),
                ]
              : FORMATS.map((format) => (
                  <button
                    key={format.id}
                    type="button"
                    className="ndwKind"
                    style={{ ['--game-accent' as string]: chosen.accent }}
                    disabled={busy}
                    onClick={() => create({ game: 'mtg', format: format.name, name: t('dbUntitled') })}
                  >
                    <span className="ndwKindIcon">
                      <Plus size={18} />
                    </span>
                    <span className="ndwKindBody">
                      <span className="ndwKindName">{format.name}</span>
                      <span className="ndwKindDesc">
                        {format.exactSize
                          ? `${format.exactSize} cards${format.hasCommander ? ' · commander' : ''}`
                          : `${format.minSize}+ cards`}
                      </span>
                    </span>
                  </button>
                ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
