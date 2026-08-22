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
	streakAspect: 3,
	/** How much longer than wide each of a `glint`'s two crossed lobes is baked. */
	glintLobeAspect: 4
} as const;

/** Where each sprite hands the core color over to the edge color, as a fraction of its radius. */
const CORE_STOP: Record<SpriteId, number> = {
	disc: 0.34,
	// A spark is mostly rim, which is what makes it read as a hot point rather
	// than as a small ball.
	spark: 0.12,
	streak: 0.28,
	glint: 0.1
};

/** Texture width over height. Only a `streak` is baked wider than it is tall. */
const ASPECT: Record<SpriteId, number> = {
	disc: 1,
	spark: 1,
	streak: SPRITE.streakAspect,
	glint: 1
};

/**
 * The scales the one gradient circle is drawn under, one entry per lobe. Keeping
 * a sprite a list of scaled draws rather than a list of gradients is what stops
 * a second falloff curve from drifting out of sync with the first.
 */
const LOBES: Record<SpriteId, ReadonlyArray<readonly [x: number, y: number]>> = {
	disc: [[1, 1]],
	spark: [[1, 1]],
	streak: [[SPRITE.streakAspect, 1]],
	// Two thin lobes crossed at the center: the specular star of a facet, whose
	// brightest pixel is where they overlap.
	glint: [
		[1, 1 / SPRITE.glintLobeAspect],
		[1 / SPRITE.glintLobeAspect, 1]
	]
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
	const aspect = ASPECT[sprite];
	const height = SPRITE.texturePx;
	const width = height * aspect;
	const image = document.createElement('canvas');
	image.width = width;
	image.height = height;

	const ctx = image.getContext('2d')!;
	ctx.translate(width / 2, height / 2);
	// Lobes pile up rather than paint over each other, so a crossing point is
	// hotter than either lobe alone. A one-lobe sprite is unaffected.
	ctx.globalCompositeOperation = 'lighter';

	const radius = height / 2;
	const core = CORE_STOP[sprite];
	// Draw one circle under a scale per lobe, so every shape in the atlas is the
	// same falloff seen from a different aspect.
	for (const [scaleX, scaleY] of LOBES[sprite]) {
		ctx.save();
		ctx.scale(scaleX, scaleY);
		const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
		gradient.addColorStop(0, rgba(tint.core, 1));
		gradient.addColorStop(core, rgba(tint.core, 0.88));
		gradient.addColorStop((core + 1) / 2, rgba(tint.edge, EDGE_ALPHA));
		gradient.addColorStop(1, rgba(tint.edge, 0));
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(0, 0, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

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
