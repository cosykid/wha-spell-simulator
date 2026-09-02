/**
 * @file The `Voice` contract: everything about how a substance sounds, and
 * nothing about when. A row is data, resolved sigil then element then inert the
 * way a look row is, and `cues.ts` lays it over the score's own clock.
 *
 * The app ships no audio files. Every sound is synthesized from two sources,
 * band-passed noise and a few oscillators, so a row says what each of the
 * synth's building blocks is set to for one substance: where its noise sits,
 * what its tone is made of, how it wobbles, what it throws off, and what its
 * strike sounds like.
 */

/** A band-pass over white noise. The whole hiss, roar and whistle vocabulary is this one shape. */
export interface NoiseBand {
	/** Centre frequency, in Hz. */
	centerHz: number;
	/** Resonance. Low is a broad hiss, high is a whistle. */
	q: number;
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

/** The slow sweep of the body's band. Depth is a fraction of the centre frequency. */
export interface Wobble {
	rateHz: number;
	depth: number;
}

/** The low-passed floor under the body. */
export interface Rumble {
	level: number;
	hz: number;
}

/**
 * What a substance throws off while it manifests. A `crackle` is a burst of
 * high-passed noise; a `blip` is a short tone that slides from `hz` to
 * `hz * sweep`. Neither is the body of anything: they pattern the mass.
 */
export interface Grain {
	kind: 'crackle' | 'blip';
	/** Grains per second when the manifestation is at full loudness. */
	rate: number;
	durMs: number;
	hz: number;
	/** A blip's end pitch as a ratio of its start. Above one rises, below one falls. Ignored by a crackle. */
	sweep: number;
	level: number;
}

/** R-01's strike, as the substance lands. */
export interface Strike {
	/** Pitch the thump starts at, falling as it decays. Zero for no thump. */
	thumpHz: number;
	noise: NoiseBand;
	/** A tone that rings with the impact, or null for none. */
	toneHz: number | null;
	decayMs: number;
}

export interface VoiceRow {
	/** 0..1 loudness trim for the whole row. */
	level: number;
	/** The body's noise. */
	body: NoiseBand;
	/** How much of the body is tone rather than noise. 0 is all noise, 1 is all tone. */
	toneMix: number;
	/** The body's tone, and the hum a hovering mass keeps whatever the mix. */
	tone: ToneVoice;
	wobble: Wobble;
	rumble: Rumble;
	grain: Grain | null;
	strike: Strike;
}

/** The table `voices.ts` resolves against, keyed on sigil id with element rows as the fallback tier. */
export type VoiceTable = Record<string, VoiceRow>;
