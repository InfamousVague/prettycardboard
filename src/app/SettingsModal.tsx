import { useEffect, useState } from 'react';
import {
  Button,
  DensitySelector,
  Fieldset,
  Label,
  Pill,
  ProgressBar,
  Row,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  TabbedModal,
  Text,
  Size,
  TextTone,
  useToast,
  type TabbedModalSection,
} from '@glacier/react';
import {
  CircleUserRound,
  Download,
  ExternalLink,
  Globe,
  Info,
  LayoutGrid,
  LogOut,
  Palette,
  RefreshCw,
} from '@glacier/icons';
import { accentSteps } from '@glacier/tokens';
import { ACCENTS, DEFAULT_PREFERENCES, MONO_FONTS, SANS_FONTS, type Preferences } from './preferences.ts';
import { LANGUAGES, useT, type AppLocale } from './i18n.ts';
import { canSelfUpdate, checkForUpdate, currentVersion, installUpdate, type PendingUpdate } from './updater.ts';
import { isTauri } from './tauri.ts';
import { useApp } from './state/appStore.ts';

/** The public marketing name, brand-fixed across locales. */
const APP_NAME = 'PrettyCardboard';
const DOWNLOAD_URL = 'https://prettycardboard.com/download';
const SITE_URL = 'https://prettycardboard.com';

function resolveTheme(theme: Preferences['theme']): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

