/**
 * @file The element behavior matrix. Every number that makes fire, water and
 * wind DIFFERENT lives in this one file, so the bake-off's second critique
 * ("elements should literally behave differently") is answerable by pointing
 * here: motion dynamics (MOTION), volume field shaping (SKIN), material rows
 * (TOON / INK), and the 2D substrate rows (SUBSTRATE) are all per-element.
 *
 * Throwaway prototype code. No test pins any of this.
 */

export type ProtoElement = 'fire' | 'water' | 'wind';
export type ProtoStyle = 'a' | 'b' | 'c';

/** One stop on a pigment ramp: position on the axis, display sRGB. */
interface Stop {
	at: number;
	rgb: readonly [number, number, number];
}

/**
 * Pigment ramps, watercolor names not screen colors. The axis differs per
 * element: fire runs cold soot to warm near-white core, water runs deep
 * indigo ink to pale foam, wind runs dusty celadon to near-paper air.
 * Fire's stops are proto-hybrid's ramp verbatim; water/wind are derived from
 * the shipped look rows (looks/water.ts FOAM/DEEP/SHADOW, looks/wind.ts
 * AIR/HAZE/DUST) pulled darker at the low end so the rim can be ink.
 */
const RAMPS: Record<ProtoElement, readonly Stop[]> = {
	fire: [
		{ at: 0.0, rgb: [0.129, 0.09, 0.063] },
		{ at: 0.14, rgb: [0.256, 0.126, 0.076] },
		{ at: 0.27, rgb: [0.44, 0.156, 0.088] },
		{ at: 0.4, rgb: [0.735, 0.184, 0.082] },
		{ at: 0.53, rgb: [0.878, 0.34, 0.096] },
		{ at: 0.67, rgb: [0.957, 0.485, 0.13] },
		{ at: 0.82, rgb: [1.0, 0.673, 0.196] },
		{ at: 0.93, rgb: [1.0, 0.827, 0.44] },
		{ at: 1.0, rgb: [1.0, 0.941, 0.804] }
	],
	water: [
		{ at: 0.0, rgb: [0.031, 0.11, 0.24] },
		{ at: 0.18, rgb: [0.039, 0.243, 0.478] },
		{ at: 0.38, rgb: [0.071, 0.478, 0.855] },
		{ at: 0.58, rgb: [0.243, 0.62, 0.878] },
		{ at: 0.78, rgb: [0.502, 0.855, 1.0] },
		{ at: 0.92, rgb: [0.749, 0.937, 1.0] },
		{ at: 1.0, rgb: [0.902, 0.973, 1.0] }
	],
	wind: [
		{ at: 0.0, rgb: [0.42, 0.565, 0.53] },
		{ at: 0.3, rgb: [0.549, 0.729, 0.698] },
		{ at: 0.6, rgb: [0.722, 0.91, 0.843] },
		{ at: 0.85, rgb: [0.878, 0.973, 0.906] },
		{ at: 1.0, rgb: [0.945, 0.988, 0.953] }
	]
};

/** The ink each element's rim/outline is drawn in, as linear-ish sRGB floats. */
export const INKS: Record<ProtoElement, readonly [number, number, number]> = {
	fire: [0.16, 0.085, 0.05],
	water: [0.05, 0.13, 0.27],
	wind: [0.33, 0.44, 0.41]
};

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a: number, b: number, v: number): number {
	const t = clamp01((v - a) / (b - a));
	return t * t * (3 - 2 * t);
}

/** Samples an element's ramp in JS. Same fold of smoothsteps as the GLSL. */
export function rampJs(
	element: ProtoElement,
	heat: number,
	out: { r: number; g: number; b: number }
): void {
	const ramp = RAMPS[element];
	const h = clamp01(heat);
	out.r = ramp[0].rgb[0];
	out.g = ramp[0].rgb[1];
	out.b = ramp[0].rgb[2];
	for (let i = 1; i < ramp.length; i += 1) {
		const t = smoothstep(ramp[i - 1].at, ramp[i].at, h);
		out.r += (ramp[i].rgb[0] - out.r) * t;
		out.g += (ramp[i].rgb[1] - out.g) * t;
		out.b += (ramp[i].rgb[2] - out.b) * t;
	}
}

