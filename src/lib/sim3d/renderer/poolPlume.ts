/**
 * @file The whirl's body: deposit passes that skin a spinning column into the
 * marching-cubes volume. Two callers share the cord machinery — the gathered
 * fire's heap vortex (depositPlume: cords + flame licks over the pooled
 * motes) and the Γ_p twist tornado (depositTwistFunnel: cords on the physics
 * funnel, mote ribbons arrive via the streaming lane). A core spine of
 * stacked balls guarantees one thick connected column however sparse the
 * motes. Deposit-side only — mote motion lives in ambient3d.
 */
import type { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { CONFIG } from '../core/config.js';
import { funnelR, swayX, swayZ } from './whirlSway.js';

/** Same stable per-mote hash the vortex ride uses. */
function hash01(i: number): number {
	return Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
}

/**
 * Rope strands + molten core for one whirl column. `midR(t)` gives the
 * strand mid-band radius at normalized height t (wobble applied here);
 * `swayS` scales the lashing centerline (the axisymmetric twist tornado
 * passes 0 — its motes follow the field, which never sways).
 */
function depositCords(
	mesh: MarchingCubes,
	height: number,
	phase: number,
	span: number,
	y0: number,
	cap: number,
	midR: (t: number) => number,
	swayS: number
): number {
	let spent = 0;

	// ---- rope strands: helical cords riding the funnel wall -----------------
	// the guaranteed connected body of the whirl. Each strand winds around the
	// centerline, turning with the whirl phase; wall-bound motes crowd around
	// these same paths and thicken them. Per-strand wobble in angle and radius
	// keeps the cords hand-drawn ragged rather than lathe-perfect.
	const levels = Math.max(1, Math.floor(height / CONFIG.PLUME_STEP));
	for (let s = 0; s < CONFIG.VORTEX_STRANDS && spent < cap; s++) {
		const armBase = (s * 2 * Math.PI) / CONFIG.VORTEX_STRANDS;
		for (let l = 0; l <= levels && spent < cap; l++) {
			const t = l / levels;
			const yw = l * CONFIG.PLUME_STEP;
			// mild fade only: motes thin out toward the crown, so up there the
			// strands ARE the body — starving them shatters the top into plates
			const strength = CONFIG.VOLUME_STRENGTH * CONFIG.SPINE_STRENGTH * (1 - 0.22 * t);
			const a =
				phase +
				armBase +
				yw * CONFIG.VORTEX_PITCH +
				0.17 * Math.sin(yw * 2.3 + s * 2.1 + phase * 0.6);
			const rs = midR(t) * (1 + 0.09 * Math.sin(yw * 3.1 + s * 4.7 + phase * 0.35));
			const bx = (swayX(yw, phase) * swayS + rs * Math.cos(a) + span / 2) / span;
			const by = (yw - y0) / span;
			const bz = (swayZ(yw, phase) * swayS + rs * Math.sin(a) + span / 2) / span;
			if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) continue;
			mesh.addBall(bx, by, bz, strength, CONFIG.VOLUME_SUBTRACT);
			spent++;
		}
	}

	// ---- molten core: a faint stack up the centerline -----------------------
	// the grooves between ropes reveal glowing interior instead of punching
	// clean through to the parchment — the column reads as a body with spiral
	// ridges, not a hollow pasta screw
	for (let l = 0; l <= levels && spent < cap; l++) {
		const t = l / levels;
		const yw = l * CONFIG.PLUME_STEP;
		const strength = CONFIG.VOLUME_STRENGTH * CONFIG.SPINE_STRENGTH * 0.65 * (1 - 0.25 * t);
		const bx = (swayX(yw, phase) * swayS + span / 2) / span;
		const by = (yw - y0) / span;
		const bz = (swayZ(yw, phase) * swayS + span / 2) / span;
		if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) continue;
		mesh.addBall(bx, by, bz, strength, CONFIG.VOLUME_SUBTRACT);
		spent++;
	}
	return spent;
}

