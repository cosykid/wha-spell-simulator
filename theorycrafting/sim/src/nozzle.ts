/**
 * Layer 1 — "the nozzle": compile a seal's sign list into the aggregate
 * quantities the field is built from. See GROUND_TRUTH.md §4–§8.
 *
 * Region signs are grouped into gate UNITS before fences are derived:
 *   1. pinch pairs — close anti-parallel chevrons (floating drops, curtains,
 *      pins): both fences stay active, the magic is squeezed between them;
 *   2. barrels — parallel chevrons sharing a lane (flame shot stacks, the
 *      demo's R5): the REARMOST sets the fence, the rest add staging
 *      (hardness, bias, reach);
 *   3. singles — everything else; near-radial ones become curved fences that
 *      follow the ring (so chevron rings make disks/annuli, not polygons).
 */
import { CONFIG } from './config';
import { angDist, angleOf, dot, len, norm, scale, sigmoid, sub, v2, type Vec2 } from './math2';
import { ELEMENT_GRIP, type Seal } from './model';

export interface Fence {
	kind: 'planar' | 'radialIn' | 'radialOut';
	dir: Vec2; //      û (planar); for radial fences the direction is ±ρ̂(x)
	boundary: number; // planar: allowed x·û ≥ b; radial: fence circle ρ = b
}

export interface GateUnit {
	fences: Fence[];
	count: number; //   hardness multiplier (barrel stages, or 2 for tight pinches)
	barrel: boolean; // only barrels contribute to reach staging
	members: Vec2[]; // member positions, for azimuthal governance
	global: boolean; // near-center units govern everywhere
}

/** Levitation force-pair bundle (GROUND_TRUTH §6): same algebra, separate budget. */
export interface LevBundle {
	L: number; //      levitation budget    Σλ
	P: Vec2; //        lateral channel      Σλû   (substrate thrust along +P̂)
	C: number; //      hold channel (grip)  −Σλw(û·r̂)
	gamma: number; //  torque               Σλw(û·t̂)    (rotor prediction)
	h0: number; //     hover rest height = H_LEV · λ̄  (spring ruling: longer signs hold further)
	x0: Vec2; //       lateral hover displacement = −LEV_SHIFT · P  (mass side gets −P̂)
	grip: boolean; //  element property: holdable blob (spring) vs streaming medium (wash)
	cap: number; //    held-ball capacity in tracers = BALL_CAP · C_lev₊  (W_max ∝ ηR²C_lev, §6)
}

/** Pull ambient-coupling bundle (GROUND_TRUTH §7): same algebra, third target. */
export interface PullBundle {
	K: number; //      pull budget          Σλ
	P: Vec2; //        lateral drag         Σλû   (ambient matter carried along +P̂)
	C: number; //      sink channel         −Σλw(û·r̂)   (+ = pull toward the seal, − = push)
	gamma: number; //  ambient twist        Σλw(û·t̂)
	cap: number; //    grasp capacity in tracers = GRASP_CAP · C_p₊  (G_max ∝ ηR²C_p₊, the capacitor ruling)
}

/**
 * Orb vessel bundle (GROUND_TRUTH §9): a one-way spherical boundary, placed
 * by the CAPTURED column aggregate — on an orb seal the columns never fire,
 * A aims the vessel instead (§3's one budget, re-read).
 */
export interface OrbBundle {
	O: number; //      orb budget           Σλ (glyph diameters — position/orientation ignored)
	radius: number; // r = K_ORB·O / F      (the lens shrinks the vessel, §8)
	x: Vec2; //        horizontal center = ORB_SHIFT·P  (along +P̂ — the aim reading, §12.15)
	h: number; //      center height = radius + H_ORB·C₊  (tangent by default; C<0 clamps)
	stir: number; //   captured Γ — solid-body swirl of the contents about the vessel axis
}