/** The same ramp emitted as a GLSL function `vec3 pigment(float h)`. */
export function rampGlsl(element: ProtoElement): string {
	const ramp = RAMPS[element];
	const v = (rgb: readonly [number, number, number]) =>
		`vec3(${rgb.map((c) => c.toFixed(4)).join(', ')})`;
	const lines = ramp
		.slice(1)
		.map(
			(stop, i) =>
				`\tc = mix(c, ${v(stop.rgb)}, smoothstep(${ramp[i].at.toFixed(3)}, ${stop.at.toFixed(3)}, h));`
		);
	return [
		'vec3 pigment(float heat) {',
		'\tfloat h = clamp(heat, 0.0, 1.0);',
		`\tvec3 c = ${v(ramp[0].rgb)};`,
		...lines,
		'\treturn c;',
		'}'
	].join('\n');
}

/**
 * Motion: the physics each element's population obeys. Read by the CPU tracers
 * (styles A and C) and mirrored into the GPU substrate's uniforms (style B),
 * so the same element moves the same way whichever style is judging it.
 * Speeds are multiples of the spell's nozzle speed; accelerations seal units/s^2.
 */
export interface MotionSpec {
	/** Spawn disc radius as a fraction of the jet footprint. */
	mouth: number;
	/** Initial upward speed range, x nozzle speed. */
	riseLo: number;
	riseHi: number;
	/** Initial outward lean range, x nozzle speed. Water aims it along a jet. */
	radialLo: number;
	radialHi: number;
	/** Water only: distinct sub-jets that arc apart, and how fast they precess. */
	jets: number;
	jetSpinRadS: number;
	/** Upward acceleration on hot/young mass. Fire's identity. */
	buoyancy: number;
	/** Downward acceleration. Water's identity. */
	gravity: number;
	drag: number;
	/** Curl-noise gain and spatial scale. Wind runs large-scale, water small. */
	turbulence: number;
	turbScale: number;
	/** Coherent lateral sway, wind's identity: gusts that bend the whole body. */
	gust: number;
	swirl: number;
	/** Pull toward the column boundary (fire keeps a column; others do not). */
	pinch: number;
	lifeLo: number;
	lifeHi: number;
	/** Above this fraction of reach, age runs faster (fire tips tear away). */
	tearFrom: number;
	tearRate: number;
	/** Kill height, x reach. */
	heightCap: number;
	/** Floor behavior. Only water pools. */
	pool: {
		floorZ: number;
		bounce: number;
		spread: number;
		dragXY: number;
		ageRate: number;
		drainAgeRate: number;
	} | null;
	/** Tracer spawns per second at full emission (A/C). */
	spawnPerSec: number;
	/** Fraction of the GPU population style B may keep alive at full emission. */
	popScale: number;
}

