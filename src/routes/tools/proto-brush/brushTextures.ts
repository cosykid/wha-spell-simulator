/**
 * @file The brush stamps, painted once into a single 2x2 atlas.
 *
 * Every stamp is a spine, a width profile, and a crowd of tapered bristle sweeps
 * laid along it at varying alpha. Nothing is drawn as a whole shape and nothing
 * is punched out with holes, because both read as geometry; the ragged edge here
 * comes from the margin of the sweep crowd running dry, the way a real mark
 * frays. Each stamp then meets a lumpy organic mask, so no stamp ever carries
 * energy to its quad border and the mass can never show a rectangle.
 *
 * The stamps are luminance masks (white on transparent); the mesh tints them per
 * stroke, so four stamps carry the entire palette.
 */

import * as THREE from 'three';
import { mulberry32, type Rng } from '$lib/cast/rng.js';

/** Atlas cell, in the order the stamps are painted. */
export const BRUSH_SLOT = {
	streak: 0,
	lick: 1,
	wash: 2,
	soot: 3
} as const;

export type BrushSlot = (typeof BRUSH_SLOT)[keyof typeof BRUSH_SLOT];

/** Side of one cell, in texels. Four cells make a 1024px atlas. */
const CELL = 512;
const MID = CELL / 2;

/** The uv rect of a slot, optionally mirrored: `[u0, v0, u1, v1]`. */
export function slotUv(slot: BrushSlot, flip: number): [number, number, number, number] {
	const u0 = (slot % 2) * 0.5;
	const v0 = slot < 2 ? 0.5 : 0;
	const u = flip & 1 ? [u0 + 0.5, u0] : [u0, u0 + 0.5];
	const v = flip & 2 ? [v0 + 0.5, v0] : [v0, v0 + 0.5];
	return [u[0], v[0], u[1], v[1]];
}

function ink(alpha: number): string {
	return `rgba(255,255,255,${alpha.toFixed(3)})`;
}

function between(rng: Rng, min: number, max: number): number {
	return min + rng() * (max - min);
}

/** Signed unit sample bunched toward zero, so a sweep crowd is dense in its core. */
function bunched(rng: Rng): number {
	return (rng() + rng() + rng() - 1.5) / 1.5;
}

interface Spine {
	/** Point on the spine at `t` in 0..1. */
	at: (t: number) => { x: number; y: number };
	/** Half-width of the mark at `t`, in texels. */
	width: (t: number) => number;
}

/**
 * One bristle sweep: a tapered line following the spine at a fixed fraction of
 * its width, drawn in short segments so it can run dry mid-stroke.
 */
