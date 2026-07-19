import * as ws from '../../net/ws.ts';
import { useGame } from '../../state/gameStore.ts';
import type { CardInst, TablePlayer } from '../../net/types.ts';

/**
 * Contract shim, found against the live server: `token.create` / `token.clone`
 * rebroadcast the freshly minted token under `action.card`, while the game
 * store's event reducer looks for `action.token` - and v1 actions carry no
 * follow-up room.state snapshot. Without help, tokens stay invisible until the
 * next snapshot. This listener runs after the store's own (listener order is
 * insertion order) and inserts the token if the reducer did not, deduped by
 * iid so a future server or store fix cannot double-place it.
 */

let installed = false;

export function installTableShims(): void {
  if (installed) return;
  installed = true;

  ws.onMessage((message) => {
    if (message.type !== 'room.event') return;
    const action = message.action as {
      kind?: string;
      card?: CardInst;
      token?: CardInst;
      x?: number;
      y?: number;
    };
    if (action.kind !== 'token.create' && action.kind !== 'token.clone') return;
    const token = action.card ?? action.token;
    if (!token || !token.iid) return;

    const { room } = useGame.getState();
    if (!room) return;
    const players = room.players.map((player): TablePlayer => {
      if (player.userId !== message.actor) return player;
      if (player.battlefield.some((card) => card.iid === token.iid)) return player;
      const placed: CardInst = {
        ...token,
        x: token.x ?? action.x ?? 0.5,
        y: token.y ?? action.y ?? 0.55,
      };
      return { ...player, battlefield: [...player.battlefield, placed] };
    });
    useGame.setState({ room: { ...room, players } });
  });
}
