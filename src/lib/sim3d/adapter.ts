/**
 * @file Compiles recognized signs into the physical model's SimSeal
 * (core/model.ts). The physics (nozzle flux law, region fences, ambient pull)
 * comes from the theorycrafting sim; the drawing-quality weighting kept here
 * comes from the app compiler — canon says messy or undersized glyphs weaken
 * the spell, which the sim's hand-authored presets never modeled.
 */
import { facingDirection, sealPosition } from '../field/buildSpellField.js';
import { clamp, vectorFromAngleDeg } from '../utils/geometry.js';
import type { ElementId } from '../types/dictionary.js';
import type { Recognition } from '../types/recognition.js';
import type { SimSeal, SimSign } from './core/model.js';

const SIGN_LENGTH = {
	// sizeNorm is the glyph's largest dimension over the ring DIAMETER; doubling
	// it recovers the length in seal units (λ = ℓ/R) the flux law expects.
	fromSizeNorm: 2,
	min: 0.2,
	max: 1.6,
	// Drawing quality scales each sign's budget: a sloppy glyph still acts, but
	// weakly (GROUND_TRUTH §1 [canon: messy seals are weaker]).
	qualityBase: 0.55,
	qualityScale: 0.45
};

/** Sign length λ in seal units, weighted by how well the glyph was drawn. */
function signLength(sign: Recognition): number {
	const drawn = clamp(sign.sizeNorm * SIGN_LENGTH.fromSizeNorm, SIGN_LENGTH.min, SIGN_LENGTH.max);
	const quality = clamp(sign.confidence * sign.neatness);
	return drawn * (SIGN_LENGTH.qualityBase + SIGN_LENGTH.qualityScale * quality);
}

/** Facing flipped outward: the dispersion glyph is canon's inverted column. */
function outwardDirection(sign: Recognition): { x: number; y: number } {
	const facing = facingDirection(sign);
	return { x: -facing.x, y: -facing.y };
}

/** Inward regardless of twist, for signs whose facing carries no meaning. */
function inwardDirection(sign: Recognition): { x: number; y: number } {
	return vectorFromAngleDeg((sign.angleDeg ?? 0) + 180);
}

function simSign(sign: Recognition): SimSign | null {
	const pos = sealPosition(sign);
	switch (sign.semantic?.manifestation) {
		case 'column':
			// A column twisted mostly outward is drawn inverted; its flux already
			// encodes that through the facing, so no special case is needed.
			return { kind: 'column', pos, dir: facingDirection(sign), len: signLength(sign) };
		case 'dispersion':
			return { kind: 'column', pos, dir: outwardDirection(sign), len: signLength(sign) };
		case 'pull':
			return { kind: 'pull', pos, dir: facingDirection(sign), len: signLength(sign) };
		case 'collection':
			// Collection gathers toward the seal; its glyph facing is unreadable,
			// so it acts as a plain inward pull.
			return { kind: 'pull', pos, dir: inwardDirection(sign), len: signLength(sign) };
		case 'levitation':
			return { kind: 'levitation', pos, dir: facingDirection(sign), len: signLength(sign) };
		case 'directed':
			return { kind: 'region', pos, dir: facingDirection(sign) };
		case 'convergence':
			return { kind: 'convergence', pos, dir: facingDirection(sign), len: signLength(sign) };
		default:
			// Crush, weave, bolt, billowing, repetition… stay scalar-only for now;
			// they keep flowing through the manifestation deltas instead.
			return null;
	}
}

/**
 * Builds the physical seal for the 3D effect. Returns null when no sign maps
 * into the model, so sigil-only spells keep the legacy per-element effects.
 */
export function buildSimSeal(
	signs: Recognition[],
	element: ElementId | null,
	sigil: string | null
): SimSeal | null {
	if (!element) {
		return null;
	}
	const simSigns: SimSign[] = [];
	for (const sign of signs) {
		const mapped = simSign(sign);
		if (mapped) {
			simSigns.push(mapped);
		}
	}
	if (!simSigns.length) {
		return null;
	}
	return {
		element: sigil === 'crystal' ? 'crystal' : element,
		signs: simSigns
	};
}

/** Compact digest so seal geometry changes reset the particle populations. */
export function simSealSignature(seal: SimSeal | null): string {
	if (!seal) {
		return 'none';
	}
	const signs = seal.signs
		.map((sign) => {
			const base = `${sign.kind[0]}${Math.round(sign.pos.x * 20)},${Math.round(sign.pos.y * 20)}>${Math.round(sign.dir.x * 10)},${Math.round(sign.dir.y * 10)}`;
			return 'len' in sign ? `${base}.${Math.round(sign.len * 100)}` : base;
		})
		.sort()
		.join('|');
	return `${seal.element}:${signs}`;
}
