import { useEffect, useState } from 'react';
import { Button, Input, Modal, SearchField, Size, Spinner, Text, TextTone } from '@glacier/react';
import { Plus } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import * as api from '../../net/api.ts';
import { COMMON_TOKENS, deckTokens, searchTokens, type TokenCard } from '../../data/tokens.ts';
import { GameCard } from '../../components/GameCard.tsx';
import './tokenpicker.css';

/**
 * Create-token picker: search Scryfall's token cards (real art + P/T), with the
 * tokens THIS deck can produce shown up top by default, plus common-token quick
 * chips and a custom name/PT fallback. Placing calls back with a token or a
 * custom spec; the board decides where it lands.
 */
export function TokenPicker({
  deckId,
  onPlace,
  onPlaceCustom,
  onClose,
}: {
  deckId?: string | null;
  onPlace: (token: TokenCard) => void;
  onPlaceCustom: (name: string, power?: string, toughness?: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenCard[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [deckToks, setDeckToks] = useState<TokenCard[] | null>(null);
  const [customName, setCustomName] = useState('');
  const [customPT, setCustomPT] = useState('1/1');

  // Which tokens this deck can produce (from each card's Scryfall all_parts).
  useEffect(() => {
    let cancelled = false;
    if (!deckId) {
      setDeckToks([]);
      return;
    }
    api
      .getDeck(deckId)
      .then((deck) => deckTokens(deckId, deck.cards.map((card) => card.scryfallId)))
      .then((tokens) => {
        if (!cancelled) setDeckToks(tokens);
      })
      .catch(() => {
        if (!cancelled) setDeckToks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // Debounced token search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchTokens(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const grid = (tokens: TokenCard[]) => (
    <div className="tokenGrid">
      {tokens.map((token) => (
        <button key={token.id} type="button" className="tokenCell" title={token.name} onClick={() => onPlace(token)}>
          <GameCard name={token.name} imageUrl={token.image} fluid tilt={0} />
          {token.power != null && token.toughness != null && (
            <span className="tokenPT">
              {token.power}/{token.toughness}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const loading = (
    <div className="tokenLoading">
      <Spinner size="sm" aria-label={t('tkTitle')} />
    </div>
  );

  return (
    <Modal open onClose={onClose} title={t('tkTitle')} size="xl">
      <div className="tokenPicker">
        <SearchField value={query} onValueChange={setQuery} placeholder={t('tkSearch')} aria-label={t('tkSearch')} />

        {query.trim() ? (
          searching ? (
            loading
          ) : results && results.length > 0 ? (
            grid(results)
          ) : (
            <Text tone={TextTone.Muted}>{t('tkNoResults')}</Text>
          )
        ) : (
          <>
            <section className="tokenSection">
              <Text size={Size.Small} weight="semibold" className="tokenSectionTitle">
                {t('tkDeckTokens')}
              </Text>
              {deckToks == null ? (
                loading
              ) : deckToks.length > 0 ? (
                grid(deckToks)
              ) : (
                <Text size={Size.Small} tone={TextTone.Subtle}>
                  {t('tkNoDeckTokens')}
                </Text>
              )}
            </section>
            <section className="tokenSection">
              <Text size={Size.Small} weight="semibold" className="tokenSectionTitle">
                {t('tkCommon')}
              </Text>
              <div className="tokenChips">
                {COMMON_TOKENS.map((name) => (
                  <Button key={name} size="sm" variant="soft" onClick={() => setQuery(name)}>
                    {name}
                  </Button>
                ))}
              </div>
            </section>
          </>
        )}

        <form
          className="tokenCustom"
          onSubmit={(event) => {
            event.preventDefault();
            const [power, toughness] = customPT.split('/');
            onPlaceCustom(customName.trim() || 'Token', power?.trim(), toughness?.trim());
          }}
        >
          <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="tokenCustomLabel">
            {t('tkCustom')}
          </Text>
          <Input size="sm" value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="Token" />
          <Input
            size="sm"
            value={customPT}
            onChange={(event) => setCustomPT(event.target.value)}
            placeholder="1/1"
            aria-label="Power / toughness"
            style={{ width: '4.75rem' }}
          />
          <Button size="sm" type="submit" aria-label={t('tkCustom')}>
            <Plus size={14} />
          </Button>
        </form>
      </div>
    </Modal>
  );
}
