import { useRef, useState, type ReactNode } from 'react';
import { Button, IconButton, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { Trash2, Upload } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { PLAYMATS, playmatBackground, playmatUrl } from '../data/playmats.ts';
import { CARD_BACKS, cardBackUrl } from '../data/cardBacks.ts';
import { deleteCardBack, uploadCardBack, uploadPlaymat } from '../net/api.ts';
import { presentThemes, THEME_LABEL_KEY, type AssetTheme } from '../data/themes.ts';

type Filter = 'all' | AssetTheme;

/**
 * A picker grid that filters by asset theme. The catalog spans Magic, the
 * Cyberpunk TCG, solid color-token swatches, and game-agnostic art, so a chip
 * row narrows the grid to one theme. Chips are derived from the items present,
 * so a new themed asset surfaces its category with no code change.
 *
 * Shared by the Customize tab (playmats, card backs) and the deck editor's
 * per-deck mat, so all three pick from one grid with one set of behaviours.
 */
export function ThemedPicker<T extends { id: string; name: string; theme: AssetTheme }>({
  items,
  selectedId,
  onSelect,
  ariaLabel,
  gridClass,
  swatchClass,
  renderMedia,
  lead,
  scrollable,
}: {
  items: readonly T[];
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  gridClass: string;
  swatchClass: string;
  renderMedia: (item: T) => ReactNode;
  /** An extra swatch rendered before the catalog (the deck's "no mat" tile). */
  lead?: ReactNode;
  /** Put the grid in its own scroll box - for a height-capped modal, where the
   *  page itself cannot scroll. The grid must NOT be the scroller: as a flex
   *  item with a definite height its rows size against the container rather
   *  than the tiles, and aspect-ratio swatches then overlap the row below. */
  scrollable?: boolean;
}) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const themes = presentThemes(items);
  const shown = filter === 'all' ? items : items.filter((item) => item.theme === filter);
  const wrap = (grid: ReactNode) => (scrollable ? <div className="pickerScroll">{grid}</div> : grid);

  return (
    <>
      {themes.length > 1 && (
        <div className="pickerFilter">
          <SegmentedControl
            aria-label={ariaLabel}
            fullWidth
            value={filter}
            onValueChange={(value) => setFilter(value as Filter)}
            options={[
              { value: 'all', label: t('custThemeAll') },
              ...themes.map((theme) => ({ value: theme, label: t(THEME_LABEL_KEY[theme]) })),
            ]}
          />
        </div>
      )}
      {wrap(
        <div className={gridClass} role="radiogroup" aria-label={ariaLabel}>
          {lead}
          {shown.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selectedId === item.id}
              className={swatchClass}
              data-selected={selectedId === item.id || undefined}
              title={item.name}
              onClick={() => onSelect(item.id)}
            >
              {renderMedia(item)}
            </button>
          ))}
        </div>,
      )}
    </>
  );
}

/** One mat's face: a color token paints itself, artwork loads its webp. */
export function PlaymatSwatchMedia({ id, name }: { id: string; name: string }) {
  const mat = PLAYMATS.find((entry) => entry.id === id);
  return (
    <>
      {mat?.token ? (
        <span className="matColorFill" aria-hidden style={{ backgroundImage: playmatBackground(id) }} />
      ) : (
        <img src={playmatUrl(id)} alt={name} loading="lazy" draggable={false} />
      )}
      <span className="matSwatchName">{name}</span>
    </>
  );
}

/**
 * Upload-your-own: the image goes to the server (one per account) and comes
 * back as a `custom-...` id. Deliberately id-in / id-out rather than
 * preference-coupled, so the Customize tab and a deck's own mat can both use
 * it - the caller decides what "chosen" means.
 */
