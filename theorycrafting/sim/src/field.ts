/**
 * Layer 2 — the velocity fields: u(X) for the spell's own magic and
 * u_amb(X) for the ambient medium (GROUND_TRUTH.md §10, pull law §7).
 * Convergence (§8) acts here as a lens: envelope widths ÷ F, speeds × F,
 * burst/kernel directions pinched toward the emission axis.
 * World frame: seal plane = xz, up = +y. Seal 2D (x, y) ↦ world (x, z).
 */
import * as THREE from 'three';
import { CONFIG } from './config';
import { smoothstep, v2 } from './math2';
import { governing, maskAt, type GateUnit, type Nozzle } from './nozzle';

const scratchGov: GateUnit[] = [];
const p2 = v2(0, 0);

/**
 * Sample the field at `pos`, writing into `out`.
 * Returns the manifestation mask at the point (used by callers to absorb
 * particles that stray behind a fence).
 */
export function sampleVelocity(n: Nozzle, pos: THREE.Vector3, out: THREE.Vector3): number {
	const px = pos.x;
	const h = pos.y;
	const pz = pos.z;
	const rho = Math.hypot(px, pz);
	const F = n.focus; // the lens (§8): widths ÷ F, speeds × F
	out.set(0, 0, 0);

	// ---- burst: the ring's emission — one budget, steered by the columns ----
	// §7 manifestation ruling: a pull-only seal emits no own magic at all —
	// the shockwave is the DEFAULT spend, and pull redirects it entirely to
	// the ambient coupling (jet/fan/swirl/lev are already zero without
	// column/levitation signs, so gating the burst silences u(X) completely)
	if (n.manifests) {
		const vx = px;
		const vy = h + CONFIG.H_VIRTUAL;
		const vz = pz;
		const vl = Math.hypot(vx, vy, vz) || 1;
		// column momentum A = (P, C₊) bends the emission direction: no columns →
		// isotropic; a strong column owns the whole budget (no backward leak)
		const g = CONFIG.BURST_STEER;
		let sx = vx / vl + g * n.P.x;
		let sy = vy / vl + g * Math.max(n.C, 0);
		let sz = vz / vl + g * n.P.y;
		// the lens pinches the emission toward its axis (§8): the axis is the
		// column aggregate when driven, ẑ when bare. Rays refract toward the
		// axis LINE, not just its direction — a focused ring is a converging
		// plume, not a disk-wide collimated brush
		if (n.Q > 1e-3) {
			const ax = n.P.x;
			const ay = Math.max(n.C, 0);
			const az = n.P.y;
			const al = Math.hypot(ax, ay, az);
			const dx0 = al > 1e-3 ? ax / al : 0;
			const dy0 = al > 1e-3 ? ay / al : 1;
			const dz0 = al > 1e-3 ? az / al : 0;
			const s = px * dx0 + h * dy0 + pz * dz0;
			let ox = px - s * dx0;
			let oy = h - s * dy0;
			let oz = pz - s * dz0;
			const om = Math.hypot(ox, oy, oz);
			const axial = CONFIG.CONV_AXIAL * Math.min(om, 1);
			if (om > 1e-4) {
				ox /= om;
				oy /= om;
				oz /= om;
			}
			let tx = dx0 - ox * axial;
			let ty = dy0 - oy * axial;
			let tz = dz0 - oz * axial;
			const tl = Math.hypot(tx, ty, tz) || 1;
			const k = CONFIG.CONV_PINCH * n.Q;
			sx += (k * tx) / tl;
			sy += (k * ty) / tl;
			sz += (k * tz) / tl;
		}
		const sl = Math.hypot(sx, sy, sz) || 1;
		const dDisk = Math.hypot(Math.max(0, rho - 1), Math.max(0, h));
		const mag = CONFIG.U_BURST * F * Math.exp(-dDisk / (CONFIG.L_BURST * n.reach));
		out.x += (sx / sl) * mag;
		out.y += (sy / sl) * mag;
		out.z += (sz / sl) * mag;
	}

	// ---- jet: lateral drive P + convergence C₊ (flux law) --------------------
	{
		const ax = n.P.x;
		const ay = Math.max(n.C, 0);
		const az = n.P.y;
		const a = Math.hypot(ax, ay, az);
		if (a > 1e-3) {
			const dx = ax / a,
				dy = ay / a,
				dz = az / a;
			const s = px * dx + h * dy + pz * dz; // along-axis coordinate
			if (s > -CONFIG.JET_BACK) {
				const ox = px - s * dx,
					oy = h - s * dy,
					oz = pz - s * dz;
				const rPerp = Math.hypot(ox, oy, oz);
				const envR =
					1 - smoothstep(CONFIG.JET_RADIUS / F, (CONFIG.JET_RADIUS + CONFIG.JET_SOFT) / F, rPerp);
				const range = CONFIG.L_JET * n.reach * (0.4 + 0.6 * a);
				// upstream edge must fade, not switch: a hard cutoff seams the plume
				const envS = Math.exp(-Math.max(0, s) / range) * smoothstep(-CONFIG.JET_BACK, 0, s);
				const mag = CONFIG.U_COLUMN * a * F * envR * envS;
				out.x += dx * mag;
				out.y += dy * mag;
				out.z += dz * mag;
			}
		}
	}

	// ---- fan: divergence D = C₋ (inverted columns / dispersion mode) --------
	{
		const D = Math.max(-n.C, 0);
		if (D > 1e-3 && rho > 1e-3) {
			const env =
				Math.exp(-Math.max(0, h) / (CONFIG.FAN_H / F)) *
				smoothstep(0.3, 0.85, rho) *
				Math.exp(-Math.max(0, rho - 1) / (CONFIG.FAN_RANGE * n.reach));
			const mag = CONFIG.U_COLUMN * D * F * env;
			out.x += (px / rho) * mag;
			out.z += (pz / rho) * mag;
		}
	}

	// ---- swirl: circulation Γ ------------------------------------------------
	{
		if (Math.abs(n.gamma) > 1e-3 && rho > 1e-3) {
			const env =
				Math.exp(-Math.max(0, h) / (CONFIG.SWIRL_H / F)) *
				smoothstep(0.1, 0.6, Math.min(rho, 1)) *
				Math.exp(-Math.max(0, rho - 1.15) / 0.5);
			const mag = CONFIG.U_COLUMN * n.gamma * F * env;
			// t̂ = ŷ × ρ̂  (counter-clockwise seen from above)
			out.x += (-pz / rho) * mag;
			out.z += (px / rho) * mag;
		}
	}

	// ---- levitation: the force pair's grip on the zone above the seal (§6) --
	if (n.lev) {
		const lev = n.lev;
		if (lev.grip) {
			// holdable blob: damped spring toward the hover locus X₀ — off inside
			// the blob radius (the ball churns; recapture is emergent, no burst rule)
			const Cg = Math.max(lev.C, 0);
			if (Cg > 1e-3) {
				const dx = lev.x0.x - px;
				const dy = lev.h0 - h;
				const dz = lev.x0.y - pz;
				const d = Math.hypot(dx, dy, dz);
				if (d > 1e-4) {
					// the lens shrinks the churn room (§8): a focused ball is smaller
					const on = smoothstep(CONFIG.BLOB_R / F, CONFIG.BLOB_R / F + CONFIG.BLOB_SOFT, d);
					// the pair grips the whole zone above the seal (§6): the plateau
					// always reaches the rim, however high the locus sits — otherwise
					// the burst outruns a far-hovering ball's grip and sprays a skirt
					const capR = Math.max(CONFIG.CAP_R, Math.hypot(1, lev.h0));
					const zone = Math.exp(-Math.max(0, d - capR) / CONFIG.CAP_FALL);
					const mag = CONFIG.U_HOLD * Cg * F * on * zone;
					out.x += (dx / d) * mag;
					out.y += (dy / d) * mag;
					out.z += (dz / d) * mag;
				}
				// torque: Γ_lev spins the held mass about the hover axis (rotor)
				if (Math.abs(lev.gamma) > 1e-3) {
					const ax = px - lev.x0.x;
					const az = pz - lev.x0.y;
					const arho = Math.hypot(ax, az);
					if (arho > 1e-3) {
						const denv = Math.hypot(ax, h - lev.h0, az);
						const mag = CONFIG.U_HOLD * lev.gamma * F * Math.exp(-denv / (CONFIG.SPIN_FALL / F));
						out.x += (-az / arho) * mag;
						out.z += (ax / arho) * mag;
					}
				}
			}
		} else {
			// streaming medium (wind): the grip pumps it — wash tube from the disk
			// along W = C₊ẑ − P_lev; the substrate reaction is the thrust readout
			const wx = -lev.P.x;
			const wy = Math.max(lev.C, 0);
			const wz = -lev.P.y;
			const wmag = Math.hypot(wx, wy, wz);
			if (wmag > 1e-3) {
				const dx = wx / wmag,
					dy = wy / wmag,
					dz = wz / wmag;
				const s = px * dx + h * dy + pz * dz;
				if (s > -CONFIG.JET_BACK) {
					const ox = px - s * dx,
						oy = h - s * dy,
						oz = pz - s * dz;
					const rPerp = Math.hypot(ox, oy, oz);
					// the sylph strut (§8): a focused wash is a narrow, stiff column
					const envR =
						1 - smoothstep(CONFIG.JET_RADIUS / F, (CONFIG.JET_RADIUS + CONFIG.JET_SOFT) / F, rPerp);
					const range = CONFIG.L_JET * n.reach * (0.4 + 0.6 * wmag);
					const envS = Math.exp(-Math.max(0, s) / range) * smoothstep(-CONFIG.JET_BACK, 0, s);
					const mag = CONFIG.U_WASH * wmag * F * envR * envS;
					out.x += dx * mag;
					out.y += dy * mag;
					out.z += dz * mag;
				}
			}
		}
	}

	// ---- region gating: clip + bias + conserve (transport does the rest) ----
	p2.x = px;
	p2.y = pz;
	let mask = 1;
	if (n.gates.length > 0) {
		applyExhaust(n, px, pz, rho, out);
		// fences attenuate whatever sits behind them
		mask = maskAt(n, p2);
		const att = CONFIG.MASK_FLOOR + (1 - CONFIG.MASK_FLOOR) * mask;
		out.multiplyScalar(att);
	}

	// ---- disk wall: no flow through the seal from above ----------------------
	if (h < 0.02 && rho < 1 && out.y < 0) out.y = 0;

	return mask;
}

