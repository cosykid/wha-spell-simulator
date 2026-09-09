/** @file Material coordinates deform one finite solid sample into a flexible band. */
import type { Vec3 } from '../../types.js';
import { flowRibbonPoint, type RibbonCurrent } from './flowRibbon.js';

export interface RibbonFlow {
	length: number;
	width: number;
	/** 0 is the contact sample, 1 is the stretched demonstration shape. */
	stretch: number;
	materialCount: number;
	current?: RibbonCurrent;
}

/** u runs along the sample; v and w cross its width and thickness (-1..1). */
export function ribbonPoint(ribbon: RibbonFlow, u: number, v: number, w: number, out: Vec3): void {
	if (ribbon.current) {
		flowRibbonPoint(ribbon.current, ribbon.width, u, v, w, out);
		return;
	}
	const pull = ribbon.stretch;
	const length = 0.75 + (ribbon.length - 0.75) * pull;
	const s = u * length;
	const bend = Math.sin(u * Math.PI);
	const wave = Math.sin(u * Math.PI * 2);
	const twist = 1.1 + 0.55 * bend;
	const across = v * ribbon.width * 0.5;
	const sampleAcross = v * 0.325;
	// Stretching redistributes the sample instead of feeding a growing plume.
	const thickness = (w * 0.22 * 0.75) / length;
	// One relaxed S bend shows the softened material's broad face. Its pose is
	// the demonstration's pull, not an autonomous coil or a sign direction.
	const tangentX = length * 0.42 + 0.7 * Math.PI * Math.cos(u * Math.PI * 2);
	const tangentZ = length * 0.78 + 0.2 * Math.PI * Math.cos(u * Math.PI);
	const magnitude = Math.hypot(tangentX, tangentZ);
	const tx = tangentX / magnitude,
		tz = tangentZ / magnitude;
	const face = Math.sin(twist),
		edge = Math.cos(twist);
	const stretchedX = -0.375 + s * 0.42 + 0.35 * wave + across * tz * face - thickness * tz * edge;
	const stretchedY = across * edge + thickness * face;
	const stretchedZ = 0.25 + s * 0.78 + 0.2 * bend - across * tx * face + thickness * tx * edge;
	const sampleX = (u - 0.5) * 0.75;
	out.x = sampleX + (stretchedX - sampleX) * pull;
	out.y = sampleAcross + (stretchedY - sampleAcross) * pull;
	out.z = 0.25 + w * 0.22 + (stretchedZ - 0.25 - w * 0.22) * pull;
}

const behind = { x: 0, y: 0, z: 0 };
const ahead = { ...behind };
const edge = { ...behind };

/** The shared skin flattens along the surface as the solid is stretched. */
export function ribbonNormal(ribbon: RibbonFlow, u: number, out: Vec3): void {
	ribbonPoint(ribbon, Math.max(0, u - 0.005), 0, 0, behind);
	ribbonPoint(ribbon, Math.min(1, u + 0.005), 0, 0, ahead);
	ribbonPoint(ribbon, Math.min(1, u + 0.005), 1, 0, edge);
	const tx = ahead.x - behind.x,
		ty = ahead.y - behind.y,
		tz = ahead.z - behind.z;
	const wx = edge.x - ahead.x,
		wy = edge.y - ahead.y,
		wz = edge.z - ahead.z;
	const nx = ty * wz - tz * wy,
		ny = tz * wx - tx * wz,
		nz = tx * wy - ty * wx;
	const length = Math.hypot(nx, ny, nz) || 1;
	out.x = nx / length;
	out.y = ny / length;
	out.z = nz / length;
}
