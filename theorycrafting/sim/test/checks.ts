/**
 * GROUND_TRUTH.md §11 (the scorecard) as executable assertions, keyed by the
 * exact preset name in spells.ts — a renamed preset fails loudly. Thresholds
 * are deliberately loose: they pin the *qualitative* claim of each row, not
 * the current tuning of config.ts.
 */
import * as THREE from 'three';
import { CONFIG } from '../src/config';
import { compileSeal, type Nozzle, type OrbBundle } from '../src/nozzle';
import { deg, fromAngle, v2 } from '../src/math2';
import { AmbientMedium } from '../src/render/ambient';
import { Particles } from '../src/render/particles';
import { columnAt, SPELLS } from '../src/spells';
import { f, makeCtx, type Ctx } from './harness';

/** Run the real ambient population (§9 claims are population-level). */
const cupRun = (n: Nozzle, seconds: number, pour = true, seed = 5): AmbientMedium => {
	const med = new AmbientMedium(new THREE.Scene());
	med.setSeal(n, 0xffffff, seed, pour);
	for (let s = 0; s < Math.round(seconds * 60); s++) med.update(1 / 60);
	return med;
};

/** Poured-mote statistics: the pool inside the shell + what rests outside. */
const cupStats = (med: AmbientMedium, orb: OrbBundle) => {
	const ys: number[] = [];
	let spilled = 0;
	for (let i = CONFIG.AMBIENT_COUNT; i < CONFIG.AMBIENT_COUNT + CONFIG.POUR_COUNT; i++) {
		const x = med.pos[i * 3];
		if (x < -900) continue; // still in the bottle
		const y = med.pos[i * 3 + 1];
		const z = med.pos[i * 3 + 2];
		const d = Math.hypot(x - orb.x.x, y - orb.h, z - orb.x.y);
		if (d < orb.radius + 0.03) ys.push(y);
		else if (y < 0.3) spilled++;
	}
	ys.sort((a, b) => a - b);
	const count = ys.length;
	return {
		count,
		min: ys[0] ?? 0,
		p85: ys[Math.floor(count * 0.85)] ?? 0,
		spilled
	};
};

const verticalJet = (t: Ctx) => {
	const a = t.u(0, 0.5, 0);
	t.expect(a.y > 1.5, `axis jet rises: u_y(0,0.5,0)=${f(a.y)}, want >1.5`);
	const b = t.u(0.5, 0.5, 0);
	const hv = Math.hypot(b.x, b.z) / b.y;
	t.expect(hv < 0.15, `collimated aloft: |u_h|/u_y at (0.5,0.5,0)=${f(hv)}, want <0.15`);
	t.expect(
		Math.hypot(t.n.P.x, t.n.P.y) < 0.05,
		`balanced ring: |P|=${f(Math.hypot(t.n.P.x, t.n.P.y))}, want ≈0`
	);
	t.expect(t.n.C > 2.5, `strong convergence: C=${f(t.n.C)}, want >2.5`);
};