/**
 * The Γ_p twist tornado's guaranteed trunk: cords on the physics funnel
 * (r0 at the foot flaring to r1 at the crown), no lashing — the ambient
 * motes follow the axisymmetric field, and the cords must sit on them.
 */
export function depositTwistFunnel(
	mesh: MarchingCubes,
	height: number,
	r0: number,
	r1: number,
	phase: number,
	span: number,
	y0: number,
	budget: number
): number {
	const cap = Math.min(budget, CONFIG.PLUME_BALLS);
	if (height <= 0.15 || cap <= 0) return 0;
	return depositCords(mesh, height, phase, span, y0, cap, (t) => (r0 + (r1 - r0) * t) * 0.85, 0);
}

/**
 * Deposit the plume over the pooled motes. `pooled`/`vel` hold packed world
 * xyz (position, velocity), `height` the vortex crown height, `phase` the
 * whirl's rotation the helices are wound off. Returns balls spent. With
 * height ≈ 0 (a flat, non-buoyant pool) there is no column to build and the
 * pass is skipped — the pooled-mote body deposits cover it.
 */
export function depositPlume(
	mesh: MarchingCubes,
	pooled: Float32Array,
	vel: Float32Array,
	count: number,
	height: number,
	phase: number,
	span: number,
	y0: number,
	budget: number
): number {
	const cap = Math.min(budget, CONFIG.PLUME_BALLS);
	if (count < 4 || height <= 0.05 || cap <= 0) return 0;
	// mid-band radius: the motes' jittered wall straddles the strand
	let spent = depositCords(
		mesh,
		height,
		phase,
		span,
		y0,
		cap,
		(t) => (CONFIG.VORTEX_R_BASE + (CONFIG.VORTEX_R_TOP - CONFIG.VORTEX_R_BASE) * t) * 0.85,
		1
	);

	// ---- flame licks: short stacks above each mote, trailing the spin -------
	// only motes already on the funnel sprout licks — a mote still easing in
	// from its latch spot would chain isolated balls, and any lone ball's core
	// cell crosses the isosurface (the popcorn rule: density gates, not strength).
	// Funnel distance is measured from the LASHING centerline, not the seal axis.
	for (let i = 0; i < count && spent < cap; i++) {
		const px = pooled[i * 3];
		const py = pooled[i * 3 + 1];
		const pz = pooled[i * 3 + 2];
		// gate follows the funnel flare (wide crown, tight foot), so licks sprout
		// up the whole tornado instead of only near the narrow base
		if (Math.hypot(px - swayX(py, phase), pz - swayZ(py, phase)) > funnelR(py, height) * 1.3)
			continue;
		const jitter = hash01(i);
		const t = Math.min(1, py / height);
		// crown motes shred into longer licks; foot motes stay stubby. A sparse
		// crown mote chaining even more balls upward just mints floating plates,
		// so the count stays capped at 3
		const licks = t > 0.45 ? 3 : 2;
		// the lick tip lags the whirl: lean opposite the horizontal velocity,
		// a touch harder near the crown where the flame tears loose
		const lean = CONFIG.TONGUE_LEAN * (1 + 0.4 * t);
		const lx = -vel[i * 3] * lean;
		const lz = -vel[i * 3 + 2] * lean;
		for (let k = 1; k <= licks && spent < cap; k++) {
			if (t * 0.7 + 0.3 * jitter > 0.95) break; // the very crown stays open
			const s =
				CONFIG.VOLUME_STRENGTH * CONFIG.PLUME_STRENGTH * (1 - 0.28 * k) * (0.7 + 0.6 * jitter);
			const bx = (px + lx * k * CONFIG.TONGUE_STEP + span / 2) / span;
			const by = (py + k * CONFIG.TONGUE_STEP - y0) / span;
			const bz = (pz + lz * k * CONFIG.TONGUE_STEP + span / 2) / span;
			if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) continue;
			mesh.addBall(bx, by, bz, s, CONFIG.VOLUME_SUBTRACT);
			spent++;
		}
	}
	return spent;
}
