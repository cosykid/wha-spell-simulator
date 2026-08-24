/**
 * @file How a mark is made: a spine, a crowd of tapered bristle sweeps laid
 * along it, and the lumpy mask that keeps the crowd off its own quad border.
 *
 * Nothing is drawn as a whole shape and nothing is punched out with holes,
 * because both read as geometry; the ragged edge comes from the margin of the
 * sweep crowd running dry, the way a real mark frays.
 */

import type { Rng } from '../rng.js';

/** Side of one atlas cell, in texels. Four cells make a 1024px atlas. */
export const CELL = 512;
export const MID = CELL / 2;

/** White ink at an alpha, the only colour the stamps are painted in. */
export function ink(alpha: number): string {
	return `rgba(255,255,255,${alpha.toFixed(3)})`;
}

export function between(rng: Rng, min: number, max: number): number {
	return min + rng() * (max - min);
}

/** Signed unit sample bunched toward zero, so a sweep crowd is dense in its core. */
export function bunched(rng: Rng): number {
	return (rng() + rng() + rng() - 1.5) / 1.5;
}

/** The path a mark is dragged along, and how wide the brush is at each point. */
export interface Spine {
	/** Point on the spine at `t` in 0..1. */
	at: (t: number) => { x: number; y: number };
	/** Half-width of the mark at `t`, in texels. */
	width: (t: number) => number;
}

/**
 * One bristle sweep: a tapered line following the spine at a fixed fraction of
 * its width, drawn in short segments so it can run dry mid-stroke.
 */
export function sweep(
	ctx: CanvasRenderingContext2D,
	rng: Rng,
	spine: Spine,
	offset: number,
	alpha: number,
	from: number,
	to: number
): void {
	const steps = 30;
	const drift = between(rng, -0.16, 0.16);
	const grip = between(rng, 0.7, 1.25);
	// The margin of the crowd runs dry: the further from the core, the more of
	// the sweep is missing, which is where the frayed edge comes from.
	const dryness = 0.14 + 0.5 * Math.abs(offset) ** 2;
	const place = (t: number) => {
		const at = spine.at(t);
		const half = spine.width(t) * grip;
		const ahead = spine.at(Math.min(1, t + 0.02));
		const dx = ahead.x - at.x;
		const dy = ahead.y - at.y;
		const len = Math.hypot(dx, dy) || 1;
		const push = (offset + drift * Math.sin(t * 4.7)) * half;
		return { x: at.x - (dy / len) * push, y: at.y + (dx / len) * push };
	};

	ctx.lineCap = 'round';
	for (let i = 0; i < steps; i += 1) {
		const t = from + ((to - from) * i) / steps;
		if (rng() < dryness) {
			continue;
		}
		const head = place(t);
		const tail = place(t + ((to - from) * 1.4) / steps);
		const along = (t - from) / (to - from || 1);
		// Tapered at both ends, so a sweep is a mark and not a segment.
		const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, along))) ** 0.42;
		ctx.strokeStyle = ink(alpha * taper * (1 - Math.abs(offset) * 0.55) * between(rng, 0.55, 1));
		ctx.lineWidth = spine.width(t) * between(rng, 0.07, 0.19) + 1.2;
		ctx.beginPath();
		ctx.moveTo(head.x, head.y);
		ctx.lineTo(tail.x, tail.y);
		ctx.stroke();
	}
}

/** Lays `count` sweeps across the spine, bunched toward its core. */
export function crowd(
	ctx: CanvasRenderingContext2D,
	rng: Rng,
	spine: Spine,
	count: number,
	alpha: number
): void {
	for (let i = 0; i < count; i += 1) {
		const from = rng() < 0.55 ? 0 : between(rng, 0, 0.4);
		const to = rng() < 0.6 ? 1 : between(rng, 0.55, 1);
		sweep(ctx, rng, spine, bunched(rng), alpha * between(rng, 0.5, 1), from, to);
	}
}

/**
 * A lumpy soft-edged silhouette, built as the union of overlapping dabs so its
 * border is organic in every direction. Composited `destination-in`, it is what
 * guarantees a stamp fades out before its quad edge.
 */
export function organicMask(rng: Rng, rx: number, ry: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = CELL;
	canvas.height = CELL;
	const ctx = canvas.getContext('2d')!;
	const p1 = rng() * 6.28;
	const p2 = rng() * 6.28;
	const dab = Math.min(rx, ry) * 0.55;

	for (let i = 0; i < 220; i += 1) {
		const angle = rng() * Math.PI * 2;
		const lump = 0.72 + 0.2 * Math.sin(angle * 3 + p1) + 0.11 * Math.sin(angle * 5 + p2);
		const reach = rng() ** 0.45;
		const x = MID + Math.cos(angle) * rx * lump * reach;
		const y = MID + Math.sin(angle) * ry * lump * reach;
		const r = dab * between(rng, 0.7, 1.3);
		const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
		grad.addColorStop(0, 'rgba(255,255,255,1)');
		grad.addColorStop(0.45, 'rgba(255,255,255,0.62)');
		grad.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	return canvas;
}
