/**
 * @file The sprite atlas: the little radial-gradient discs and streaks a parcel
 * is blitted from, baked once per (sprite, tint) and kept for the session.
 *
 * The redesign's Canvas2D ruling rests on this: the quality lever is sprite art
 * and compositing, not polygon count, and a few thousand `drawImage` calls of a
 * pre-baked texture are cheap where a few thousand gradient fills are not.
 *
 * Baking is a pure function of the look table, so the same look always produces
 * the same texture and a golden frame stays a baseline.
 *
 * @example
 * const sprite = spriteFor(look);
 * ctx.drawImage(sprite.image, -w / 2, -h / 2, w, h);
 */

import type { Look, Rgb, SpriteId, Tint } from '../looks/look.js';

const SPRITE = {
	/** Baked texture height in px. Sprites draw scaled, so this buys quality, not size. */
	texturePx: 64,
	/** How much wider than tall a `streak` is baked. */
	streakAspect: 3
} as const;

/** Where each sprite hands the core color over to the edge color, as a fraction of its radius. */
const CORE_STOP: Record<SpriteId, number> = {
	disc: 0.34,
	// A spark is mostly rim, which is what makes it read as a hot point rather
	// than as a small ball.
	spark: 0.12,
	streak: 0.28
};

/** Alpha at the handover, so the rim reads as a glow rather than as a drawn ring. */
const EDGE_ALPHA = 0.5;

const atlas = new Map<string, Sprite>();

/** A baked texture and the shape it was baked at. */
export interface Sprite {
	image: HTMLCanvasElement;
	/** Texture width over height. The painter multiplies a parcel's size by it. */
	aspect: number;
}

function rgba(color: Rgb, alpha: number): string {
	return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function atlasKey(sprite: SpriteId, tint: Tint): string {
	return `${sprite}:${tint.core.join()}:${tint.edge.join()}`;
}

function bake(sprite: SpriteId, tint: Tint): Sprite {
	const aspect = sprite === 'streak' ? SPRITE.streakAspect : 1;
	const height = SPRITE.texturePx;
	const width = height * aspect;
	const image = document.createElement('canvas');
	image.width = width;
	image.height = height;

	const ctx = image.getContext('2d')!;
	// Draw one circle under a horizontal stretch, so a streak is an ellipse with
	// the same falloff as a disc rather than a second gradient to keep in sync.
	ctx.translate(width / 2, height / 2);
	ctx.scale(aspect, 1);

	const radius = height / 2;
	const core = CORE_STOP[sprite];
	const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
	gradient.addColorStop(0, rgba(tint.core, 1));
	gradient.addColorStop(core, rgba(tint.core, 0.88));
	gradient.addColorStop((core + 1) / 2, rgba(tint.edge, EDGE_ALPHA));
	gradient.addColorStop(1, rgba(tint.edge, 0));
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(0, 0, radius, 0, Math.PI * 2);
	ctx.fill();

	return { image, aspect };
}

/** The look's texture, baked on first use. */
export function spriteFor(look: Look): Sprite {
	const key = atlasKey(look.sprite, look.tint);
	const baked = atlas.get(key);
	if (baked) {
		return baked;
	}
	const sprite = bake(look.sprite, look.tint);
	atlas.set(key, sprite);
	return sprite;
}