export const MOTION: Record<ProtoElement, MotionSpec> = {
	// Buoyant: accelerates upward, flickers turbulently, tips tear and burn out.
	fire: {
		mouth: 1.0,
		riseLo: 0.45,
		riseHi: 1.6,
		radialLo: 0.0,
		radialHi: 0.08,
		jets: 0,
		jetSpinRadS: 0,
		buoyancy: 3.4,
		gravity: 0,
		drag: 1.6,
		turbulence: 2.7,
		turbScale: 1.3,
		gust: 0,
		swirl: 0.5,
		pinch: 6.0,
		lifeLo: 0.55,
		lifeHi: 1.35,
		tearFrom: 0.72,
		tearRate: 2.6,
		heightCap: 1.38,
		pool: null,
		spawnPerSec: 1500,
		popScale: 1.0
	},
	// Heavy and cohesive: launched, bent over by gravity into arcs, pools on
	// the paper and spreads. The pool block is water's alone.
	water: {
		mouth: 0.34,
		riseLo: 1.2,
		riseHi: 1.75,
		radialLo: 0.28,
		radialHi: 0.62,
		jets: 3,
		jetSpinRadS: 0.5,
		buoyancy: 0,
		gravity: 3.3,
		drag: 0.55,
		turbulence: 0.45,
		turbScale: 1.0,
		gust: 0,
		swirl: 0.15,
		pinch: 0,
		lifeLo: 1.7,
		lifeHi: 2.9,
		tearFrom: 2.0,
		tearRate: 1,
		heightCap: 1.0,
		pool: {
			floorZ: 0.02,
			bounce: 0.14,
			spread: 0.85,
			dragXY: 2.1,
			ageRate: 0.28,
			drainAgeRate: 3.2
		},
		spawnPerSec: 1200,
		popScale: 0.6
	},
	// Nearly bodiless: very fast, curl at grass-blade scale, coherent gusts.
	// The motion is the identity; the pigment barely shows. Dense spawn with a
	// tight mouth, so the streaks fuse into ribbons rather than confetti.
	wind: {
		mouth: 0.5,
		riseLo: 2.0,
		riseHi: 3.0,
		radialLo: 0.0,
		radialHi: 0.1,
		jets: 0,
		jetSpinRadS: 0,
		buoyancy: 0.5,
		gravity: 0,
		drag: 0.5,
		turbulence: 1.1,
		turbScale: 0.55,
		gust: 4.2,
		swirl: 0.7,
		pinch: 0.8,
		lifeLo: 0.5,
		lifeHi: 0.95,
		tearFrom: 1.1,
		tearRate: 1.7,
		heightCap: 1.9,
		pool: null,
		spawnPerSec: 1500,
		popScale: 0.12
	}
};

/**
 * Volume field shaping for the marching-cubes skin (styles A and C), ported
 * from PR #74's VolumeLook. This shapes the FIELD, not the color: water's low
 * iso + smear + smoothing + cohesion is what fuses it into one rounded body.
 */
export interface SkinSpec {
	isoScale: number;
	smearScale: number;
	smooth: number;
	smoothPasses: number;
	cohesion: number;
	/** Per-ball deposit weight. Wind's few streaks are fat so they fuse. */
	strengthScale: number;
	/** Strength floor for isolated deposits. Low means loners vanish. */
	loner: number;
}

export const SKIN: Record<ProtoElement, SkinSpec> = {
	// Fire coheres mildly with a low loner floor: the body stays raw lively
	// metaballs, but an isolated ember melts away instead of rendering as a
	// stray grid-sized chip.
	fire: {
		isoScale: 1.0,
		smearScale: 0.9,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0.3,
		strengthScale: 1,
		loner: 0.18
	},
	water: {
		isoScale: 0.5,
		smearScale: 1.5,
		smooth: 0.85,
		smoothPasses: 2,
		cohesion: 1,
		strengthScale: 1,
		loner: 0.45
	},
	// Wind coheres weakly with a near-zero loner floor: beads that ride a
	// shared gust fuse into a ribbon, stragglers simply are not there.
	wind: {
		isoScale: 0.9,
		smearScale: 1.15,
		smooth: 0.55,
		smoothPasses: 1,
		cohesion: 0.35,
		strengthScale: 1.7,
		loner: 0.12
	}
};

/** Style A's toon rows: PR #74's material recolored to the pigment palette. */
export const TOON: Record<
	ProtoElement,
	{ color: number; emissive: number; intensity: number; opacity: number }
