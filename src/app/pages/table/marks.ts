import type { MarkKind } from './bits.tsx';
import type { MessageKey } from '../../i18n.ts';

/** What each table marker is called, in one place: the board menu, the seat
 *  picker and the tooltips all read the same label for the same puck. */
export const MARK_LABEL: Record<MarkKind, MessageKey> = {
  skull: 'mkSkull',
  sword: 'mkSword',
  shield: 'mkShield',
  star: 'mkStar',
  eye: 'mkEye',
  flame: 'mkFlame',
  ban: 'mkBan',
  question: 'mkQuestion',
};
