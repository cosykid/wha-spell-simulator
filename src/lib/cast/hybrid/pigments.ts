/**
 * @file A look row read as pigment: the heat ramp the substrate paints with, and
 * the material numbers that decide how thickly it is laid on.
 *
 * Looks stay data behind their ESLint wall (`../CLAUDE.md`), so this reads a row
 * and never writes one. The derivation is mechanical on purpose: a row already
 * says what its element is coloured like (`wisp` cold, `body` the mass, `core`
 * the hot centre), so a nine-stop ramp falls out of the six tints it carries and
 * every row renders credibly without a table of hand-picked stops.
 *
 * `fire` is the one exception, and it is the reference: its stops are the
 * hand-authored list the hybrid prototype was approved on, kept digit for digit
 * so the production engine can be judged against those frames.
 *
 * @example
 * const palette = pigmentsFor({ sigil: 'crystal', element: 'earth' }, look);
 */

import { MASS_CEILING, type Palette, type Stop } from './palette.js';
import type { LookRow, Rgb } from '../looks/look.js';
import type { ElementId } from '../../types.js';

/** What the cast paints from, the same pair `looks/table.ts` resolves against. */
export interface PigmentKey {
	sigil: string | null;
	element: ElementId | null;
}

/** Where each derived stop sits on the heat axis. Cold soot to warm near-white. */
const HEAT_AXIS = [0, 0.14, 0.27, 0.4, 0.53, 0.67, 0.82, 0.93, 1] as const;

/**
 * The approved fire ramp, verbatim from the hybrid prototype. Pigment names a
 * painter would reach for, never a screen colour: soot, burnt umber, ember,
 * vermilion, cinnabar, burnt orange, amber, pale amber, core.
 */
const FIRE_STOPS: readonly Stop[] = [
	{ at: 0.0, rgb: [0.129, 0.09, 0.063] },
	{ at: 0.14, rgb: [0.256, 0.126, 0.076] },
	{ at: 0.27, rgb: [0.44, 0.156, 0.088] },
	{ at: 0.4, rgb: [0.735, 0.184, 0.082] },
	{ at: 0.53, rgb: [0.878, 0.34, 0.096] },
	{ at: 0.67, rgb: [0.957, 0.485, 0.13] },
	{ at: 0.82, rgb: [1.0, 0.673, 0.196] },
	{ at: 0.93, rgb: [1.0, 0.827, 0.44] },
	{ at: 1.0, rgb: [1.0, 0.941, 0.804] }
];

/** Rows whose ramp is authored rather than derived. Fire is the art direction. */
const TUNED: Record<string, readonly Stop[]> = { fire: FIRE_STOPS };

type Triple = [number, number, number];

/** A look tint's sRGB bytes as the 0..1 display values a stop carries. */
function unit(rgb: Rgb): Triple {
	return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
}

