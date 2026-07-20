import { useEffect, useRef, useState } from 'react';
import type { GigDie } from '../../net/types.ts';
import { CyberpunkDiceRoll } from './CyberpunkDiceRoll.tsx';
import type { DiceScene } from './dice3d/diceScene.ts';
import './dice3d/dice-roll-3d.css';

/**
 * WebGL polyhedral-dice roll over the mat. Replaces the CSS cube with REAL dice
 * — a d20 is a 20-face icosahedron, a d10 a pentagonal trapezohedron, etc. — that
 * tumble and settle showing the server-chosen value (see DiceScene). three.js is
 * loaded lazily on the first roll, so Magic players never download it; if WebGL
 * is unavailable the component falls back to the lightweight CSS cube.
 *
 * Rolls are read off the synced `gigDice`: a die that flips inGig false→true (or
 * changes value while inGig) is a fresh roll, so every viewer of this mat sees
 * it. Pointer-transparent, self-cleaning.
 */

interface Roll {
  sides: number;
  value: number;
}

export function DiceRoll3D({ dice, playerId }: { dice: GigDie[] | undefined; playerId: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<DiceScene | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const queue = useRef<Roll[]>([]);
  const loading = useRef(false);
  const seed = useRef(1);
  const [failed, setFailed] = useState(false);

  // Roll detection — same diff as the CSS roller: a die newly in the Gig area (or
  // re-rolled) is a fresh roll; a stage-switch (viewing another board) rebaselines.
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
    void ensureSceneAndFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice, playerId, failed]);

  const startLoop = () => {
    if (rafRef.current != null) return;
    const loop = () => {
      const scene = sceneRef.current;
      if (!scene) {
        rafRef.current = undefined;
        return;
      }
      const alive = scene.tick(performance.now());
      if (alive > 0) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        rafRef.current = undefined;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const flush = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    const batch = queue.current;
    queue.current = [];
    const now = performance.now();
    batch.forEach((roll, i) => {
      scene.spawn(roll.sides, roll.value, i, batch.length, now, seed.current++);
    });
    if (batch.length > 0) startLoop();
  };

  const ensureSceneAndFlush = async () => {
    if (sceneRef.current) {
      flush();
      return;
    }
    if (loading.current || failed) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    loading.current = true;
    try {
      const { DiceScene } = await import('./dice3d/diceScene.ts');
      const accent = resolveAccent();
      const scene = new DiceScene(canvas, accent);
      scene.resize(wrap.clientWidth || 1, wrap.clientHeight || 1);
      sceneRef.current = scene;
      flush();
    } catch {
      // No WebGL / three failed to load — drop to the CSS cube.
      setFailed(true);
    } finally {
      loading.current = false;
    }
  };

  // Keep the renderer sized to the mat.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || failed) return;
    const ro = new ResizeObserver(() => {
      sceneRef.current?.resize(wrap.clientWidth || 1, wrap.clientHeight || 1);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [failed]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    },
    [],
  );

  if (failed) return <CyberpunkDiceRoll dice={dice} playerId={playerId} />;

  return (
    <div className="diceRoll3d" ref={wrapRef} aria-hidden>
      <canvas ref={canvasRef} className="diceRoll3dCanvas" />
    </div>
  );
}

/** Resolve `--glacier-accent` (any CSS colour format — hex/rgb/oklch) to a plain
 *  hex string three.js + the luminance check can read. */
function resolveAccent(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--glacier-accent').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  // Let the browser normalise anything else to rgb() via a throwaway element.
  const probe = document.createElement('span');
  probe.style.color = raw || '#f4d03f';
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color; // "rgb(r, g, b)"
  probe.remove();
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return '#f4d03f';
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1]!)}${hex(m[2]!)}${hex(m[3]!)}`;
}
