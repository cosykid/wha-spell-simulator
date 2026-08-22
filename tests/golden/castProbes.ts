/**
 * @file The cast probe table: one row is one claim about one cast at one moment,
 * tagged with the ruling or the ground-truth section it pins.
 *
 * Same discipline as [`probes.ts`](probes.ts) — thresholds are loose, because a
 * row pins the qualitative claim of its ruling and not today's tuning constants
 * — and the same shape, over the redesign's own parcels instead of the field's.
 *
 * Most rows name a lab preset. The `pinwheel` fixture is the exception: R-05's
 * circulation `Gamma` is a **column-family** aggregate, and no lab preset draws
 * tangential columns, so the one arrangement the vortex exists for has to be
 * built here. The lab corpus stays as it is; it belongs to the look tier.
 */

import { compileScore } from '../../src/lib/cast/score/compileScore.js';
import { resolvePlan } from '../../src/lib/compiler/plan/resolvePlan.js';
import { classifyTwist } from '../../src/lib/compiler/reading/facing.js';
import { readPresetSeal } from '../../src/lib/ui/spellEffectLab.js';
import { FIELD_PRESETS } from '../../src/lib/ui/spellEffectLabPresets.js';
import { signedAngleDifferenceDeg, vectorFromAngleDeg } from '../../src/lib/utils/geometry.js';
import { castSource } from './casts.js';
import { GOLDEN_SIGIL } from './plans.js';
import type { CastProbe } from './castProbeMetrics.js';
import type { SignReading, SpellScore } from '../../src/lib/types.js';

/** Inside the 980ms charge beat, on a whole simulation step. */
const CHARGE_MS = 850;
/** Late in the body of a 4-second cast, where the slow primitives have arrived. */
const BODY_MS = 2600;

/** A column sign gated the way `readSeal` gates one. */
function column(atDeg: number, facingDeg: number): SignReading {
	return {
		id: 'column',
		manifestation: 'column',
		at: vectorFromAngleDeg(atDeg),
		length: 1,
		facing: vectorFromAngleDeg(facingDeg),
		facingClass: classifyTwist(signedAngleDifferenceDeg(atDeg + 180, facingDeg)),
		facingSource: 'ml-pose',
		facingTrust: 0.9,
		power: 0.7
	};
}

/** Four columns each pointing a quarter turn off their own arm: `P = 0, C = 0, Gamma = S`. */
function pinwheelScore(): SpellScore {
	const signs = [0, 90, 180, 270].map((atDeg) => column(atDeg, (atDeg + 90) % 360));
	const reading = {
		signs,
		sigil: GOLDEN_SIGIL,
		element: 'water' as const,
		quality: 1,
		symmetry: null,
		notes: []
	};
	return compileScore(resolvePlan(reading), castSource('pinwheel'));
}

/** Every subject a row may name, by the name it names it with. */
export function castSubjects(): Map<string, SpellScore> {
	const subjects = new Map<string, SpellScore>();
	for (const preset of FIELD_PRESETS) {
		subjects.set(
			preset.id,
			compileScore(resolvePlan(readPresetSeal(preset.signs, GOLDEN_SIGIL)), castSource(preset.id))
		);
	}
	subjects.set('pinwheel', pinwheelScore());
	return subjects;
}

/** Rows that all probe one subject, so the name is written once per group. */
function on(subject: string, rows: Array<Omit<CastProbe, 'subject'>>): CastProbe[] {
	return rows.map((row) => ({ subject, ...row }));
}

/** A row every lab preset owes, because R-10's world is the same in all of them. */
function onEveryPreset(row: Omit<CastProbe, 'subject'>): CastProbe[] {
	return FIELD_PRESETS.map((preset) => ({ subject: preset.id, ...row }));
}

export const CAST_PROBES: CastProbe[] = [
	...onEveryPreset({
		atMs: CHARGE_MS,
		of: 'medium',
		expect: { metric: 'parcels', above: 0 },
		rulingId: 'R-10',
		claim: 'the world holds a thin ambient medium whatever the seal manifests'
	}),
	...onEveryPreset({
		atMs: CHARGE_MS,
		of: 'medium',
		expect: { metric: 'radialSpeed', below: 0 },
		rulingId: 'R-01',
		claim: 'and the charge beat is that medium drawing inward, not dead time'
	}),
	...onEveryPreset({
		atMs: CHARGE_MS,
		of: 'manifested',
		expect: { metric: 'parcels', below: 1 },
		rulingId: 'R-02',
		claim: 'while nothing the seal manifests may erupt before the portal has tilted'
	}),

	...on('pinwheel', [
		{
			atMs: BODY_MS,
			of: 'vortex',
			expect: { metric: 'axisDensity', radius: 0.2, below: 0.02 },
			rulingId: 'R-05',
			claim: 'a pinwheel of columns turns into a vortex, and its eye stays hollow'
		},
		{
			atMs: BODY_MS,
			of: 'vortex',
			expect: { metric: 'axisDensity', radius: 0.8, above: 0.6 },
			rulingId: 'R-05',
			claim: 'the funnel wall is where the population actually sits'
		},
		{
			atMs: BODY_MS,
			of: 'vortex',
			expect: { metric: 'meanHeight', above: 0.1 },
			rulingId: 'R-05',
			claim: 'and the wall carries an updraft, so the cell climbs instead of stirring flat'
		}
	]),

	...on('levitation', [
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'meanHeight', above: 0.6, below: 1.1 },
			rulingId: 'ground-truth-6',
			claim: 'held magic settles into the hover band rather than climbing away'
		},
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'meanRadius', below: 0.5 },
			rulingId: 'ground-truth-6',
			claim: 'and gathers onto the hover axis, so the grip reads as a blob and not a spray'
		}
	]),

	...on('pull-inward', [
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'radialSpeed', below: 0 },
			rulingId: 'R-11',
			claim: 'a pull-only seal manifests nothing, and what it shows is the medium streaming in'
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'axisDensity', radius: 0.4, above: 0.1 },
			rulingId: 'ground-truth-7',
			claim: 'arriving matter pools against the seal instead of spiking through the center'
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'meanHeight', below: 0.05 },
			rulingId: 'ground-truth-7',
			claim: 'a straight pull gains no twist, so its inflow stays flat on the paper'
		}
	]),

	...on('pull-inverted', [
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'radialSpeed', above: 0 },
			rulingId: 'ground-truth-7',
			claim: 'the same signed kernel un-reversed is a push: no second code path for inversion'
		}
	]),

	...on('pull-vortex', [
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'meanHeight', above: 0.05 },
			rulingId: 'ground-truth-7',
			claim: 'a slanted pull is helical inflow: only the twist lifts, and here it does'
		}
	])
];
