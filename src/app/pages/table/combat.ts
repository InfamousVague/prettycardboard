import type { RoomState } from '../../net/types.ts';

/**
 * Combat is a lightweight, unenforced overlay: the attacker declares which
 * creatures attack (and optionally at whom), defenders declare blocks, and
 * everyone adjusts life/creatures by hand. These helpers just read that overlay
 * so the board can highlight who is under attack.
 */

/** Every seat a combat is aimed at (explicit seat, or everyone else on an open swing). */
export function targetedSeats(room: RoomState): number[] {
  const combat = room.combat;
  if (!combat) return [];
  const seats = new Set<number>();
  for (const entry of combat.attackers) {
    if (entry.defenderSeat != null) {
      seats.add(entry.defenderSeat);
    } else {
      for (const player of room.players) {
        if (player.seat !== room.activeSeat && !player.conceded) seats.add(player.seat);
      }
    }
  }
  // 2-player tables treat the lone opponent as targeted even without a seat.
  if (seats.size === 0 && combat.attackers.length > 0 && room.players.length === 2) {
    for (const player of room.players) {
      if (player.seat !== room.activeSeat) seats.add(player.seat);
    }
  }
  return [...seats];
}

export function seatTargeted(room: RoomState, seat: number): boolean {
  return targetedSeats(room).includes(seat);
}