> = {
	fire: { color: 0xd7541e, emissive: 0xa03012, intensity: 0.3, opacity: 1 },
	water: { color: 0x3f96d8, emissive: 0x0e3a5f, intensity: 0.35, opacity: 0.84 },
	wind: { color: 0xd9ecdf, emissive: 0xa9d8c4, intensity: 0.22, opacity: 0.26 }
};

/** Style C's ink rows: flat washes, dark rim, per-element weights. */
export const INK_STYLE: Record<
	ProtoElement,
	{ opacity: number; bands: number; rim: number; glint: number; heatBase: number; heatSpan: number }
> = {
	// Fire is hot at the base, spent at the crown: heat falls with height.
	fire: { opacity: 0.94, bands: 4, rim: 0.7, glint: 0, heatBase: 0.8, heatSpan: -0.55 },
	// Water is deep in the body, foam at the crest: heat rises with height.
	water: { opacity: 0.88, bands: 3, rim: 0.9, glint: 0.35, heatBase: 0.3, heatSpan: 0.55 },
	wind: { opacity: 0.28, bands: 3, rim: 0.4, glint: 0, heatBase: 0.5, heatSpan: 0.3 }
};

/** Style B's substrate rows: how the 2D pigment field is smeared, merged, rimmed. */
export const SUBSTRATE: Record<
	ProtoElement,
	{
		/** Blur radius of the coverage field, px at trail scale. Merging power. */
		blurPx: number;
		/** Soft threshold window the blurred coverage is re-shaped through. */
		threshLo: number;
		threshHi: number;
		/** Per-step trail survival and upward drift. */
		fade: number;
		drift: number;
		/** Stamp radius in seal units, velocity stretch, per-stamp opacity. */
		stampSize: number;
		stretch: number;
		opacity: number;
		/** Ink rim strength, and the wet glint (water only). */
		rim: number;
		glint: number;
		/** Final body alpha scale. Wind is a translucent ghost. */
		bodyAlpha: number;
		/** Sub-threshold haze factor: the thin outer bleed and the charge motes. */
		sub: number;
		/** How much sharp (unblurred) accumulation shows inside the body. */
		sharpMix: number;
		/** Alpha the re-thresholded sharp streaks carry. Wind's identity. */
		sharpBody: number;
		/** Vertical stretch of the metaball blur. Wind rounds its crown with it. */
		blurYScale: number;
		/** Stamp age window the fade-out runs over. Wind thins early. */
		fadeOut: readonly [number, number];
	}
> = {
	fire: {
		blurPx: 2.4,
		threshLo: 0.3,
		threshHi: 0.62,
		fade: 0.72,
		drift: 0.0011,
		stampSize: 0.095,
		stretch: 0.5,
		opacity: 0.34,
		rim: 0.62,
		glint: 0,
		bodyAlpha: 1.0,
		sub: 0.12,
		sharpMix: 0.7,
		sharpBody: 0.25,
		blurYScale: 1,
		fadeOut: [0.5, 0.95]
	},
	water: {
		blurPx: 4.0,
		threshLo: 0.3,
		threshHi: 0.62,
		fade: 0.76,
		drift: 0.0002,
		stampSize: 0.105,
		stretch: 0.4,
		opacity: 0.32,
		rim: 0.7,
		glint: 1,
		bodyAlpha: 0.96,
		sub: 0.06,
		sharpMix: 0.5,
		sharpBody: 0,
		blurYScale: 1,
		fadeOut: [0.5, 0.95]
	},
	wind: {
		blurPx: 4.0,
		threshLo: 0.1,
		threshHi: 0.45,
		fade: 0.62,
		drift: 0,
		stampSize: 0.075,
		stretch: 2.6,
		opacity: 0.34,
		rim: 0.25,
		glint: 0,
		bodyAlpha: 0.22,
		sub: 0.08,
		sharpMix: 0.8,
		sharpBody: 0.55,
		blurYScale: 2.0,
		fadeOut: [0.3, 0.8]
	}
};