/** Open a URL in the user's browser — via the Tauri opener when desktop, else a new tab. */
async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { openUrl } = await import(/* @vite-ignore */ '@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch {
      // fall through to the web path
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * The app preferences, in a tabbed modal. Every control writes straight to the
 * persisted preferences and re-themes the app live through Glacier tokens, so
 * there is nothing to save: Reset restores the defaults, Done closes. Labels
 * are translated, and the language control drives the app-wide locale. The
 * playmat and card back live in the Customize modal, reachable from the Table
 * tab, so they are deliberately not duplicated here.
 */
export function SettingsModal({
  open,
  onClose,
  preferences,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const swatchTheme = resolveTheme(preferences.theme);
  // Fall back to the defaults for the numeric sliders, so a preferences object
  // that is missing a field (an older persisted version, or Fast Refresh state
  // that predates the field) renders instead of crashing on `undefined.toFixed`.
  const radiusScale = preferences.radiusScale ?? DEFAULT_PREFERENCES.radiusScale;
  const frostedness = preferences.frostedness ?? DEFAULT_PREFERENCES.frostedness;

  const general = (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-6)' }}>
      <div className="split">
        <div className="control">
          <Label>{t('setLanguage')}</Label>
          <Select
            aria-label={t('setLanguage')}
            value={preferences.locale}
            onValueChange={(value) => onChange({ locale: value as AppLocale })}
            options={LANGUAGES.map((lang) => ({ value: lang.code, label: lang.label }))}
          />
        </div>
      </div>
      <Fieldset legend={t('setReduceMotion')} description={t('setReduceMotionHint')}>
        <Switch
          label={t('setReduceMotion')}
          checked={preferences.reduceMotion}
          onCheckedChange={(checked) => onChange({ reduceMotion: checked })}
        />
      </Fieldset>
    </div>
  );

  const appearance = (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-6)' }}>
      <div className="split">
        <div className="control">
          <Label>{t('setTheme')}</Label>
          <SegmentedControl
            aria-label={t('setTheme')}
            fullWidth
            value={preferences.theme}
            onValueChange={(value) => onChange({ theme: value as Preferences['theme'] })}
            options={[
              { value: 'system', label: t('setSystem') },
              { value: 'light', label: t('setLight') },
              { value: 'dark', label: t('setDark') },
            ]}
          />
        </div>
        <div className="control">
          <Label>{t('setDensity')}</Label>
          <DensitySelector
            aria-label={t('setDensity')}
            value={preferences.density}
            onValueChange={(density) => onChange({ density })}
          />
        </div>
      </div>

      <div className="control">
        <Label>{t('setAccent')}</Label>
        <div className="accentSwatches" role="radiogroup" aria-label={t('setAccent')}>
          {ACCENTS.map((option) => (
            <button
              key={option.name}
              type="button"
              role="radio"
              aria-checked={preferences.accent === option.name}
              aria-label={option.label}
              className="accentSwatch"
              data-selected={preferences.accent === option.name || undefined}
              style={{ background: accentSteps(option, swatchTheme)[8] }}
              onClick={() => onChange({ accent: option.name })}
            />
          ))}
        </div>
      </div>

      <div className="split">
        <div className="control">
          <Label>{t('setTypeface')}</Label>
          <SegmentedControl
            aria-label={t('setTypeface')}
            value={preferences.font}
            onValueChange={(value) => onChange({ font: value as Preferences['font'] })}
            options={SANS_FONTS}
          />
        </div>
        <div className="control">
          <Label>{t('setMonospace')}</Label>
          <SegmentedControl
            aria-label={t('setMonospace')}
            value={preferences.mono}
            onValueChange={(value) => onChange({ mono: value as Preferences['mono'] })}
            options={MONO_FONTS}
          />
        </div>
      </div>

      <div className="split">
        <div className="control" style={{ width: '100%' }}>
          <Label>{t('setRounding')}</Label>
          <Row gap={3} align="center" style={{ width: '100%' }}>
            <div style={{ flex: 1 }}>
              <Slider
                aria-label={t('setRounding')}
                min={0}
                max={2}
                step={0.05}
                value={radiusScale}
                onValueChange={(next) => onChange({ radiusScale: next })}
              />
            </div>
            <Text as="span" size={Size.Small} tone={TextTone.Muted} mono>
              {radiusScale.toFixed(2)}×
            </Text>
          </Row>
        </div>
        <div className="control" style={{ width: '100%' }}>
          <Label>{t('setFrost')}</Label>
          <Row gap={3} align="center" style={{ width: '100%' }}>
            <div style={{ flex: 1 }}>
              <Slider
                aria-label={t('setFrost')}
                min={0}
                max={2}
                step={0.05}
                value={frostedness}
                onValueChange={(next) => onChange({ frostedness: next })}
              />
            </div>
            <Text as="span" size={Size.Small} tone={TextTone.Muted} mono>
              {frostedness.toFixed(2)}×
            </Text>
          </Row>
        </div>
      </div>
    </div>
  );

  const table = (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-6)' }}>
      <div className="control">
        <Label>{t('setSidebar')}</Label>
        <SegmentedControl
          aria-label={t('setSidebar')}
          fullWidth
          value={preferences.layout}
          onValueChange={(value) => onChange({ layout: value as Preferences['layout'] })}
          options={[
            { value: 'floating', label: t('setFloating') },
            { value: 'full', label: t('setFullHeight') },
          ]}
        />
      </div>

      <Fieldset legend={t('setHaptics')} description={t('setHapticsHint')}>
        <Switch
          label={t('setHaptics')}
          checked={preferences.haptics}
          onCheckedChange={(checked) => onChange({ haptics: checked })}
        />
      </Fieldset>

      <Fieldset legend={t('setVisualFeedback')} description={t('setVisualFeedbackHint')}>
        <Switch
          label={t('setVisualFeedback')}
          checked={preferences.visualFeedback}
          onCheckedChange={(checked) => onChange({ visualFeedback: checked })}
        />
        {preferences.visualFeedback && (
          <div className="split" style={{ marginBlockStart: 'var(--glacier-space-3)' }}>
            <div className="control">
              <Label>{t('setEffect')}</Label>
              <SegmentedControl
                aria-label={t('setEffect')}
                value={preferences.visualFeedbackVariant}
                onValueChange={(value) =>
                  onChange({ visualFeedbackVariant: value as Preferences['visualFeedbackVariant'] })
                }
                options={[
                  { value: 'shockwave', label: 'Shockwave' },
                  { value: 'pulse', label: 'Pulse' },
                  { value: 'glow', label: 'Glow' },
                  { value: 'nudge', label: 'Nudge' },
                ]}
              />
            </div>
            <div className="control">
              <Label>{t('setIntensity')}</Label>
              <SegmentedControl
                size={Size.Small}
                aria-label={t('setIntensity')}
                value={preferences.visualFeedbackIntensity}
                onValueChange={(value) =>
                  onChange({ visualFeedbackIntensity: value as Preferences['visualFeedbackIntensity'] })
                }
                options={[
                  { value: 'subtle', label: 'Subtle' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'strong', label: 'Strong' },
                ]}
              />
            </div>
          </div>
        )}
      </Fieldset>

      <Row justify="between" align="center" gap={3} wrap>
        <Text as="span" size={Size.Small} tone={TextTone.Muted}>
          {t('setCustomizeNote')}
        </Text>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.dispatchEvent(new Event('pc:open-customize'))}
        >
          <Palette size={16} />
          {t('setOpenCustomize')}
        </Button>
      </Row>
    </div>
  );

  const sections: TabbedModalSection[] = [
    { id: 'general', label: t('setGeneral'), icon: <Globe size={18} />, content: general },
    { id: 'appearance', label: t('setAppearance'), icon: <Palette size={18} />, content: appearance },
    { id: 'table', label: t('setTableTab'), icon: <LayoutGrid size={18} />, content: table },
    {
      id: 'account',
      label: t('setAccount'),
      icon: <CircleUserRound size={18} />,
      content: <AccountTab onClose={onClose} />,
    },
    { id: 'about', label: t('setAbout'), icon: <Info size={18} />, content: <AboutTab /> },
  ];

  return (
    <TabbedModal
      open={open}
      onClose={onClose}
      title={t('setTitle')}
      defaultValue="general"
      sections={sections}
      footer={
        <Row justify="between" align="center">
          <Button
            variant="outline"
            onClick={() => {
              onChange(DEFAULT_PREFERENCES);
              toast({ tone: 'neutral', message: t('setResetToast') });
            }}
          >
            {t('setReset')}
          </Button>
          <Button onClick={onClose}>{t('setDone')}</Button>
        </Row>
      }
    />
  );
}