export interface Nozzle {
	S: number; //      total column budget  Σλ
	P: Vec2; //        net lateral drive    Σλû
	C: number; //      convergence          −Σλw(û·r̂)   (+ = inward, clashes → vertical)
	gamma: number; //  circulation          Σλw(û·t̂)    (swirl)
	Q: number; //      lens budget (§8)     Σλ — orientation/position ignored (120° ruling)
	focus: number; //  F = 1 + CONV_FOCUS·Q: envelope widths ÷ F, speeds × F
	lev: LevBundle | null;
	pull: PullBundle | null;
	orb: OrbBundle | null;
	gates: GateUnit[];
	reach: number; //  range multiplier from barrel staging
	// §7 manifestation ruling: a pull-only seal (no column, no levitation)
	// spends its whole output on the ambient coupling — no burst, no own
	// manifestation. Region/convergence don't restore it (valve and lens
	// manifest nothing themselves); column or levitation does (flame burst).
	// §9: orb seals are silent the same way, and column does NOT restore
	// manifestation there — the vessel captures its budget.
	manifests: boolean;
}

interface RSign {
	pos: Vec2;
	dir: Vec2;
}

/** Radial alignment of a chevron at its own position: -1 inward, +1 outward, 0 neither. */
function radialSense(s: RSign): -1 | 0 | 1 {
	const r = len(s.pos);
	if (r <= CONFIG.RADIAL_MIN_R) return 0;
	const rd = dot(s.dir, scale(s.pos, 1 / r));
	if (rd > CONFIG.RADIAL_DOT) return 1;
	if (rd < -CONFIG.RADIAL_DOT) return -1;
	return 0;
}

/**
 * Fence of one chevron *within a pinch pair*: rim pairs may curve (they trace
 * the ring band), everything else is a straight half-plane gate.
 */
function fenceOf(s: RSign): Fence {
	const sense = radialSense(s);
	if (sense === 1) return { kind: 'radialOut', dir: s.dir, boundary: len(s.pos) };
	if (sense === -1) return { kind: 'radialIn', dir: s.dir, boundary: len(s.pos) };
	return { kind: 'planar', dir: s.dir, boundary: dot(s.pos, s.dir) };
}

