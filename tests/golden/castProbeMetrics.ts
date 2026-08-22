/**
 * @file What a cast probe row is, and how it turns into a number.
 *
 * The counterpart of [`probeMetrics.ts`](probeMetrics.ts) one tier over: those
 * rows read `sampleFieldForce`, these read the parcels a `SpellScore` actually
 * advected. A cast row therefore claims something about the redesign's own
 * behaviour rather than about the field it replaces.
 *
 * A row selects its parcels by R-10's own vocabulary. The world holds the
 * `medium` and what the spell `manifested` out of it, and a row may also name
 * one primitive when the claim is about that kernel in particular.
 */

import { scoreTracks } from '../../src/lib/cast/score/compileScore.js';
import type { Parcel } from '../../src/lib/cast/sim/parcel.js';
import type { PrimitiveKind, SpellScore } from '../../src/lib/types.js';
import type { ProbeResult, RulingId } from './probeMetrics.js';

/** R-10's two halves of the world, or one primitive by name. */
export type CastSelector = 'medium' | 'manifested' | PrimitiveKind;

export type CastMetric =
	/** How many parcels the selection holds. */
	| 'parcels'
	/** Fraction of them inside `radius` of the seal axis. */
	| 'axisDensity'
	| 'meanHeight'
	| 'meanRadius'
	/** Mean outward velocity along each parcel's own arm. Negative is inflow. */
	| 'radialSpeed';

export interface CastProbe {
	/** A lab preset id, or a fixture named in [`castProbes.ts`](castProbes.ts). */
	subject: string;
	/** When the cast is sampled. Must land on a whole simulation step. */
	atMs: number;
	of: CastSelector;
	expect: {
		metric: CastMetric;
		/** Only for `axisDensity`: the disc around the seal axis that counts as near. */
		radius?: number;
		above?: number;
		below?: number;
	};
	rulingId: RulingId;
	/** The qualitative claim, in words, for the failure message. */
	claim: string;
}

/** Metrics that say nothing about an empty selection, so an empty one fails instead. */
const NEEDS_PARCELS: ReadonlySet<CastMetric> = new Set([
	'axisDensity',
	'meanHeight',
	'meanRadius',
	'radialSpeed'
]);

const MEASURE: Record<CastMetric, (probe: CastProbe, parcels: Parcel[]) => number> = {
	parcels: (_probe, parcels) => parcels.length,
	axisDensity: (probe, parcels) => {
		const radius = probe.expect.radius ?? 0;
		const near = parcels.filter((parcel) => Math.hypot(parcel.at.x, parcel.at.y) <= radius);
		return near.length / parcels.length;
	},
	meanHeight: (_probe, parcels) => mean(parcels.map((parcel) => parcel.at.z)),
	meanRadius: (_probe, parcels) =>
		mean(parcels.map((parcel) => Math.hypot(parcel.at.x, parcel.at.y))),
	radialSpeed: (_probe, parcels) =>
		mean(
			parcels.map((parcel) => {
				const arm = Math.hypot(parcel.at.x, parcel.at.y);
				return arm > 0
					? (parcel.at.x * parcel.velocity.x + parcel.at.y * parcel.velocity.y) / arm
					: 0;
			})
		)
};

function mean(values: number[]): number {
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/** The parcels a row's selector names, out of a cast of the score it was scored from. */
export function select(probe: CastProbe, score: SpellScore, parcels: Parcel[]): Parcel[] {
	const kindOf = new Map(scoreTracks(score).map((track) => [track.id, track.kind]));
	return parcels.filter((parcel) => {
		const kind = kindOf.get(parcel.trackId);
		if (probe.of === 'medium') {
			return kind === 'shimmer';
		}
		if (probe.of === 'manifested') {
			return kind !== 'shimmer';
		}
		return kind === probe.of;
	});
}

/** Evaluate one cast row against a cast already advanced to its `atMs`. */
export function checkCastProbe(
	probe: CastProbe,
	score: SpellScore,
	parcels: Parcel[]
): ProbeResult {
	const selected = select(probe, score, parcels);
	const header = `[${probe.rulingId}] ${probe.subject} @${probe.atMs}ms ${probe.of}: ${probe.claim}`;
	if (NEEDS_PARCELS.has(probe.expect.metric) && selected.length === 0) {
		return {
			passed: false,
			measured: Number.NaN,
			message: `${header}\n  nothing was selected, so ${probe.expect.metric} measures nothing`
		};
	}

	const measured = MEASURE[probe.expect.metric](probe, selected);
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
		message: `${header}\n  ${probe.expect.metric} = ${measured.toPrecision(4)}, want ${wanted}`
	};
}