export const CHECKS: Record<string, (t: Ctx) => void> = {
	'Blank ring — shockwave': (t) => {
		const e = t.u(0.7, 0.1, 0);
		const w = t.u(-0.7, 0.1, 0);
		t.expect(e.x > 0.1, `burst flows outward: u_x(0.7,0.1,0)=${f(e.x)}, want >0.1`);
		t.expect(Math.abs(e.x + w.x) < 0.01, `isotropic: east/west mirror, ${f(e.x)} vs ${f(w.x)}`);
		const a = t.u(0, 0.5, 0);
		t.expect(
			a.y > 0.2 && Math.hypot(a.x, a.z) < 0.02,
			`vertical on axis: u(0,0.5,0)=(${f(a.x)},${f(a.y)},${f(a.z)})`
		);
	},

	'Watershot — balanced ring ×8': verticalJet,
	'Light beam — element swap': verticalJet,

	"Coco's misfire — one long sign": (t) => {
		t.expect(t.n.P.x < -0.2, `long east sign points west: P_x=${f(t.n.P.x)}, want <-0.2`);
		const a = t.u(0, 0.8, 0);
		t.expect(a.x < -0.1, `jet tilts west aloft: u_x(0,0.8,0)=${f(a.x)}, want <-0.1`);
		t.expect(a.y > 1.5, `still mostly vertical: u_y=${f(a.y)}, want >1.5`);
	},

	'Crystal shard — inverted ring': (t) => {
		t.expect(t.n.C < -1, `divergence: C=${f(t.n.C)}, want <-1`);
		for (const [x, z] of [
			[1.1, 0],
			[-1.1, 0],
			[0, 1.1],
			[0, -1.1]
		] as const) {
			const a = t.u(x, 0.05, z);
			const rad = (a.x * x + a.z * z) / 1.1;
			t.expect(rad > 0.8, `radial eruption at (${x},${z}): u_rad=${f(rad)}, want >0.8`);
			t.expect(a.y < 0.3 * rad, `hugs the plane at (${x},${z}): u_y=${f(a.y)}, want <0.3·u_rad`);
		}
	},

	'Two opposed columns': (t) => {
		const a = t.u(0, 0.5, 0);
		t.expect(a.y > 0.8, `clash rises: u_y(0,0.5,0)=${f(a.y)}, want >0.8`);
		t.expect(Math.hypot(a.x, a.z) < 0.1 * a.y, `vertical: |u_h|=${f(Math.hypot(a.x, a.z))}`);
	},

	'Central column — flame shot core': (t) => {
		const front = t.u(0, 0.1, 0.7);
		t.expect(
			front.z > 1 && front.z > 1.5 * front.y,
			`flat forward shot: u(0,0.1,0.7)=(${f(front.x)},${f(front.y)},${f(front.z)})`
		);
		const back = t.u(0, 0.1, -0.7);
		t.expect(back.z > -0.02, `no backward leak: u_z(0,0.1,-0.7)=${f(back.z)}, want ≥0`);
	},

	'Lone rim column — engine': (t) => {
		// the TASKS.md fix: one budget, steered — nothing exits the back of the sign
		for (const [x, y, z] of [
			[0, 0.05, -0.8],
			[0, 0.1, -0.95],
			[0.3, 0.05, -0.7]
		] as const) {
			const a = t.u(x, y, z);
			t.expect(a.z > 0.02, `steered behind the sign: u_z(${x},${y},${z})=${f(a.z)}, want >0`);
		}
		const jet = t.u(0, 0.3, 0.5);
		const speed = Math.hypot(jet.x, jet.y, jet.z);
		t.expect(speed > 0.9 && jet.z > 0.5, `engine jet in front: |u|=${f(speed)}, u_z=${f(jet.z)}`);
		let drifters = 0;
		for (const path of t.traces) {
			if (path.length > 1 && path[path.length - 1].z < path[0].z - 0.05) drifters++;
		}
		const frac = drifters / Math.max(1, t.traces.length);
		t.expect(frac < 0.02, `no tracer drifts south: ${(frac * 100).toFixed(1)}% do, want <2%`);
		t.expect(t.n.C > 0.4 && t.n.C < 0.6, `flux law parse: C=${f(t.n.C)}, want ≈0.51`);
	},

	'Lone chevron gate — valve': (t) => {
		for (const [x, z] of [
			[0.4, -0.5],
			[-0.4, -0.5],
			[0, 0.6]
		] as const) {
			const a = t.u(x, 0.1, z);
			t.expect(a.z > -0.01, `gate forbids south: u_z(${x},0.1,${z})=${f(a.z)}, want ≥0`);
		}
		const a = t.u(0, 0.1, 0.6);
		const speed = Math.hypot(a.x, a.y, a.z);
		t.expect(speed < 0.9, `valve, not engine: |u(0,0.1,0.6)|=${f(speed)}, want <0.9 (burst-scale)`);
		t.expect(t.n.S === 0, `region signs carry no momentum: S=${f(t.n.S)}`);
	},

	'Edge: column vs gate — duel': (t) => {
		for (const [x, y, z] of [
			[0, 0.1, -0.7],
			[0, 0.1, 0.7],
			[0.7, 0.1, 0],
			[0, 0.8, 0]
		] as const) {
			const a = t.u(x, y, z);
			t.expect(a.z > -0.02, `gate vetoes the south drive: u_z(${x},${y},${z})=${f(a.z)}, want ≥0`);
		}
		const a = t.u(0, 0.8, 0);
		t.expect(
			a.y > 0.3 && a.z > 0.05,
			`budget re-exits up+north: u(0,0.8,0)=(${f(a.x)},${f(a.y)},${f(a.z)})`
		);
	},

	'Pinwheel — vortex prediction': (t) => {
		t.expect(t.n.gamma > 3, `circulation: Γ=${f(t.n.gamma)}, want >3`);
		t.expect(
			Math.abs(t.n.C) < 0.05 && Math.hypot(t.n.P.x, t.n.P.y) < 0.05,
			`pure swirl: C=${f(t.n.C)}, |P|=${f(Math.hypot(t.n.P.x, t.n.P.y))}`
		);
		const e = t.u(0.7, 0.1, 0);
		t.expect(
			e.z > 1 && e.z > 3 * Math.abs(e.x),
			`ccw tangential east: u(0.7,0.1,0)=(${f(e.x)},${f(e.y)},${f(e.z)})`
		);
		const w = t.u(-0.7, 0.1, 0);
		t.expect(w.z < -1, `ccw tangential west: u_z(-0.7,0.1,0)=${f(w.z)}`);
	},

	'Region: all inward — collimator': (t) => {
		t.expect(t.mask(0, 0) > 0.95, `whole disk manifests: m(0,0)=${f(t.mask(0, 0))}`);
		t.expect(t.mask(1.25, 0) < 0.05, `outside forbidden: m(1.25,0)=${f(t.mask(1.25, 0))}`);
		const a = t.u(0.4, 0.8, 0);
		t.expect(
			a.y > 0.1 && a.x < 0.01,
			`collimated up, not outward: u(0.4,0.8,0)=(${f(a.x)},${f(a.y)},${f(a.z)})`
		);
	},

	'Region: all outward — moat': (t) => {
		t.expect(t.mask(0, 0) < 0.05, `empty interior: m(0,0)=${f(t.mask(0, 0))}`);
		t.expect(
			t.spawn(1.05, 0) > 0.4,
			`source relocates to the annulus: spawn(1.05,0)=${f(t.spawn(1.05, 0))}`
		);
		const a = t.u(1.3, 0.05, 0);
		t.expect(a.x > 0.3, `outward fan: u_x(1.3,0.05,0)=${f(a.x)}`);
	},

	'Region: opposed ring — floating drops': (t) => {
		t.expect(
			t.spawn(0.91, 0) > 0.3,
			`manifestation on the ring line: spawn(0.91,0)=${f(t.spawn(0.91, 0))}`
		);
		t.expect(
			t.spawn(0, 0) < 0.05 && t.spawn(0.45, 0) < 0.1,
			`pinched off elsewhere: spawn(0,0)=${f(t.spawn(0, 0))}, spawn(0.45,0)=${f(t.spawn(0.45, 0))}`
		);
		const a = t.u(0.91, 0.5, 0);
		t.expect(a.y > 0.1, `rising curtain: u_y(0.91,0.5,0)=${f(a.y)}`);
	},

	'Region: mid-line pairs — curtain': (t) => {
		t.expect(t.spawn(0.5, 0) > 0.3, `stripe manifests: spawn(0.5,0)=${f(t.spawn(0.5, 0))}`);
		t.expect(t.spawn(0, 0.5) < 0.05, `off-stripe forbidden: spawn(0,0.5)=${f(t.spawn(0, 0.5))}`);
		const a = t.u(0.4, 0.5, 0);
		t.expect(a.y > 0.1, `rising curtain: u_y(0.4,0.5,0)=${f(a.y)}`);
	},

	'Region: center pin — beam': (t) => {
		t.expect(t.spawn(0.02, 0) > 0.2, `point source survives: spawn(0.02,0)=${f(t.spawn(0.02, 0))}`);
		t.expect(t.spawn(0.3, 0) < 0.05, `rest of disk pinned off: spawn(0.3,0)=${f(t.spawn(0.3, 0))}`);
		const a = t.u(0.04, 0.4, 0);
		t.expect(
			a.y > 0.05 && a.y > 3 * Math.abs(a.x),
			`vertical exhaust: u(0.04,0.4,0)=(${f(a.x)},${f(a.y)},${f(a.z)})`
		);
	},

	'Region: single shutter (1/3 deep)': (t) => {
		t.expect(t.mask(0, 0) > 0.7, `front manifests: m(0,0)=${f(t.mask(0, 0))}`);
		t.expect(t.mask(-0.7, 0) < 0.15, `behind the fence forbidden: m(-0.7,0)=${f(t.mask(-0.7, 0))}`);
		const a = t.u(0.3, 0.1, 0);
		t.expect(a.x > 0.2, `lateral channel east: u_x(0.3,0.1,0)=${f(a.x)}`);
		t.expect(
			t.u(-0.5, 0.1, 0).x >= 0,
			`no westward flow anywhere: u_x(-0.5,0.1,0)=${f(t.u(-0.5, 0.1, 0).x)}`
		);
	},

	'Region: shutter + stage (R5)': (t) => {
		t.expect(t.n.reach > 1.2, `staging boosts reach: reach=${f(t.n.reach)}, want >1.2`);
		t.expect(
			t.mask(-0.5, 0) > 0.85,
			`rearmost sign sets the fence — full disk: m(-0.5,0)=${f(t.mask(-0.5, 0))}`
		);
		const a = t.u(0.5, 0.1, 0);
		t.expect(a.x > 0.3, `harder channel: u_x(0.5,0.1,0)=${f(a.x)}`);
	},

	'Rising wave — columns + half region': (t) => {
		const a = t.u(0, 0.6, 0);
		t.expect(a.y > 1, `surge rises: u_y(0,0.6,0)=${f(a.y)}`);
		t.expect(a.x > 0.25 * a.y, `and drives east — diagonal: u_x/u_y=${f(a.x / a.y)}, want >0.25`);
	},

	'Flame shot — column + side barrels': (t) => {
		t.expect(t.n.reach >= 3, `stacked gates extend reach: reach=${f(t.n.reach)}, want ≥3`);
		const a = t.u(0, 0.3, 1.5);
		t.expect(
			a.z > 1 && a.z > 2 * Math.abs(a.y),
			`collimated forward beam: u(0,0.3,1.5)=(${f(a.x)},${f(a.y)},${f(a.z)})`
		);
		t.expect(t.u(0, 0.3, 3).z > 0.3, `extended: u_z(0,0.3,3)=${f(t.u(0, 0.3, 3).z)}`);
		t.expect(
			t.u(0, 0.1, -0.7).z > -0.05,
			`no backward vent: u_z(0,0.1,-0.7)=${f(t.u(0, 0.1, -0.7).z)}`
		);
	},

	'Pyreball — levitation ×4': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && lev.grip, `fire is holdable: lev bundle present with grip`);
		if (!lev) return;
		t.expect(t.n.S === 0, `levitation adds no column budget: S=${f(t.n.S)}, want 0`);
		t.expect(lev.C > 1.4, `balanced ring grips: C_lev=${f(lev.C)}, want >1.4`);
		t.expect(
			Math.hypot(lev.P.x, lev.P.y) < 0.05,
			`balanced: |P_lev|=${f(Math.hypot(lev.P.x, lev.P.y))}, want ≈0`
		);
		t.expect(lev.h0 > 0.6 && lev.h0 < 1.0, `hover height: h0=${f(lev.h0)}, want ≈0.8`);
		// the hold signature: flow ABOVE the seal points DOWN — no column seal can do this
		const above = t.u(0, lev.h0 + 0.6, 0);
		t.expect(
			above.y < -0.3,
			`recapture above the ball: u_y(0,${f(lev.h0 + 0.6)},0)=${f(above.y)}, want <-0.3`
		);
		const side = t.u(0.7, lev.h0, 0);
		t.expect(
			side.x < -0.3,
			`grip pulls inward at the side: u_x(0.7,${f(lev.h0)},0)=${f(side.x)}, want <-0.3`
		);
		const feed = t.u(0, 0.3, 0);
		t.expect(feed.y > 0.2, `feed stream from the disk: u_y(0,0.3,0)=${f(feed.y)}, want >0.2`);
		// emergent recapture ruling: tracers end at the ball, none escape the zone
		let near = 0;
		let far = 0;
		for (const path of t.traces) {
			const e = path[path.length - 1];
			const d = Math.hypot(e.x - lev.x0.x, e.y - lev.h0, e.z - lev.x0.y);
			if (d < 0.75) near++;
			if (d > 1.5) far++;
		}
		const nT = Math.max(1, t.traces.length);
		t.expect(
			far / nT < 0.03,
			`no escapes: ${((far / nT) * 100).toFixed(1)}% of tracers end >1.5 from the ball, want <3%`
		);
		t.expect(
			near / nT > 0.75,
			`churning ball: ${((near / nT) * 100).toFixed(1)}% end within 0.75 of it, want >75%`
		);
	},

	'Waterball — long signs, higher hover': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && lev.grip, `lev bundle present with grip`);
		if (!lev) return;
		// the spring ruling: rest length grows with stem length (short preset pins ≈0.8)
		t.expect(lev.h0 > 1.15, `longer stems hover higher: h0=${f(lev.h0)}, want >1.15`);
		t.expect(
			t.u(0, lev.h0 - 0.45, 0).y > 0.1,
			`rising feed below the ball: u_y=${f(t.u(0, lev.h0 - 0.45, 0).y)}`
		);
		t.expect(
			t.u(0, lev.h0 + 0.6, 0).y < -0.3,
			`recapture above the ball: u_y=${f(t.u(0, lev.h0 + 0.6, 0).y)}`
		);
		// "just a ball": tracer-time pools in the churning blob, and the feed
		// converges from the disk instead of spraying a skirt past the ring
		let inBall = 0;
		let skirt = 0;
		let total = 0;
		for (const path of t.traces) {
			for (const p of path) {
				total++;
				const d = Math.hypot(p.x - lev.x0.x, p.y - lev.h0, p.z - lev.x0.y);
				if (d < CONFIG.BLOB_R + CONFIG.BLOB_SOFT + 0.1) inBall++;
				if (Math.hypot(p.x, p.z) > 1.25 && p.y < 0.6 * lev.h0) skirt++;
			}
		}
		t.expect(
			inBall / total > 0.6,
			`ball dominates: ${((inBall / total) * 100).toFixed(0)}% of tracer-time in the blob, want >60%`
		);
		t.expect(
			skirt / total < 0.02,
			`no skirt outside the ring: ${((skirt / total) * 100).toFixed(1)}% of tracer-time, want <2%`
		);
		// fill-to-capacity ruling: run the real population sim to steady state —
		// the ball accumulates to W_max ∝ C_lev, then the feed stops and drains
		const sim = new Particles(new THREE.Scene());
		sim.setSeal(t.n, 0xffffff);
		for (let s = 0; s < 40 * 60; s++) sim.update(1 / 60);
		let alive = 0;
		let held = 0;
		for (let i = 0; i < CONFIG.MAX_PARTICLES; i++) {
			if (!sim.alive[i]) continue;
			alive++;
			const d = Math.hypot(
				sim.pos[i * 3] - lev.x0.x,
				sim.pos[i * 3 + 1] - lev.h0,
				sim.pos[i * 3 + 2] - lev.x0.y
			);
			if (d < CONFIG.BLOB_R + CONFIG.BLOB_SOFT + 0.1) held++;
		}
		t.expect(
			held > 0.75 * lev.cap && held < 1.3 * lev.cap,
			`ball fills to capacity: held=${held}, cap=${f(lev.cap)}`
		);
		t.expect(
			alive - held < 0.08 * Math.max(1, alive),
			`feed stops once full: ${alive - held} of ${alive} tracers still outside the ball after 40s`
		);
	},

	'Skysoaring — lone lev arrow (readout)': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && !lev.grip, `wind streams through the grip (no hold)`);
		if (!lev) return;
		t.expect(t.n.S === 0 && Math.hypot(t.n.P.x, t.n.P.y) < 0.01, `no column budget: S=${f(t.n.S)}`);
		t.expect(
			lev.P.y > 1.4,
			`thrust readout along the arrow (north): P_lev·ẑ=${f(lev.P.y)}, want >1.4`
		);
		const wash = t.u(0, 0.5, -1.0);
		t.expect(
			wash.z < -0.3,
			`prop wash streams south, opposite the arrow: u_z(0,0.5,-1)=${f(wash.z)}, want <-0.3`
		);
		t.expect(
			t.u(0, 1.0, 0).y > -0.05,
			`nothing gets pulled down — no grip on wind: u_y(0,1,0)=${f(t.u(0, 1.0, 0).y)}`
		);
	},

	'Wind lev ring — ground fan (prediction)': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && !lev.grip, `wind streams through the grip`);
		if (!lev) return;
		t.expect(
			lev.C > 1.4 && Math.hypot(lev.P.x, lev.P.y) < 0.05,
			`balanced ring: C_lev=${f(lev.C)}, |P_lev|≈0`
		);
		const a = t.u(0, 1.0, 0);
		t.expect(a.y > 0.5, `fan updraft: u_y(0,1,0)=${f(a.y)}, want >0.5`);
		t.expect(
			Math.hypot(a.x, a.z) < 0.2 * a.y,
			`vertical wash: |u_h|/u_y=${f(Math.hypot(a.x, a.z) / a.y)}`
		);
	},

	// ---- pull: the ambient coupling (GROUND_TRUTH §7) -------------------------

	'Grasping wind — pull ring ×4': (t) => {
		const pull = t.n.pull;
		t.expect(!!pull, `pull bundle present`);
		if (!pull) return;
		t.expect(t.n.S === 0 && !t.n.lev, `pull adds no column/lev budget: S=${f(t.n.S)}`);
		t.expect(pull.C > 1.4, `balanced inward ring sinks: C_p=${f(pull.C)}, want >1.4`);
		t.expect(
			Math.hypot(pull.P.x, pull.P.y) < 0.05,
			`balanced: |P_p|=${f(Math.hypot(pull.P.x, pull.P.y))} ≈ 0`
		);
		t.expect(pull.cap > 0, `sink charges a capacitor: cap=${f(pull.cap)}`);
		// the sink signature: ambient flow above the seal points DOWN…
		const above = t.uAmb(0, 1.2, 0);
		t.expect(
			above.y < -0.25,
			`ambient descends onto the seal: u_amb.y(0,1.2,0)=${f(above.y)}, want <-0.25`
		);
		const side = t.uAmb(1.5, 0.25, 0);
		t.expect(
			side.x < -0.15,
			`ambient streams in from the side: u_amb.x(1.5,0.25,0)=${f(side.x)}, want <-0.15`
		);
		// …while the seal itself stays SILENT (§7 manifestation ruling): a
		// pull-only seal spends its whole output on the ambient coupling
		t.expect(!t.n.manifests, `pull-only seal manifests nothing`);
		const own = t.u(1.5, 0.25, 0);
		const axis = t.u(0, 0.5, 0);
		t.expect(
			Math.hypot(own.x, own.y, own.z) < 1e-9,
			`no own shockwave at the shoulder: |u(1.5,0.25,0)|=${f(Math.hypot(own.x, own.y, own.z))}`
		);
		t.expect(
			Math.hypot(axis.x, axis.y, axis.z) < 1e-9,
			`no own shockwave on axis: |u(0,0.5,0)|=${f(Math.hypot(axis.x, axis.y, axis.z))}`
		);
		t.expect(t.traces.length === 0, `no own tracers spawn: ${t.traces.length} paths, want 0`);
		// capacitor ruling: run the real medium population — the grasp pools,
		// charges toward G_max, and the pull dies away
		const med = new AmbientMedium(new THREE.Scene());
		med.setSeal(t.n, 0xffffff, 5);
		for (let s = 0; s < 40 * 60; s++) med.update(1 / 60);
		t.expect(
			med.grasped > 0.6 * pull.cap,
			`grasp charges: ${med.grasped} pooled after 40s, cap=${f(pull.cap)}, want >60%`
		);
		t.expect(med.grasped <= pull.cap, `…and the latch stops at capacity: ${med.grasped} ≤ cap`);
		t.expect(
			med.throttle() < 0.4,
			`the pull dies as it charges: throttle=${f(med.throttle())}, want <0.4`
		);
		t.expect(
			med.grasped < 0.5 * CONFIG.AMBIENT_COUNT,
			`the medium is not exhausted: ${med.grasped} of ${CONFIG.AMBIENT_COUNT} pooled`
		);
	},

	'Grasping wind, slanted — apple twist': (t) => {
		const pull = t.n.pull;
		t.expect(!!pull, `pull bundle present`);
		if (!pull) return;
		// the wiki diagram's margin note: pull weakens as cos(slant)…
		t.expect(
			pull.C > 1.0 && pull.C < 1.7,
			`slant weakens the pull (straight ring pins 1.8): C_p=${f(pull.C)}, want ≈1.56`
		);
		// …twist grows as sin(slant)
		t.expect(
			Math.abs(pull.gamma) > 0.6,
			`…and buys twist: |Γ_p|=${f(Math.abs(pull.gamma))}, want >0.6`
		);
		const a = t.uAmb(0.9, 0.3, 0);
		t.expect(a.x < -0.15, `still pulls inward: u_amb.x(0.9,0.3,0)=${f(a.x)}, want <-0.15`);
		// helix: tangential flow turns the way the arrows point (sign of Γ_p)
		const turn = a.z * Math.sign(pull.gamma);
		t.expect(turn > 0.05, `…and twists with the arrows: u_t·sign(Γ)=${f(turn)}, want >0.05`);
	},

	'Pull pinwheel — pure twist': (t) => {
		const pull = t.n.pull;
		t.expect(!!pull, `pull bundle present`);
		if (!pull) return;
		t.expect(Math.abs(pull.C) < 0.03, `90° slant kills the pull: C_p=${f(pull.C)} ≈ 0`);
		t.expect(pull.gamma > 1.4, `pure ambient circulation: Γ_p=${f(pull.gamma)}, want >1.4`);
		t.expect(pull.cap === 0, `nothing gathers — no capacitor, twists forever: cap=${f(pull.cap)}`);
		// §7 manifestation ruling: the ambient swirl IS the whole spell
		t.expect(!t.n.manifests, `pull-only seal: no shockwave`);
		const own = t.u(0.7, 0.1, 0);
		t.expect(
			Math.hypot(own.x, own.y, own.z) < 1e-9,
			`own field silent: |u(0.7,0.1,0)|=${f(Math.hypot(own.x, own.y, own.z))}`
		);
		const axis = t.uAmb(0, 1.0, 0);
		t.expect(Math.abs(axis.y) < 0.05, `zero net inflow on axis: u_amb.y(0,1,0)=${f(axis.y)}`);
		const e = t.uAmb(0.7, 0.15, 0);
		t.expect(e.z > 0.3, `flat swirl (ccw): u_amb.z(0.7,0.15,0)=${f(e.z)}, want >0.3`);
		t.expect(
			Math.abs(e.x) < 0.15 * Math.abs(e.z),
			`…with no radial creep: |u_r|/|u_t|=${f(Math.abs(e.x) / Math.abs(e.z))}`
		);
	},

	'Repel ring — inverted pull': (t) => {
		const pull = t.n.pull;
		t.expect(!!pull, `pull bundle present`);
		if (!pull) return;
		t.expect(pull.C < -0.5, `inverted ring pushes: C_p=${f(pull.C)}, want <-0.5`);
		t.expect(pull.cap === 0, `push gathers nothing — never self-limits: cap=${f(pull.cap)}`);
		t.expect(!t.n.manifests, `pull-only seal: no shockwave, only the ambient push`);
		// the sink's time-reverse (signed kernel ruling): up on axis…
		const axis = t.uAmb(0, 1.0, 0);
		t.expect(axis.y > 0.1, `ambient pushed up on axis: u_amb.y(0,1,0)=${f(axis.y)}, want >0.1`);
		// …lateral near the plane (NOT a plane-hugging-only fan: both live)
		const rim = t.uAmb(1.4, 0.1, 0);
		t.expect(
			rim.x > 0.05,
			`ambient pushed outward near the plane: u_amb.x(1.4,0.1,0)=${f(rim.x)}, want >0.05`
		);
	},

	'Vacuum snout — pull + barrel': (t) => {
		const pull = t.n.pull;
		t.expect(!!pull && pull.C > 1.4, `pull ring underneath: C_p=${f(pull?.C ?? 0)}`);
		// the valve does NOT restore manifestation (§7 ruling): chevrons gate
		// the ambient field, they manifest nothing themselves
		t.expect(!t.n.manifests, `pull + region only: still no shockwave`);
		t.expect(
			t.n.gates.length === 1 && t.n.gates[0].count === 2,
			`north barrel: ${t.n.gates.length} unit(s) × ${t.n.gates[0]?.count} stage(s)`
		);
		t.expect(t.n.reach > 1.4, `staged suction reach: reach=${f(t.n.reach)}, want >1.4`);
		// field-gating ruling: the seal inhales from the south…
		const south = t.uAmb(0, 0.3, -1.3);
		t.expect(
			south.z > 0.15,
			`south side inhaled northward: u_amb.z(0,0.3,-1.3)=${f(south.z)}, want >0.15`
		);
		// …but cannot suck matter back from the north (clip kills southward pull)
		const north = t.uAmb(0, 0.3, 1.3);
		t.expect(
			north.z > -0.02,
			`no suck-back from the north: u_amb.z(0,0.3,1.3)=${f(north.z)}, want ≥0`
		);
	},

	'Earth conveyor — wall bend (loose)': (t) => {
		const pull = t.n.pull;
		t.expect(!!pull, `pull bundle present`);
		if (!pull) return;
		t.expect(
			Math.hypot(pull.P.x, pull.P.y) > 1.3,
			`parallel pulls drag: |P_p|=${f(Math.hypot(pull.P.x, pull.P.y))}, want >1.3`
		);
		t.expect(pull.C < 0.3, `tails near center — barely any sink: C_p=${f(pull.C)}, want <0.3`);
		t.expect(!t.n.manifests, `pull-only seal: no shockwave, the conveyor is the whole spell`);
		t.expect(Math.abs(pull.gamma) < 0.05, `mirrored pair, no twist: Γ_p=${f(pull.gamma)}`);
		// the conveyor: caught upstream (north), carried across, delivered south
		t.expect(
			t.uAmb(0, 0.25, 1.2).z < -0.15,
			`caught upstream: u_amb.z(0,0.25,1.2)=${f(t.uAmb(0, 0.25, 1.2).z)}, want <-0.15`
		);
		t.expect(
			t.uAmb(0, 0.25, 0).z < -0.3,
			`carried across the seal: u_amb.z(0,0.25,0)=${f(t.uAmb(0, 0.25, 0).z)}, want <-0.3`
		);
		t.expect(
			t.uAmb(0, 0.25, -1.2).z < -0.15,
			`delivered past it, not stalled: u_amb.z(0,0.25,-1.2)=${f(t.uAmb(0, 0.25, -1.2).z)}, want <-0.15`
		);
	},

	'Flame burst — column + pull ring': (t) => {
		// the coexistence anchor: a COLUMN on the ring restores the manifestation
		// the pull-only rule suppresses — engine and intake run on one seal
		t.expect(t.n.manifests, `column restores manifestation`);
		t.expect(t.n.S > 0.9, `column budget spent: S=${f(t.n.S)}`);
		const pull = t.n.pull;
		t.expect(
			!!pull && pull.C > 1.4 && pull.cap > 0,
			`pull ring underneath: C_p=${f(pull?.C ?? 0)}, cap=${f(pull?.cap ?? 0)}`
		);
		// own magic: the flame jet fires north…
		const jet = t.u(0, 0.2, 0.8);
		t.expect(jet.z > 0.8, `flame jet fires north: u_z(0,0.2,0.8)=${f(jet.z)}`);
		// …while ambient matter is inhaled through the very same region —
		// decoupled populations counter-stream (§7 exemption ruling)
		const amb = t.uAmb(0, 0.25, 1.4);
		t.expect(
			amb.z < -0.1,
			`ambient inhaled against the jet: u_amb.z(0,0.25,1.4)=${f(amb.z)}, want <-0.1`
		);
		t.expect(
			t.uAmb(0, 1.2, 0).y < -0.25,
			`ambient descends onto the seal: u_amb.y(0,1.2,0)=${f(t.uAmb(0, 1.2, 0).y)}`
		);
	},

	// ---- edge-case probes (todo_edgecases.md) --------------------------------
	// These pin the CURRENT law where it is disputed, so a future ruling that
	// changes it fails loudly here and gets re-pinned deliberately.

	'Edge: half ring — surge angle probe': (t) => {
		t.expect(t.n.P.y > 1.1, `net drive north: P_z=${f(t.n.P.y)}, want >1.1`);
		t.expect(
			t.n.C > 1.0,
			`flux law converts one-sided inward flux: C=${f(t.n.C)}, want ≈1.15 (clash law would give ≈0.12)`
		);
		const a = t.u(0, 0.55, 0.6);
		t.expect(a.z > 0.5, `surge drives north: u_z(0,0.55,0.6)=${f(a.z)}`);
		t.expect(
			a.y > 0.6 * a.z,
			`§9.1 pin — rises steeply (≈43°): u_y/u_z=${f(a.y / a.z)}, clash law would be ≈0.1`
		);
	},

	'Edge: quadrupole — cancelled ink': (t) => {
		t.expect(t.n.S > 1.1, `ink was spent: S=${f(t.n.S)}`);
		const agg = Math.hypot(t.n.P.x, t.n.P.y) + Math.abs(t.n.C) + Math.abs(t.n.gamma);
		t.expect(agg < 0.02, `all first moments cancel: |P|+|C|+|Γ|=${f(agg)}`);
		const e = t.u(0.7, 0.1, 0); //  squeeze axis (inward pair)
		const nn = t.u(0, 0.1, 0.7); // stretch axis (outward pair)
		t.expect(
			Math.abs(e.x - nn.z) < 0.01,
			`current-law pin: burst can't tell the axes apart — u_x(east)=${f(e.x)} vs u_z(north)=${f(nn.z)} (a real nozzle would differ)`
		);
	},

	'Edge: two chevrons — quarter arc': (t) => {
		t.expect(
			t.n.gates.length === 1 && t.n.gates[0].fences[0].kind === 'radialIn',
			`pair fuses into one curved fence: ${t.n.gates.length} gate(s), ${t.n.gates[0]?.fences[0]?.kind}`
		);
		t.expect(t.mask(0, 0) > 0.9, `interior manifests: m(0,0)=${f(t.mask(0, 0))}`);
		t.expect(
			t.mask(-0.8, -0.8) < 0.05,
			`current-law pin: the naked SW quadrant is fenced too: m(-0.8,-0.8)=${f(t.mask(-0.8, -0.8))}`
		);
		const a = t.u(-0.5, 0.6, -0.5);
		const rad = (a.x * -0.5 + a.z * -0.5) / Math.hypot(0.5, 0.5);
		t.expect(
			rad < 0.05 && a.y > 0.1,
			`SW flow collimated up despite no sign there: u_rad=${f(rad)}, u_y=${f(a.y)}`
		);
	},

	'Edge: lev pinwheel — rotor?': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && lev.grip, `fire lev bundle with grip`);
		if (!lev) return;
		t.expect(
			Math.abs(lev.C) < 0.02 && lev.gamma > 1.5,
			`pure lev circulation: C_lev=${f(lev.C)}, Γ_lev=${f(lev.gamma)}`
		);
		const a = t.u(0.7, 0.8, 0);
		t.expect(
			Math.abs(a.z) < 0.02,
			`current-law pin: NO rotor — spin is gated on C_lev>0, §6/§7 disagree: u_t(0.7,0.8,0)=${f(a.z)}`
		);
	},

	'Edge: lopsided grip — lev misfire': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && lev.grip, `lev bundle with grip`);
		if (!lev) return;
		t.expect(lev.P.x < -0.4, `long east arrow points west: P_lev·x̂=${f(lev.P.x)}`);
		t.expect(
			lev.x0.x > 0.1,
			`§9.5 pin: locus displaces EAST, toward the long sign: x0_x=${f(lev.x0.x)} (the tepee reading would displace west)`
		);
		const above = t.u(0, lev.h0 + 0.7, 0);
		t.expect(
			above.x > 0.02,
			`axis flow pulled east toward the displaced ball: u_x(0,${f(lev.h0 + 0.7)},0)=${f(above.x)}`
		);
		t.expect(above.y < -0.2, `still recaptured from above: u_y=${f(above.y)}`);
	},

	'Edge: inverted lev ring — press or dud?': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && lev.C < -0.5, `outward arrows diverge: C_lev=${f(lev?.C ?? 0)}, want <-0.5`);
		const a = t.u(0, 1.0, 0);
		t.expect(
			a.y > 0.05 && a.y < 0.4,
			`§9.6 pin: today a dud — bare burst, no press/repulse: u_y(0,1,0)=${f(a.y)}`
		);
	},

	'Edge: fountain vs grip — jet through the ball': (t) => {
		const lev = t.n.lev;
		t.expect(t.n.C > 2.5, `column engine underneath: C=${f(t.n.C)}`);
		t.expect(!!lev && lev.C > 1.4, `hold ring on top: C_lev=${f(lev?.C ?? 0)}`);
		if (!lev) return;
		const above = t.u(0, lev.h0 + 0.6, 0);
		t.expect(
			above.y > 0.5,
			`current-law pin: the jet outruns the grip — no recapture (pyreball reads <-0.3 here): u_y(0,${f(lev.h0 + 0.6)},0)=${f(above.y)}`
		);
		let far = 0;
		for (const path of t.traces) {
			const e = path[path.length - 1];
			if (Math.hypot(e.x - lev.x0.x, e.y - lev.h0, e.z - lev.x0.y) > 1.5) far++;
		}
		const frac = far / Math.max(1, t.traces.length);
		t.expect(
			frac > 0.4,
			`ball never forms: ${(frac * 100).toFixed(0)}% of tracers escape past 1.5, want >40%`
		);
	},

	// ---- convergence: the lens (GROUND_TRUTH §8) ------------------------------

	'Floatglow lamp — lev + convergence': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && lev.grip, `light is holdable: lev bundle with grip`);
		if (!lev) return;
		t.expect(t.n.S === 0, `triangles add no column budget: S=${f(t.n.S)}`);
		t.expect(t.n.Q > 1.3, `lens budget: Q=${f(t.n.Q)}, want ≈1.4`);
		t.expect(t.n.focus > 1.6, `focus: F=${f(t.n.focus)}, want >1.6`);
		// same ring as the pyreball: hold channel and CAPACITY are untouched (§8)
		t.expect(lev.C > 1.4, `grip unchanged: C_lev=${f(lev.C)}`);
		t.expect(
			Math.abs(lev.cap - CONFIG.BALL_CAP * lev.C) < 1e-6,
			`W_max untouched by focus: cap=${f(lev.cap)}`
		);
		// tighter spring: at 0.35 from the locus the pyreball reads ≈-0.4 — the
		// focused blob (radius ÷F) is already gripping hard there
		const mid = t.u(0, lev.h0 + 0.35, 0);
		t.expect(
			mid.y < -1.0,
			`lens tightens the ball: u_y at locus+0.35 = ${f(mid.y)}, want <-1.0 (pyreball ≈-0.4)`
		);
		t.expect(
			t.u(0, lev.h0 + 0.6, 0).y < -0.5,
			`recapture above: u_y=${f(t.u(0, lev.h0 + 0.6, 0).y)}`
		);
		// rigidity ruling: run the real population — the held ball must MOVE as a
		// body, so measure actual drift over one second, not instantaneous field
		// samples (spring-vs-pressure pairs cancel in position space, not in u)
		const sim = new Particles(new THREE.Scene());
		sim.setSeal(t.n, 0xffffff);
		for (let s = 0; s < 15 * 60; s++) sim.update(1 / 60);
		const idx: number[] = [];
		const p0: number[] = [];
		for (let i = 0; i < CONFIG.MAX_PARTICLES; i++) {
			if (!sim.alive[i]) continue;
			const d = Math.hypot(
				sim.pos[i * 3] - lev.x0.x,
				sim.pos[i * 3 + 1] - lev.h0,
				sim.pos[i * 3 + 2] - lev.x0.y
			);
			if (d > 0.55) continue;
			idx.push(i);
			p0.push(sim.pos[i * 3], sim.pos[i * 3 + 1], sim.pos[i * 3 + 2]);
		}
		t.expect(
			idx.length > 150,
			`a held ball exists: ${idx.length} tracers within 0.55 of the locus`
		);
		for (let s = 0; s < 60; s++) sim.update(1 / 60);
		let ex = 0,
			ey = 0,
			ez = 0,
			cnt = 0;
		const ev: number[] = [];
		for (let k = 0; k < idx.length; k++) {
			const i = idx[k];
			if (!sim.alive[i]) continue;
			const dx = sim.pos[i * 3] - p0[k * 3];
			const dy = sim.pos[i * 3 + 1] - p0[k * 3 + 1];
			const dz = sim.pos[i * 3 + 2] - p0[k * 3 + 2];
			ev.push(dx, dy, dz);
			ex += dx;
			ey += dy;
			ez += dz;
			cnt++;
		}
		if (cnt > 0) {
			ex /= cnt;
			ey /= cnt;
			ez /= cnt;
			let disp = 0;
			for (let k = 0; k < ev.length; k += 3)
				disp += Math.hypot(ev[k] - ex, ev[k + 1] - ey, ev[k + 2] - ez);
			disp /= cnt;
			t.expect(
				disp < 0.3,
				`rigidity: ball moves as a body, drift dispersion over 1s = ${f(disp)}, want <0.3 (a churning pyreball swirls at blob scale)`
			);
		}
	},

	'Bare focus — candle plume': (t) => {
		t.expect(t.n.S === 0 && !t.n.lev && !t.n.pull, `only the lens: S=${f(t.n.S)}, no lev/pull`);
		t.expect(t.n.Q > 1.3 && t.n.focus > 1.6, `Q=${f(t.n.Q)}, F=${f(t.n.focus)}`);
		// the plume: emission pinched toward the axis (blank ring is isotropic)
		const a = t.u(0.4, 0.8, 0);
		t.expect(
			a.y > 2 * Math.abs(a.x),
			`pinched aloft: u(0.4,0.8,0)=(${f(a.x)},${f(a.y)},${f(a.z)}), want u_y > 2|u_x|`
		);
		const rim = t.u(1.1, 0.15, 0);
		t.expect(
			rim.y > rim.x,
			`even near the rim the flow bends up: u_y=${f(rim.y)} vs u_x=${f(rim.x)}`
		);
		// lens ≠ focal spring: nothing is held, nothing descends on the axis
		t.expect(
			t.u(0, 1.5, 0).y > 0.05,
			`no recapture — not a levitation: u_y(0,1.5,0)=${f(t.u(0, 1.5, 0).y)}, want >0`
		);
		// lens ≠ spawn pin: the whole disk still manifests
		t.expect(t.spawn(0.5, 0) > 0.9, `full-disk source: spawn(0.5,0)=${f(t.spawn(0.5, 0))}`);
		// orientation ruling (§8): rotate every triangle 60° (apex flips) — identical
		const seal = SPELLS.find((s) => s.name === 'Bare focus — candle plume')!;
		const spun = compileSeal({
			...seal,
			signs: seal.signs.map((s) =>
				s.kind === 'convergence'
					? { ...s, dir: fromAngle(Math.atan2(s.dir.y, s.dir.x) + deg(60)) }
					: s
			)
		});
		t.expect(
			spun.Q === t.n.Q && spun.focus === t.n.focus,
			`orientation ignored: spun Q=${f(spun.Q)} F=${f(spun.focus)}`
		);
		const c2 = makeCtx(spun, []);
		const b = c2.u(0.4, 0.8, 0);
		t.expect(
			Math.abs(b.y - a.y) < 1e-9 && Math.abs(b.x - a.x) < 1e-9,
			`identical field when triangles spin: Δu=(${f(b.x - a.x)},${f(b.y - a.y)})`
		);
	},

	'Focused watershot — beam lens': (t) => {
		t.expect(t.n.C > 2.5, `engine intact: C=${f(t.n.C)}`);
		t.expect(t.n.focus > 1.5, `lens on: F=${f(t.n.focus)}`);
		const core = t.u(0, 0.5, 0);
		t.expect(
			core.y > 4.5,
			`faster core (watershot pins >1.5): u_y(0,0.5,0)=${f(core.y)}, want >4.5`
		);
		const rim = t.u(0.85, 0.5, 0);
		t.expect(
			rim.y < 1.0,
			`narrower tube (watershot reads ≈3+ here): u_y(0.85,0.5,0)=${f(rim.y)}, want <1.0`
		);
		t.expect(
			t.n.reach === 1,
			`the lens does NOT extend reach — that is region staging: reach=${f(t.n.reach)}`
		);
	},

	'Sylph shoes — strut (lev + conv)': (t) => {
		const lev = t.n.lev;
		t.expect(!!lev && !lev.grip, `wind streams through the grip`);
		if (!lev) return;
		t.expect(
			lev.C > 1.4 && Math.hypot(lev.P.x, lev.P.y) < 0.05,
			`balanced hold ring: C_lev=${f(lev.C)}`
		);
		t.expect(t.n.focus > 1.6, `lens on: F=${f(t.n.focus)}`);
		const axis = t.u(0, 1.0, 0);
		t.expect(
			axis.y > 1.2,
			`stiff strut (plain wind ring pins >0.5): u_y(0,1,0)=${f(axis.y)}, want >1.2`
		);
		const off = t.u(0.85, 1.0, 0);
		const offMag = Math.hypot(off.x, off.y, off.z);
		t.expect(offMag < 0.35 * axis.y, `narrow tube: |u(0.85,1,0)|=${f(offMag)}, want <0.35·axis`);
	},

	'Focused intake — pull + conv': (t) => {
		const pull = t.n.pull;
		t.expect(!!pull && pull.C > 1.4, `pull ring underneath: C_p=${f(pull?.C ?? 0)}`);
		if (!pull) return;
		t.expect(t.n.focus > 1.6, `seal-wide lens: F=${f(t.n.focus)}`);
		t.expect(pull.cap > 0, `still a capacitor: cap=${f(pull.cap)}`);
		// the lens does NOT restore manifestation (§7 ruling): it focuses the
		// ambient field, the seal's only emission
		t.expect(!t.n.manifests, `pull + convergence only: still no shockwave`);
		// axial throat: at the shoulder the inflow now DESCENDS more than it
		// streams (grasping wind reads |u_x| ≫ |u_y| there)
		const a = t.uAmb(1.5, 0.25, 0);
		t.expect(
			a.y < 0 && Math.abs(a.y) > Math.abs(a.x),
			`intake turned axial: u_amb(1.5,0.25,0)=(${f(a.x)},${f(a.y)},${f(a.z)})`
		);
		const above = t.uAmb(0, 1.2, 0);
		t.expect(
			above.y < -0.5,
			`harder axial inflow (grasping wind pins <-0.25): u_amb.y(0,1.2,0)=${f(above.y)}`
		);
	},

	// ---- orb: the vessel (GROUND_TRUTH §9) ------------------------------------

	'Water Orb — canon cup': (t) => {
		const orb = t.n.orb;
		t.expect(!!orb, `orb bundle present`);
		if (!orb) return;
		t.expect(Math.abs(orb.O - 1.04) < 0.01, `budget = Σ glyph diameters: O=${f(orb.O)}, want 1.04`);
		t.expect(
			Math.abs(orb.radius - CONFIG.K_ORB * orb.O) < 1e-9,
			`no lens: r = K_ORB·O = ${f(orb.radius)}`
		);
		// placement re-read: the columns are captured — they never fire
		t.expect(
			t.n.S === 0 && t.n.C === 0 && Math.hypot(t.n.P.x, t.n.P.y) === 0,
			`column budget captured: S=${f(t.n.S)}, C=${f(t.n.C)}`
		);
		t.expect(
			orb.h - orb.radius > 0.3,
			`C₊ lifts the vessel above tangent (Orb_Diagram): h−r=${f(orb.h - orb.radius)}, want >0.3`
		);
		t.expect(Math.hypot(orb.x.x, orb.x.y) < 1e-9, `balanced pair: no lateral shift`);
		// manipulate mode: silent — column does NOT restore manifestation here
		t.expect(!t.n.manifests, `orb seal manifests nothing`);
		t.expect(t.traces.length === 0, `no own tracers: ${t.traces.length} paths, want 0`);
		const u0 = t.u(0, 0.5, 0);
		t.expect(
			Math.hypot(u0.x, u0.y, u0.z) < 1e-9,
			`own field silent: |u(0,0.5,0)|=${f(Math.hypot(u0.x, u0.y, u0.z))}`
		);
		// height law: longer columns park the vessel higher (compile-level)
		const seal = SPELLS.find((s) => s.name === 'Water Orb — canon cup')!;
		const tall = compileSeal({
			...seal,
			signs: seal.signs.map((s) => (s.kind === 'column' ? { ...s, len: s.len * 1.6 } : s))
		}).orb!;
		t.expect(tall.h > orb.h + 0.2, `longer columns park it higher: h=${f(tall.h)} vs ${f(orb.h)}`);
		// the cup, live: poured water is contained, pools bottom-up, held
		const med = cupRun(t.n, 6);
		const early = cupStats(med, orb);
		for (let s = 0; s < 24 * 60; s++) med.update(1 / 60);
		const late = cupStats(med, orb);
		t.expect(
			late.count > 0.7 * CONFIG.POUR_COUNT,
			`the pour is contained: ${late.count}/${CONFIG.POUR_COUNT} in the shell`
		);
		t.expect(
			late.spilled < 0.03 * CONFIG.POUR_COUNT,
			`nothing spills from an unfilled cup: ${late.spilled} resting outside`
		);
		t.expect(
			late.min > orb.h - orb.radius - 0.05,
			`rests ON the shell, not through it: min y=${f(late.min)}, bottom=${f(orb.h - orb.radius)}`
		);
		t.expect(
			late.p85 < orb.h,
			`pools in the lower half (gravity is local law): p85 y=${f(late.p85)} < center ${f(orb.h)}`
		);
		t.expect(
			early.min > orb.h - orb.radius - 0.05 && early.min < orb.h - 0.5 * orb.radius,
			`first arrivals land at the bottom — the cup fills bottom-up: early min=${f(early.min)}`
		);
		t.expect(
			late.count >= early.count,
			`held indefinitely — the cup only gains: ${early.count} → ${late.count}`
		);
	},

	'Bare cup — orb only': (t) => {
		const orb = t.n.orb;
		t.expect(!!orb, `orb bundle present`);
		if (!orb) return;
		t.expect(
			Math.abs(orb.h - orb.radius) < 1e-9,
			`no columns: vessel tangent to the disk, h=${f(orb.h)}=r`
		);
		t.expect(!t.n.manifests && t.traces.length === 0, `silent seal, no own magic`);
		t.expect(t.n.Q === 0 && !t.n.pull && !t.n.lev, `only the vessel: nothing else compiled`);
		// divergent columns clamp at tangent (§9: C<0 has nowhere to sink)
		const seal = SPELLS.find((s) => s.name === 'Bare cup — orb only')!;
		const div = compileSeal({
			...seal,
			signs: [...seal.signs, columnAt(v2(0.4, 0), 0, 0.5), columnAt(v2(-0.4, 0), 180, 0.5)]
		}).orb!;
		t.expect(
			Math.abs(div.h - div.radius) < 1e-9,
			`divergent columns clamp at tangent: h=${f(div.h)}=r`
		);
	},

	'Lopsided cup — one column': (t) => {
		const orb = t.n.orb;
		t.expect(!!orb, `orb bundle present`);
		if (!orb) return;
		t.expect(
			orb.x.x > 0.2,
			`§12.15 pin: vessel parks along +P̂, east — where the jet would have gone: x=${f(orb.x.x)} (the lev-locus analogy would send it west)`
		);
		t.expect(orb.h > orb.radius + 0.2, `and C₊ lifts it: h−r=${f(orb.h - orb.radius)}`);
		t.expect(!t.n.manifests && t.n.S === 0, `no jet fires — the aggregate is spent on placement`);
	},

	'Self-filling canteen — orb + pull': (t) => {
		const orb = t.n.orb;
		const pull = t.n.pull;
		t.expect(!!orb && !!pull, `vessel + intake on one ring`);
		if (!orb || !pull) return;
		t.expect(!t.n.manifests, `still silent: orb + pull manifest nothing`);
		t.expect(pull.C > 1.4 && pull.cap > 0, `sink underneath: C_p=${f(pull.C)}, cap=${f(pull.cap)}`);
		t.expect(
			t.uAmb(0, 1.8, 0).y < -0.2,
			`intake descends through the vessel airspace: u_amb.y(0,1.8,0)=${f(t.uAmb(0, 1.8, 0).y)}`
		);
		// §9 ruling: the shell is a raised grasp — contained charges the capacitor
		const med = cupRun(t.n, 40, false);
		t.expect(
			med.contained > 60,
			`the cup self-fills from the medium: ${med.contained} contained after 40s`
		);
		t.expect(
			med.grasped >= med.contained,
			`contained counts against G_max: grasped=${med.grasped}`
		);
		t.expect(
			med.throttle() < 0.75,
			`…throttling the intake as it fills: throttle=${f(med.throttle())}, want <0.75`
		);
		t.expect(
			med.contained < 0.5 * CONFIG.AMBIENT_COUNT,
			`the medium is not exhausted: ${med.contained} of ${CONFIG.AMBIENT_COUNT}`
		);
	},

	'Stirred cup — orb + pinwheel': (t) => {
		const orb = t.n.orb;
		t.expect(!!orb, `orb bundle present`);
		if (!orb) return;
		t.expect(orb.stir > 3, `Γ captured into the stir: ${f(orb.stir)}, want >3`);
		t.expect(t.n.gamma === 0, `…and spent: nozzle Γ=${f(t.n.gamma)} — no free swirl field`);
		t.expect(
			Math.abs(orb.h - orb.radius) < 1e-9 && Math.hypot(orb.x.x, orb.x.y) < 0.01,
			`pinwheel: P=C=0, vessel tangent on axis`
		);
		t.expect(!t.n.manifests, `silent — the columns are captured`);
		// the pool circulates: net tangential drift about the vessel axis
		const med = cupRun(t.n, 20);
		const idx: number[] = [];
		const before: number[] = [];
		for (let i = CONFIG.AMBIENT_COUNT; i < CONFIG.AMBIENT_COUNT + CONFIG.POUR_COUNT; i++) {
			const x = med.pos[i * 3];
			if (x < -900) continue;
			const y = med.pos[i * 3 + 1];
			const z = med.pos[i * 3 + 2];
			if (Math.hypot(x - orb.x.x, y - orb.h, z - orb.x.y) < orb.radius) {
				idx.push(i);
				before.push(x, z);
			}
		}
		med.update(1 / 60);
		let cross = 0;
		for (let k = 0; k < idx.length; k++) {
			const i = idx[k];
			cross +=
				before[k * 2] * (med.pos[i * 3 + 2] - before[k * 2 + 1]) -
				before[k * 2 + 1] * (med.pos[i * 3] - before[k * 2]);
		}
		t.expect(idx.length > 200, `a pool exists: ${idx.length} contained`);
		t.expect(
			cross > 0,
			`…and it circulates the way the arrows point (ccw): Σ r×dr = ${cross.toFixed(3)}, want >0`
		);
	},

	'Focused cup — orb + convergence': (t) => {
		const orb = t.n.orb;
		t.expect(!!orb, `orb bundle present`);
		if (!orb) return;
		t.expect(t.n.Q > 1.3 && t.n.focus > 1.6, `lens on: Q=${f(t.n.Q)}, F=${f(t.n.focus)}`);
		t.expect(
			Math.abs(orb.radius * t.n.focus - CONFIG.K_ORB * orb.O) < 1e-9,
			`widths ÷ F (§8): r=${f(orb.radius)} = K_ORB·O/F — the bare cup reads ${f(CONFIG.K_ORB * orb.O)}`
		);
		t.expect(!t.n.manifests, `the lens does not restore manifestation (§7 precedent)`);
		const med = cupRun(t.n, 20);
		t.expect(
			med.contained > 0.6 * CONFIG.POUR_COUNT,
			`same pour, smaller denser cup — still held: ${med.contained} contained`
		);
	},

	'Edge: overfill — thimble cup': (t) => {
		const orb = t.n.orb;
		t.expect(!!orb, `orb bundle present`);
		if (!orb) return;
		t.expect(orb.radius < 0.2, `thimble: r=${f(orb.radius)}`);
		const med = cupRun(t.n, 35);
		const s = cupStats(med, orb);
		t.expect(
			s.count < 0.85 * CONFIG.POUR_COUNT,
			`geometric capacity (no constant!): only ${s.count}/${CONFIG.POUR_COUNT} fit`
		);
		t.expect(
			s.spilled > 0.1 * CONFIG.POUR_COUNT,
			`the rest is rejected at the packed surface and spills: ${s.spilled} resting outside`
		);
		t.expect(s.count > 40, `…but the thimble did fill first: ${s.count} contained`);
	}
};
