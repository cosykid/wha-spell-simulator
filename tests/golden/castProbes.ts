/**
 * @file The cast probe table: one row is one claim about one cast at one moment,
 * tagged with the ruling or the ground-truth section it pins. Thresholds are
 * deliberately loose: a row pins the qualitative claim of its ruling, not today's
 * tuning constants.
 *
 * The rows are measured on what a cell reported, because that is what performs a
 * score. The hybrid rework changed their instrument and not one of their claims:
 * where a row used to read a uniform off a named mesh it now reads the scalar
 * that archetype publishes, and where it read a mesh's world position it reads
 * the root or the tip the cell declares. Every ruling that had a row still has
 * one, and no threshold moved.
 *
 * Every subject is a lab preset. The hand-built `pinwheel` fixture retired when
 * `column-pinwheel` joined the presets: R-05's circulation is a column-family
 * aggregate, and that preset is now the seal that draws it.
 */

import { LAB_PRESETS, type LabPreset } from '../../src/lib/ui/spellEffectLabPresets.js';
import type { CastProbe } from './castProbeMetrics.js';

/** Inside the 980ms charge beat, on a whole frame of the stage's step. */
const CHARGE_MS = 850;
/** Early in the body of a 4-second cast, while the strike's throw still shows. */
const EARLY_BODY_MS = 1600;
/** Late in the body of a 4-second cast, where the slow forms have arrived. */
const BODY_MS = 2600;
/** Inside the release, where the drive has eased and a grip can take hold. */
const RELEASE_MS = 3000;

/** Loud enough to be a mark on the paper rather than a rounding artefact. */
const SILENT = 1e-9;

