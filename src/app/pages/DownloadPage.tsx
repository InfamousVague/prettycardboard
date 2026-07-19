import { Heading, Pill, Size, Text, TextTone } from '@glacier/react';
import { Apple, Monitor, RefreshCw, Terminal, Wifi } from '@glacier/icons';
import { motion } from 'motion/react';
import { useT } from '../i18n.ts';
import { DownloadButton } from '../components/DownloadButton.tsx';
import './download.css';

/**
 * The public download page: pitch the desktop app, offer the platform picker
 * (the same SplitButton dropdown), and list what installing gets you. Linked
 * from the web banner and the Settings → About tab.
 */
export function DownloadPage() {
  const t = useT();
  const perks = [
    { icon: <RefreshCw size={18} />, title: t('dlPerkUpdatesTitle'), body: t('dlPerkUpdatesBody') },
    { icon: <Wifi size={18} />, title: t('dlPerkSyncTitle'), body: t('dlPerkSyncBody') },
    { icon: <Monitor size={18} />, title: t('dlPerkNativeTitle'), body: t('dlPerkNativeBody') },
  ];
  const platforms = [
    { icon: <Apple size={22} />, name: t('dlMac') },
    { icon: <Monitor size={22} />, name: t('dlWindows') },
    { icon: <Terminal size={22} />, name: t('dlLinux') },
  ];

  return (
    <div className="page downloadPage">
      <motion.header
        className="dlHero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 150, damping: 20 }}
      >
        <Pill size="sm" tone="accent">{t('dlHeroTag')}</Pill>
        <Heading level={1}>{t('dlHeroTitle')}</Heading>
        <Text size={Size.Large} tone={TextTone.Muted} className="lede">
          {t('dlHeroLede')}
        </Text>
        <div className="dlHeroAction">
          <DownloadButton size="lg" />
        </div>
        <div className="dlPlatforms">
          {platforms.map((p) => (
            <span key={p.name} className="dlPlatform">
              {p.icon}
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted}>
                {p.name}
              </Text>
            </span>
          ))}
        </div>
      </motion.header>

      <section className="dlPerks">
        {perks.map((perk, index) => (
          <motion.div
            key={perk.title}
            className="dlPerk"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 150, damping: 20, delay: 0.05 + index * 0.06 }}
          >
            <span className="dlPerkIcon" aria-hidden>
              {perk.icon}
            </span>
            <Heading level={3} noMargin>
              {perk.title}
            </Heading>
            <Text size={Size.Small} tone={TextTone.Muted}>
              {perk.body}
            </Text>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