export function compileSeal(seal: Seal): Nozzle {
	let S = 0;
	let P = v2(0, 0);
	let C = 0;
	let gamma = 0;

	// --- columns, levitation & pull → flux decompositions (separate budgets) --
	let levL = 0;
	let levN = 0;
	let levP = v2(0, 0);
	let levC = 0;
	let levGamma = 0;
	let pullK = 0;
	let pullP = v2(0, 0);
	let pullC = 0;
	let pullGamma = 0;
	let Q = 0;
	let O = 0;
	for (const s of seal.signs) {
		if (s.kind === 'region') continue;
		if (s.kind === 'convergence') {
			// the lens (§8): a scalar budget — the glyph's 120° symmetry ruling
			// makes orientation unreadable, and focus is a whole-seal property
			Q += s.len;
			continue;
		}
		if (s.kind === 'orb') {
			// the vessel (§9): non-directional, position ignored — like the lens,
			// a whole-seal property read purely as ink amount (glyph diameter)
			O += s.len;
			continue;
		}
		if (s.kind === 'levitation') {
			levL += s.len;
			levN++;
			levP = v2(levP.x + s.len * s.dir.x, levP.y + s.len * s.dir.y);
		} else if (s.kind === 'pull') {
			pullK += s.len;
			pullP = v2(pullP.x + s.len * s.dir.x, pullP.y + s.len * s.dir.y);
		} else {
			S += s.len;
			P = v2(P.x + s.len * s.dir.x, P.y + s.len * s.dir.y);
		}
		const r = len(s.pos);
		if (r > 0.05) {
			const rhat = scale(s.pos, 1 / r);
			const that = v2(-rhat.y, rhat.x); // ẑ × r̂
			const w = Math.min(r, 1);
			const conv = s.len * w * -dot(s.dir, rhat);
			const circ = s.len * w * dot(s.dir, that);
			if (s.kind === 'levitation') {
				levC += conv;
				levGamma += circ;
			} else if (s.kind === 'pull') {
				pullC += conv;
				pullGamma += circ;
			} else {
				C += conv;
				gamma += circ;
			}
		}
	}
	const lev: LevBundle | null =
		levN === 0
			? null
			: {
					L: levL,
					P: levP,
					C: levC,
					gamma: levGamma,
					h0: CONFIG.H_LEV * (levL / levN),
					x0: scale(levP, -CONFIG.LEV_SHIFT),
					grip: ELEMENT_GRIP[seal.element],
					cap: CONFIG.BALL_CAP * Math.max(levC, 0)
				};
	const pull: PullBundle | null =
		pullK === 0
			? null
			: {
					K: pullK,
					P: pullP,
					C: pullC,
					gamma: pullGamma,
					cap: CONFIG.GRASP_CAP * Math.max(pullC, 0)
				};

	// --- region signs → gate units -----------------------------------------
	const signs: RSign[] = seal.signs.filter((s) => s.kind === 'region');
	const used = new Array<boolean>(signs.length).fill(false);
	const gates: GateUnit[] = [];
	const antiCos = -Math.cos((35 * Math.PI) / 180);
	const parCos = Math.cos((CONFIG.DIR_CLUSTER_DEG * Math.PI) / 180);

	// 1. pinch pairs: close anti-parallel chevrons squeeze magic between them
	for (let i = 0; i < signs.length; i++) {
		if (used[i]) continue;
		for (let j = i + 1; j < signs.length; j++) {
			if (used[j]) continue;
			if (dot(signs[i].dir, signs[j].dir) > antiCos) continue;
			if (len(sub(signs[i].pos, signs[j].pos)) > CONFIG.PINCH_GAP) continue;
			used[i] = used[j] = true;
			const members = [signs[i].pos, signs[j].pos];
			gates.push({
				fences: [fenceOf(signs[i]), fenceOf(signs[j])],
				count: 2, // tight pinch: hard walls (but no reach staging)
				barrel: false,
				members,
				global: members.every((p) => len(p) < CONFIG.GLOBAL_R + 0.1)
			});
			break;
		}
	}

	// 2. barrels: parallel chevrons sharing a lane; rearmost sets the fence.
	//    Lone chevrons are deferred — they may still assemble into a ring.
	const singles: RSign[] = [];
	for (let i = 0; i < signs.length; i++) {
		if (used[i]) continue;
		used[i] = true;
		const lane: RSign[] = [signs[i]];
		for (let j = i + 1; j < signs.length; j++) {
			if (used[j]) continue;
			if (dot(signs[i].dir, signs[j].dir) < parCos) continue;
			const d = sub(signs[j].pos, signs[i].pos);
			const perpOff = Math.abs(d.x * -signs[i].dir.y + d.y * signs[i].dir.x);
			if (perpOff > CONFIG.LANE_W) continue;
			used[j] = true;
			lane.push(signs[j]);
		}
		if (lane.length === 1) {
			singles.push(lane[0]);
			continue;
		}
		const members = lane.map((s) => s.pos);
		const dir = norm(lane.reduce((a, s) => v2(a.x + s.dir.x, a.y + s.dir.y), v2(0, 0)));
		const boundary = Math.min(...members.map((p) => dot(p, dir)));
		gates.push({
			fences: [{ kind: 'planar', dir, boundary }], // the R5 "rearmost" ruling
			count: lane.length,
			barrel: true,
			members,
			global: members.every((p) => len(p) < CONFIG.GLOBAL_R + 0.1)
		});
	}

	// 3. rings: ≥2 radially aligned chevrons of the same sense, spread in
	//    azimuth, fuse into ONE curved fence following the ring. A lone
	//    radial chevron stays a straight shutter (demo R2: rim chevron →
	//    lateral channel, not a collimator).
	const ringSpread = (CONFIG.RING_SPREAD_DEG * Math.PI) / 180;
	for (const sense of [-1, 1] as const) {
		const group = singles.filter((s) => radialSense(s) === sense);
		if (group.length >= 2) {
			let spread = 0;
			for (let i = 0; i < group.length; i++)
				for (let j = i + 1; j < group.length; j++)
					spread = Math.max(spread, angDist(angleOf(group[i].pos), angleOf(group[j].pos)));
			if (spread >= ringSpread) {
				const members = group.map((s) => s.pos);
				const meanR = members.reduce((t, p) => t + len(p), 0) / members.length;
				gates.push({
					fences: [
						{ kind: sense === 1 ? 'radialOut' : 'radialIn', dir: group[0].dir, boundary: meanR }
					],
					count: group.length,
					barrel: false,
					members,
					global: false
				});
				for (const s of group) singles.splice(singles.indexOf(s), 1);
			}
		}
	}

	// 4. leftovers: straight one-way shutters
	for (const s of singles) {
		gates.push({
			fences: [{ kind: 'planar', dir: s.dir, boundary: dot(s.pos, s.dir) }],
			count: 1,
			barrel: true,
			members: [s.pos],
			global: len(s.pos) < CONFIG.GLOBAL_R + 0.1
		});
	}

	const extraStages = gates.reduce((t, g) => t + (g.barrel ? g.count - 1 : 0), 0);
	const reach = Math.min(1 + CONFIG.STAGE_BOOST * extraStages, CONFIG.REACH_MAX);

	const focus = 1 + CONFIG.CONV_FOCUS * Q;

	// the vessel captures the column budget (§9 placement re-read): A aims the
	// vessel instead of firing — height from C₊ (tangent floor), lateral shift
	// along +P̂, Γ stirs the contents. The aggregates are then SPENT: no jet,
	// no fan, no swirl, and column does not restore manifestation here.
	let orb: OrbBundle | null = null;
	if (O > 0) {
		const radius = (CONFIG.K_ORB * O) / focus;
		orb = {
			O,
			radius,
			x: scale(P, CONFIG.ORB_SHIFT),
			h: radius + CONFIG.H_ORB * Math.max(C, 0),
			stir: gamma
		};
		S = 0;
		P = v2(0, 0);
		C = 0;
		gamma = 0;
	}

	return {
		S,
		P,
		C,
		gamma,
		Q,
		focus,
		lev,
		pull,
		orb,
		gates,
		reach,
		manifests: (pull === null && orb === null) || S > 0 || lev !== null
	};
}