/** Every subject a row may name, by the name it names it with. */
export function castSubjects(): Map<string, LabPreset> {
	return new Map(LAB_PRESETS.map((preset) => [preset.id, preset]));
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
		expect: { metric: 'ink', above: 0 },
		rulingId: 'R-10',
		claim: 'the world holds a thin ambient medium whatever the seal manifests'
	}),
	...onEveryPreset({
		atMs: CHARGE_MS,
		of: 'medium',
		expect: { metric: 'detail', name: 'inhale', above: 0.5 },
		rulingId: 'R-01',
		claim: 'and the charge beat is that medium drawing inward, not dead time'
	}),
	...onEveryPreset({
		atMs: CHARGE_MS,
		of: 'manifested',
		expect: { metric: 'ink', below: SILENT },
		rulingId: 'R-02',
		claim: 'while nothing the seal manifests may erupt before the portal has tilted'
	}),

	...on('column-balanced', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'z', above: 0.5 },
			rulingId: 'R-05',
			claim: 'a balanced ring of columns clashes into a beam that stands off the paper'
		}
	]),

	...on('column-unbalanced', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'x', below: -0.1 },
			rulingId: 'R-05',
			claim:
				'the east sign faces inward, so the beam leans west, where the sign points, never toward the side carrying it'
		}
	]),

	...on('column-levitation', [
		{
			atMs: EARLY_BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'z', above: 1.2 },
			rulingId: 'R-18',
			claim:
				'drive wins while driven: a live beam stands past the grip closing on it instead of being clipped mid-beam'
		},
		{
			atMs: RELEASE_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'z', below: 1.3 },
			rulingId: 'R-18',
			claim:
				'and grip wins on coast, so once the drive eases the hold has the column at its own shell'
		},
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'ceiling', field: 'closed', above: 0.1 },
			rulingId: 'R-18',
			claim:
				'the coupling is a ceiling and nothing else: the plan declared this capture, so the holder publishes a closed grip for the stage to carry'
		},
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'ceiling', field: 'radius', above: 0.1, below: 0.6 },
			rulingId: 'R-13',
			claim:
				'and the ceiling is the ball it actually holds, so what was caught meets a shell rather than a stop at a point'
		}
	]),

	...on('column-half-ring', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'z', above: 0.3 },
			rulingId: 'R-14',
			claim:
				'unopposed convergence still leaves the paper: a half-ring is a diagonal geyser, never a ground-hugging surge'
		},
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'x', below: -0.1 },
			rulingId: 'R-14',
			claim: 'and it leans off the open side of the ring, where the uncancelled flux points'
		}
	]),

	...on('column-cancelled', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'z', below: 1.6 },
			rulingId: 'R-15',
			claim:
				'cancelled ink leaves A = 0, so nothing steers the ring: what stands is the designed default, not the column four signs would have thrown'
		}
	]),

	...on('levitation-pinwheel', [
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'ceiling', field: 'closed', below: 0.01 },
			rulingId: 'R-16',
			claim: 'a rotor spins without a grip, so it holds nothing and constrains nothing'
		},
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'tip', axis: 'z', above: 0.5 },
			rulingId: 'R-16',
			claim: 'and it still climbs to the rest height, because a gripless hold rises before it turns'
		},
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'detail', name: 'turned', above: 1 },
			rulingId: 'R-16',
			claim: 'and it turns while it hangs there, which is the whole of what a rotor is'
		}
	]),

	...on('levitation-inverted', [
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'ink', below: SILENT },
			rulingId: 'R-17',
			claim:
				'outward levitation grips nothing, so a dud builds no hold at all rather than pressing or repelling'
		}
	]),

	...on('region-pair', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'root', axis: 'z', above: 0.1 },
			rulingId: 'R-19',
			claim:
				'two outward chevrons complete the fence, so the seal passes what it holds through a raised valve rather than off the open paper'
		},
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'radius', below: 0.2 },
			rulingId: 'R-19',
			claim: 'and it exhausts up the axis, leaving the interior it fenced off alone'
		}
	]),

	...on('column-pinwheel', [
		{
			atMs: BODY_MS,
			of: 'vortex',
			expect: { metric: 'detail', name: 'foot', above: 0.15 },
			rulingId: 'R-05',
			claim: 'a pinwheel of columns turns into a vortex, and its eye stays hollow'
		},
		{
			atMs: BODY_MS,
			of: 'vortex',
			expect: { metric: 'detail', name: 'crown', above: 0.4, below: 1 },
			rulingId: 'R-05',
			claim:
				'the funnel wall stands inside the ring the columns were drawn on, where the mass rides'
		},
		{
			atMs: BODY_MS,
			of: 'vortex',
			expect: { metric: 'detail', name: 'height', above: 0.5 },
			rulingId: 'R-05',
			claim: 'and the wall carries an updraft, so the cell climbs instead of stirring flat'
		}
	]),

	...on('levitation', [
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'tip', axis: 'z', above: 0.6, below: 1.1 },
			rulingId: 'ground-truth-6',
			claim: 'held magic settles into the hover band rather than climbing away'
		},
		{
			atMs: BODY_MS,
			of: 'hold',
			expect: { metric: 'tip', axis: 'radius', below: 0.5 },
			rulingId: 'ground-truth-6',
			claim: 'and gathers onto the hover axis, so the grip reads as a blob and not a spray'
		},
		{
			atMs: RELEASE_MS,
			of: 'hold',
			expect: { metric: 'detail', name: 'grip', above: 0.3 },
			rulingId: 'R-20',
			claim:
				'by the release the ball has filled and closed its own feed, so it reads as a suspended mass rather than a column still being fed from the disk'
		},
		{
			atMs: RELEASE_MS,
			of: 'hold',
			expect: { metric: 'ceiling', field: 'closed', above: 0.3, below: 1 },
			rulingId: 'R-20',
			claim:
				'and the held mass settles at a capacity set by the grip, approaching it instead of growing with the clock'
		}
	]),

	...on('pull-inward', [
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'detail', name: 'outward', below: 0.5 },
			rulingId: 'R-11',
			claim: 'a pull-only seal manifests nothing, and what it shows is the medium streaming in'
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'detail', name: 'to', below: 0.9 },
			rulingId: 'R-13',
			claim: 'pull owns the intake verb: the strokes end gathered at the seal instead of dispersing'
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'detail', name: 'turn', above: -0.01, below: 0.01 },
			rulingId: 'ground-truth-7',
			claim:
				'a straight pull does not turn on its way in, so arriving matter pools against the seal instead of winding into an eye'
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'detail', name: 'lift', below: 0.05 },
			rulingId: 'ground-truth-7',
			claim: 'and it gains no twist, so its inflow stays flat on the paper'
		}
	]),

	...on('pull-inverted', [
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'detail', name: 'outward', above: 0.5 },
			rulingId: 'ground-truth-7',
			claim: 'the same signed kernel un-reversed is a push: no second code path for inversion'
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'detail', name: 'lift', below: 0.1 },
			rulingId: 'R-07',
			claim:
				'an outward-facing pull carries no twist, so its push hugs the plane rather than climbing'
		}
	]),

	...on('dispersion', [
		{
			atMs: BODY_MS,
			of: 'fan',
			expect: { metric: 'detail', name: 'outer', above: 1 },
			rulingId: 'R-07',
			claim:
				'dispersion gives C < 0: the sheet runs away from the seal, past the ring it was drawn on'
		},
		{
			atMs: BODY_MS,
			of: 'fan',
			expect: { metric: 'detail', name: 'lift', below: 0.35 },
			rulingId: 'R-07',
			claim:
				'and the fan hugs the plane (canon Snugstone dispersal): only its lip ever leaves the paper'
		}
	]),

	...on('region-sector', [
		{
			atMs: BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'x', above: 0.3 },
			rulingId: 'R-09',
			claim: 'row 10: collinear agreeing chevrons exhaust laterally along their facing, here east'
		}
	]),

	...on('region-ring', [
		{
			atMs: EARLY_BODY_MS,
			of: 'jet',
			expect: { metric: 'root', axis: 'z', above: 0.1 },
			rulingId: 'R-09',
			claim: 'row 4: opposed pairs open a valve, so what the seal passes leaves through it'
		},
		{
			atMs: EARLY_BODY_MS,
			of: 'jet',
			expect: { metric: 'tip', axis: 'radius', below: 0.2 },
			rulingId: 'R-09',
			claim: 'and the flux runs up the one axis the pair left open, not across the interior'
		}
	]),

	...on('pull-vortex', [
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'detail', name: 'lift', above: 0.1 },
			rulingId: 'ground-truth-7',
			claim: 'a slanted pull is helical inflow: only the twist lifts, and here it does'
		},
		{
			atMs: BODY_MS,
			of: 'intake',
			expect: { metric: 'detail', name: 'turn', below: -1 },
			rulingId: 'ground-truth-7',
			claim:
				'and canon calls the slanted case a vortex, so its strokes wind an eye instead of pooling'
		}
	])
];
