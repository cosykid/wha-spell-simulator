/**
 * @file What a cast probe row is, and how it turns into a number. One evaluator
 * per metric, so the table in [`castProbes.ts`](castProbes.ts) stays data and
 * every row is comparable to every other row.
 *
 * A row reads the state a cell actually reached, so it claims something about a
 * performance rather than about a force sampled in the abstract. It selects the
 * cells it reads by R-10's own vocabulary: the world holds the `medium` and what
 * the spell `manifested` out of it, and a row may also name one primitive when
 * the claim is about that cell in particular.
 *
 * Since the hybrid rework the readings are a cell's own {@link CellReport}: how
 * loudly it paints, where its mass stands, where the form it declares is rooted
 * and where it reaches, how many marks it has laid, one named scalar its
 * archetype publishes, and the ceiling a holder publishes. The scene graph the
 * rows used to be measured on is gone; what each row pins is unchanged.
 */

import type { HeadlessCast } from './cellHarness.js';
import type { Performer } from '../../src/lib/cast/stage/frames.js';
import type { CellReport } from '../../src/lib/cast/cells/cell.js';
import type { PrimitiveKind, Vec3 } from '../../src/lib/types.js';

/**
 * A ruling in docs/animation-spec.md, or a section of docs/ground-truth.md for a
 * claim the spec delegates rather than restates.
 */
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
	| 'R-14'
	| 'R-15'
	| 'R-16'
	| 'R-17'
	| 'R-18'
	| 'R-19'
	| 'R-20'
	| 'R-21'
	/** Levitation, the force pair. */
	| 'ground-truth-6'
	/** Pull, the ambient coupling, and the ambient medium itself. */
	| 'ground-truth-7';

/** R-10's two halves of the world, or one primitive by name. */
export type CastSelector = 'medium' | 'manifested' | PrimitiveKind;

/** Which component of a seal-space point a row reads. `radius` is the arm from the seal axis. */
export type SealAxis = 'x' | 'y' | 'z' | 'radius';

/** Every row states at least one side of the band its claim lives in. */
interface Bounds {
	above?: number;
	below?: number;
}

export type CastExpectation = Bounds &
	(
		| {
				/** How loudly the selection is painting, 0..1. Zero is silence. */
				metric: 'ink';
		  }
		| {
				/** Live brush marks across the selection. */
				metric: 'marks';
		  }
		| {
				/** One named scalar the archetype publishes. */
				metric: 'detail';
				name: string;
		  }
		| {
				/** Where the selection's mass stands: the centroid of its live marks. */
				metric: 'mass';
				axis: SealAxis;
		  }
		| {
				/** Where the form the cell declares is rooted. */
				metric: 'root';
				axis: SealAxis;
		  }
		| {
				/** The far end of that form, in seal space. */
				metric: 'tip';
				axis: SealAxis;
		  }
		| {
				/** The ceiling this cell publishes to whatever it holds. Zero when it holds nothing. */
				metric: 'ceiling';
				field: 'closed' | 'radius' | 'height';
		  }
	);

export interface CastProbe {
	/** A lab preset id, or a fixture named in [`castProbes.ts`](castProbes.ts). */
	subject: string;
	/** When the cast is sampled. Must land on a whole frame of the stage's step. */
	atMs: number;
	of: CastSelector;
	expect: CastExpectation;
	rulingId: RulingId;
	/** The qualitative claim, in words, for the failure message. */
	claim: string;
}

/** The cells a row's selector names, out of a cast built from the score it names. */
export function select(probe: CastProbe, cast: HeadlessCast): Performer[] {
	return cast.performers.filter(({ track }) => {
		if (probe.of === 'medium') {
			return track.kind === 'shimmer';
		}
		if (probe.of === 'manifested') {
			return track.kind !== 'shimmer';
		}
		return track.kind === probe.of;
	});
}

function component(point: Vec3, axis: SealAxis): number {
	return axis === 'radius' ? Math.hypot(point.x, point.y) : point[axis];
}

/** A number, or why the row could not be measured at all. */
type Reading = { value: number } | { missing: string };

/** The largest reading across the selection, or zero where the selection is empty. */
function loudest(reports: CellReport[], of: (report: CellReport) => number): Reading {
	return { value: reports.length ? Math.max(...reports.map(of)) : 0 };
}

function measure(probe: CastProbe, cast: HeadlessCast): Reading {
	const performers = select(probe, cast);
	const reports = performers.map(({ cell }) => cell.report());
	const expect = probe.expect;

	switch (expect.metric) {
		case 'ink':
			return loudest(reports, (report) => report.ink);
		case 'marks':
			return { value: reports.reduce((sum, report) => sum + report.marks, 0) };
		case 'mass':
			return loudest(reports, (report) => component(report.at, expect.axis));
		case 'root':
			return loudest(reports, (report) => component(report.from, expect.axis));
		case 'tip':
			return loudest(reports, (report) => component(report.tip, expect.axis));
		case 'detail': {
			const named = reports.filter((report) => expect.name in report.detail);
			if (named.length === 0) {
				// An absent cell reads as zero, which is what "no hold at all" means
				// (R-17), but a cell that is there and publishes no such scalar is a
				// row pointing at nothing.
				return reports.length === 0
					? { value: 0 }
					: { missing: `no cell of this selection publishes "${expect.name}"` };
			}
			return loudest(named, (report) => report.detail[expect.name]);
		}
		case 'ceiling': {
			const ceilings = performers
				.map(({ cell }) => cell.constraint?.())
				.filter((one) => one !== null && one !== undefined);
			if (ceilings.length === 0) {
				return { value: 0 };
			}
			return {
				value: Math.max(
					...ceilings.map((one) =>
						expect.field === 'closed'
							? one.closed
							: expect.field === 'radius'
								? one.radius
								: one.at.z
					)
				)
			};
		}
	}
}

export interface ProbeResult {
	passed: boolean;
	/** Failure text: what was claimed, what was measured, and which ruling it pins. */
	message: string;
}

/** How a row reads out loud, for a failure message. */
function reading(expect: CastExpectation): string {
	switch (expect.metric) {
		case 'detail':
			return `detail ${expect.name}`;
		case 'mass':
			return `mass ${expect.axis}`;
		case 'root':
			return `root ${expect.axis}`;
		case 'tip':
			return `tip ${expect.axis}`;
		case 'ceiling':
			return `ceiling ${expect.field}`;
		default:
			return expect.metric;
	}
}

/** Evaluate one row against a cast already advanced to its `atMs`. */
export function checkCastProbe(probe: CastProbe, cast: HeadlessCast): ProbeResult {
	const header = `[${probe.rulingId}] ${probe.subject} @${probe.atMs}ms ${probe.of}: ${probe.claim}`;
	const measured = measure(probe, cast);
	if ('missing' in measured) {
		return { passed: false, message: `${header}\n  ${measured.missing}` };
	}

	const { above, below } = probe.expect;
	const passed =
		(above === undefined || measured.value > above) &&
		(below === undefined || measured.value < below);
	const wanted = [
		above === undefined ? null : `> ${above}`,
		below === undefined ? null : `< ${below}`
	]
		.filter(Boolean)
		.join(' and ');

	return {
		passed,
		message: `${header}\n  ${reading(probe.expect)} = ${measured.value.toPrecision(4)}, want ${wanted}`
	};
}
