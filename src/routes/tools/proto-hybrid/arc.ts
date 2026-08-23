/**
 * @file The energy arc, hand-timed over the compiled score's beats. The score
 * says where the beats fall; how hard each one hits is authored here, because a
 * bake-off judges a read rather than a physics term.
 *
 * One arc feeds both populations, which is half of why they look like one thing:
 * the fluid's spawn rate and the brush's mark rate are two readings of the same
 * envelope, so the licks thicken and starve exactly when the mass does.
 */

import type { HybridSpell } from './hybridSpell.js';

/** Milliseconds the punch is concentrated into, measured from the strike's start. */
const PUNCH_MS = 250;
/** Time constant of the punch's fall, in milliseconds. */
const PUNCH_FALL_MS = 88;

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * The strike's overpressure at `tMs`, 0..1. A spike that is over inside a
 * quarter second: the punch has to read as an event, and anything that decays
 * slowly enough to still be rising at the body reads as a slug instead.
 */
export function punchAt(spell: HybridSpell, tMs: number): number {
	const since = tMs - spell.beats.strike.startMs;
	if (since < 0 || since > PUNCH_MS) {
		return 0;
	}
	// Arriving over a few frames rather than one, so the front has a spread of
	// ages in it and never lands as a single flat tone.
	const arrive = clamp01(since / 26);
	return arrive * Math.exp(-since / PUNCH_FALL_MS);
}

/** How much fuel the seal is pushing at `tMs`, as the fraction of parcels alive. */
export function emissionAt(spell: HybridSpell, tMs: number): number {
	const { beats } = spell;
	if (tMs < beats.strike.startMs) {
		return 0;
	}
	if (tMs < beats.strike.endMs) {
		// The column is already filling in behind the punch, so when the punch burns
		// out there is a body standing there rather than a gap.
		const through = (tMs - beats.strike.startMs) / (beats.strike.endMs - beats.strike.startMs);
		return 0.34 + 0.42 * through;
	}
	if (tMs < beats.body.endMs) {
		const through = (tMs - beats.body.startMs) / Math.max(1, beats.body.endMs - beats.body.startMs);
		// Roaring sustain, breathing rather than flat, so the mass never settles.
		return 0.7 + 0.09 * Math.sin(through * 11.4) + 0.05 * Math.sin(through * 27.1 + 1.3);
	}
	if (tMs < beats.release.endMs) {
		const through =
			(tMs - beats.release.startMs) / Math.max(1, beats.release.endMs - beats.release.startMs);
		return 0.62 * (1 - through) * (1 - through);
	}
	return 0;
}

/** How much of the charge beat's inward ember drift is running at `tMs`, 0..1. */
export function emberDriftAt(spell: HybridSpell, tMs: number): number {
	const charge = spell.beats.charge;
	if (tMs >= charge.endMs) {
		return 0;
	}
	// Quiet buildup: the medium gathers, fastest just before the strike.
	const through = tMs / Math.max(1, charge.endMs);
	return Math.min(1, through * through * 1.25);
}

/**
 * How fast a parcel burns through its own life at `tMs`. One while the spell is
 * fed; rising through the release, so the mass already in the air cools and
 * thins instead of hanging on past the cast.
 */
export function burnAt(spell: HybridSpell, tMs: number): number {
	const { release } = spell.beats;
	if (tMs < release.startMs) {
		return 1;
	}
	const through = clamp01((tMs - release.startMs) / Math.max(1, spell.totalMs - release.startMs));
	return 1 + 3.1 * through * through;
}

/** How hard the column is driven at `tMs`, as a multiplier on nozzle speed. */
export function driveAt(spell: HybridSpell, tMs: number): number {
	const release = spell.beats.release;
	const decay =
		tMs < release.startMs
			? 1
			: Math.max(0, 1 - (tMs - release.startMs) / Math.max(1, spell.totalMs - release.startMs));
	return (0.74 + 1.15 * punchAt(spell, tMs)) * (0.36 + 0.64 * decay);
}

/** Brush marks born per second at `tMs`. The same shape the fluid's fuel has. */
export function lickRateAt(spell: HybridSpell, tMs: number): number {
	const { beats } = spell;
	if (tMs < beats.strike.startMs) {
		return 0;
	}
	if (tMs < beats.strike.endMs) {
		// The punch tears licks off the front in a burst, then settles to the roar.
		return 380 + 1700 * punchAt(spell, tMs);
	}
	if (tMs < beats.body.endMs) {
		const through = (tMs - beats.body.startMs) / Math.max(1, beats.body.endMs - beats.body.startMs);
		return (500 - 70 * through) * (1 + 0.16 * Math.sin(through * 17.3));
	}
	if (tMs < beats.release.endMs) {
		const through =
			(tMs - beats.release.startMs) / Math.max(1, beats.release.endMs - beats.release.startMs);
		return 500 * (1 - through) ** 2.2;
	}
	return 0;
}

/** How much of the cast has cooled to smoke at `tMs`, 0..1. Cools the pigment. */
export function sootAt(spell: HybridSpell, tMs: number): number {
	const { beats } = spell;
	if (tMs < beats.body.startMs) {
		return 0;
	}
	if (tMs < beats.body.endMs) {
		return (
			0.15 *
			clamp01((tMs - beats.body.startMs) / Math.max(1, beats.body.endMs - beats.body.startMs))
		);
	}
	if (tMs < beats.release.endMs) {
		const through =
			(tMs - beats.release.startMs) / Math.max(1, beats.release.endMs - beats.release.startMs);
		return 0.15 + 0.6 * through;
	}
	const through = clamp01(
		(tMs - beats.afterglow.startMs) / Math.max(1, beats.afterglow.endMs - beats.afterglow.startMs)
	);
	return 0.75 + 0.25 * through;
}
