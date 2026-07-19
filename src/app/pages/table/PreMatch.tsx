import { motion } from 'motion/react';
import { Avatar, Button, Text, Size, TextTone } from '@glacier/react';
import { Crown, Swords } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import type { RoomState, TablePlayer } from '../../net/types.ts';

/**
 * The matchup splash. Shown the moment opening hands are dealt; the mulligan
 * overlay (whose card fan IS the deal animation) is held back until this is
 * dismissed, so the reveal reads: who you are facing, then your seven.
 */

function commanderOf(player: TablePlayer) {
  return player.command.find((card) => card.isCommander) ?? player.command[0];
}

export function PreMatch({ room, onClose }: { room: RoomState; onClose: () => void }) {
  const t = useT();
  const players = [...room.players].sort((a, b) => a.seat - b.seat);
  const first = room.startingSeat ?? room.activeSeat;

  return (
    <motion.div
      className="preOverlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('preTitle')}
    >
      <motion.div
        className="prePanel"
        initial={{ y: 24, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <div className="preHead">
          <span className="preMark" aria-hidden>
            <Swords size={22} />
          </span>
          <Text as="p" size={Size.Large} weight="bold" className="preTitle">
            {t('preTitle')}
          </Text>
          <Text as="p" size={Size.Small} tone={TextTone.Muted}>
            {room.name}
          </Text>
        </div>

        <div className="preGrid" data-count={players.length}>
          {players.map((player, index) => {
            const commander = commanderOf(player);
            const goesFirst = player.seat === first;
            return (
              <motion.div
                key={player.userId}
                className="prePlayer"
                data-first={goesFirst || undefined}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + index * 0.09, type: 'spring', stiffness: 300, damping: 24 }}
              >
                {commander ? (
                  <GameCard
                    name={commander.name}
                    imageUrl={commander.imageUrl || cardImage(commander.scryfallId)}
                    width={120}
                    foil
                    tilt={0}
                  />
                ) : (
                  <div className="preNoCommander">
                    <Avatar name={player.username} size="lg" />
                  </div>
                )}
                <span className="preName">{player.username}</span>
                {player.deckName && <span className="preDeck">{player.deckName}</span>}
                {goesFirst && (
                  <span className="preFirst">
                    <Crown size={11} /> {t('preFirst')}
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="preFooter">
          <Button onClick={onClose}>{t('preDeal')}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
