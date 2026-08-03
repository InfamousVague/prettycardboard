import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  DensitySelector,
  Fieldset,
  Label,
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
import { Bot, ChevronLeft, CircleUserRound, Globe, Info, Keyboard, LayoutGrid, Paintbrush, Palette, Wrench } from '@glacier/icons';
import { useMobileLayout } from './hooks/useIsPhone.ts';
import { accentSteps } from '@glacier/tokens';
import { ACCENTS, DEFAULT_PREFERENCES, MONO_FONTS, SANS_FONTS, type Preferences } from './preferences.ts';
import { LANGUAGES, useT, type AppLocale } from './i18n.ts';
import { AccountTab } from './settings/AccountTab.tsx';
import { BotsTab } from './settings/BotsTab.tsx';
import { AboutTab } from './settings/AboutTab.tsx';
import { CustomizeTab } from './settings/CustomizeTab.tsx';
import { KeybindsTab } from './settings/KeybindsTab.tsx';
import { useApp } from './state/appStore.ts';
import { useTableUi } from './pages/table/tableUi.ts';
import type { BoardMode } from './pages/table/boardModes.ts';

function resolveTheme(theme: Preferences['theme']): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
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
  initialSection,
}: {
  open: boolean;
  onClose: () => void;
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  /** Which tab to show when the modal opens (e.g. 'customize' from the rail). */
  initialSection?: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const phone = useMobileLayout();
  // The battlefield arrangement (free / smart / rows / grid). Table-scoped
  // state rather than a Preferences field - it was born on the mat's own
  // toolbar and keeps its per-user persistence (see boardModes.ts) - but it
  // is a once-in-a-while choice, so the picker lives here with the other
  // layout controls instead of spending board pixels.
  const userId = useApp((state) => state.identity?.userId);
  const boardMode = useTableUi((state) => state.boardMode);
  // The active tab is controlled so callers can deep-link (rail Customize, the
  // in-game menu) straight to a section; it resets to the requested tab on each
  // open.
  const [section, setSection] = useState(initialSection ?? 'general');
  // Phones swap the side-by-side rail+pane for a master-detail flow: the
  // section list first, then the picked section fullscreen with a back row.
  // Deep links (rail Customize, in-game menu) land directly on the section.
  const [mobilePane, setMobilePane] = useState<'list' | 'section'>(initialSection ? 'section' : 'list');
  useEffect(() => {
    if (open) {
      setSection(initialSection ?? 'general');
      setMobilePane(initialSection ? 'section' : 'list');
    }
  }, [open, initialSection]);
  const swatchTheme = resolveTheme(preferences.theme);
  // Fall back to the defaults for the numeric sliders, so a preferences object
  // that is missing a field (an older persisted version, or Fast Refresh state
  // that predates the field) renders instead of crashing on `undefined.toFixed`.
  const radiusScale = preferences.radiusScale ?? DEFAULT_PREFERENCES.radiusScale;
  const frostedness = preferences.frostedness ?? DEFAULT_PREFERENCES.frostedness;
  const soundEffects = preferences.soundEffects ?? DEFAULT_PREFERENCES.soundEffects;
  const alertSounds = preferences.alertSounds ?? DEFAULT_PREFERENCES.alertSounds;
  const soundVolume = preferences.soundVolume ?? DEFAULT_PREFERENCES.soundVolume;

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
      <Fieldset
        legend={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
            <Wrench size={15} /> {t('setDeveloper')}
          </span>
        }
        description={t('setEnableWipHint')}
      >
        <Switch
          label={t('setEnableWip')}
          checked={preferences.enableWip}
          onCheckedChange={(checked) => onChange({ enableWip: checked })}
        />
        {preferences.enableWip && (
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
            {t('setBotsUnlocked')}
          </Text>
        )}
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
            fullWidth={phone}
            value={preferences.font}
            onValueChange={(value) => onChange({ font: value as Preferences['font'] })}
            options={SANS_FONTS}
          />
        </div>
        <div className="control">
          <Label>{t('setMonospace')}</Label>
          <SegmentedControl
            aria-label={t('setMonospace')}
            fullWidth={phone}
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
        <Label>{t('setMobileLayout')}</Label>
        <SegmentedControl
          aria-label={t('setMobileLayout')}
          fullWidth
          value={preferences.mobileLayout ?? 'auto'}
          onValueChange={(value) => onChange({ mobileLayout: value as Preferences['mobileLayout'] })}
          options={[
            { value: 'auto', label: t('setMobileAuto') },
            { value: 'on', label: t('setMobileOn') },
            { value: 'off', label: t('setMobileOff') },
          ]}
        />
        <Text size={Size.XSmall} tone={TextTone.Subtle}>
          {t('setMobileLayoutHint')}
        </Text>
      </div>

      {/* The CHROME axis: whether the shell's surfaces detach into rounded
          cards or sit flush against the edges. No longer desktop-only - the
          phone tab bar honours it too, so it is not "the sidebar" any more. */}
      <div className="control">
        <Label>{t('setLayout')}</Label>
        <SegmentedControl
          aria-label={t('setLayout')}
          fullWidth
          value={preferences.layout}
          onValueChange={(value) => onChange({ layout: value as Preferences['layout'] })}
          options={[
            { value: 'floating', label: t('setFloating') },
            { value: 'full', label: t('setFullHeight') },
          ]}
        />
        <Text size={Size.XSmall} tone={TextTone.Subtle}>
          {t('setLayoutHint')}
        </Text>
      </div>

      {/* The OCCLUSION axis, which is a different question: does a panel cover
          the board or take space beside it? 'Auto' follows the layout above,
          so the single control usually reads as one switch; the explicit
          values are the escape hatch. Hidden on phones, where nothing docks.

          Its first two segments reuse setMobileAuto/setFloating rather than
          carrying near-duplicate keys of their own. */}
      {!phone && (
        <div className="control">
          <Label>{t('setPanelDock')}</Label>
          <SegmentedControl
            aria-label={t('setPanelDock')}
            fullWidth
            value={preferences.panelDock ?? DEFAULT_PREFERENCES.panelDock}
            onValueChange={(value) => onChange({ panelDock: value as Preferences['panelDock'] })}
            options={[
              { value: 'auto', label: t('setMobileAuto') },
              { value: 'float', label: t('setFloating') },
              { value: 'dock', label: t('setDockDock') },
            ]}
          />
          <Text size={Size.XSmall} tone={TextTone.Subtle}>
            {t('setPanelDockHint')}
          </Text>
        </div>
      )}

      <div className="control">
        <Label>{t('gpBoardMode')}</Label>
        <SegmentedControl
          aria-label={t('gpBoardMode')}
          fullWidth
          value={boardMode}
          onValueChange={(value) => useTableUi.getState().setBoardMode(value as BoardMode, userId)}
          options={[
            { value: 'free', label: t('gpModeFree') },
            { value: 'assist', label: t('gpModeAssist') },
            { value: 'rows', label: t('gpModeRows') },
            { value: 'grid', label: t('gpModeGrid') },
          ]}
        />
        <Text size={Size.XSmall} tone={TextTone.Subtle}>
          {t('setBoardModeHint')}
        </Text>
      </div>

      <div className="control">
        <Label>{t('setCardPlacement')}</Label>
        <SegmentedControl
          aria-label={t('setCardPlacement')}
          fullWidth
          value={preferences.verticalCards ? 'vertical' : 'natural'}
          onValueChange={(value) => onChange({ verticalCards: value === 'vertical' })}
          options={[
            { value: 'natural', label: t('setCardNatural') },
            { value: 'vertical', label: t('setCardVertical') },
          ]}
        />
      </div>

      <Fieldset legend={t('setCardNames')} description={t('setCardNamesHint')}>
        <Switch
          label={t('setCardNames')}
          checked={preferences.cardNames}
          onCheckedChange={(checked) => onChange({ cardNames: checked })}
        />
      </Fieldset>

      <Fieldset legend={t('setCardTotals')} description={t('setCardTotalsHint')}>
        <Switch
          label={t('setCardTotals')}
          checked={preferences.cardTotals}
          onCheckedChange={(checked) => onChange({ cardTotals: checked })}
        />
      </Fieldset>

      <Fieldset legend={t('setAmbientCards')} description={t('setAmbientCardsHint')}>
        <Switch
          label={t('setAmbientCards')}
          checked={preferences.ambientCards}
          onCheckedChange={(checked) => onChange({ ambientCards: checked })}
        />
      </Fieldset>

      <Fieldset legend={t('setAutoTurn')} description={t('setAutoTurnHint')}>
        <div style={{ display: 'grid', gap: 'var(--glacier-space-3)' }}>
          <Switch
            label={t('setAutoUntap')}
            checked={preferences.autoUntap}
            onCheckedChange={(checked) => onChange({ autoUntap: checked })}
          />
          <Switch
            label={t('setAutoDraw')}
            checked={preferences.autoDraw}
            onCheckedChange={(checked) => onChange({ autoDraw: checked })}
          />
        </div>
      </Fieldset>

      <Fieldset legend={t('setCoach')} description={t('setCoachHint')}>
        <Switch
          label={t('setCoachOn')}
          checked={preferences.rulesCoach}
          onCheckedChange={(checked) => onChange({ rulesCoach: checked })}
        />
      </Fieldset>

      <Fieldset legend={t('setPriority')} description={t('setPriorityHint')}>
        <div style={{ display: 'grid', gap: 'var(--glacier-space-3)' }}>
          <Switch
            label={t('setAutoPass')}
            checked={preferences.autoPass ?? true}
            onCheckedChange={(checked) => onChange({ autoPass: checked })}
          />
          <Switch
            label={t('setStopStack')}
            checked={preferences.alwaysStopStack ?? false}
            onCheckedChange={(checked) => onChange({ alwaysStopStack: checked })}
          />
          <Switch
            label={t('setStopEnd')}
            checked={preferences.alwaysStopEndStep ?? false}
            onCheckedChange={(checked) => onChange({ alwaysStopEndStep: checked })}
          />
          {/* Not enforced-only, unlike its three neighbours: the counter prompt
              runs at freeform tables too. It lives here because this is where a
              player looks for "stop asking me things". */}
          <Switch
            label={t('setAutoCounters')}
            checked={preferences.autoCounters ?? false}
            onCheckedChange={(checked) => onChange({ autoCounters: checked })}
          />
        </div>
      </Fieldset>

      <Fieldset legend={t('setMirror')} description={t('setMirrorHint')}>
        <Switch
          label={t('setMirror')}
          checked={preferences.mirrorOpponent}
          onCheckedChange={(checked) => onChange({ mirrorOpponent: checked })}
        />
      </Fieldset>

      <Fieldset legend={t('setSounds')} description={t('setSoundsHint')}>
        <div style={{ display: 'grid', gap: 'var(--glacier-space-3)' }}>
          <Switch
            label={t('setAlertSounds')}
            checked={alertSounds}
            onCheckedChange={(checked) => onChange({ alertSounds: checked })}
          />
          <Switch
            label={t('setTableSounds')}
            checked={soundEffects}
            onCheckedChange={(checked) => onChange({ soundEffects: checked })}
          />
        </div>
        {(alertSounds || soundEffects) && (
          <Row gap={3} align="center" style={{ width: '100%', marginBlockStart: 'var(--glacier-space-3)' }}>
            <div style={{ flex: 1 }}>
              <Slider
                aria-label={t('setSoundVolume')}
                min={0}
                max={1}
                step={0.05}
                value={soundVolume}
                onValueChange={(next) => onChange({ soundVolume: next })}
              />
            </div>
            <Text as="span" size={Size.Small} tone={TextTone.Muted} mono>
              {Math.round(soundVolume * 100)}%
            </Text>
          </Row>
        )}
      </Fieldset>

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
                fullWidth={phone}
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
                fullWidth={phone}
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
    </div>
  );

  const sections: TabbedModalSection[] = [
    { id: 'general', label: t('setGeneral'), icon: <Globe size={18} />, content: general },
    { id: 'appearance', label: t('setAppearance'), icon: <Palette size={18} />, content: appearance },
    {
      id: 'customize',
      label: t('navCustomize'),
      icon: <Paintbrush size={18} />,
      content: <CustomizeTab preferences={preferences} onChange={onChange} />,
    },
    { id: 'table', label: t('setTableTab'), icon: <LayoutGrid size={18} />, content: table },
    // Developer mode unlocks the bot-match launcher as its own section.
    ...(preferences.enableWip
      ? [{
          id: 'bots',
          label: t('setBots'),
          icon: <Bot size={18} />,
          content: <BotsTab onClose={onClose} />,
        }]
      : []),
    {
      id: 'keybinds',
      label: t('setKeybinds'),
      icon: <Keyboard size={18} />,
      content: <KeybindsTab preferences={preferences} onChange={onChange} />,
    },
    {
      id: 'account',
      label: t('setAccount'),
      icon: <CircleUserRound size={18} />,
      content: <AccountTab onClose={onClose} />,
    },
    { id: 'about', label: t('setAbout'), icon: <Info size={18} />, content: <AboutTab /> },
  ];

  // Phones: keybinds are meaningless without a keyboard, and every section
  // gains a back row returning to the list pane.
  const withBack = (label: ReactNode, content: ReactNode) => (
    <div className="setMobileSection">
      <Button variant="ghost" size="sm" className="setMobileBack" onClick={() => setMobilePane('list')}>
        <ChevronLeft size={16} aria-hidden />
        {label}
      </Button>
      {content}
    </div>
  );
  // The controlled value must name a section the kit actually got: a desktop
  // selection of Keybinds survives a flip to phone, where that tab is gone.
  const shownSections = phone
    ? sections.filter((s) => s.id !== 'keybinds').map((s) => ({ ...s, content: withBack(s.label, s.content) }))
    : sections;
  const shownValue = shownSections.some((s) => s.id === section) ? section : (shownSections[0]?.id ?? 'general');

  return (
    <TabbedModal
      className={`pcMobileFull pcSettings ${phone ? (mobilePane === 'list' ? 'pcPaneList' : 'pcPaneSection') : ''}`}
      open={open}
      onClose={onClose}
      title={t('setTitle')}
      value={shownValue}
      onValueChange={(value) => {
        setSection(value);
        setMobilePane('section');
      }}
      sections={shownSections}
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
