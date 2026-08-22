/**
 * @file `compileScore` — the Score layer's entry point: a resolved `SpellPlan`
 * plus the compiled spell's length and signature become an authored timeline.
 *
 * Three promises shape it. **Every plan compiles to at least one track**, because
 * R-11 makes "manifests nothing" a look rather than an absence, so there is no
 * empty path to fall into and nothing here throws. **No plan forks on element**:
 * a sigil picks a look row, never a behavior. And **every score carries the
 * ambient medium** (R-10), so a manipulate-mode seal always has something to
 * manipulate and the charge beat always has R-01's content in it.
 *
 * R-13's `vessel` is the one primitive still without a kernel. A plan asking for
 * one is not dropped and not faked: its budget is routed into a fan at a
 * conservative gain and the score says so in a `routed-vessel` note.
 *
 * @example
 * const score = compileScore(resolvePlan(reading), spellIR);
 */

import { buildBeats, totalMsFor } from './beats.js';
import { burstTrack } from './tracks/burst.js';
import { dispersionFan, vesselFan } from './tracks/fan.js';
import { holdTrack } from './tracks/hold.js';
import { intakeTrack } from './tracks/intake.js';
import { aimJet, defaultJet, exhaustJet } from './tracks/jet.js';
import { ambientShimmer } from './tracks/shimmer.js';
import { circulationVortex } from './tracks/vortex.js';
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
 * than a branch: `fan-dispersion` is R-08's leak, and `fan-vessel` is the one
 * stand-in left, for the one primitive still deferred.
 */
const NOTE_FOR_TRACK: Record<string, ScoreNote> = {
	'fan-dispersion': 'dispersion-leak',
	'fan-vessel': 'routed-vessel'
};

interface Performance {
	tracks: ScoreTrack[];
	notes: ScoreNote[];
}

/**
 * The plan's declared couplings, written onto the tracks they bind. The plan
 * names which primitives a hold captures; the score records the holder's track
 * id on each of them, and the sim reads nothing else.
 *
 * R-18 ranks the pair: drive wins while driven, grip wins on coast. Capture is
 * soft, because `hold`'s constraint only takes parcels that have effectively
 * arrived, so a live column is not clipped mid-beam. The note keeps the ranking
 * visible in a score rather than buried in a kernel.
 */
function bindCouplings(plan: SpellPlan, tracks: ScoreTrack[]): ScoreNote[] {
	const holder = tracks.find((track) => track.kind === 'hold');
	if (!holder) {
		return [];
	}
	const captured = new Set<string>(
		plan.couplings.filter((coupling) => coupling.holder === 'hold').flatMap((c) => c.captures)
	);
	let bound = false;
	for (const track of tracks) {
		if (track !== holder && captured.has(track.kind)) {
			track.capturedBy = holder.id;
			bound = true;
		}
	}
	return bound ? ['coupling-soft'] : [];
}

/**
 * The plan's primitives, in performance order: the medium first, then the
 * strike, then the spell's own manifestation. The medium and the burst are both
 * unconditional (R-10 and R-01), and the R-11 default only appears when the plan
 * itself resolved to nothing.
 */
function perform(plan: SpellPlan, population: Population): Performance {
	const tracks: ScoreTrack[] = [];
	const notes: ScoreNote[] = [];

	const manifested = [
		aimJet(plan, population),
		exhaustJet(plan, population),
		dispersionFan(plan, population),
		circulationVortex(plan, population),
		holdTrack(plan, population),
		vesselFan(plan, population),
		intakeTrack(plan)
	];
	for (const track of manifested) {
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

	const performed = [ambientShimmer(plan), burstTrack(plan, population), ...tracks];
	notes.push(...bindCouplings(plan, performed));
	return { tracks: performed, notes };
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
	// second-guesses it per family. The two ambient-by-law tracks, the medium
	// itself and the pull coupling, set their own population and ignore this.
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
