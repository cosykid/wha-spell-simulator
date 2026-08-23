/**
 * @file The one pigment ramp. The fluid body reads it as GLSL, the brush marks
 * read it as JavaScript, and both are generated from the single stop list below,
 * so a colour edit cannot land on one population and miss the other.
 *
 * The axis is heat: 0 is cold soot, 1 is the warm near-white core. Only the
 * fluid's hottest sliver is allowed past {@link MASS_CEILING}, which is what
 * keeps the white a place inside the mass rather than a property of a mark.
 *
 * @example
 * pigment(0.74, tint);           // in JS, for a brush mark
 * PIGMENT_GLSL + 'vec3 c = pigment(h);'  // in a shader, for the fluid
 */

/** One stop on the ramp: where it sits on the heat axis, and its display sRGB. */
interface Stop {
	at: number;
	rgb: readonly [number, number, number];
	name: string;
}

/** Cold to hot. Pigment names a painter would reach for, never a screen colour. */
const RAMP: readonly Stop[] = [
	{ at: 0.0, rgb: [0.129, 0.09, 0.063], name: 'soot' },
	{ at: 0.14, rgb: [0.256, 0.126, 0.076], name: 'burnt umber' },
	{ at: 0.27, rgb: [0.44, 0.156, 0.088], name: 'ember' },
	{ at: 0.4, rgb: [0.735, 0.184, 0.082], name: 'vermilion' },
	{ at: 0.53, rgb: [0.878, 0.34, 0.096], name: 'cinnabar' },
	{ at: 0.67, rgb: [0.957, 0.485, 0.13], name: 'burnt orange' },
	{ at: 0.82, rgb: [1.0, 0.673, 0.196], name: 'amber' },
	{ at: 0.93, rgb: [1.0, 0.827, 0.44], name: 'pale amber' },
	{ at: 1.0, rgb: [1.0, 0.941, 0.804], name: 'core' }
];

/** How far up the ramp anything but the fluid's hot core may climb. */
export const MASS_CEILING = 0.86;

/** The charge beat's inward motes: warm unlit ink drifting in, not ash. */
export const MOTE = [0.62, 0.36, 0.19] as const;

/** Cream the paper stand-in is painted in, so the page and the mesh agree. */
export const PAPER = '#e7dab4';
/** Ink the seal ring is drawn in. */
export const RING_INK = '#241b16';

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

/**
 * Samples the ramp into `out`. A fold of smoothstep blends rather than a
 * piecewise lerp, because that is what the generated GLSL below computes and the
 * two have to agree to the last digit.
 */
export function pigment(heat: number, out: { r: number; g: number; b: number }): void {
	const h = clamp01(heat);
	out.r = RAMP[0].rgb[0];
	out.g = RAMP[0].rgb[1];
	out.b = RAMP[0].rgb[2];
	for (let i = 1; i < RAMP.length; i += 1) {
		const t = smoothstep(RAMP[i - 1].at, RAMP[i].at, h);
		out.r += (RAMP[i].rgb[0] - out.r) * t;
		out.g += (RAMP[i].rgb[1] - out.g) * t;
		out.b += (RAMP[i].rgb[2] - out.b) * t;
	}
}

function glslVec3(rgb: readonly [number, number, number]): string {
	return `vec3(${rgb.map((c) => c.toFixed(4)).join(', ')})`;
}

/** The same fold, emitted as GLSL. Prepended to any program that needs pigment. */
function buildPigmentGlsl(): string {
	const lines = RAMP.slice(1).map(
		(stop, index) =>
			`\tc = mix(c, ${glslVec3(stop.rgb)}, smoothstep(${RAMP[index].at.toFixed(3)}, ` +
			`${stop.at.toFixed(3)}, h)); // ${stop.name}`
	);
	return [
		'// Generated from palette.ts. Cold soot at 0, warm near-white core at 1.',
		'vec3 pigment(float heat) {',
		'\tfloat h = clamp(heat, 0.0, 1.0);',
		`\tvec3 c = ${glslVec3(RAMP[0].rgb)}; // ${RAMP[0].name}`,
		...lines,
		'\treturn c;',
		'}',
		`const float MASS_CEILING = ${MASS_CEILING.toFixed(3)};`,
		''
	].join('\n');
}

/** The ramp as a shader function, built once at module load. */
export const PIGMENT_GLSL = buildPigmentGlsl();