function mix(a: Triple, b: Triple, t: number): Triple {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scale(a: Triple, factor: number): Triple {
	return [a[0] * factor, a[1] * factor, a[2] * factor];
}

const WHITE: Triple = [1, 1, 1];

/**
 * Nine stops out of a row's own six tints. The cold end is the `wisp` pair
 * darkened toward soot, the middle is the `body` pair, and the hot end is the
 * `core` pair lifted the last step toward white.
 *
 * A row's `emissive` decides how far that last lift goes: a lit row (fire,
 * light) reaches near-white at the top of its ramp, and a row that is matter
 * (earth, crystal) keeps its own colour there, because a rock does not glow.
 */
function deriveStops(look: LookRow): readonly Stop[] {
	const wispEdge = unit(look.wisp.tint.edge);
	const wispCore = unit(look.wisp.tint.core);
	const bodyEdge = unit(look.body.tint.edge);
	const bodyCore = unit(look.body.tint.core);
	const coreEdge = unit(look.core.tint.edge);
	const coreCore = unit(look.core.tint.core);
	const lift = 0.16 + 0.42 * look.material.emissive;
	const rgbs: Triple[] = [
		scale(wispEdge, 0.3),
		scale(wispEdge, 0.62),
		wispEdge,
		mix(wispCore, bodyEdge, 0.5),
		bodyEdge,
		bodyCore,
		coreEdge,
		coreCore,
		mix(coreCore, WHITE, lift)
	];
	return HEAT_AXIS.map((at, index) => ({ at, rgb: rgbs[index] }));
}

/**
 * The row's true black: the manga outline the ink marks are drawn in. It is off
 * the heat axis on purpose. Nothing on the ramp may reach it, because the mass
 * is pigment and only a drawn line is ink.
 */
function deriveInk(look: LookRow): Triple {
	return scale(unit(look.wisp.tint.edge), 0.16);
}

/** The charge beat's inward motes: the medium unlit, one step off its own wisp. */
function deriveMote(look: LookRow): Triple {
	return mix(unit(look.wisp.tint.edge), unit(look.wisp.tint.core), 0.35);
}

/**
 * The palette a cast paints with. Resolution mirrors `looks/table.ts`: a tuned
 * sigil ramp, else a tuned element ramp, else the row's own tints derived.
 */
export function pigmentsFor(key: PigmentKey, look: LookRow): Palette {
	const tuned =
		(key.sigil ? TUNED[key.sigil] : undefined) ?? (key.element ? TUNED[key.element] : undefined);
	return {
		stops: tuned ?? deriveStops(look),
		ink: deriveInk(look),
		mote: deriveMote(look)
	};
}

/**
 * How thickly this row lays its pigment down. Every number is a multiplier on a
 * {@link import('./tuning.js').DRAW} dial, so a row cannot invent a shape: it
 * can only be denser, hotter or heavier than the reference.
 */
export interface MaterialInk {
	/** Multiplier on per-sprite opacity. A row that is matter covers; wind barely does. */
	opacity: number;
	/** Multiplier on sprite size. A heavy row is chunky, a thin one is fine. */
	size: number;
	/** How far up the ramp the mass may climb before the core gate. */
	ceiling: number;
	/** How hard the hot core adds. A row that is not a light source barely does. */
	coreLift: number;
	/** Multiplier on the brush population's peak alpha. */
	markAlpha: number;
	/** Multiplier on brush mark size, from the row's own ribbon width. */
	markSize: number;
	/** Multiplier on turbulence gain: flicker is motion texture, so it moves the field. */
	turbulence: number;
	/** Multiplier on the accumulation's per-paint survival. */
	trail: number;
	/** Share of marks drawn as dark outline ink rather than as pigment. */
	inkShare: number;
}

/**
 * The eleven-number material profile read as the eight multipliers the substrate
 * has. Nothing here is a new dial: each one is a row's own field aimed at the
 * one thing in the substrate it can honestly steer.
 */
export function materialInk(look: LookRow): MaterialInk {
	const m = look.material;
	return {
		// A row's fill is its opacity, floored so the thinnest row still reads.
		opacity: 0.55 + 0.85 * m.opacity,
		// Weight is apparent mass, so a heavy row draws bigger, softer parcels.
		size: 0.86 + 0.34 * m.weight + 0.18 * m.ribbonWidth,
		ceiling: MASS_CEILING * (0.82 + 0.18 * m.emissive),
		coreLift: 0.3 + 0.75 * m.emissive,
		markAlpha: 0.7 + 0.6 * m.opacity + 0.25 * m.emissive,
		markSize: 0.7 + 2.1 * m.ribbonWidth,
		turbulence: 0.62 + 0.5 * m.flicker + 0.35 * m.undulation,
		trail: 0.9 + 0.16 * m.trailPersistence,
		// A crisp-edged row draws its own outline; a feathered one has no edge to
		// draw, so it carries the least ink.
		inkShare: m.edge === 'feather' ? 0.05 : m.edge === 'serrated' ? 0.13 : 0.09
	};
}
