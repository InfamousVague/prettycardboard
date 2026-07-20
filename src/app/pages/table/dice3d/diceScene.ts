import * as THREE from 'three';
import { makeDie, type DieShape, type FaceInfo } from './diceGeometry.ts';

/**
 * The imperative WebGL dice engine. Lives outside React (a plain class the
 * overlay component drives) because it owns a renderer, a rAF-driven simulation,
 * and GPU resources that must be created and disposed by hand.
 *
 * A roll is DETERMINISTIC: the server already chose the value, so each die is
 * given a landing orientation that puts the face carrying that value straight
 * up, then a decaying multi-turn tumble that resolves exactly onto it. No
 * physics — the result is guaranteed, the motion is just for show.
 */

const UP = new THREE.Vector3(0, 1, 0);
const ROLL_MS = 1150; // tumble + settle
const HOLD_MS = 950; // sit showing the result
const FADE_MS = 380; // dissolve out
const LIFE_MS = ROLL_MS + HOLD_MS + FADE_MS;

interface ActiveDie {
  group: THREE.Group;
  mesh: THREE.Mesh;
  body: THREE.MeshStandardMaterial;
  numerals: THREE.Sprite[];
  born: number;
  restPos: THREE.Vector3;
  dropHeight: number;
  target: THREE.Quaternion;
  tumbleAxis: THREE.Vector3;
  tumbleAngle: number;
  spin: THREE.Quaternion; // scratch
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Standard bouncy landing (0→0, 1→1 with settling bounces).
function easeOutBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

/** Relative luminance of a #rrggbb color, for choosing a readable numeral ink. */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** A cached numeral sprite texture (white ink on transparent; underline on 6/9
 *  so their orientation is unambiguous). */
const numeralTextures = new Map<string, THREE.Texture>();
function numeralTexture(value: number, ink: string): THREE.Texture {
  const key = `${value}:${ink}`;
  const cached = numeralTextures.get(key);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = ink;
  ctx.font = `bold ${value >= 10 ? 62 : 78}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = String(value);
  ctx.fillText(label, size / 2, size / 2 + 4);
  if (value === 6 || value === 9) {
    ctx.fillRect(size / 2 - 22, size / 2 + 34, 44, 7);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  numeralTextures.set(key, texture);
  return texture;
}

export class DiceScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private dice: ActiveDie[] = [];
  private shapes = new Map<number, DieShape>();
  private accent = '#f4d03f';
  private ink = '#0b0b0e';
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, accent: string) {
    this.accent = accent || this.accent;
    this.ink = luminance(this.accent) > 0.55 ? '#0b0b0e' : '#f6f6f8';

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 6.2, 4.4);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3, 8, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 0.9);
    rim.position.set(-5, 3, -4);
    this.scene.add(rim);
  }

  private shapeFor(sides: number): DieShape {
    let shape = this.shapes.get(sides);
    if (!shape) {
      shape = makeDie(sides);
      this.shapes.set(sides, shape);
    }
    return shape;
  }

  /** Landing orientation that points `face` straight up, plus a random yaw. */
  private landingQuat(face: FaceInfo, yaw: number): THREE.Quaternion {
    const align = new THREE.Quaternion().setFromUnitVectors(face.normal.clone().normalize(), UP);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    return yawQ.multiply(align);
  }

  /** Add a rolling die of `sides` that will settle showing `value`. `index`/`total`
   *  spread simultaneous rolls apart. `seed` varies the tumble deterministically-ish. */
  spawn(sides: number, value: number, index: number, total: number, now: number, seed: number): void {
    const shape = this.shapeFor(sides);
    const faceCount = shape.faces.length;
    // Face 0 carries the result; the rest cycle through the remaining pips so
    // every face shows a distinct, plausible number.
    const resultFace = shape.faces[0]!;

    const group = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.accent),
      flatShading: true,
      metalness: 0.15,
      roughness: 0.42,
    });
    const mesh = new THREE.Mesh(shape.geometry, body);
    group.add(mesh);

    const numerals: THREE.Sprite[] = [];
    for (let i = 0; i < faceCount; i++) {
      const face = shape.faces[i]!;
      const faceValue = ((value - 1 + i) % faceCount) + 1;
      const material = new THREE.SpriteMaterial({
        map: numeralTexture(faceValue, this.ink),
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(face.centroid).addScaledVector(face.normal, 0.04);
      const scale = sides >= 12 ? 0.5 : sides === 4 ? 0.42 : 0.6;
      sprite.scale.set(scale, scale, scale);
      group.add(sprite);
      numerals.push(sprite);
    }

    const dieScale = 0.82;
    group.scale.setScalar(dieScale);

    const spread = Math.min(2.3, 5.2 / Math.max(1, total));
    const restPos = new THREE.Vector3((index - (total - 1) / 2) * spread, 0, 0);
    group.position.copy(restPos).add(new THREE.Vector3(0, 4, 0));

    const yaw = (seed % 360) * (Math.PI / 180);
    const target = this.landingQuat(resultFace, yaw);
    const axis = new THREE.Vector3(
      Math.sin(seed * 1.3) * 0.6 + 0.3,
      Math.cos(seed * 0.7) * 0.4 + 0.6,
      Math.sin(seed * 2.1) * 0.6,
    ).normalize();
    const turns = 3 + (seed % 3);

    group.quaternion.copy(target);
    this.scene.add(group);
    this.dice.push({
      group,
      mesh,
      body,
      numerals,
      born: now,
      restPos,
      dropHeight: 4,
      target,
      tumbleAxis: axis,
      tumbleAngle: turns * Math.PI * 2,
      spin: new THREE.Quaternion(),
    });
  }

  /** Advance + render one frame. Returns the number of dice still on screen. */
  tick(now: number): number {
    for (let i = this.dice.length - 1; i >= 0; i--) {
      const d = this.dice[i]!;
      const age = now - d.born;
      if (age >= LIFE_MS) {
        this.remove(i);
        continue;
      }
      // Rotation: tumble that decays to exactly the target orientation.
      const rollT = Math.min(1, age / ROLL_MS);
      const residual = d.tumbleAngle * (1 - easeOutCubic(rollT));
      d.spin.setFromAxisAngle(d.tumbleAxis, residual);
      d.group.quaternion.copy(d.target).multiply(d.spin);
      // Position: drop with a bouncy settle.
      const yOff = (1 - easeOutBounce(rollT)) * d.dropHeight;
      d.group.position.set(d.restPos.x, d.restPos.y + yOff, d.restPos.z);
      // Fade out at the end of life.
      const fadeStart = ROLL_MS + HOLD_MS;
      if (age > fadeStart) {
        const k = 1 - (age - fadeStart) / FADE_MS;
        d.body.opacity = k;
        d.body.transparent = true;
        for (const s of d.numerals) (s.material as THREE.SpriteMaterial).opacity = k;
        d.group.scale.setScalar(0.82 * (0.9 + 0.1 * k));
      }
    }
    this.renderer.render(this.scene, this.camera);
    return this.dice.length;
  }

  private remove(i: number): void {
    const d = this.dice[i]!;
    this.scene.remove(d.group);
    d.body.dispose();
    for (const s of d.numerals) (s.material as THREE.SpriteMaterial).dispose();
    this.dice.splice(i, 1);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  get activeCount(): number {
    return this.dice.length;
  }

  dispose(): void {
    for (let i = this.dice.length - 1; i >= 0; i--) this.remove(i);
    for (const shape of this.shapes.values()) shape.geometry.dispose();
    this.shapes.clear();
    for (const texture of numeralTextures.values()) texture.dispose();
    numeralTextures.clear();
    this.renderer.dispose();
  }
}
