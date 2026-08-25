/**
 * @file Bake-off glue: the one spell this prototype burns. Copied from the Spell
 * Effect Lab's path (preset signs -> `SealReading` -> `SpellIR` -> `SpellScore`)
 * rather than refactored out of it, because this route is a throwaway.
 *
 * The prototype only needs the shape of the flame, so the score is read down to
 * a small {@link FluidSpell}: where the column stands, how wide and how far it
 * reaches, and the five beat boundaries the energy arc is hand-timed against.
 */

import { CONFIG } from '$lib/config.js';
import { compileScore } from '$lib/cast/score/compileScore.js';
import { buildSpellIR, defaultControlValues, readPresetSeal } from '$lib/ui/spellEffectLab.js';
import { presetById } from '$lib/ui/spellEffectLabPresets.js';
import type { Beat, BeatWindow, JetParams, Vector } from '$lib/types.js';

/** The one arrangement the prototype performs. */
export const PROTO_PRESET = 'column-balanced';
/** The one sigil the prototype paints. */
export const PROTO_SIGIL = 'fire';

/** A column site read off the plan: where a drawn column stands on the ring, and where it leans. */
export interface FeederSite {
	at: Vector;
	facing: Vector;
}

/** What the fluid needs to know about the spell it is burning. */
export interface FluidSpell {
	totalMs: number;
	beats: Record<Beat, BeatWindow>;
	/** Seal units from the axis where the beam is still at half strength. */
	footprint: number;
	/** Seal units along the axis the beam spends itself over. */
	reach: number;
	/** Seal units per second at the nozzle. */
	speed: number;
	/** How hard the beam drafts what surrounds it onto its own axis, 0..1. */
	converge: number;
	/** The drawn columns, as base tongues that feed the main mass. */
	sites: FeederSite[];
}

/** Fallback numbers, used only if the plan resolves without a jet. */
const BARE_JET = { footprint: 0.45, reach: 1.6, speed: 1.9, converge: 0.6 };

/**
 * Compiles the prototype's spell once. Everything downstream reads the returned
 * value and never the compiler again.
 */
export function protoFluidSpell(): FluidSpell {
	const preset = presetById(PROTO_PRESET);
	const reading = readPresetSeal(preset.signs, PROTO_SIGIL);
	const spellIR = buildSpellIR({
		values: defaultControlValues(),
		element: 'fire',
		sigil: PROTO_SIGIL,
		activatedAt: 0,
		config: CONFIG,
		reading
	});
	const score = compileScore(spellIR.plan, spellIR);
	const jet = score.layers.flatMap((layer) => layer.tracks).find((track) => track.kind === 'jet')
		?.params as JetParams | undefined;

	return {
		totalMs: score.totalMs,
		beats: score.beats,
		footprint: jet?.footprint ?? BARE_JET.footprint,
		reach: jet?.reach ?? BARE_JET.reach,
		speed: jet?.speed ?? BARE_JET.speed,
		converge: jet?.converge ?? BARE_JET.converge,
		sites: (jet?.sites ?? []).map((site) => ({ at: site.at, facing: site.facing }))
	};
}

/** How much fuel the seal is pushing at `tMs`, 0..1. The energy arc, hand-timed. */
export function emissionAt(spell: FluidSpell, tMs: number): number {
	const { beats } = spell;
	if (tMs < beats.strike.startMs) {
		return 0;
	}
	if (tMs < beats.strike.endMs) {
		// The punch. Fuel arrives over about ninety milliseconds rather than in one
		// frame: still a hard hit, but the mass is born in a wave, so the front has
		// a spread of ages in it instead of one flat colour.
		const through = (tMs - beats.strike.startMs) / (beats.strike.endMs - beats.strike.startMs);
		return Math.min(1, 0.14 + through * 3.2);
	}
	if (tMs < beats.body.endMs) {
		const through = (tMs - beats.body.startMs) / Math.max(1, beats.body.endMs - beats.body.startMs);
		// Roaring sustain, breathing rather than flat, so the mass never settles.
		return 0.66 + 0.09 * Math.sin(through * 11.4) + 0.05 * Math.sin(through * 27.1 + 1.3);
	}
	if (tMs < beats.release.endMs) {
		const through =
			(tMs - beats.release.startMs) / Math.max(1, beats.release.endMs - beats.release.startMs);
		return 0.6 * (1 - through) * (1 - through);
	}
	return 0;
}

/** How much of the charge beat's inward ember drift is running at `tMs`, 0..1. */
export function emberDriftAt(spell: FluidSpell, tMs: number): number {
	const charge = spell.beats.charge;
	if (tMs >= charge.endMs) {
		return 0;
	}
	const through = tMs / Math.max(1, charge.endMs);
	// Quiet buildup: the medium gathers, fastest just before the strike.
	return Math.min(1, through * through * 1.25);
}

/** The strike's overpressure at `tMs`, 0..1: a hard spike that decays over the punch. */
export function strikeAt(spell: FluidSpell, tMs: number): number {
	const { strike } = spell.beats;
	// The punch keeps pushing a little past its own beat, so the column does not
	// step down the instant the strike window closes.
	const punchMs = (strike.endMs - strike.startMs) * 1.35;
	if (tMs < strike.startMs || tMs > strike.startMs + punchMs) {
		return 0;
	}
	const through = (tMs - strike.startMs) / punchMs;
	return (1 - through) ** 1.6;
}

/**
 * How fast a parcel burns through its own life at `tMs`. One while the spell is
 * fed; rising through the release, so the mass that is already in the air cools
 * and thins instead of hanging on past the cast.
 */
export function burnAt(spell: FluidSpell, tMs: number): number {
	const { release } = spell.beats;
	if (tMs < release.startMs) {
		return 1;
	}
	const through = Math.min(
		1,
		(tMs - release.startMs) / Math.max(1, spell.totalMs - release.startMs)
	);
	return 1 + 3.1 * through * through;
}

/** How hard the column is driven at `tMs`, as a multiplier on nozzle speed. */
export function driveAt(spell: FluidSpell, tMs: number): number {
	const release = spell.beats.release;
	const decay =
		tMs < release.startMs
			? 1
			: Math.max(0, 1 - (tMs - release.startMs) / Math.max(1, spell.totalMs - release.startMs));
	return (0.72 + 0.9 * strikeAt(spell, tMs)) * (0.35 + 0.65 * decay);
}
