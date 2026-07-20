import { useEffect, useRef, useState } from 'react';
import type { GigDie } from '../../net/types.ts';
import './cyberpunk-dice-roll.css';

/**
 * The 3D Fixer-die roll, played on the mat. When a player's die rolls into the
 * Gig area (server-decided value), it tumbles as a 3D cube here and settles
 * showing that exact number — the animation is *weighted* to the result because
 * the front face (the one facing the camera at rest) is always the rolled value.
 *
 * Driven off the synced `gigDice`: a die that flips inGig false→true (or changes
 * value while inGig) is a fresh roll. Watching state means every viewer of this
 * mat sees the roll, not just the roller. Pointer-transparent, self-cleaning.
 */

interface Roll {
  id: number;
  sides: number;
  value: number;
  /** The six cube-face numbers; the front face is the real result. */
  faces: number[];
}

const HOLD_MS = 1700; // total life of a rolled die before it fades out

/** Deterministic filler numbers for the non-result faces (flavour during the
 *  tumble); the result always sits on the front face. */
function cubeFaces(value: number, sides: number): number[] {
  const faces = [value];
  let seed = value * 31 + sides;
  for (let i = 0; i < 5; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    faces.push((seed % sides) + 1);
  }
  return faces;
}

export function CyberpunkDiceRoll({ dice, playerId }: { dice: GigDie[] | undefined; playerId: string }) {
  const [rolls, setRolls] = useState<Roll[]>([]);
  // Previous inGig/value per die-sides, plus which player it was for — so a
  // stage-switch (viewing another board) re-baselines instead of firing a burst.
  const prev = useRef<{ owner: string; map: Map<number, { inGig: boolean; value: number }> } | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    const list = dice ?? [];
    const map = new Map(list.map((d) => [d.sides, { inGig: d.inGig, value: d.value }]));

    // First sight of this player's dice: baseline only, don't animate.
    if (!prev.current || prev.current.owner !== playerId) {
      prev.current = { owner: playerId, map };
      return;
    }

    const fresh: Roll[] = [];
    for (const die of list) {
      const before = prev.current.map.get(die.sides);
      const rolled = die.inGig && (!before || !before.inGig || before.value !== die.value);
      if (rolled) {
        fresh.push({ id: nextId.current++, sides: die.sides, value: die.value, faces: cubeFaces(die.value, die.sides) });
      }
    }
    prev.current = { owner: playerId, map };

    if (fresh.length === 0) return;
    setRolls((current) => [...current, ...fresh]);
    const ids = new Set(fresh.map((r) => r.id));
    const timer = window.setTimeout(() => {
      setRolls((current) => current.filter((r) => !ids.has(r.id)));
    }, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [dice, playerId]);

  if (rolls.length === 0) return null;

  return (
    <div className="cpDiceRoll" aria-hidden>
      {rolls.map((roll, index) => (
        <div
          key={roll.id}
          className="cpDie"
          style={{ ['--i' as string]: index - (rolls.length - 1) / 2 }}
        >
          <div className="cpDieCube">
            <span className="cpDieFace cpDieFront">{roll.faces[0]}</span>
            <span className="cpDieFace cpDieBack">{roll.faces[1]}</span>
            <span className="cpDieFace cpDieRight">{roll.faces[2]}</span>
            <span className="cpDieFace cpDieLeft">{roll.faces[3]}</span>
            <span className="cpDieFace cpDieTop">{roll.faces[4]}</span>
            <span className="cpDieFace cpDieBottom">{roll.faces[5]}</span>
          </div>
          <span className="cpDieKind">d{roll.sides}</span>
        </div>
      ))}
    </div>
  );
}