/**
 * Governance: which units act at seal-plane point p.
 * Global units always govern; local ones by nearest-member azimuth
 * (Voronoi with a tie window, so co-located units all apply).
 */
export function governing(n: Nozzle, p: Vec2, out: GateUnit[]): GateUnit[] {
	out.length = 0;
	if (n.gates.length === 0) return out;
	const r = len(p);
	if (r < 0.07) {
		for (const g of n.gates) out.push(g);
		return out;
	}
	const az = angleOf(p);
	let dmin = Infinity;
	const dists: number[] = [];
	for (const g of n.gates) {
		if (g.global) {
			dists.push(-1);
			continue;
		}
		let d = Infinity;
		for (const m of g.members) {
			if (len(m) < 0.15) continue;
			d = Math.min(d, angDist(az, angleOf(m)));
		}
		dists.push(d);
		dmin = Math.min(dmin, d);
	}
	if (dmin === Infinity) dmin = 0;
	const tie = (CONFIG.TIE_DEG * Math.PI) / 180;
	for (let i = 0; i < n.gates.length; i++) {
		if (dists[i] < 0 || dists[i] <= dmin + tie) out.push(n.gates[i]);
	}
	return out;
}

const scratchGates: GateUnit[] = [];

/** Manifestation mask m(p) ∈ (0,1): product of governing fence sigmoids. */
export function maskAt(n: Nozzle, p: Vec2): number {
	const gov = governing(n, p, scratchGates);
	if (gov.length === 0) return 1;
	const rho = len(p);
	let m = 1;
	for (const g of gov) {
		const k = CONFIG.GATE_K * g.count;
		for (const f of g.fences) {
			let s: number;
			if (f.kind === 'planar') s = dot(p, f.dir) - f.boundary;
			else if (f.kind === 'radialIn') s = f.boundary - rho;
			else s = rho - f.boundary;
			m *= sigmoid(k * s);
		}
	}
	return m;
}

/** Spawn density: mask × proximity to the disk (source can relocate just outside). */
export function spawnWeight(n: Nozzle, p: Vec2): number {
	const rho = len(p);
	const prox = rho <= 1 ? 1 : Math.exp(-(rho - 1) / CONFIG.PROX_OUT);
	return maskAt(n, p) * prox;
}
