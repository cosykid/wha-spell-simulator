/**
 * @file The one pigment ramp. The parcel body reads it as a texture, the brush
 * marks read it as JavaScript, and both are sampled from the same stop list, so
 * a colour edit cannot land on one population and miss the other.
 *
 * The axis is heat: 0 is cold soot, 1 is the warm near-white core. Only the
 * parcels' hottest sliver is allowed past {@link MASS_CEILING}, which is what
 * keeps the white a place inside the mass rather than a property of a mark.
 *
 * A row is a stop list, never a shader fork. Eight look rows share one program
 * because the ramp travels as a 1D texture built from whichever list the cast
 * resolved.
 *
 * @example
 * pigment(stops, 0.74, tint);      // in JS, for a brush mark
 * rampTexels(stops);               // in GL, as the parcel program's ramp
 */

/** One stop on the ramp: where it sits on the heat axis, and its display sRGB. */
export interface Stop {
	at: number;
	rgb: readonly [number, number, number];
}

/** A whole row's pigment: the heat ramp, plus the two colours off that axis. */
export interface Palette {
	stops: readonly Stop[];
	/** True near-black. The manga's outline, carried by the ink marks alone. */
	ink: readonly [number, number, number];
	/** The charge beat's inward motes: unlit medium drifting in, not ash. */
	mote: readonly [number, number, number];
}

/** How far up the ramp anything but the parcels' hot core may climb. */
export const MASS_CEILING = 0.86;

/** Texels the ramp is baked into. Wide enough that the fold's knees stay smooth. */
export const RAMP_TEXELS = 128;

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

/** A mutable rgb triple, so a frame of marks allocates nothing. */
export interface Tint {
	r: number;
	g: number;
	b: number;
}

/**
 * Samples the ramp into `out`. A fold of smoothstep blends rather than a
 * piecewise lerp: neighbouring stops overlap, which is what keeps a nine-stop
 * ramp from showing its knees.
 */
export function pigment(stops: readonly Stop[], heat: number, out: Tint): void {
	const h = clamp01(heat);
	out.r = stops[0].rgb[0];
	out.g = stops[0].rgb[1];
	out.b = stops[0].rgb[2];
	for (let i = 1; i < stops.length; i += 1) {
		const t = smoothstep(stops[i - 1].at, stops[i].at, h);
		out.r += (stops[i].rgb[0] - out.r) * t;
		out.g += (stops[i].rgb[1] - out.g) * t;
		out.b += (stops[i].rgb[2] - out.b) * t;
	}
}

/**
 * The same fold, baked into RGBA texels for the GPU. The shader samples this
 * rather than recomputing the fold, so the two populations cannot drift apart
 * and a row change costs one texture upload instead of a shader recompile.
 */
export function rampTexels(stops: readonly Stop[]): Float32Array {
	const data = new Float32Array(RAMP_TEXELS * 4);
	const tint: Tint = { r: 0, g: 0, b: 0 };
	for (let i = 0; i < RAMP_TEXELS; i += 1) {
		pigment(stops, (i + 0.5) / RAMP_TEXELS, tint);
		data[i * 4] = tint.r;
		data[i * 4 + 1] = tint.g;
		data[i * 4 + 2] = tint.b;
		data[i * 4 + 3] = 1;
	}
	return data;
}
