/**
 * @file The one spell this bake-off route performs: the `column-balanced` preset
 * cast with the `fire` sigil, compiled through the real reading -> plan -> score
 * path. Throwaway glue copied from the Spell Effect Lab, trimmed to a single
 * cast; nothing here is meant to survive the bake-off.
 *
 * Everything the look is driven by comes off the compiled score: R-01's beats,
 * the jet's aim and footprint, the burst's hump, the ambient medium's leak. The
 * cue this file samples is the whole energy arc the stage paints, so the timing
 * argument lives in one place instead of in the shaders.
 *
 * @example
 * const cast = buildWashCast();
 * const cue = sampleWashCue(cast, 1400); // early body: the column is climbing
 */

import { CONFIG } from '$lib/config.js';
import { compileScore, scoreTracks } from '$lib/cast/score/compileScore.js';
import { curveAt, evaluateEnvelope } from '$lib/cast/score/envelopes.js';
import { beatAt, progressThrough, spanOf } from '$lib/cast/score/beats.js';
import { buildSpellIR, defaultControlValues, readPresetSeal } from '$lib/ui/spellEffectLab.js';
import { presetById } from '$lib/ui/spellEffectLabPresets.js';
import { clamp } from '$lib/utils/geometry.js';
import type { Beat, BeatWindow, Envelope, ScoreTrack, Vec3, Vector } from '$lib/types.js';

/** The single arrangement the prototype casts. */
export const WASH_PRESET_ID = 'column-balanced';
/** The sigil whose pigments the whole style is tuned for. */
export const WASH_SIGIL = 'fire';

/** The compiled cast, reduced to what a proxy column needs to stand up. */
export interface WashCast {
	totalMs: number;
	beats: Record<Beat, BeatWindow>;
	/** Unit seal-space beam axis. Three balanced columns cancel to straight up. */
	axis: Vec3;
	/** The drawn column feet, in seal space, that braid into that one beam. */
	feet: Vector[];
	/** Seal units from the axis where the beam is still half strength. */
	footprint: number;
	/** Seal units per second at the nozzle. */
	speed: number;
	/** The plan's n-fold snap. Three, here. */
	symmetry: number;
	/** A one-line description of what compiled, for the page's caption. */
	caption: string;
}

/** Everything the stage samples per frame: one energy arc, read off the score. */
export interface WashCue {
	tMs: number;
	beat: Beat;
	/** R-01's charge: the ink brightening while the paper tilts. 0..1 */
	charge: number;
	/** The strike's hump. A hard 320ms punch. 0..1 */
	strike: number;
	/** How hard the column is fed, from the jet's own emission envelope. 0..1 */
	feed: number;
	/** Velocity scale on the column, from the jet's drive envelope. 0..1 */
	drive: number;
	/** The ambient medium's presence. 0..1 */
	medium: number;
	/** The fade across release and afterglow. 1..0 */
	life: number;
	/**
	 * Fuel still burning. R-02 stops every emission at the end of `body`, so what
	 * is already on the page has to burn down rather than vanish with the feed.
	 */
	burn: number;
	/** Pigment the cast has left on the sheet. Monotonic: a stain does not lift. */
	scorch: number;
	/** How much column stands, 0 at the strike and 1 at the roar. */
	reach: number;
	/** Total pigment on the page: the arc a reader actually sees. 0..1 */
	mass: number;
	/** Seal units of expanding shock ring; 0 once the strike has spent it. */
	burstRadius: number;
	/** How much of that ring is still wet. 0..1 */
	burstFade: number;
}

/** Sliders the cast is built from. Only the ones a fire column cares about move. */
function washControlValues(): Record<string, number> {
	return {
		...defaultControlValues(),
		duration: 5,
		force: 0.82,
		spread: 0.42,
		focus: 0.7,
		stability: 0.66,
		xTiltDeg: 0,
		yTiltDeg: 0,
		ringRadius: 0.34
	};
}

function envelopeOf(track: ScoreTrack | undefined, which: 'emission' | 'drive'): Envelope | null {
	return track ? track[which] : null;
}

/** An envelope read as 0..1 rather than in its own units, so cues stay comparable. */
function normalized(
	envelope: Envelope | null,
	beats: Record<Beat, BeatWindow>,
	tMs: number
): number {
	if (!envelope || envelope.gain <= 0) {
		return 0;
	}
	return clamp(evaluateEnvelope(envelope, beats, tMs) / envelope.gain);
}

