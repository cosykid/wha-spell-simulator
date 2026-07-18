/**
 * The twist channels' vortex structure (GROUND_TRUTH §7 canon check —
 * helical inflow, the apple-plucking vortex; §13 pinwheel prediction).
 * Circulation is not a flat stir: it is a Rankine column with a secondary
 * cell — floor inflow feeding a rising funnel-wall updraft that spills out
 * and down at the crown, so matter cycles through the whirl instead of
 * orbiting a flat merry-go-round. Shared by the own-magic swirl (columns)
 * and the ambient twist (pulls); the channels differ only in speed scale U.
 * Transport only: nothing here stores — the capacitor rulings are untouched.
 */
import { CONFIG } from './config';
import { smoothstep } from './math2';

interface V3 {
	x: number;
	y: number;
	z: number;
}

/** Crown height a circulation γ can raise (seal units; 0 = no column). */
export function vortexHeight(gamma: number): number {
	return CONFIG.TWIST_H * Math.min(1, Math.abs(gamma) / CONFIG.TWIST_FULL);
}

/** Funnel core radius at height y: a tight foot flaring toward the crown. */
export function vortexCoreR(y: number, H: number, F: number): number {
	const s = H > 0 ? Math.min(1, Math.max(0, y / H)) : 0;
	return (CONFIG.TWIST_R0 + (CONFIG.TWIST_R1 - CONFIG.TWIST_R0) * s) / F;
}

/** Solid-body spin rate of the funnel wall — a renderer's whirl phase rate. */
export function vortexOmega(gamma: number, F: number, U: number): number {
	const H = vortexHeight(gamma);
	if (H <= 1e-3) return 0;
	const rc = vortexCoreR(H * 0.5, H, F);
	const omega = (U * gamma * F) / Math.max(rc, 1e-3);
	return Math.max(-CONFIG.TWIST_OMEGA_MAX, Math.min(CONFIG.TWIST_OMEGA_MAX, omega));
}

/**
 * Add one twist channel's velocity at (px, h, pz) into `out`.
 * `U` is the channel's speed scale (own swirl: U_COLUMN; ambient twist:
 * U_PULL); the geometry below is shared. γ keeps its sign on the tangential
 * term (turn sense); the secondary cell reads |γ|.
 */
export function addVortex(
	out: V3,
	px: number,
	h: number,
	pz: number,
	rho: number,
	gamma: number,
	F: number,
	U: number
): void {
	if (Math.abs(gamma) <= 1e-3) return;
	const H = vortexHeight(gamma);
	if (H <= 1e-3) return;
	const s = Math.max(0, h) / H;
	const rc = vortexCoreR(h, H, F);
	const base = U * F;
	const mag = Math.abs(gamma);

	// ---- tangential: Rankine profile on the funnel wall ---------------------
	// solid-body inside the core, 1/ρ tail outside; the far tail keeps the old
	// ring cutoff so a seal stirs its surroundings, not the whole room. Spin
	// persists a little past the crown so spilling matter exits on a curve.
	if (rho > 1e-3) {
		const rankine = rho <= rc ? rho / rc : (rc / rho) * Math.exp(-Math.max(0, rho - 1.15) / 0.5);
		const fadeTop = 1 - smoothstep(0.85, 1.25, s);
		const t = base * gamma * rankine * fadeTop;
		out.x += (-pz / rho) * t;
		out.z += (px / rho) * t;
	}

	// ---- updraft: the funnel wall rises -------------------------------------
	// peaked on the wall (≈0.8·r_c), not the axis — the tornado is a climbing
	// sheath around a calmer eye, which is also where a renderer skins it
	{
		const wall = Math.exp(-(((rho - 0.8 * rc) / (0.7 * rc)) ** 2));
		const env = smoothstep(0, 0.12 * H, h) * (1 - smoothstep(0.88, 1.06, s));
		out.y += base * CONFIG.TWIST_LIFT * mag * wall * env;
	}

	// ---- floor inflow: the boundary layer feeds the foot --------------------
	// ground friction's secondary flow — matter spirals in along the floor and
	// hands off to the wall updraft where the band meets the core
	if (rho > 1e-3) {
		const bl = Math.exp(-Math.max(0, h) / CONFIG.TWIST_BL);
		const band = smoothstep(1.1 * rc, 2.2 * rc, rho) * Math.exp(-Math.max(0, rho - 1.35) / 0.6);
		const m = base * CONFIG.TWIST_FEED * mag * bl * band;
		out.x -= (px / rho) * m;
		out.z -= (pz / rho) * m;
	}

	// ---- crown spill: out and down, closing the cell ------------------------
	// the column sheds at the top instead of stranding matter mid-air; the
	// downward tilt starts the return leg the floor inflow finishes
	if (rho > 1e-3) {
		const env = smoothstep(0.9, 1.12, s) * (1 - smoothstep(1.3, 1.6, s));
		const rad = Math.exp(-((Math.max(0, rho - rc) / (1.6 * rc)) ** 2));
		const m = base * CONFIG.TWIST_SPILL * mag * env * rad;
		out.x += (px / rho) * m;
		out.z += (pz / rho) * m;
		out.y -= 0.45 * m;
	}
}