/**
 * The §5 exhaust pipeline (clip → bias → conserve), shared by the own-magic
 * field and the pull field: region gates the spell's magic wherever it acts,
 * including its long arm on ambient matter (§7 ruling). Mask attenuation is
 * NOT part of this — masks never apply to foreign matter.
 */
function applyExhaust(n: Nozzle, px: number, pz: number, rho: number, out: THREE.Vector3): void {
	const speed0 = out.length();
	if (speed0 <= 1e-6) return;
	p2.x = px;
	p2.y = pz;
	const gov = governing(n, p2, scratchGov);
	for (const g of gov) {
		const bias =
			speed0 * Math.min(CONFIG.CH_BIAS + CONFIG.CH_BIAS_STAGE * (g.count - 1), CONFIG.CH_BIAS_MAX);
		// clip against every fence first, then push with the unit's NET bias —
		// a pinch's opposed fences must cancel each other's push exactly, so a
		// fully pinched point exhausts vertically instead of drifting sideways
		let bx = 0;
		let bz = 0;
		for (const f of g.fences) {
			// effective fence direction at this point
			let ux: number, uz: number;
			if (f.kind === 'planar') {
				ux = f.dir.x;
				uz = f.dir.y;
			} else if (rho > 1e-3) {
				const sgn = f.kind === 'radialOut' ? 1 : -1;
				ux = (sgn * px) / rho;
				uz = (sgn * pz) / rho;
			} else {
				continue;
			}
			// 1. clip the backward component
			const c = out.x * ux + out.z * uz;
			if (c < 0) {
				out.x -= c * ux;
				out.z -= c * uz;
			}
			// 2. accumulate channeling bias
			bx += ux * bias;
			bz += uz * bias;
		}
		out.x += bx;
		out.z += bz;
	}
	// 3. conservation: blocked budget re-exits through what is open
	const l = out.length();
	if (l < 1e-5)
		out.set(0, speed0, 0); // fully blocked → vertical exhaust
	else out.multiplyScalar(speed0 / l);
}

