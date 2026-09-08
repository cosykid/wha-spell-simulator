/**
 * @file The `Voice` contract: everything about what a substance is made of, and
 * nothing about when it sounds. A row is data, resolved sigil then element then
 * inert the way a look row is, and `cues.ts` lays it over the score's own clock.
 *
 * The app ships no audio files, so every row is a physical description rather
 * than a sample: what colour the substance's noise is, which resonances stand
 * out of it, how unsteadily it burns or gusts, how hard it drives the air, how
 * far away the room puts it, what it throws off, and what its impact is made
 * of. The synth in `bodies.ts` and `impacts.ts` builds exactly this and nothing
 * else, so a substance is only ever changed here.
 */

/**
 * The spectral tilt of a substance's noise. White is flat and reads as hiss,
 * pink falls 3dB an octave and is what most moving air and water actually is,
 * brown falls 6dB and is the roar and rumble of something large.
 */
export type NoiseColour = 'white' | 'pink' | 'brown';

/**
 * One resonance of a body, as a multiple of the body's own centre. Real sources
 * have several at once, which is why a single band-pass reads as a synthesizer
 * and three read as a thing.
 */
export interface Formant {
	/** Where it sits, as a multiple of {@link Body.centerHz}. */
	ratio: number;
	/** Resonance. Below one is a broad shelf, above four is a whistle. */
	q: number;
	/** Its share of the body. */
	level: number;
}

/** The substance's noise: its colour, its resonances, and the air above them. */
export interface Body {
	colour: NoiseColour;
	/** The centre every formant is a multiple of, in Hz. */
	centerHz: number;
	formants: readonly Formant[];
	/** Everything above this is rolled off, the way distance and air do it. */
	tiltHz: number;
}

/** A pitched sound built from partials over one base frequency. */
export interface ToneVoice {
	baseHz: number;
	/** Partials as `[frequency ratio, level]`. Whole ratios ring harmonic, others ring like glass. */
	partials: readonly (readonly [number, number])[];
	wave: 'sine' | 'triangle';
	/** Cents between the two copies of each partial, so a hum beats slowly instead of standing still. */
	detuneCents: number;
}

/**
 * How unsteady the substance is. Nothing in the world holds still, and nothing
 * holds a rate either, so this is a wander rather than an oscillation: a flame
 * gutters, a gust arrives, a slab barely moves.
 */
export interface Flutter {
	/** Roughly how many times a second the wander turns around. */
	rateHz: number;
	/** How much loudness it takes away at its lowest, as a fraction. */
	depth: number;
	/** How far it drags the body's resonances, as a fraction of their frequency. */
	bandDepth: number;
}

/** The low-passed floor under the body. */
export interface Rumble {
	level: number;
	hz: number;
}

/**
 * What a substance throws off while it manifests, as the event it physically
 * is: a `crackle` is a resonant pop, a `bubble` rises in pitch as it collapses,
 * `grit` is a pebble bouncing twice, a `chime` is struck glass and a `spark`
 * is a soft bloom of light. None of them is the body of anything.
 */
export interface Grain {
	kind: 'crackle' | 'bubble' | 'grit' | 'chime' | 'spark';
	/** Grains per second when the manifestation is at full loudness. */
	rate: number;
	durMs: number;
	hz: number;
	level: number;
}

/**
 * One mode of an impact: a partial that rings at its own pitch and dies at its
 * own rate. Modes with unequal decays are most of what tells a real impact from
 * a beep, because in anything struck the high modes go first.
 */
export interface Mode {
	hz: number;
	level: number;
	decayMs: number;
}

/** R-01's strike, as the substance lands. Four parts, in the order the ear hears them. */
export interface Strike {
	/** The edge: a click of broad noise a couple of milliseconds long. Zero for something soft. */
	click: number;
	/** The air the impact moves, and how long it takes to get out of the way. */
	air: { centerHz: number; q: number; decayMs: number; level: number };
	/** A pitch dropping under it all, or zero where nothing has mass to land. */
	thumpHz: number;
	thumpDecayMs: number;
	/** What rings afterwards. Empty for anything that does not ring. */
	modes: readonly Mode[];
	/** Grains flung by the landing itself: the splash, the chips, the shower of sparks. */
	scatter: number;
}

export interface VoiceRow {
	/** 0..1 loudness trim for the whole row. */
	level: number;
	body: Body;
	/** How much of the body is tone rather than noise. 0 is all noise, 1 is all tone. */
	toneMix: number;
	/** The body's tone, and the hum a hovering mass keeps whatever the mix. */
	tone: ToneVoice;
	flutter: Flutter;
	rumble: Rumble;
	/** How hard the substance drives the air, 0..1. Saturation, and the harmonics anything loud picks up. */
	drive: number;
	/** How much of the substance reaches the ear off the room rather than straight, 0..1. */
	space: number;
	grain: Grain | null;
	strike: Strike;
}

/** The table `voices.ts` resolves against, keyed on sigil id with element rows as the fallback tier. */
export type VoiceTable = Record<string, VoiceRow>;
