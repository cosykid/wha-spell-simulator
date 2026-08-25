/**
 * `planDigest`, the plan's component of `SpellIR.signature`.
 *
 * The signature is the cast's reset key, so a dial that fails to reach the
 * digest is a change that never shows on screen. That invariant used to be a
 * sentence in a guide; here it is a table with one nudge per plan field, and a
 * new field stops the table type-checking until its nudge is written.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { planDigest } from '../src/lib/compiler/plan/planDigest.js';
import type { SpellPlan } from '../src/lib/types.js';

/** A plan with every field carrying something, so any nudge is a real change. */
const RICH: SpellPlan = {
	version: 1,
	sigil: 'crystal',
	element: 'earth',
	mode: 'create',
	aim: { x: 0.5, y: -0.25, z: 1.5 },
	dispersion: 0.75,
	circulation: -1.25,
	budget: 3.5,
	sites: {
		column: [{ at: { x: 1, y: 0 }, facing: { x: -1, y: 0 } }],
		dispersion: [{ at: { x: 0, y: -1 }, facing: { x: 0, y: -1 } }]
	},
	aperture: { kind: 'annulus', inner: 0.85, outer: 1.05 },
	exhaust: { x: 1, y: 0, z: 0.2 },
	hardness: 0.68,
	reach: 1.5,
	hold: { at: { x: 0.1, y: -0.2, z: 0.9 }, grip: 4, spin: 1.5, budget: 6 },
	intake: { budget: 2, draw: 1.5, swirl: -0.5, lateral: { x: 0.2, y: 0.3 } },
	vessel: { at: { x: 0, y: 0, z: 1 }, radius: 0.4, stir: 0.6 },
	focus: 1.8,
	quality: 0.9,
	symmetry: 4,
	couplings: [{ holder: 'hold', captures: ['burst', 'jet'] }],
	notes: ['dispersion-leak']
};

/** One nudge per plan field. `version` is a literal and cannot be nudged. */
const NUDGES: Record<Exclude<keyof SpellPlan, 'version'>, Partial<SpellPlan>> = {
	sigil: { sigil: 'aeroform' },
	element: { element: 'wind' },
	mode: { mode: 'manipulate' },
	aim: { aim: { ...RICH.aim, x: RICH.aim.x + 0.5 } },
	dispersion: { dispersion: RICH.dispersion + 0.5 },
	circulation: { circulation: -RICH.circulation },
	budget: { budget: RICH.budget + 0.5 },
	// A site moving is the arrangement changing, which is a different cast even
	// where the fold above it is identical.
	sites: { sites: { ...RICH.sites, column: [] } },
	aperture: { aperture: { kind: 'disc' } },
	exhaust: { exhaust: { ...RICH.exhaust, z: RICH.exhaust.z + 0.5 } },
	hardness: { hardness: RICH.hardness + 0.2 },
	reach: { reach: RICH.reach + 0.5 },
	hold: { hold: { ...RICH.hold!, spin: -RICH.hold!.spin } },
	intake: { intake: { ...RICH.intake!, swirl: -RICH.intake!.swirl } },
	vessel: { vessel: { ...RICH.vessel!, stir: -RICH.vessel!.stir } },
	focus: { focus: RICH.focus + 0.5 },
	quality: { quality: RICH.quality - 0.2 },
	symmetry: { symmetry: 3 },
	couplings: { couplings: [{ holder: 'hold', captures: ['jet'] }] },
	notes: { notes: ['inert-quadrupole'] }
};

test('every plan dial reaches the digest', () => {
	const base = planDigest(RICH);
	for (const [field, patch] of Object.entries(NUDGES)) {
		assert.notEqual(
			planDigest({ ...RICH, ...patch }),
			base,
			`${field} does not reach the digest, so changing it would not restart the cast`
		);
	}
});

test('a dial dropping to absent reaches it too', () => {
	const base = planDigest(RICH);
	for (const patch of [
		{ hold: null },
		{ intake: null },
		{ vessel: null },
		{ symmetry: null }
	] as const) {
		assert.notEqual(planDigest({ ...RICH, ...patch }), base);
	}
	assert.notEqual(planDigest({ ...RICH, couplings: [] }), base);
	assert.notEqual(planDigest({ ...RICH, notes: [] }), base);
	assert.notEqual(planDigest({ ...RICH, sites: { column: [], dispersion: [] } }), base);
});

test('the digest rounds to hundredths, the granularity the rest of the signature uses', () => {
	const base = planDigest(RICH);

	assert.equal(
		planDigest({ ...RICH, budget: RICH.budget + 0.004 }),
		base,
		'a sub-hundredth nudge tunes in place instead of reseeding the parcel stream'
	);
	assert.notEqual(planDigest({ ...RICH, budget: RICH.budget + 0.01 }), base);
});

test('a rounded-away negative digests as zero, so two machines agree', () => {
	assert.equal(
		planDigest({ ...RICH, circulation: -0.001 }),
		planDigest({ ...RICH, circulation: 0 })
	);
});

test('an aperture is digested by kind and by geometry', () => {
	const withAperture = (aperture: SpellPlan['aperture']) => planDigest({ ...RICH, aperture });

	assert.notEqual(
		withAperture({ kind: 'disc' }),
		withAperture({ kind: 'disc', bias: { x: 0.3, y: 0 } }),
		'a biased disc is not a bare one'
	);
	assert.notEqual(
		withAperture({ kind: 'annulus', inner: 0.85, outer: 1.05 }),
		withAperture({ kind: 'annulus', inner: 0.85, outer: 1.4 })
	);
	assert.notEqual(
		withAperture({ kind: 'sector', bearingDeg: 0, halfAngleDeg: 30, inner: 0, outer: 1 }),
		withAperture({ kind: 'sector', bearingDeg: 90, halfAngleDeg: 30, inner: 0, outer: 1 })
	);
	assert.notEqual(
		withAperture({ kind: 'point', at: { x: 0, y: 0 } }),
		withAperture({ kind: 'point', at: { x: 0.5, y: 0 } })
	);
	assert.notEqual(
		withAperture({ kind: 'band', normal: { x: 1, y: 0 }, offset: 0, width: 0.4 }),
		withAperture({ kind: 'band', normal: { x: 0, y: 1 }, offset: 0, width: 0.4 })
	);
});