interface CompiledWash {
	cast: WashCast;
	jetEmission: Envelope | null;
	jetDrive: Envelope | null;
	burstEmission: Envelope | null;
	burstDrive: Envelope | null;
	mediumEmission: Envelope | null;
	burstSpeed: number;
}

let compiled: CompiledWash | null = null;

function compileWash(): CompiledWash {
	const preset = presetById(WASH_PRESET_ID);
	const reading = readPresetSeal(preset.signs, WASH_SIGIL);
	const values = washControlValues();
	const spellIR = buildSpellIR({
		values,
		element: 'fire',
		sigil: WASH_SIGIL,
		activatedAt: 0,
		config: CONFIG,
		reading
	});
	const score = compileScore(spellIR.plan, spellIR);
	const tracks = scoreTracks(score);
	const jet = tracks.find((track) => track.id === 'jet-aim');
	const burst = tracks.find((track) => track.kind === 'burst');
	const medium = tracks.find((track) => track.kind === 'shimmer');

	const jetParams = jet?.kind === 'jet' ? jet.params : null;
	const burstParams = burst?.kind === 'burst' ? burst.params : null;

	const cast: WashCast = {
		totalMs: score.totalMs,
		beats: score.beats,
		axis: jetParams?.axis ?? { x: 0, y: 0, z: 1 },
		feet: (jetParams?.sites ?? []).map((site) => site.at),
		footprint: jetParams?.footprint ?? 0.45,
		speed: jetParams?.speed ?? 1.9,
		symmetry: jetParams?.symmetry ?? 1,
		caption: `${preset.label} · ${WASH_SIGIL} · ${tracks.map((track) => track.id).join(', ')}`
	};

	return {
		cast,
		jetEmission: envelopeOf(jet, 'emission'),
		jetDrive: envelopeOf(jet, 'drive'),
		burstEmission: envelopeOf(burst, 'emission'),
		burstDrive: envelopeOf(burst, 'drive'),
		mediumEmission: envelopeOf(medium, 'emission'),
		burstSpeed: burstParams?.speed ?? 1.6
	};
}

/** The compiled cast, built once. */
export function buildWashCast(): WashCast {
	compiled ??= compileWash();
	return compiled.cast;
}

/**
 * The arc at `tMs`, in cast time. Envelopes come from the score; the two shaping
 * terms that are pure art direction (`reach` and `mass`) are hand-timed on top of
 * them, and say so.
 */
export function sampleWashCue(tMs: number): WashCue {
	compiled ??= compileWash();
	const { beats } = compiled.cast;
	const beat = beatAt(beats, tMs);

	const charge = curveAt('swell', progressThrough(beats.charge, tMs));
	const strike = normalized(compiled.burstEmission, beats, tMs);
	const feed = normalized(compiled.jetEmission, beats, tMs);
	const drive = normalized(compiled.jetDrive, beats, tMs);
	const medium = normalized(compiled.mediumEmission, beats, tMs);

	// Hand-timed decay. The score stops feeding at the end of `body`, so what is
	// already on the page has to burn down across release and afterglow.
	const tail = spanOf(beats, 'release', 'afterglow');
	const life = tMs < tail.startMs ? 1 : Math.pow(1 - progressThrough(tail, tMs), 1.35);

	// Hand-timed column growth: it overshoots on the punch, settles into the roar.
	const sinceStrike = Math.max(0, tMs - beats.strike.startMs);
	const climb = clamp(sinceStrike / 780);
	const overshoot = 1 + 0.26 * curveAt('pulse', clamp(sinceStrike / 620));
	const reach = clamp(curveAt('attack', climb) * overshoot * life, 0, 1.3);

	const roar = Math.max(feed, drive * 0.9);
	const burn = (tMs < beats.body.endMs ? roar : 0.82) * life;
	const mass = clamp(0.16 * medium + 0.92 * burn + 0.85 * strike * life);
	const scorch = clamp((tMs - beats.strike.startMs) / 1500);

	const burstAge = (tMs - beats.strike.startMs) / 1000;
	const burstDrive = normalized(compiled.burstDrive, beats, tMs);
	const burstRadius =
		burstAge <= 0 ? 0 : compiled.burstSpeed * 1.05 * (1 - Math.exp(-burstAge * 2.3));
	const burstFade = clamp(burstDrive * (1 - clamp(burstAge / 1.1))) * life;

	return {
		tMs,
		beat,
		charge: charge * clamp(1 - progressThrough(beats.strike, tMs) * 1.6),
		strike,
		feed,
		drive,
		medium,
		life,
		burn,
		scorch,
		reach,
		mass,
		burstRadius,
		burstFade
	};
}
