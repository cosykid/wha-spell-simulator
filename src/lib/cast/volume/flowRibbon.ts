/** @file One continuous band flowing along an arch, stream, orbit or luminous loop. */
import type { Vec3, WeaveCurrentParams } from '../../types.js';

export interface RibbonCurrent extends WeaveCurrentParams {
	phase: number;
	open: number;
	attachment: number;
}

const TAU = Math.PI * 2;
const PATHS: Record<WeaveCurrentParams['path'], (c: RibbonCurrent, u: number, out: Vec3) => void> =
	{
		arch(c, u, out) {
			const rise = Math.sin(u * Math.PI);
			out.x = c.span * (2 * u - 1);
			out.y = c.wave * Math.sin(u * TAU * c.waves - c.phase) * rise;
			out.z = 0.22 + c.height * rise + c.wave * 0.5 * Math.cos(u * TAU * c.waves - c.phase) * rise;
		},
		stream(c, u, out) {
			out.x = c.span * u + c.wave * Math.sin(u * TAU * c.waves - c.phase) * u;
			out.y = c.wave * 0.45 * Math.cos(u * TAU - c.phase * 0.7) * u;
			out.z = 0.18 + c.height * u;
		},
		orbit(c, u, out) {
			const angle = u * TAU * 0.88 + c.phase * 0.25;
			const radius = c.span + c.wave * Math.sin(u * TAU * c.waves - c.phase);
			out.x = radius * Math.cos(angle);
			out.y = radius * Math.sin(angle);
			out.z = 0.3 + c.height * u + c.wave * Math.sin(u * TAU - c.phase);
		},
		loop(c, u, out) {
			const angle = u * TAU;
			out.x = (c.span + c.wave * Math.sin(angle - c.phase)) * Math.sin(angle);
			out.y = 0;
			out.z = 0.22 + c.height * (1 - Math.cos(angle)) * 0.5;
		}
	};

const center = { x: 0, y: 0, z: 0 };
const ahead = { ...center },
	behind = { ...center };

export function currentPulse(current: RibbonCurrent, u: number): number {
	return Math.pow(0.5 + 0.5 * Math.cos(u * TAU - current.phase), 8);
}

export function flowRibbonPoint(
	c: RibbonCurrent,
	width: number,
	u: number,
	v: number,
	w: number,
	out: Vec3
): void {
	const path = PATHS[c.path];
	path(c, u, center);
	path(c, Math.max(0, u - 0.005), behind);
	path(c, Math.min(1, u + 0.005), ahead);
	const tx = ahead.x - behind.x,
		ty = ahead.y - behind.y,
		tz = ahead.z - behind.z;
	// Cross the tangent with the viewing direction for a readable broad face.
	const projected = Math.hypot(tx, tz);
	const wx = projected > 1e-6 ? tz / projected : 1;
	const wz = projected > 1e-6 ? -tx / projected : 0;
	const nx = ty * wz,
		ny = tz * wx - tx * wz,
		nz = -ty * wx;
	const normal = Math.hypot(nx, ny, nz) || 1;
	const pulse = 1 + c.pulse * currentPulse(c, u) * 0.8;
	const across = v * width * 0.5 * (1 - c.taper * u) * pulse;
	const thickness = w * 0.025;
	out.x = (center.x + across * wx + (thickness * nx) / normal) * c.open;
	out.y = (center.y + (thickness * ny) / normal) * c.open;
	out.z = Math.max(0.04, 0.1 + (center.z - 0.1 + across * wz + (thickness * nz) / normal) * c.open);
}
