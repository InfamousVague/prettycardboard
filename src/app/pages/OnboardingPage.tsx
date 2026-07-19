import { useState, type FormEvent } from 'react';
import { Button, Heading, Input, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { motion } from 'motion/react';
import { Ticket } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import { ApiError } from '../net/api.ts';
import { PRECONS, cardImage, preconCommander } from '../data/cards.ts';
import { GameCard } from '../components/GameCard.tsx';

const NAME_RE = /^[A-Za-z0-9_]{3,24}$/;

type Mode = 'signup' | 'login';

/**
 * The auth gate: sign up or log back in over a fanned arc of the four Final
 * Fantasy commanders. Accounts are username + password; the session token is
 * stored locally, and registering seeds the FF precons.
 */
export function OnboardingPage({ desktop }: { desktop: boolean }) {
  const t = useT();
  const register = useApp((state) => state.register);
  const login = useApp((state) => state.login);
  const pendingJoin = useUi((state) => state.pendingJoin);
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commanders = PRECONS.map((deck) => preconCommander(deck));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'signup' && !NAME_RE.test(name)) {
      setError(t('obInvalid'));
      return;
    }
    if (password.length < 6) {
      setError(t('obPasswordShort'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') await register(name, password);
      else await login(name, password);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setError(t('obTaken'));
      else if (cause instanceof ApiError && cause.status === 401) setError(t('obBadCredentials'));
      else if (cause instanceof ApiError && cause.status === 400) setError(t('obPasswordShort'));
      else setError(t('obOffline'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboarding" data-tauri-drag-region={desktop ? '' : undefined}>
      <div className="onboardingGlow" aria-hidden />
      <div className="onboardingFan" aria-hidden>
        {commanders.map((commander, index) => {
          const spread = index - (commanders.length - 1) / 2; // -1.5..1.5
          return (
            <motion.div
              key={commander.id}
              className="onboardingFanCard"
              initial={{ y: 120, opacity: 0, rotate: 0 }}
              animate={{ y: Math.abs(spread) * 26, opacity: 1, rotate: spread * 9 }}
              transition={{ type: 'spring', stiffness: 120, damping: 16, delay: 0.15 + index * 0.09 }}
            >
              <GameCard name={commander.name} imageUrl={cardImage(commander.id)} width={210} foil glow tilt={12} />
            </motion.div>
          );
        })}
      </div>

      <motion.form
        className="onboardingPanel"
        onSubmit={submit}
        initial={{ y: 26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.5 }}
      >
        <img
          className="onboardingLogo"
          src={`${import.meta.env.BASE_URL}brand/logo.png`}
          alt="PrettyCardboard"
          draggable={false}
        />
        {pendingJoin && (
          <div className="onboardingInvite" role="status">
            <Ticket size={16} aria-hidden />
            <Text as="span" size={Size.Small}>
              {t('joinAuthPrompt')}
            </Text>
          </div>
        )}
        <div className="onboardingMode" data-no-drag>
          <SegmentedControl
            fullWidth
            value={mode}
            onValueChange={(value) => {
              setMode(value as Mode);
              setError(null);
            }}
            options={[
              { value: 'signup', label: t('obSignUp') },
              { value: 'login', label: t('obLogIn') },
            ]}
            aria-label={t('obSignUp')}
          />
        </div>
        <Text size={Size.Small} tone={TextTone.Muted} align="center">
          {mode === 'signup' ? t('obLede') : t('obLoginLede')}
        </Text>
        <div className="onboardingFields" data-no-drag>
          <Input
            size="lg"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('obPlaceholder')}
            autoFocus
            autoComplete="username"
            aria-label={t('obPlaceholder')}
          />
          <Input
            size="lg"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t('obPassword')}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            aria-label={t('obPassword')}
          />
          <Button size="lg" type="submit" loading={busy} disabled={!name || !password}>
            {mode === 'signup' ? t('obButton') : t('obLogIn')}
          </Button>
        </div>
        {error && (
          <Text size={Size.Small} tone={TextTone.Danger} align="center">
            {error}
          </Text>
        )}
      </motion.form>
    </div>
  );
}
