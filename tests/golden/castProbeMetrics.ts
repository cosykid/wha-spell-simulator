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
 * The readings are the cell's own load-bearing state and nothing else: whether a
 * form is inking, how bright it is, one named uniform, where a form sits in seal
 * space, where the far end of a shaft lands, and the ceiling a holder publishes.
 * The parcels the rows used to be measured on died with the sim; what each row
 * pins is unchanged, and every row that had to change its reading says so.
 */

import * as THREE from 'three';
import type { HeadlessCast } from './cellHarness.js';
import type { Performer } from '../../src/lib/cast/stage/frames.js';
import type { PrimitiveKind } from '../../src/lib/types.js';

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
				/** How many of the selection's forms are inking. The count a `parcels` row used to take. */
				metric: 'forms';
		  }
		| {
				/** The brightest of them. How present the selection is, 0..1. */
				metric: 'alpha';
		  }
		| {
				/** One number the cell wrote into one form. */
				metric: 'uniform';
				form: string;
				name: string;
		  }
		| {
				/** Where a form sits in seal space. */
				metric: 'origin';
				form: string;
				axis: SealAxis;
		  }
		| {
				/**
				 * The far end of a shaft-shaped form, in seal space: its own local +Z at
				 * the length uniform named by `length`. Every shaft in `cells/forms/` is
				 * built along local +Z and aimed by the group above it.
				 */
				metric: 'tip';
				form: string;
				length: string;
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

/** A form's own alpha, or 1 for a form the cell gave no alpha to fade. */
function alphaOf(mesh: THREE.Mesh): number {
	const material = mesh.material as THREE.Material;
	if (!(material instanceof THREE.ShaderMaterial)) {
		return 1;
	}
	const alpha = material.uniforms.uAlpha?.value;
	return typeof alpha === 'number' ? alpha : 1;
}

/** Every mesh of the selection that reaches a pixel: visible all the way up, and not faded out. */
function inkingForms(performers: Performer[]): THREE.Mesh[] {
	const forms: THREE.Mesh[] = [];
	for (const { cell } of performers) {
		cell.group.updateMatrixWorld(true);
		cell.group.traverseVisible((object) => {
			if (object instanceof THREE.Mesh && alphaOf(object) > 0) {
				forms.push(object);
			}
		});
	}
	return forms;
}

/** The named form, wherever it sits under the selection. Null when nothing built one. */
function formNamed(performers: Performer[], name: string): THREE.Mesh | null {
	for (const { cell } of performers) {
		cell.group.updateMatrixWorld(true);
		const found = cell.group.getObjectByName(name);
		if (found instanceof THREE.Mesh) {
			return found;
		}
	}
	return null;
}

function uniformOf(mesh: THREE.Mesh, name: string): number | null {
	const material = mesh.material as THREE.Material;
	if (!(material instanceof THREE.ShaderMaterial)) {
		return null;
	}
	const value = material.uniforms[name]?.value;
	return typeof value === 'number' ? value : null;
}

function component(point: THREE.Vector3, axis: SealAxis): number {
	return axis === 'radius' ? Math.hypot(point.x, point.y) : point[axis];
}

/** A number, or why the row could not be measured at all. */
type Reading = { value: number } | { missing: string };

function measure(probe: CastProbe, cast: HeadlessCast): Reading {
	const performers = select(probe, cast);
	const expect = probe.expect;

	if (expect.metric === 'forms') {
		return { value: inkingForms(performers).length };
	}
	if (expect.metric === 'alpha') {
		const alphas = inkingForms(performers).map(alphaOf);
		return { value: alphas.length ? Math.max(...alphas) : 0 };
	}
	if (expect.metric === 'ceiling') {
		const ceilings = performers
			.map(({ cell }) => cell.constraint?.())
			.filter((one) => one !== null);
		if (ceilings.length === 0) {
			return { value: 0 };
		}
		return {
			value: Math.max(
				...ceilings.map((one) =>
					expect.field === 'closed'
						? one!.closed
						: expect.field === 'radius'
							? one!.radius
							: one!.at.z
				)
			)
		};
	}

	const form = formNamed(performers, expect.form);
	if (!form) {
		return { missing: `no form named "${expect.form}" is on stage` };
	}
	if (expect.metric === 'uniform') {
		const value = uniformOf(form, expect.name);
		return value === null
			? { missing: `"${expect.form}" has no uniform ${expect.name}` }
			: { value };
	}
	if (expect.metric === 'origin') {
		return { value: component(form.getWorldPosition(new THREE.Vector3()), expect.axis) };
	}
	const length = uniformOf(form, expect.length);
	if (length === null) {
		return { missing: `"${expect.form}" has no uniform ${expect.length}` };
	}
	const tip = new THREE.Vector3(0, 0, length).applyMatrix4(form.matrixWorld);
	return { value: component(tip, expect.axis) };
}

export interface ProbeResult {
	passed: boolean;
	/** Failure text: what was claimed, what was measured, and which ruling it pins. */
	message: string;
}

/** How a row reads out loud, for a failure message. */
function reading(expect: CastExpectation): string {
	switch (expect.metric) {
		case 'uniform':
			return `${expect.form}.${expect.name}`;
		case 'origin':
			return `${expect.form} ${expect.axis}`;
		case 'tip':
			return `${expect.form} tip ${expect.axis}`;
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
