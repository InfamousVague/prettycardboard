import { useEffect, useRef } from 'react';
import { Pill, Text, Size } from '@glacier/react';
import { Bot, Heart } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { cardImage } from '../../data/cards.ts';
import { playmatUrl } from '../../data/playmats.ts';
import { juicePulse } from './juice.ts';
import type { TablePlayer } from '../../net/types.ts';

/**
 * A miniature, read-only battlefield preview for the side rail: every player
 * who is not currently on the main stage gets one. Clicking it stages that
 * board. The inner surface renders at a fixed design size and is scaled down
 * wholesale so card positions match the real board exactly.
 */

const DESIGN_W = 640;
const DESIGN_H = 300;
const SCALE = 0.36;

export function MiniBoard({
  player,
  active,
  onStage,
}: {
  player: TablePlayer;
  active: boolean;
  onStage: () => void;
}) {
  const t = useT();
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const lastLife = useRef(player.life);
  useEffect(() => {
    if (player.life !== lastLife.current) {
      lastLife.current = player.life;
      juicePulse(rootRef.current, 1.1);
    }
  }, [player.life]);
  return (
    <button
      type="button"
      ref={rootRef}
      className="miniBoard"
      data-active={active || undefined}
      onClick={onStage}
      title={t('gpStage')}
    >
      <span className="miniHead">
        <Text as="span" size={Size.XSmall} weight="semibold" className="miniName">
          {player.username}
        </Text>
        {player.isBot && (
          <Pill size="sm" tone="accent" icon={<Bot size={10} />}>
            {t('gpBotChip')}
          </Pill>
        )}
        <span className="miniLife">
          <Heart size={10} /> {player.life}
        </span>
        {player.handCount > 0 && (
          <span className="miniHand" title={`${t('tblHand')}: ${player.handCount}`}>
            {Array.from({ length: Math.min(player.handCount, 6) }).map((_, index) => (
              <span key={index} className="miniHandCard" aria-hidden />
            ))}
            <span className="miniHandTally">{player.handCount}</span>
          </span>
        )}
      </span>
      <span
        className="miniViewport"
        style={{
          height: DESIGN_H * SCALE,
          ...(player.playmat ? { ['--pc-board-mat' as string]: `url("${playmatUrl(player.playmat)}")` } : {}),
        }}
      >
        <span
          className="miniSurface"
          style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${SCALE})` }}
        >
          {player.battlefield.map((card) => (
            <span
              key={card.iid}
              className="miniCard"
              data-tapped={card.tapped || undefined}
              style={{ left: `${card.x * 100}%`, top: `${Math.min(card.y, 0.82) * 100}%` }}
            >
              {card.faceDown ? (
                <span className="miniCardBack" />
              ) : (
                <img src={card.imageUrl || cardImage(card.scryfallId)} alt="" loading="lazy" draggable={false} />
              )}
            </span>
          ))}
          {player.battlefield.length === 0 && <span className="miniEmpty" />}
        </span>
      </span>
    </button>
  );
}
