import { useEffect, useMemo, useState } from 'react';
import { Button, Fieldset, IconButton, Kbd, SegmentedControl, Size, Text, TextTone, Tooltip } from '@glacier/react';
import { RotateCcw, X } from '@glacier/icons';
import { useT } from '../i18n.ts';
import type { Preferences } from '../preferences.ts';
import { getGame, type GameId } from '../data/games.ts';
import { useGame } from '../state/gameStore.ts';
import {
  KEYBIND_DEFS,
  KEYBIND_GROUPS,
  KEYBIND_GROUP_LABEL,
  effectiveCode,
  keyLabel,
  type ActionId,
  type KeyCode,
} from '../data/keybinds.ts';

/**
 * The Keybinds settings tab: pick a game, then rebind the table's keyboard
 * shortcuts. Bindings are per game and stored sparsely (only the changes) in
 * preferences.keybinds; unset actions show their catalog default. Clicking a
 * key chip listens for one keypress (Esc cancels, Backspace unbinds). Bindings
 * are keyed by physical key (KeyboardEvent.code), so they survive layout/Shift.
 */
export function KeybindsTab({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
}) {
  const t = useT();
  const roomGame = useGame((s) => s.room?.game) as GameId | undefined;
  // Which game's bindings are being edited (view-only; does not touch any room).
  const [game, setGame] = useState<GameId>(roomGame ?? 'mtg');
  const [listening, setListening] = useState<ActionId | null>(null);

  const binds = preferences.keybinds;
  // Cyberpunk is WIP-gated: only offer editing a game you can actually play.
  const gameOptions = [
    { value: 'mtg', label: 'Magic' },
    ...(preferences.enableWip ? [{ value: 'cyberpunk', label: 'Cyberpunk' }] : []),
  ];

  const defs = useMemo(() => KEYBIND_DEFS.filter((d) => d.games.includes(game)), [game]);

  // Which codes are bound to more than one action in this game (a soft warning;
  // the handler still resolves ties deterministically by catalog order).
  const conflicts = useMemo(() => {
    const count = new Map<KeyCode, number>();
    for (const d of defs) {
      const code = effectiveCode(binds, game, d.action);
      if (code) count.set(code, (count.get(code) ?? 0) + 1);
    }
    return count;
  }, [defs, binds, game]);
  const hasConflict = [...conflicts.values()].some((n) => n > 1);

  const commit = (action: ActionId, code: KeyCode) => {
    onChange({ keybinds: { ...binds, [game]: { ...binds[game], [action]: code } } });
    setListening(null);
  };
  const resetOne = (action: ActionId) => {
    const g = { ...binds[game] };
    delete g[action];
    onChange({ keybinds: { ...binds, [game]: g } });
  };
  const resetGame = () => onChange({ keybinds: { ...binds, [game]: {} } });

  // While listening, capture the next keypress in the capture phase so it never
  // leaks to the modal (Esc/Space/Tab would operate it) or the table.
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return; // wait for a real key
      if (e.metaKey || e.ctrlKey || e.altKey) return; // bare keys only (matches the table handler)
      if (e.code === 'Escape') return setListening(null); // cancel
      if (e.code === 'Backspace' || e.code === 'Delete') return commit(listening, ''); // unbind
      commit(listening, e.code);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, game, binds]);

  // Vitals rows read game-aware resource names (Life/Net, Poison/RAM).
  const gdef = getGame(game);
  const primaryLabel = gdef.resources.find((r) => r.primary)?.label ?? 'Life';
  const secondaryLabel = gdef.resources.find((r) => !r.primary)?.label ?? 'Poison';
  const rowLabel = (action: ActionId, labelKey: Parameters<typeof t>[0]) => {
    if (action === 'lifeUp' || action === 'lifeDown') return `${primaryLabel} ${t(labelKey)}`;
    if (action === 'secondaryUp' || action === 'secondaryDown') return `${secondaryLabel} ${t(labelKey)}`;
    return t(labelKey);
  };

  return (
    <div className="keybindsTab" style={{ display: 'grid', gap: 'var(--glacier-space-6)' }}>
      <div className="control">
        <SegmentedControl
          aria-label={t('setKeybinds')}
          fullWidth
          value={game}
          onValueChange={(value) => {
            setListening(null);
            setGame(value as GameId);
          }}
          options={gameOptions}
        />
      </div>

      {hasConflict && (
        <Text size={Size.Small} tone={TextTone.Warning} role="alert" aria-live="polite">
          {t('kbConflictWarn')}
        </Text>
      )}

      {KEYBIND_GROUPS.map((group) => {
        const rows = defs.filter((d) => d.group === group);
        if (rows.length === 0) return null;
        return (
          <Fieldset key={group} legend={t(KEYBIND_GROUP_LABEL[group])}>
            <div className="keybindRows">
              {rows.map((def) => {
                const code = effectiveCode(binds, game, def.action);
                const conflicted = code !== '' && (conflicts.get(code) ?? 0) > 1;
                const isListening = listening === def.action;
                return (
                  <div
                    key={def.action}
                    className="keybindRow"
                    data-listening={isListening || undefined}
                    data-conflict={conflicted || undefined}
                  >
                    <Text as="span" size={Size.Small}>
                      {rowLabel(def.action, def.labelKey)}
                    </Text>
                    <div className="keybindChips">
                      <button
                        type="button"
                        className="kbChip"
                        aria-label={t('setKeybinds')}
                        onClick={() => setListening(isListening ? null : def.action)}
                      >
                        <Kbd>{isListening ? t('kbPressKey') : keyLabel(code) || t('kbUnbound')}</Kbd>
                      </button>
                      {code !== '' && (
                        <Tooltip content={t('kbClear')}>
                          <IconButton size="sm" variant="ghost" aria-label={t('kbClear')} onClick={() => commit(def.action, '')}>
                            <X size={13} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {code !== def.defaultCode && (
                        <Tooltip content={t('kbReset')}>
                          <IconButton size="sm" variant="ghost" aria-label={t('kbReset')} onClick={() => resetOne(def.action)}>
                            <RotateCcw size={13} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Fieldset>
        );
      })}

      <div>
        <Button size="sm" variant="ghost" onClick={resetGame}>
          <RotateCcw size={14} /> {t('kbResetGame')}
        </Button>
      </div>
    </div>
  );
}
