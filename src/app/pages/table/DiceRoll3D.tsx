import { useEffect, useRef, useState } from 'react';
import type DiceBoxType from '@3d-dice/dice-box-threejs';
import type { GigDie } from '../../net/types.ts';
import { CyberpunkDiceRoll } from './CyberpunkDiceRoll.tsx';
import { playSound } from '../../sounds.ts';
import { loadPreferences } from '../../preferences.ts';
import { diceSkinById } from '../../data/diceSkins.ts';
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
  // Removes the "dismiss on playmat interaction" listener once armed.
  const interactionCleanup = useRef<(() => void) | undefined>(undefined);
  // The skin the live box was built with; a change rebuilds it.
  const currentSkin = useRef<string | null>(null);
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
    playSound('diceRoll');
    void ensureBoxAndFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice, playerId, failed]);

  // Generic single-die rolls (Magic sidebar, or any game): a bumped seq is a
  // fresh roll. A stage-switch rebaselines instead of firing.
  const prevSeq = useRef<{ owner: string; seq: number } | null>(null);
  useEffect(() => {
    if (failed) return;
    if (!prevSeq.current || prevSeq.current.owner !== playerId) {
      prevSeq.current = { owner: playerId, seq: lastRoll?.seq ?? 0 };
      return;
    }
    if (!lastRoll) return;
    if (lastRoll.seq === prevSeq.current.seq) return;
    prevSeq.current = { owner: playerId, seq: lastRoll.seq };
    queue.current.push({ sides: lastRoll.sides, value: lastRoll.value });
    playSound('diceRoll');
    void ensureBoxAndFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRoll?.seq, playerId, failed]);

  // The dice linger on the mat after settling; the next real interaction with
  // the playmat clears them (so a roll stays readable as long as you want).
  const armClearOnInteraction = () => {
    if (interactionCleanup.current) return;
    const onDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('.table')) return;
      interactionCleanup.current?.();
      interactionCleanup.current = undefined;
      try {
        boxRef.current?.clearDice();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    interactionCleanup.current = () => window.removeEventListener('pointerdown', onDown, true);
  };

  const flush = () => {
    const box = boxRef.current;
    if (!box) return;
    const batch = queue.current;
    queue.current = [];
    if (batch.length === 0) return;
    // A fresh roll clears whatever the previous roll left on the mat and drops
    // any pending dismiss listener.
    window.clearTimeout(clearTimer.current);
    interactionCleanup.current?.();
    interactionCleanup.current = undefined;
    try {
      box.clearDice();
    } catch {
      /* ignore */
    }
    // Predetermined notation: `1d20@17` forces the physics to settle on 17.
    // Several at once combine with `+` (rare — usually one Fixer die at a time).
    const notation = batch.map((r) => `1d${r.sides}@${r.value}`).join('+');
    box
      .roll(notation)
      .then(() => {
        playSound('diceLand');
        armClearOnInteraction();
      })
      .catch(() => {});
    // Fallback: arm the dismiss even if the roll promise never resolves, so the
    // dice can never get stuck on the mat with no way to clear them.
    clearTimer.current = window.setTimeout(armClearOnInteraction, 4000);
  };

  const ensureBoxAndFlush = async () => {
    // A skin change rebuilds the box so the next roll wears the new look.
    const skinId = loadPreferences().diceSkin;
    if (boxRef.current && currentSkin.current !== skinId) {
      try {
        boxRef.current.clearDice();
      } catch {
        /* ignore */
      }
      if (wrapRef.current) wrapRef.current.innerHTML = '';
      boxRef.current = null;
    }
    if (boxRef.current) {
      flush();
      return;
    }
    if (loading.current || failed) return;
    if (!wrapRef.current) return;
    loading.current = true;
    try {
      const { default: DiceBox } = await import('@3d-dice/dice-box-threejs');
      const skin = diceSkinById(skinId);
      const background = skin.accent ? resolveAccent() : skin.color;
      const foreground = skin.accent ? inkFor(background) : skin.pip;
      const box = new DiceBox(`#${containerId.current}`, {
        assetPath: import.meta.env.BASE_URL,
        sounds: false,
        shadows: true,
        theme_surface: 'green-felt',
        theme_material: skin.material,
        theme_texture: skin.texture ?? '',
        theme_customColorset: {
          background,
          foreground,
          texture: skin.texture ?? 'none',
          material: skin.material,
        },
        gravity_multiplier: 320,
        baseScale: 90,
        strength: 1.6,
      });
      await box.initialize();
      boxRef.current = box;
      currentSkin.current = skinId;
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
      interactionCleanup.current?.();
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

/** Resolve the live theme accent (`--glacier-accent-solid`) to a hex string the
 *  library reads for the die colour. Probed through an element so var() chains
 *  resolve; the computed value may stay `oklch(...)` (Glacier's ramps are
 *  OKLCH and engines don't reserialize wide-gamut colours to rgb). */
function resolveAccent(): string {
  const probe = document.createElement('span');
  probe.style.color = 'var(--glacier-accent-solid)';
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return toHex(computed) ?? '#f4d03f';
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
  if (!raw) return null;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  // Resolve keywords / var() chains through a probe. The computed value may
  // still be a modern colour function - engines do NOT reserialize wide-gamut
  // colours (Glacier's OKLCH ramps) into legacy rgb() - so parse those too.
  const probe = document.createElement('span');
  probe.style.color = raw;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color || raw;
  probe.remove();
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(computed);
  if (rgb) return hexOf(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255);
  const srgb = /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(computed);
  if (srgb) return hexOf(Number(srgb[1]), Number(srgb[2]), Number(srgb[3]));
  const ok = /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?/i.exec(computed);
  if (ok) return oklchToHex(cssNum(ok[1]!, 1), cssNum(ok[2]!, 0.4), Number(ok[3]));
  return null;
}

/** '64%' -> 0.64 * scale100; plain numbers pass through. */
function cssNum(v: string, scale100: number): number {
  return v.endsWith('%') ? (Number(v.slice(0, -1)) / 100) * scale100 : Number(v);
}

function hexOf(r: number, g: number, b: number): string {
  const h = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** OKLCH -> sRGB hex (CSS Color 4 reference math), gamut-clamped per channel. */
function oklchToHex(L: number, C: number, hueDeg: number): string {
  const hr = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map((c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055));
  return hexOf(lin[0]!, lin[1]!, lin[2]!);
}
