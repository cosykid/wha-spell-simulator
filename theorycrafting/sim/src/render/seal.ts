/**
 * Draws the seal itself: ring, signs at their true positions/orientations,
 * and the element's sigil loaded from the project's SVG icon set.
 */
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { add, angleOf, len, norm, perp, scale, sub, type Vec2 } from './../math2';
import { ELEMENT_COLOR, ELEMENT_ICON, type Seal } from './../model';

const INK = 0xd8c9b4; // pale parchment ink on the dark background
const RING = 0xb08d6e;

/** A flat strip on the seal plane from a to b (seal 2D coords). */
function strip(a: Vec2, b: Vec2, width: number, color: number, y = 0.008): THREE.Mesh {
	const d = sub(b, a);
	const L = len(d);
	const geo = new THREE.BoxGeometry(Math.max(L, 1e-3), 0.004, width);
	const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
	const mid = scale(add(a, b), 0.5);
	mesh.position.set(mid.x, y, mid.y);
	mesh.rotation.y = -angleOf(d); // seal 2D angle ↦ world yaw
	return mesh;
}

function columnMesh(pos: Vec2, dir: Vec2, length: number): THREE.Group {
	const g = new THREE.Group();
	const tip = add(pos, scale(dir, length));
	g.add(strip(pos, tip, 0.016, INK)); // stem
	const p = perp(dir);
	const w = 0.13;
	g.add(strip(add(pos, scale(p, -w)), add(pos, scale(p, w)), 0.016, INK)); // crossbar
	return g;
}

/** Levitation glyph = column glyph + back-swept arrowhead at the tip. */
function levitationMesh(pos: Vec2, dir: Vec2, length: number): THREE.Group {
	const g = columnMesh(pos, dir, length);
	const tip = add(pos, scale(dir, length));
	for (const side of [1, -1]) {
		const barb = norm(add(scale(dir, -1), scale(perp(dir), side * 0.7)));
		g.add(strip(tip, add(tip, scale(barb, 0.13)), 0.016, INK));
	}
	return g;
}

/**
 * Pull glyph = bare-tailed stem + hollow triangle head + tip barbs
 * (icons/pull.svg — no crossbar; the tail-end IS the application point).
 */
function pullMesh(pos: Vec2, dir: Vec2, length: number): THREE.Group {
	const g = new THREE.Group();
	const tip = add(pos, scale(dir, length));
	g.add(strip(pos, tip, 0.016, INK)); // stem
	const p = perp(dir);
	const base = add(pos, scale(dir, length * 0.52));
	const apex = add(pos, scale(dir, length * 0.84));
	const w = 0.08;
	g.add(strip(add(base, scale(p, -w)), apex, 0.014, INK));
	g.add(strip(add(base, scale(p, w)), apex, 0.014, INK));
	g.add(strip(add(base, scale(p, -w)), add(base, scale(p, w)), 0.014, INK));
	for (const side of [1, -1]) {
		const barb = norm(add(scale(dir, -1), scale(p, side)));
		g.add(strip(tip, add(tip, scale(barb, 0.12)), 0.016, INK));
	}
	return g;
}

/**
 * Convergence glyph = closed regular triangle (icons/convergence.svg).
 * Orientation is decorative — the law reads only size (GROUND_TRUTH §8).
 */
function convergenceMesh(pos: Vec2, dir: Vec2, side: number): THREE.Group {
	const g = new THREE.Group();
	const circumR = side / Math.sqrt(3);
	const inR = side / (2 * Math.sqrt(3));
	const p = perp(dir);
	const apex = add(pos, scale(dir, circumR));
	const b1 = add(sub(pos, scale(dir, inR)), scale(p, side / 2));
	const b2 = add(sub(pos, scale(dir, inR)), scale(p, -side / 2));
	g.add(strip(apex, b1, 0.014, INK));
	g.add(strip(b1, b2, 0.014, INK));
	g.add(strip(b2, apex, 0.014, INK));
	return g;
}

/**
 * Orb glyph = circle with a line through it (icons/orb.svg). Non-directional:
 * the law reads only the diameter; the through-line orientation is styling.
 */
function orbMesh(pos: Vec2, dir: Vec2, diameter: number): THREE.Group {
	const g = new THREE.Group();
	const r = diameter / 2;
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(r, 0.008, 8, 48),
		new THREE.MeshBasicMaterial({ color: INK })
	);
	ring.rotation.x = Math.PI / 2;
	ring.position.set(pos.x, 0.008, pos.y);
	g.add(ring);
	// the through-line overshoots the circle on both sides (icon proportions)
	const over = r * 1.31;
	g.add(strip(sub(pos, scale(dir, over)), add(pos, scale(dir, over)), 0.014, INK));
	return g;
}

function regionMesh(pos: Vec2, dir: Vec2): THREE.Group {
	const g = new THREE.Group();
	const apex = add(pos, scale(dir, 0.09));
	const p = perp(dir);
	const back = scale(dir, -0.08);
	g.add(strip(apex, add(add(pos, back), scale(p, 0.1)), 0.014, INK));
	g.add(strip(apex, add(add(pos, back), scale(p, -0.1)), 0.014, INK));
	return g;
}

export function buildSealGroup(seal: Seal): THREE.Group {
	const group = new THREE.Group();

	// dark backing disk (contrast for particles and mask overlay)
	const disk = new THREE.Mesh(
		new THREE.CircleGeometry(1, 96),
		new THREE.MeshBasicMaterial({ color: 0x17181d })
	);
	disk.rotation.x = -Math.PI / 2;
	disk.position.y = -0.002;
	group.add(disk);

	// the ring
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(1, 0.013, 10, 180),
		new THREE.MeshBasicMaterial({ color: RING })
	);
	ring.rotation.x = Math.PI / 2;
	group.add(ring);

	// the signs
	for (const s of seal.signs) {
		if (s.kind === 'column') group.add(columnMesh(s.pos, s.dir, s.len));
		else if (s.kind === 'levitation') group.add(levitationMesh(s.pos, s.dir, s.len));
		else if (s.kind === 'pull') group.add(pullMesh(s.pos, s.dir, s.len));
		else if (s.kind === 'convergence') group.add(convergenceMesh(s.pos, s.dir, s.len));
		else if (s.kind === 'orb') group.add(orbMesh(s.pos, s.dir, s.len));
		else group.add(regionMesh(s.pos, s.dir));
	}

	// the sigil (async — appended when the SVG arrives)
	const icon = ELEMENT_ICON[seal.element];
	const color = ELEMENT_COLOR[seal.element];
	new SVGLoader().load(`icons/${icon}`, (data) => {
		const sigil = new THREE.Group();
		const mat = new THREE.LineBasicMaterial({ color });
		const box = new THREE.Box2();
		const allPts: THREE.Vector2[][] = [];
		for (const path of data.paths) {
			for (const sp of path.subPaths) {
				const pts = sp.getPoints(24);
				allPts.push(pts);
				for (const pt of pts) box.expandByPoint(pt);
			}
		}
		const size = new THREE.Vector2();
		box.getSize(size);
		const s = 0.42 / Math.max(size.x, size.y, 1e-6);
		const c = new THREE.Vector2();
		box.getCenter(c);
		for (const pts of allPts) {
			const geo = new THREE.BufferGeometry().setFromPoints(
				pts.map((p) => new THREE.Vector3((p.x - c.x) * s, 0, (p.y - c.y) * s))
			);
			sigil.add(new THREE.Line(geo, mat));
		}
		sigil.position.y = 0.006;
		group.add(sigil);
	});

	return group;
}