export function PlaymatUpload({
  onUploaded,
}: {
  /** Fired with the new id after a successful upload (the caller decides
   *  whether to also remember it as the account's custom mat, and whether to
   *  select it). The uploaded mat appears as a tile in the grid above. */
  onUploaded: (id: string) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 8 * 1024 * 1024) {
      setError(t('custUploadTooBig'));
      return;
    }
    setBusy(true);
    try {
      const { id } = await uploadPlaymat(file);
      onUploaded(id);
    } catch {
      setError(t('custUploadFailed'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="matUploadRow">
      <div className="matUploadActions">
        <Button variant="soft" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
          <Upload size={15} /> {t('custUpload')}
        </Button>
        <Text as="span" size={Size.XSmall} tone={error ? TextTone.Danger : TextTone.Subtle}>
          {error ?? t('custUploadHint')}
        </Text>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void pick(event.target.files?.[0])}
      />
    </div>
  );
}

/**
 * Upload-your-own card back. Same id-in / id-out contract as PlaymatUpload, with
 * one addition: a card back is on screen constantly and on every face-down card,
 * so a bad upload needs to be removable — the mat equivalent can just be
 * switched away from.
 */
export function CardBackUpload({
  hasUpload,
  onUploaded,
  onRemoved,
}: {
  hasUpload: boolean;
  onUploaded: (id: string) => void;
  onRemoved: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    // Matches the server's BACK_MAX_BYTES so the failure is immediate and
    // legible rather than a 413 after the whole body has been uploaded.
    if (file.size > 4 * 1024 * 1024) {
      setError(t('custBackTooBig'));
      return;
    }
    setBusy(true);
    try {
      const { id } = await uploadCardBack(file);
      onUploaded(id);
    } catch {
      setError(t('custUploadFailed'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteCardBack();
      onRemoved();
    } catch {
      setError(t('custUploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="matUploadRow">
      <div className="matUploadActions">
        <Button variant="soft" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
          <Upload size={15} /> {t('custUpload')}
        </Button>
        {hasUpload && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove()}>
            {t('custRemove')}
          </Button>
        )}
        <Text as="span" size={Size.XSmall} tone={error ? TextTone.Danger : TextTone.Subtle}>
          {error ?? t('custBackHint')}
        </Text>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void pick(event.target.files?.[0])}
      />
    </div>
  );
}

/**
 * The card-back grid, same shape as the playmat one: a "no back of its own"
 * lead tile for a deck that should follow the player's setting, the account's
 * upload if it has one, then the bundled catalogue.
 */
export function CardBackPicker({
  selectedId,
  onSelect,
  ariaLabel,
  noneLabel,
  onNone,
  customId,
  scrollable,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  noneLabel?: string;
  onNone?: () => void;
  customId?: string;
  scrollable?: boolean;
}) {
  const t = useT();
  return (
    <ThemedPicker
      items={CARD_BACKS}
      selectedId={selectedId}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
      gridClass="backPicker"
      swatchClass="backSwatch"
      scrollable={scrollable}
      lead={
        <>
          {noneLabel != null && onNone != null && (
            <button
              type="button"
              role="radio"
              aria-checked={selectedId === ''}
              className="backSwatch matSwatchNone"
              data-selected={selectedId === '' || undefined}
              title={noneLabel}
              onClick={onNone}
            >
              <span className="matSwatchName">{noneLabel}</span>
            </button>
          )}
          {customId ? (
            <button
              type="button"
              role="radio"
              aria-checked={selectedId === customId}
              className="backSwatch"
              data-selected={selectedId === customId || undefined}
              title={t('custUploadYours')}
              onClick={() => onSelect(customId)}
            >
              <img src={cardBackUrl(customId)} alt={t('custUploadYours')} draggable={false} />
              <span className="matSwatchName">{t('custUploadYours')}</span>
            </button>
          ) : null}
        </>
      }
      renderMedia={(back) => (
        <>
          <img src={cardBackUrl(back.id)} alt={back.name} loading="lazy" draggable={false} />
          <span className="matSwatchName">{back.name}</span>
        </>
      )}
    />
  );
}

/**
 * The playmat grid. `selectedId` empty means nothing in the catalog is chosen -
 * used by the deck editor, where "none" means the deck defers to the player's
 * own mat preference and is offered as its own leading tile.
 */
export function PlaymatPicker({
  selectedId,
  onSelect,
  ariaLabel,
  noneLabel,
  onNone,
  customIds,
  onDeleteCustom,
  scrollable,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  /** See ThemedPicker: the modal needs its own scroll box. */
  scrollable?: boolean;
  /** Present = offer a "use my own mat" tile ahead of the catalog. */
  noneLabel?: string;
  onNone?: () => void;
  /** The account's uploaded mats, rendered as the first real tiles. They
   *  belong IN the grid: outside it a swatch has no track to size against and
   *  its 16/9 ratio blows it up to the width of the row. */
  customIds?: string[];
  /** Offered on each upload, so sixteen mats is not a trap. */
  onDeleteCustom?: (id: string) => void;
}) {
  const t = useT();
  return (
    <ThemedPicker
      items={PLAYMATS}
      selectedId={selectedId}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
      gridClass="matPicker"
      swatchClass="matSwatch"
      scrollable={scrollable}
      lead={
        <>
          {noneLabel != null && onNone != null && (
            <button
              type="button"
              role="radio"
              aria-checked={selectedId === ''}
              className="matSwatch matSwatchNone"
              data-selected={selectedId === '' || undefined}
              title={noneLabel}
              onClick={onNone}
            >
              <span className="matSwatchName">{noneLabel}</span>
            </button>
          )}
          {(customIds ?? []).map((id, index) => (
            <span className="matSwatchWrap" key={id}>
              <button
                type="button"
                role="radio"
                aria-checked={selectedId === id}
                className="matSwatch matSwatchCustom"
                data-selected={selectedId === id || undefined}
                title={t('custUploadYours')}
                onClick={() => onSelect(id)}
              >
                <img src={playmatUrl(id)} alt={t('custUploadYours')} draggable={false} />
                <span className="matSwatchName">
                  {t('custUploadYours')}
                  {index > 0 ? ` ${index + 1}` : ''}
                </span>
              </button>
              {onDeleteCustom && (
                <IconButton
                  size="sm"
                  variant="ghost"
                  className="matSwatchDelete"
                  aria-label={t('custDeleteMat')}
                  onClick={() => onDeleteCustom(id)}
                >
                  <Trash2 size={14} />
                </IconButton>
              )}
            </span>
          ))}
        </>
      }
      renderMedia={(mat) => <PlaymatSwatchMedia id={mat.id} name={mat.name} />}
    />
  );
}