/**
 * The pull field u_amb(X) — GROUND_TRUTH §7. Acts ONLY on the ambient medium
 * population; the spell's own magic never feels it (and vice versa).
 * `throttle` is the grasp capacitor state, 1 (empty) → 0 (charged), owned by
 * the population that carries the grasped count.
 */
export function sampleAmbientVelocity(
	n: Nozzle,
	pos: THREE.Vector3,
	out: THREE.Vector3,
	throttle = 1
): void {
	out.set(0, 0, 0);
	const pull = n.pull;
	if (!pull || throttle <= 0) return;
	const px = pos.x;
	const h = pos.y;
	const pz = pos.z;
	const rho = Math.hypot(px, pz);
	// §8 seal-wide lens ruling: u_amb is the spell's own magic acting at a
	// distance, so the lens focuses it like every other emission
	const F = n.focus;

	// ---- sink / push: the signed burst kernel (§3's geometry, reversed) ------
	if (Math.abs(pull.C) > 1e-3) {
		let vx = px;
		let vy = h + CONFIG.H_VIRTUAL;
		let vz = pz;
		const vl = Math.hypot(vx, vy, vz) || 1;
		vx /= vl;
		vy /= vl;
		vz /= vl;
		// pinch the kernel toward the seal axis LINE: a focused sink inhales down
		// a narrow vertical throat, a focused push is a converging plume
		if (n.Q > 1e-3) {
			const axial = CONFIG.CONV_AXIAL * Math.min(rho, 1);
			let tx = 0;
			let ty = 1;
			let tz = 0;
			if (rho > 1e-4) {
				tx -= (px / rho) * axial;
				tz -= (pz / rho) * axial;
			}
			const tl = Math.hypot(tx, ty, tz) || 1;
			const k = CONFIG.CONV_PINCH * n.Q;
			vx += (k * tx) / tl;
			vy += (k * ty) / tl;
			vz += (k * tz) / tl;
			const l = Math.hypot(vx, vy, vz) || 1;
			vx /= l;
			vy /= l;
			vz /= l;
		}
		const dDisk = Math.hypot(Math.max(0, rho - 1), Math.max(0, h));
		// minus: C_p > 0 (arrows inward) reverses the kernel into an inflow
		const mag = -CONFIG.U_PULL * pull.C * F * Math.exp(-dDisk / (CONFIG.L_PULL * n.reach));
		out.x += vx * mag;
		out.y += vy * mag;
		out.z += vz * mag;
	}

	// ---- conveyor: drag slab along ±P̂ — catch upstream, deliver downstream --
	{
		const pmag = Math.hypot(pull.P.x, pull.P.y);
		if (pmag > 1e-3) {
			const dx = pull.P.x / pmag;
			const dz = pull.P.y / pmag;
			const s = px * dx + pz * dz;
			const ox = px - s * dx;
			const oz = pz - s * dz;
			const rPerp = Math.hypot(ox, h, oz);
			const envR =
				1 -
				smoothstep(CONFIG.PULL_SLAB_R / F, (CONFIG.PULL_SLAB_R + CONFIG.PULL_SLAB_SOFT) / F, rPerp);
			const envS = Math.exp(-Math.abs(s) / (CONFIG.L_PULL_SLAB * n.reach));
			const mag = CONFIG.U_PULL * pmag * F * envR * envS;
			out.x += dx * mag;
			out.z += dz * mag;
		}
	}

	// ---- twist: ambient swirl Γ_p (same envelope shape as the column swirl) --
	if (Math.abs(pull.gamma) > 1e-3 && rho > 1e-3) {
		const env =
			Math.exp(-Math.max(0, h) / (CONFIG.SWIRL_H / F)) *
			smoothstep(0.1, 0.6, Math.min(rho, 1)) *
			Math.exp(-Math.max(0, rho - 1.15) / 0.5);
		const mag = CONFIG.U_PULL * pull.gamma * F * env;
		out.x += (-pz / rho) * mag;
		out.z += (px / rho) * mag;
	}

	// ---- capacitor throttle: the pull dies away as the grasp charges ---------
	if (throttle < 1) out.multiplyScalar(throttle);

	// ---- region gates the field, not the matter (§7 ruling): exhaust only ----
	if (n.gates.length > 0) applyExhaust(n, px, pz, rho, out);

	// ---- disk wall: arriving matter stagnates — the grasp pools here ---------
	if (h < 0.02 && rho < 1 && out.y < 0) out.y = 0;
}
