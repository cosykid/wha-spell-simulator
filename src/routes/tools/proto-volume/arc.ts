/**
 * @file The energy arc over the compiled beats, trimmed from proto-hybrid's.
 * One arc feeds every style and element: the strike is a spike, the body
 * breathes, the release starves the spawn and the afterglow drains what is
 * still standing. HOW an element spends that energy is elements.ts's business.
 */

import type { ProtoSpell } from './spell.js';

const PUNCH_MS = 250;
const PUNCH_FALL_MS = 88;

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** The strike's overpressure, 0..1, over inside a quarter second. */
export function punchAt(spell: ProtoSpell, tMs: number): number {
	const since = tMs - spell.beats.strike.startMs;
	if (since < 0 || since > PUNCH_MS) {
		return 0;
	}
	return clamp01(since / 26) * Math.exp(-since / PUNCH_FALL_MS);
}

/** How much mass the seal is pushing, 0..1. Zero through the whole charge. */
export function emissionAt(spell: ProtoSpell, tMs: number): number {
	const { beats } = spell;
	if (tMs < beats.strike.startMs) {
		return 0;
	}
	if (tMs < beats.strike.endMs) {
		const through = (tMs - beats.strike.startMs) / (beats.strike.endMs - beats.strike.startMs);
		return 0.34 + 0.42 * through;
	}
	if (tMs < beats.body.endMs) {
		const through = (tMs - beats.body.startMs) / Math.max(1, beats.body.endMs - beats.body.startMs);
		return 0.7 + 0.09 * Math.sin(through * 11.4) + 0.05 * Math.sin(through * 27.1 + 1.3);
	}
	if (tMs < beats.release.endMs) {
		const through =
			(tMs - beats.release.startMs) / Math.max(1, beats.release.endMs - beats.release.startMs);
		return 0.62 * (1 - through) * (1 - through);
	}
	return 0;
}

/** Charge-beat ambient, 0..1: the quiet inward gathering before the strike. */
export function ambientAt(spell: ProtoSpell, tMs: number): number {
	const charge = spell.beats.charge;
	if (tMs >= charge.endMs) {
		return 0;
	}
	const through = tMs / Math.max(1, charge.endMs);
	return Math.min(1, through * through * 1.25);
}

/** Multiplier on how fast mass already in the air ages. Rises in release. */
export function burnAt(spell: ProtoSpell, tMs: number): number {
	const { release } = spell.beats;
	if (tMs < release.startMs) {
		return 1;
	}
	const through = clamp01((tMs - release.startMs) / Math.max(1, spell.totalMs - release.startMs));
	return 1 + 3.1 * through * through;
}

/** Multiplier on nozzle speed: the punch drives hard, the release lets go. */
export function driveAt(spell: ProtoSpell, tMs: number): number {
	const release = spell.beats.release;
	const decay =
		tMs < release.startMs
			? 1
			: Math.max(0, 1 - (tMs - release.startMs) / Math.max(1, spell.totalMs - release.startMs));
	return (0.74 + 1.15 * punchAt(spell, tMs)) * (0.36 + 0.64 * decay);
}

/** How drained the ground pool is, 0..1. Water's puddle dries on this clock. */
export function drainAt(spell: ProtoSpell, tMs: number): number {
	const { afterglow } = spell.beats;
	if (tMs < afterglow.startMs) {
		return 0;
	}
	return clamp01((tMs - afterglow.startMs) / Math.max(1, afterglow.endMs - afterglow.startMs));
}
