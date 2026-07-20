import * as THREE from 'three';

/**
 * Real polyhedral-dice geometry for the WebGL roll. Each die is the correct
 * Platonic/Catalan solid — a d20 is a 20-face icosahedron, NOT a textured cube —
 * so it reads as an actual tabletop die. Alongside the mesh geometry we return
 * per-FACE data (outward normal + centroid), which drives two things: placing a
 * numeral on every face, and computing the landing rotation that puts a chosen
 * face up (the server-decided result).
 */

export interface FaceInfo {
  /** Unit outward normal of the face (die-local space). */
  normal: THREE.Vector3;
  /** Face centre (die-local space) — where its numeral sits. */
  centroid: THREE.Vector3;
}

export interface DieShape {
  geometry: THREE.BufferGeometry;
  faces: FaceInfo[];
}

/** Cluster a triangulated geometry's triangles into flat faces by shared normal.
 *  Works for the solids whose faces are multiple triangles (cube, dodecahedron)
 *  as well as the all-triangle solids (tetra/octa/icosa → one triangle each). */
function groupFaces(geometry: THREE.BufferGeometry): FaceInfo[] {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const triCount = pos.count / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  // Merge triangles by normal DIRECTION with an angular tolerance rather than a
  // rounded key: float noise in a face's fan triangles can straddle a rounding
  // boundary and split one face into several (a dodecahedron would report >12).
  // Distinct die faces are tens of degrees apart, so dot > 0.996 (~5°) is safe.
  // `rep` is a STABLE unit normal used only for matching (never mutated, so the
  // dot test stays unit·unit); `nsum`/`csum` accumulate for the averaged result.
  const buckets: { rep: THREE.Vector3; nsum: THREE.Vector3; csum: THREE.Vector3; count: number }[] = [];
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3 + 0);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac).normalize();
    const centroid = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    const bucket = buckets.find((bk) => bk.rep.dot(n) > 0.996);
    if (bucket) {
      bucket.nsum.add(n);
      bucket.csum.add(centroid);
      bucket.count++;
    } else {
      buckets.push({ rep: n.clone(), nsum: n.clone(), csum: centroid, count: 1 });
    }
  }
  return buckets.map((bucket) => ({
    normal: bucket.nsum.normalize(),
    centroid: bucket.csum.multiplyScalar(1 / bucket.count),
  }));
}

/**
 * A pentagonal trapezohedron — the true d10 shape (10 kite faces, a zig-zag
 * equator between two apexes). three.js has no built-in for it, so build it from
 * two apexes plus a 10-vertex alternating-height equator ring; each face is a
 * kite (apex + three consecutive equator vertices) split into two triangles.
 */
function trapezohedron(): DieShape {
  const N = 5;
  const R = 1; // equator radius
  const h = 0.35; // equator zig-zag amplitude
  const H = 1.05; // apex height
  const eq: THREE.Vector3[] = [];
  for (let i = 0; i < 2 * N; i++) {
    const ang = (i * Math.PI) / N; // 36° steps
    eq.push(new THREE.Vector3(Math.cos(ang) * R, i % 2 === 0 ? h : -h, Math.sin(ang) * R));
  }
  const top = new THREE.Vector3(0, H, 0);
  const bottom = new THREE.Vector3(0, -H, 0);

  const positions: number[] = [];
  const faces: FaceInfo[] = [];
  const pushTri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => {
    positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  };
  for (let k = 0; k < 2 * N; k++) {
    const apex = k % 2 === 0 ? top : bottom;
    const v0 = eq[k]!;
    const v1 = eq[(k + 1) % (2 * N)]!;
    const v2 = eq[(k + 2) % (2 * N)]!;
    // Wind so the normal points outward (away from the die centre at origin).
    const centroid = new THREE.Vector3().add(apex).add(v0).add(v1).add(v2).multiplyScalar(0.25);
    const nrm = new THREE.Vector3()
      .crossVectors(new THREE.Vector3().subVectors(v1, apex), new THREE.Vector3().subVectors(v2, apex))
      .normalize();
    if (nrm.dot(centroid) < 0) nrm.negate();
    // Two triangles for the kite, wound to match the outward normal.
    if (k % 2 === 0) {
      pushTri(apex, v0, v1);
      pushTri(apex, v1, v2);
    } else {
      pushTri(apex, v1, v0);
      pushTri(apex, v2, v1);
    }
    faces.push({ normal: nrm, centroid });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return { geometry, faces };
}

/** Scale a shape so its farthest vertex sits at radius 1, so every die reads at
 *  a comparable size regardless of solid. */
function normalizeSize(shape: DieShape): DieShape {
  shape.geometry.computeBoundingSphere();
  const r = shape.geometry.boundingSphere?.radius ?? 1;
  const s = 1 / r;
  if (s !== 1) {
    shape.geometry.scale(s, s, s);
    for (const face of shape.faces) face.centroid.multiplyScalar(s);
  }
  return shape;
}

/** Build the die solid + face data for a given side count (4/6/8/10/12/20). */
export function makeDie(sides: number): DieShape {
  let shape: DieShape;
  if (sides === 10) {
    shape = trapezohedron();
  } else {
    let geometry: THREE.BufferGeometry;
    switch (sides) {
      case 4:
        geometry = new THREE.TetrahedronGeometry(1);
        break;
      case 6:
        geometry = new THREE.BoxGeometry(1.25, 1.25, 1.25);
        break;
      case 8:
        geometry = new THREE.OctahedronGeometry(1);
        break;
      case 12:
        geometry = new THREE.DodecahedronGeometry(1);
        break;
      case 20:
      default:
        geometry = new THREE.IcosahedronGeometry(1);
        break;
    }
    shape = { geometry, faces: groupFaces(geometry) };
  }
  return normalizeSize(shape);
}

/** The polygon (triangle/square/pentagon) sitting on each face — used to size
 *  the numeral so it fits the face. */
export function faceKind(sides: number): 'triangle' | 'square' | 'pentagon' | 'kite' {
  if (sides === 6) return 'square';
  if (sides === 12) return 'pentagon';
  if (sides === 10) return 'kite';
  return 'triangle';
}
