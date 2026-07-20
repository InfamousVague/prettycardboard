import { useEffect, useRef, useState } from 'react';
import type DiceBoxType from '@3d-dice/dice-box-threejs';
import type { GigDie } from '../../net/types.ts';
import { CyberpunkDiceRoll } from './CyberpunkDiceRoll.tsx';
import './dice3d/dice-roll-3d.css';

/**
 * The Fixer-die roll over the mat, powered by @3d-dice/dice-box-threejs — real
 * Cannon-es physics so a d20 is a proper icosahedron that tumbles, bounces and
 * settles flat on a face (never balanced on an edge). The result is the
 * server-chosen value, forced via the library's predetermined `@` notation
 * (`1d20@17`), so the physics is honest theatre over a decided outcome. three.js
 * (the library's own copy) is lazy-loaded on the first roll, so Magic never pays
 * for it; if it fails to load / init, we fall back to the lightweight CSS cube.
 *
 * Rolls are read off the synced `gigDice`: a die that flips inGig false→true (or
 * changes value while inGig) is a fresh roll, so every viewer of this mat sees
 * it. Pointer-transparent, self-cleaning.
 */

interface Roll {
  sides: number;
  value: number;
}

export function DiceRoll3D({
  dice,
  lastRoll,
  playerId,
}: {
  dice: GigDie[] | undefined;
  /** A generic single-die roll (Magic / any game) — animates on seq change. */
  lastRoll?: { seq: number; sides: number; value: number };
  playerId: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<DiceBoxType | null>(null);
  const queue = useRef<Roll[]>([]);
  const loading = useRef(false);
  const clearTimer = useRef<number | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  // A stable, unique container id for the library's selector-based constructor.
  const containerId = useRef(`pc-dicebox-${Math.random().toString(36).slice(2)}`);

  // Roll detection — a die newly in the Gig area (or re-rolled) is a fresh roll;
  // a stage-switch (viewing another board) rebaselines instead of firing.
  const prev = useRef<{ owner: string; map: Map<number, { inGig: boolean; value: number }> } | null>(null);

  useEffect(() => {
    if (failed) return;
    const list = dice ?? [];
    const map = new Map(list.map((d) => [d.sides, { inGig: d.inGig, value: d.value }]));
    if (!prev.current || prev.current.owner !== playerId) {
      prev.current = { owner: playerId, map };
      return;
    }
    const fresh: Roll[] = [];
    for (const die of list) {
      const before = prev.current.map.get(die.sides);
      if (die.inGig && (!before || !before.inGig || before.value !== die.value)) {
        fresh.push({ sides: die.sides, value: die.value });
      }
    }
    prev.current = { owner: playerId, map };
    if (fresh.length === 0) return;
    queue.current.push(...fresh);
    void ensureBoxAndFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice, playerId, failed]);

  // Generic single-die rolls (Magic sidebar, or any game): a bumped seq is a
  // fresh roll. A stage-switch rebaselines instead of firing.
  const prevSeq = useRef<{ owner: string; seq: number } | null>(null);
  useEffect(() => {
    if (failed || !lastRoll) return;
    if (!prevSeq.current || prevSeq.current.owner !== playerId) {
      prevSeq.current = { owner: playerId, seq: lastRoll.seq };
      return;
    }
    if (lastRoll.seq === prevSeq.current.seq) return;
    prevSeq.current = { owner: playerId, seq: lastRoll.seq };
    queue.current.push({ sides: lastRoll.sides, value: lastRoll.value });
    void ensureBoxAndFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRoll?.seq, playerId, failed]);

  const flush = () => {
    const box = boxRef.current;
    if (!box) return;
    const batch = queue.current;
    queue.current = [];
    if (batch.length === 0) return;
    // Predetermined notation: `1d20@17` forces the physics to settle on 17.
    // Several at once combine with `+` (rare — usually one Fixer die at a time).
    const notation = batch.map((r) => `1d${r.sides}@${r.value}`).join('+');
    box.roll(notation).catch(() => {});
    // Let the result sit, then clear so the next roll starts clean.
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => boxRef.current?.clearDice(), 2600);
  };

  const ensureBoxAndFlush = async () => {
    if (boxRef.current) {
      flush();
      return;
    }
    if (loading.current || failed) return;
    if (!wrapRef.current) return;
    loading.current = true;
    try {
      const { default: DiceBox } = await import('@3d-dice/dice-box-threejs');
      const accent = resolveAccent();
      const box = new DiceBox(`#${containerId.current}`, {
        sounds: false,
        shadows: true,
        theme_surface: 'green-felt',
        theme_material: 'plastic',
        theme_texture: '',
        theme_customColorset: {
          background: accent,
          foreground: inkFor(accent),
          texture: 'none',
          material: 'plastic',
        },
        gravity_multiplier: 500,
        baseScale: 90,
        strength: 1.6,
      });
      await box.initialize();
      boxRef.current = box;
      flush();
    } catch {
      // No WebGL / library failed — drop to the CSS cube.
      setFailed(true);
    } finally {
      loading.current = false;
    }
  };

  useEffect(
    () => () => {
      window.clearTimeout(clearTimer.current);
      try {
        boxRef.current?.clearDice();
      } catch {
        /* ignore teardown races */
      }
      boxRef.current = null;
    },
    [],
  );

  if (failed) return <CyberpunkDiceRoll dice={dice} playerId={playerId} />;

  return <div className="diceRoll3d" id={containerId.current} ref={wrapRef} aria-hidden />;
}

/** Resolve `--glacier-accent` (the Cyberpunk yellow while in a match) to a hex
 *  string the library reads for the die colour. */
function resolveAccent(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--glacier-accent-solid').trim();
  const hex = toHex(raw);
  return hex ?? '#f4d03f';
}

/** Dark ink on a light die, light ink on a dark die. */
function inkFor(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#141018';
  const r = parseInt(m[1]!, 16) / 255;
  const g = parseInt(m[2]!, 16) / 255;
  const b = parseInt(m[3]!, 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? '#141018' : '#f4f4f6';
}

/** Normalise any CSS colour (hex/rgb/oklch) to #rrggbb via the browser. */
function toHex(raw: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (!raw) return null;
  const probe = document.createElement('span');
  probe.style.color = raw;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return null;
  const h = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${h(m[1]!)}${h(m[2]!)}${h(m[3]!)}`;
}
