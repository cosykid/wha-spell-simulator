/**
 * @file The whirl's snaking centerline: the fire tornado's axis is not a
 * plumb line — it wanders and whips, harder with height. Motes ride relative
 * to this centerline and every deposit gate measures from it, so the physics
 * (ambient3d), the spine (poolPlume) and the body gates (volume3d) all bend
 * together. Driven by the whirl phase, so a dying spell stops lashing.
 */
import { CONFIG } from '../core/config.js';

/** Lash amplitude at height y: grows super-linearly, clamped for the gates. */
export function swayAmp(y: number): number {
	return Math.min(CONFIG.SWAY_MAX, CONFIG.SWAY_A * Math.pow(Math.max(0, y), 1.3));
}

/** Centerline x at height y; incommensurate frequencies = wandering ellipse. */
export function swayX(y: number, phase: number): number {
	return swayAmp(y) * Math.sin(phase * 0.42 + y * 1.9);
}

/** Centerline z at height y. */
export function swayZ(y: number, phase: number): number {
	return swayAmp(y) * Math.cos(phase * 0.31 + y * 1.4);
}

/**
 * Nominal funnel-wall radius at height y for a vortex of crown height `height`:
 * the tornado narrows at the foot and flares to the crown. The mote ride, the
 * spine strands and every deposit gate share this taper, so a wide crown mote
 * still falls inside its gate and skins into the funnel instead of stranding.
 */
export function funnelR(y: number, height: number): number {
	const t = height > 0 ? Math.min(1, Math.max(0, y / height)) : 0;
	return CONFIG.VORTEX_R_BASE + (CONFIG.VORTEX_R_TOP - CONFIG.VORTEX_R_BASE) * t;
}