function sweep(
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
function crowd(
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
function organicMask(rng: Rng, rx: number, ry: number): HTMLCanvasElement {
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

/** Dry streak: one long sweep of a loaded brush, thinning to a dry tail. */
function paintStreak(ctx: CanvasRenderingContext2D, rng: Rng): void {
	const spine: Spine = {
		at: (t) => ({
			x: 0.06 * CELL + 0.88 * CELL * t,
			y: MID + Math.sin(t * 2.4 - 0.5) * 30 - 14 * t
		}),
		width: (t) => 74 * (0.35 + 0.65 * Math.sin(Math.PI * t ** 0.55)) * (1 - 0.72 * t ** 2.4)
	};
	crowd(ctx, rng, spine, 58, 0.5);
	// A dry tail: a few marks that carry past where the pigment ran out.
	for (let i = 0; i < 12; i += 1) {
		sweep(ctx, rng, spine, bunched(rng) * 1.4, between(rng, 0.08, 0.22), 0.55, 1);
	}
}

/** Flame lick: a wide-footed tongue tapering to a curling needle, with splits. */
function paintLick(ctx: CanvasRenderingContext2D, rng: Rng): void {
	const spine: Spine = {
		at: (t) => ({
			x: 0.05 * CELL + 0.9 * CELL * t,
			y: MID + 92 * t * t - 34 * t + Math.sin(t * 5.1) * 13
		}),
		// Blunted rather than needled: a tongue of pigment tears off, it does not
		// come to a point, and a crowd of points reads as a bouquet of blades.
		width: (t) => 108 * (1 - t) ** 0.72 * (0.55 + 0.45 * Math.sin(Math.PI * t ** 0.4)) + 4
	};
	crowd(ctx, rng, spine, 96, 0.42);

	for (let i = 0; i < 3; i += 1) {
		const root = between(rng, 0.26, 0.66);
		const base = spine.at(root);
		const lift = between(rng, -1.15, -0.25);
		const reach = between(rng, 0.26, 0.46) * CELL;
		const branch: Spine = {
			at: (t) => ({
				x: base.x + Math.cos(lift) * reach * t,
				y: base.y + Math.sin(lift) * reach * t - Math.sin(t * 2.6) * 22
			}),
			width: (t) => spine.width(root) * 0.5 * (1 - t) ** 1.3 + 1.5
		};
		crowd(ctx, rng, branch, 22, 0.34);
	}
}

/** Soft wash: a lumpy pool of thin pigment, granulating toward its rim. */
function paintWash(ctx: CanvasRenderingContext2D, rng: Rng): void {
	const base = MID * 0.72;
	const p1 = rng() * 6.28;
	const p2 = rng() * 6.28;
	const bound = (angle: number) =>
		base * (0.82 + 0.24 * Math.sin(angle * 3 + p1) + 0.14 * Math.sin(angle * 6 + p2));

	// Lumps rather than one disc: the pool is where several dabs pooled together.
	for (let i = 0; i < 30; i += 1) {
		const angle = rng() * Math.PI * 2;
		const reach = rng() ** 0.4;
		const x = MID + Math.cos(angle) * bound(angle) * reach;
		const y = MID + Math.sin(angle) * bound(angle) * reach;
		const r = base * between(rng, 0.35, 0.72);
		const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
		const peak = between(rng, 0.07, 0.17);
		grad.addColorStop(0, ink(peak));
		grad.addColorStop(0.6, ink(peak * 0.45));
		grad.addColorStop(1, ink(0));
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}

	// Drag marks, so the pool shows the brush that laid it. Each one is offset off
	// the middle, or they would all cross there and read as a starburst.
	for (let i = 0; i < 16; i += 1) {
		const angle = rng() * Math.PI * 2;
		const span = bound(angle) * between(rng, 0.5, 0.95);
		const offAngle = angle + Math.PI / 2;
		const offset = bunched(rng) * base * 0.62;
		const cx = MID + Math.cos(offAngle) * offset;
		const cy = MID + Math.sin(offAngle) * offset;
		const drag: Spine = {
			at: (t) => ({
				x: cx + Math.cos(angle) * span * (t * 2 - 1),
				y: cy + Math.sin(angle) * span * (t * 2 - 1)
			}),
			width: () => base * 0.24
		};
		crowd(ctx, rng, drag, 3, 0.085);
	}

	// Granulation: pigment settling at the rim of a drying pool.
	for (let i = 0; i < 300; i += 1) {
		const angle = rng() * Math.PI * 2;
		const reach = 0.45 + 0.6 * rng() ** 0.35;
		ctx.fillStyle = ink(between(rng, 0.05, 0.26));
		ctx.beginPath();
		ctx.arc(
			MID + Math.cos(angle) * bound(angle) * reach,
			MID + Math.sin(angle) * bound(angle) * reach,
			between(rng, 1.4, 6),
			0,
			Math.PI * 2
		);
		ctx.fill();
	}
}

/** Soot smudge: charcoal dragged sideways with the heel of the hand. */
function paintSoot(ctx: CanvasRenderingContext2D, rng: Rng): void {
	for (let i = 0; i < 26; i += 1) {
		const tilt = between(rng, -0.42, 0.42);
		const y = MID + bunched(rng) * 120;
		const span = between(rng, 0.42, 0.86) * CELL * 0.5;
		const drag: Spine = {
			at: (t) => ({
				x: MID + (t * 2 - 1) * span,
				y: y + Math.sin(tilt) * (t * 2 - 1) * span + Math.sin(t * 3.3) * 14
			}),
			width: () => between(rng, 26, 62)
		};
		crowd(ctx, rng, drag, 5, 0.075);
	}
	for (let i = 0; i < 1400; i += 1) {
		const angle = rng() * Math.PI * 2;
		const reach = MID * 0.7 * rng() ** 0.42;
		ctx.fillStyle = ink(between(rng, 0.02, 0.11));
		ctx.fillRect(MID + Math.cos(angle) * reach, MID + Math.sin(angle) * reach * 0.8, 3, 3);
	}
}

/** Painter and the half-extents of the mask that trims it, per slot. */
const STAMPS: ReadonlyArray<{
	paint: (ctx: CanvasRenderingContext2D, rng: Rng) => void;
	rx: number;
	ry: number;
}> = [
	{ paint: paintStreak, rx: 0.46, ry: 0.17 },
	{ paint: paintLick, rx: 0.45, ry: 0.29 },
	{ paint: paintWash, rx: 0.4, ry: 0.38 },
	{ paint: paintSoot, rx: 0.43, ry: 0.33 }
];

/**
 * Paints all four stamps into one texture.
 *
 * @example
 * const atlas = createBrushAtlas();
 * material.uniforms.uMap.value = atlas;
 */
export function createBrushAtlas(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = CELL * 2;
	canvas.height = CELL * 2;
	const ctx = canvas.getContext('2d')!;
	const rng = mulberry32(0x51a1e);

	STAMPS.forEach((stamp, slot) => {
		ctx.save();
		ctx.translate((slot % 2) * CELL, slot < 2 ? 0 : CELL);
		ctx.beginPath();
		ctx.rect(0, 0, CELL, CELL);
		ctx.clip();
		stamp.paint(ctx, rng);
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage(organicMask(rng, stamp.rx * CELL, stamp.ry * CELL), 0, 0);
		ctx.restore();
	});

	const texture = new THREE.CanvasTexture(canvas);
	// No mipmaps: the stamps are magnified on screen, and a mip chain would bleed
	// one atlas cell into the next.
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}
