/**
 * @file `compileScore` — the Score layer's entry point: a resolved `SpellPlan`
 * plus the compiled spell's length and signature become an authored timeline.
 *
 * Two promises shape it. **Every plan compiles to at least one track**, because
 * R-11 makes "manifests nothing" a look rather than an absence, so there is no
 * empty path to fall into and nothing here throws. And **no plan forks on
 * element**: a sigil picks a look row (phase 4), never a behavior.
 *
 * Phase 4 owns `vortex`, `hold`, `intake`, `vessel` and `shimmer`. A plan asking
 * for one is not dropped and not faked: its budget is routed into the nearest
 * built kind at a conservative gain, and the score says so in a `routed-*` note.
 *
 * @example
 * const score = compileScore(resolvePlan(reading), spellIR);
 */

import { buildBeats, totalMsFor } from './beats.js';
import { burstTrack } from './tracks/burst.js';
import { circulationFan, dispersionFan, intakeFan, vesselFan } from './tracks/fan.js';
import { aimJet, defaultJet, exhaustJet, holdJet } from './tracks/jet.js';
import { hashHex, hashSeed } from '../sim/rng.js';
import type {
	Population,
	ScoreLayer,
	ScoreNote,
	ScoreTrack,
	SpellIR,
	SpellPlan,
	SpellScore
} from '../../types.js';

/**
 * What the Score reads off the compiled spell: the reset key it seeds from and
 * the length it lays its beats over. Everything else it needs is in the plan.
 */
export type CastSource = Pick<SpellIR, 'signature' | 'duration'>;

/** R-12's single v1 layer: the outermost complete ring, and only it. */
const OUTER_LAYER = 'outer';

/**
 * What each track owes the notes list, by the id it is built under. A row rather
 * than a branch: `fan-dispersion` is R-08's leak, and the four below it are
 * stand-ins a phase 4 primitive will take back.
 */
const NOTE_FOR_TRACK: Record<string, ScoreNote> = {
	'fan-dispersion': 'dispersion-leak',
	'jet-hold': 'routed-hold',
	'fan-circulation': 'routed-vortex',
	'fan-intake': 'routed-intake',
	'fan-vessel': 'routed-vessel'
};

interface Performance {
	tracks: ScoreTrack[];
	notes: ScoreNote[];
}

/**
 * The plan's primitives, in performance order. The burst is unconditional (R-01
 * gives every cast a strike), and the R-11 default only appears when nothing
 * else did.
 */
function perform(plan: SpellPlan, population: Population): Performance {
	const tracks: ScoreTrack[] = [];
	const notes: ScoreNote[] = [];

	const jets = [aimJet(plan, population), exhaustJet(plan, population), holdJet(plan, population)];
	const fans = [
		dispersionFan(plan, population),
		circulationFan(plan, population),
		intakeFan(plan, population),
		vesselFan(plan, population)
	];
	for (const track of [...jets, ...fans]) {
		if (!track) {
			continue;
		}
		tracks.push(track);
		const note = NOTE_FOR_TRACK[track.id];
		if (note) {
			notes.push(note);
		}
	}

	if (tracks.length === 0) {
		tracks.push(defaultJet(plan, population));
		notes.push('manifests-nothing');
	}

	return { tracks: [burstTrack(plan, population), ...tracks], notes };
}

/**
 * The whole score digested. Identical signature means identical cast, so
 * everything the sim reads goes in and nothing else does.
 */
function scoreSignature(score: Omit<SpellScore, 'signature'>): string {
	return `score1:${hashHex(JSON.stringify(score))}`;
}

export function compileScore(plan: SpellPlan, spellIR: CastSource): SpellScore {
	const totalMs = totalMsFor(spellIR.duration);
	// R-10. Create-class sigils emit their own element, manipulate-only sigils
	// move the ambient medium. The plan already made that call; nothing here
	// second-guesses it per family.
	const population: Population = plan.mode === 'manipulate' ? 'ambient' : 'own';
	const { tracks, notes } = perform(plan, population);
	const layer: ScoreLayer = { id: OUTER_LAYER, aperture: plan.aperture, tracks };

	const score: Omit<SpellScore, 'signature'> = {
		version: 1,
		seed: hashSeed(spellIR.signature),
		sigil: plan.sigil,
		element: plan.element,
		totalMs,
		beats: buildBeats(totalMs),
		layers: [layer],
		notes
	};
	return { ...score, signature: scoreSignature(score) };
}

/** Every track in a score, flattened past R-12's single-layer hook. */
export function scoreTracks(score: SpellScore): ScoreTrack[] {
	return score.layers.flatMap((layer) => layer.tracks);
}