/** Account tab: the signed-in name and a sign-out that also closes the modal. */
function AccountTab({ onClose }: { onClose: () => void }) {
  const t = useT();
  const identity = useApp((state) => state.identity);
  const signOut = useApp((state) => state.signOut);

  return (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-5)' }}>
      <Row align="center" gap={3}>
        <CircleUserRound size={40} aria-hidden />
        <div style={{ display: 'grid', gap: 'var(--glacier-space-1)' }}>
          <Text as="span" weight="medium">
            {identity?.username ?? '—'}
          </Text>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {t('pfTempId')}
          </Text>
        </div>
      </Row>
      <div>
        <Button
          variant="danger"
          onClick={() => {
            signOut();
            onClose();
          }}
        >
          <LogOut size={16} />
          {t('pfSignOut')}
        </Button>
      </div>
    </div>
  );
}

type UpdateState = 'idle' | 'checking' | 'uptodate' | 'available' | 'installing' | 'error';

/** About & Updates: version, self-update flow (desktop only), and links. */
function AboutTab() {
  const t = useT();
  const [version, setVersion] = useState<string | null>(null);
  const [state, setState] = useState<UpdateState>('idle');
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let alive = true;
    void currentVersion().then((v) => {
      if (alive) setVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const runCheck = async () => {
    setState('checking');
    try {
      const update = await checkForUpdate();
      if (update) {
        setPending(update);
        setState('available');
      } else {
        setState('uptodate');
      }
    } catch {
      setState('error');
    }
  };

  const runInstall = async () => {
    if (!pending) return;
    setState('installing');
    setProgress(0);
    try {
      await installUpdate(pending, setProgress);
      // On success the app relaunches; nothing more to do here.
    } catch {
      setState('error');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-5)' }}>
      <Row justify="between" align="center" gap={3} wrap>
        <div style={{ display: 'grid', gap: 'var(--glacier-space-1)' }}>
          <Text as="span" weight="medium">
            {APP_NAME}
          </Text>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {t('setCredits')}
          </Text>
        </div>
        <Pill tone="neutral" size="md">
          {t('setVersion')} {version ?? '…'}
        </Pill>
      </Row>

      {canSelfUpdate ? (
        <div style={{ display: 'grid', gap: 'var(--glacier-space-3)' }}>
          <Row align="center" gap={3} wrap>
            <Button
              variant="outline"
              loading={state === 'checking'}
              disabled={state === 'installing'}
              onClick={runCheck}
            >
              <RefreshCw size={16} />
              {state === 'checking' ? t('setChecking') : t('setCheckUpdates')}
            </Button>
            {state === 'uptodate' && (
              <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                {t('setUpToDate')}
              </Text>
            )}
            {state === 'error' && (
              <Text as="span" size={Size.Small} tone={TextTone.Danger}>
                {t('setUpdateFailed')}
              </Text>
            )}
          </Row>

          {(state === 'available' || state === 'installing') && pending && (
            <div
              style={{
                display: 'grid',
                gap: 'var(--glacier-space-3)',
                padding: 'var(--glacier-space-4)',
                borderRadius: 'var(--glacier-radius-md)',
                border: 'var(--glacier-hairline) solid var(--glacier-border)',
                background: 'var(--glacier-surface-raised)',
              }}
            >
              <Row justify="between" align="center" gap={3} wrap>
                <Text as="span" weight="medium">
                  {t('setUpdateAvailable')}
                </Text>
                <Pill tone="accent" size="sm">
                  {pending.version}
                </Pill>
              </Row>
              {pending.notes && (
                <Text as="p" size={Size.Small} tone={TextTone.Muted}>
                  {pending.notes}
                </Text>
              )}
              {state === 'installing' ? (
                <div style={{ display: 'grid', gap: 'var(--glacier-space-2)' }}>
                  <ProgressBar value={progress} max={100} aria-label={t('setUpdating')} />
                  <Text as="span" size={Size.Small} tone={TextTone.Muted} mono>
                    {t('setUpdating')} {progress}%
                  </Text>
                </div>
              ) : (
                <div>
                  <Button onClick={runInstall}>
                    <Download size={16} />
                    {t('setUpdateInstall')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--glacier-space-3)' }}>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {t('setDesktopAutoUpdates')}
          </Text>
          <div>
            <Button variant="outline" onClick={() => void openExternal(DOWNLOAD_URL)}>
              <Download size={16} />
              {t('setDownloadDesktop')}
            </Button>
          </div>
        </div>
      )}

      <Row align="center" gap={2}>
        <Button variant="ghost" size="sm" onClick={() => void openExternal(SITE_URL)}>
          <ExternalLink size={16} />
          prettycardboard.com
        </Button>
      </Row>
    </div>
  );
}
