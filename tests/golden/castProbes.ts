/**
 * @file The cast probe table: one row is one claim about one cast at one moment,
 * tagged with the ruling or the ground-truth section it pins. Thresholds are
 * deliberately loose: a row pins the qualitative claim of its ruling, not today's
 * tuning constants.
 *
 * This is the whole probe table now. The field tier's rows died with
 * `sampleFieldForce`; the ones citing a real ruling were re-measured on parcels
 * and live here, and the ones citing `legacy` described the deleted engine.
 *
 * Most rows name a lab preset. The `pinwheel` fixture is the exception: R-05's
 * circulation `Gamma` is a **column-family** aggregate, and no lab preset draws
 * tangential columns, so the one arrangement the vortex exists for has to be
 * built here.
 */

import { compileScore } from '../../src/lib/cast/score/compileScore.js';
import { resolvePlan } from '../../src/lib/compiler/plan/resolvePlan.js';
import { classifyTwist } from '../../src/lib/compiler/reading/facing.js';
import { readPresetSeal } from '../../src/lib/ui/spellEffectLab.js';
import { LAB_PRESETS } from '../../src/lib/ui/spellEffectLabPresets.js';
import { signedAngleDifferenceDeg, vectorFromAngleDeg } from '../../src/lib/utils/geometry.js';
import { castSource } from './casts.js';
import { GOLDEN_SIGIL } from './plans.js';
import type { CastProbe } from './castProbeMetrics.js';
import type { SignReading, SpellScore } from '../../src/lib/types.js';

/** Inside the 980ms charge beat, on a whole simulation step. */
const CHARGE_MS = 850;
/** Early in the body of a 4-second cast, while spawn positions still show. */
const EARLY_BODY_MS = 1600;
/** Late in the body of a 4-second cast, where the slow primitives have arrived. */
const BODY_MS = 2600;
/** Inside the release, where the drive has eased and a grip can take hold. */
const RELEASE_MS = 3000;

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
	for (const preset of LAB_PRESETS) {
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
	return LAB_PRESETS.map((preset) => ({ subject: preset.id, ...row }));
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

	...on('column-balanced', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'meanHeight', above: 0.2 },
			rulingId: 'R-05',
			claim:
				'a balanced ring of columns clashes into a beam that lifts the population off the paper'
		}
	]),

	...on('column-unbalanced', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'meanX', below: -0.1 },
			rulingId: 'R-05',
			claim:
				'the east sign faces inward, so the beam leans west, where the sign points, never toward the side carrying it'
		}
	]),

	...on('column-levitation', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'maxHeight', above: 1.2 },
			rulingId: 'R-18',
			claim:
				'drive wins while driven: a live beam fires straight through the grip, past its ceiling band, instead of being clipped mid-beam'
		},
		{
			atMs: RELEASE_MS,
			of: 'jet',
			expect: { metric: 'maxHeight', below: 1.7 },
			rulingId: 'R-18',
			claim:
				'and grip wins on coast, so once the drive eases the hold takes the spent parcels instead of letting them coast away'
		}
	]),

	...on('column-half-ring', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'meanHeight', above: 0.3 },
			rulingId: 'R-14',
			claim:
				'unopposed convergence still leaves the paper: a half-ring is a diagonal geyser, never a ground-hugging surge'
		},
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'meanX', below: -0.1 },
			rulingId: 'R-14',
			claim: 'and it leans off the open side of the ring, where the uncancelled flux points'
		}
	]),

	...on('column-cancelled', [
		{
			atMs: BODY_MS,
			of: 'burst',
			expect: { metric: 'axisDensity', radius: 0.3, below: 0.05 },
			rulingId: 'R-15',
			claim:
				'cancelled ink leaves A = 0, so nothing steers the ring: it spreads isotropically instead of collimating'
		}
	]),

	...on('levitation-pinwheel', [
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'axisDensity', radius: 0.3, below: 0.05 },
			rulingId: 'R-16',
			claim:
				'a rotor spins without a grip, so its mass rides a ring and leaves the hover axis empty, where a gripping hold packs it'
		},
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'meanHeight', above: 0.5 },
			rulingId: 'R-16',
			claim: 'and it still climbs to the rest height, because a gripless hold rises before it turns'
		}
	]),

	...on('levitation-inverted', [
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'parcels', below: 1 },
			rulingId: 'R-17',
			claim:
				'outward levitation grips nothing, so a dud holds no mass at all rather than pressing or repelling'
		}
	]),

	...on('region-pair', [
		{
			atMs: BODY_MS,
			of: 'burst',
			expect: { metric: 'meanRadius', above: 0.9 },
			rulingId: 'R-19',
			claim: 'two outward chevrons complete the fence, so the source is the moat and not the disc'
		},
		{
			atMs: BODY_MS,
			of: 'burst',
			expect: { metric: 'axisDensity', radius: 0.5, below: 0.1 },
			rulingId: 'R-19',
			claim: 'and the interior it fences off stays empty'
		}
	]),

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
		},
		{
			atMs: RELEASE_MS,
			of: 'hold',
			expect: { metric: 'meanRadius', below: 0.35 },
			rulingId: 'R-20',
			claim:
				'by the release the ball has filled and closed its own feed, so it reads as a suspended mass rather than a column still being fed from the disk'
		},
		{
			atMs: RELEASE_MS,
			of: 'hold',
			expect: { metric: 'parcels', below: 40 },
			rulingId: 'R-20',
			claim:
				'and the held mass settles at a capacity set by the grip instead of growing with the clock'
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
			expect: { metric: 'meanRadius', below: 0.8 },
			rulingId: 'R-13',
			claim:
				'pull owns the intake verb: the population gathers toward the seal instead of dispersing'
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
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'meanHeight', below: 0.1 },
			rulingId: 'R-07',
			claim:
				'an outward-facing pull carries no twist, so its push hugs the plane rather than climbing'
		}
	]),

	...on('dispersion', [
		{
			atMs: BODY_MS,
			of: 'fan',
			expect: { metric: 'radialSpeed', above: 0.1 },
			rulingId: 'R-07',
			claim: 'dispersion gives C < 0: a radial fan away from the seal, on every side at once'
		},
		{
			atMs: BODY_MS,
			of: 'fan',
			expect: { metric: 'meanHeight', below: 0.15 },
			rulingId: 'R-07',
			claim: 'and the fan hugs the plane (canon Snugstone dispersal) rather than aiming out of it'
		}
	]),

	...on('region-sector', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'meanX', above: 0.3 },
			rulingId: 'R-09',
			claim: 'row 10: collinear agreeing chevrons exhaust laterally along their facing, here east'
		}
	]),

	...on('region-ring', [
		{
			atMs: EARLY_BODY_MS,
			of: 'jet',
			expect: { metric: 'meanRadius', above: 0.6 },
			rulingId: 'R-09',
			claim: 'row 4: opposed pairs open an annulus, so what the valve passes sits on the ring line'
		},
		{
			atMs: EARLY_BODY_MS,
			of: 'jet',
			expect: { metric: 'axisDensity', radius: 0.5, below: 0.1 },
			rulingId: 'R-09',
			claim: 'and the interior is pinched off'
		}
	]),

	...on('pull-vortex', [
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'meanHeight', above: 0.05 },
			rulingId: 'ground-truth-7',
			claim: 'a slanted pull is helical inflow: only the twist lifts, and here it does'
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'axisDensity', radius: 0.4, below: 0.02 },
			rulingId: 'ground-truth-7',
			claim: 'and canon calls the slanted case a vortex, so its center is an eye and not a pool'
		}
	])
];
