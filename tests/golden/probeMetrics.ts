/**
 * @file What a probe row is, and how it turns into a number. One evaluator per
 * metric, so the table in [`probes.ts`](probes.ts) stays data and every row is
 * comparable to every other row.
 *
 * Field metrics read `sampleFieldForce` at the probe point. Population metrics
 * read the advected parcels, which is what makes a row's `atMs` matter.
 */

import { sampleFieldForce } from '../../src/lib/field/sampleField.js';
import type { Population } from './motion.js';

/** A ruling in docs/animation-spec.md, or `legacy` for unruled current behaviour. */
export type RulingId =
	| 'R-01'
	| 'R-02'
	| 'R-03'
	| 'R-04'
	| 'R-05'
	| 'R-06'
	| 'R-07'
	| 'R-08'
	| 'R-09'
	| 'R-10'
	| 'R-11'
	| 'R-12'
	| 'R-13'
	| 'legacy';

export type ProbeMetric =
	| 'forceX'
	| 'forceY'
	| 'forceZ'
	| 'lateralForce'
	| 'inwardForce'
	| 'swirl'
	| 'density'
	| 'meanRadius'
	| 'meanHeight';

export interface Probe {
	/** A preset id in `src/lib/ui/spellEffectLabPresets.ts`. */
	presetId: string;
	/** When the population is sampled. Field metrics are time invariant and use 0. */
	atMs: number;
	/** Seal space: origin at the ring center, one unit = ring radius, z out of the paper. */
	point: { x: number; y: number; z?: number };
	expect: {
		metric: ProbeMetric;
		/** Only for `density`: the disc around `point` that counts as near. */
		radius?: number;
		above?: number;
		below?: number;
	};
	rulingId: RulingId;
	/** The qualitative claim, in words, for the failure message. */
	claim: string;
}

const MEASURE: Record<ProbeMetric, (probe: Probe, population: Population) => number> = {
	forceX: (probe, population) => force(probe, population).x,
	forceY: (probe, population) => force(probe, population).y,
	forceZ: (probe, population) => force(probe, population).z,
	lateralForce: (probe, population) => {
		const f = force(probe, population);
		return Math.hypot(f.x, f.y);
	},
	// Positive when the flow heads for the seal center, negative when it fans out.
	inwardForce: (probe, population) => {
		const f = force(probe, population);
		const arm = Math.hypot(probe.point.x, probe.point.y);
		return arm > 0 ? -(probe.point.x * f.x + probe.point.y * f.y) / arm : 0;
	},
	// Screen-space cross product of arm and force. One sign everywhere is a
	// coherent rotation, which is the circulation term R-05 calls Gamma.
	swirl: (probe, population) => {
		const f = force(probe, population);
		return probe.point.x * f.y - probe.point.y * f.x;
	},
	density: (probe, population) => {
		const radius = probe.expect.radius ?? 0;
		const live = livingParcels(population);
		if (!live.length) {
			return 0;
		}
		const near = live.filter(
			(parcel) => Math.hypot(parcel.x - probe.point.x, parcel.y - probe.point.y) <= radius
		);
		return near.length / live.length;
	},
	meanRadius: (_probe, population) =>
		mean(livingParcels(population).map((parcel) => Math.hypot(parcel.x, parcel.y))),
	meanHeight: (_probe, population) => mean(livingParcels(population).map((parcel) => parcel.z))
};

// These read the parcels still in the scene, so an emptied scene would answer
// zero and quietly satisfy an upper bound. Probe rows using them assert nothing
// unless something is left to measure.
const POPULATION_METRICS: ReadonlySet<ProbeMetric> = new Set([
	'density',
	'meanRadius',
	'meanHeight'
]);

function force(probe: Probe, population: Population) {
	return sampleFieldForce(
		population.field,
		{ x: probe.point.x, y: probe.point.y },
		probe.point.z ?? 0
	);
}

function livingParcels(population: Population) {
	return population.parcels.filter((parcel) => !parcel.escaped);
}

function mean(values: number[]): number {
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export interface ProbeResult {
	passed: boolean;
	measured: number;
	/** Failure text: what was claimed, what was measured, and which ruling it pins. */
	message: string;
}

/** Evaluate one probe row against a population already advanced to its `atMs`. */
export function checkProbe(probe: Probe, population: Population): ProbeResult {
	if (POPULATION_METRICS.has(probe.expect.metric) && livingParcels(population).length === 0) {
		return {
			passed: false,
			measured: Number.NaN,
			message:
				`[${probe.rulingId}] ${probe.presetId} @${probe.atMs}ms: ${probe.claim}\n` +
				`  every parcel has left the scene, so ${probe.expect.metric} measures nothing`
		};
	}

	const measured = MEASURE[probe.expect.metric](probe, population);
	const { above, below } = probe.expect;
	const passed =
		(above === undefined || measured > above) && (below === undefined || measured < below);
	const wanted = [
		above === undefined ? null : `> ${above}`,
		below === undefined ? null : `< ${below}`
	]
		.filter(Boolean)
		.join(' and ');

	return {
		passed,
		measured,
		message:
			`[${probe.rulingId}] ${probe.presetId} @${probe.atMs}ms: ${probe.claim}\n` +
			`  ${probe.expect.metric} at (${probe.point.x}, ${probe.point.y}, ${probe.point.z ?? 0}) ` +
			`= ${measured.toPrecision(4)}, want ${wanted}`
	};
}
