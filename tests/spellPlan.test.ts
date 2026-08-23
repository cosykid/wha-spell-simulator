/**
 * Law tests for the Plan layer. Every test cites the ruling it pins, by id, from
 * `docs/animation-spec.md`. A test that pins a guess instead of a ruling is how
 * the last two attempts froze canon by accident, so the citation is the point:
 * re-ruling must be a visible edit here, never a tuning drift.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyTwist } from '../src/lib/compiler/reading/facing.js';
import { FACING_TRUST_FLOOR } from '../src/lib/compiler/reading/trust.js';
import { aimVector, dispersionScalar, foldAggregate } from '../src/lib/compiler/plan/columns.js';
import { resolvePlan } from '../src/lib/compiler/plan/resolvePlan.js';
import { resolveRegion } from '../src/lib/compiler/plan/region.js';
import { planFingerprint, snapPlan } from '../src/lib/compiler/plan/snap.js';
import {
	angleDegFromCenter,
	signedAngleDifferenceDeg,
	vectorFromAngleDeg
} from '../src/lib/utils/geometry.js';
import { readRealDictionary } from './dictionaryFixtures.js';
import type { SealReading, SignReading, Vec3 } from '../src/lib/types.js';

interface SignOptions {
	manifestation?: string;
	/** Ring bearing of the sign: 0 east, 90 top. */
	atDeg?: number;
	/** Distance from the seal center; 1 is the rim, so the radial weight is 1. */
	radius?: number;
	/** Bearing the sign points toward. Defaults to inward. */
	facingDeg?: number;
	length?: number;
	facingTrust?: number;
	power?: number;
}

/**
 * A gated sign, built the way the reading builds one: the facing class follows
 * from the twist away from inward rather than being asserted by hand.
 */
function sign(options: SignOptions = {}): SignReading {
	const atDeg = options.atDeg ?? 0;
	const radius = options.radius ?? 1;
	const at = vectorFromAngleDeg(atDeg);
	const facingDeg = options.facingDeg ?? atDeg + 180;
	const manifestation = options.manifestation ?? 'column';
	return {
		id: manifestation,
		manifestation,
		at: { x: at.x * radius, y: at.y * radius },
		length: options.length ?? 1,
		facing: vectorFromAngleDeg(facingDeg),
		facingClass: classifyTwist(signedAngleDifferenceDeg(atDeg + 180, facingDeg)),
		facingSource: 'ml-pose',
		facingTrust: options.facingTrust ?? 0.9,
		power: options.power ?? 0.7
	};
}

function reading(signs: SignReading[], overrides: Partial<SealReading> = {}): SealReading {
	return {
		signs,
		sigil: 'water',
		element: 'water',
		quality: 1,
		symmetry: null,
		notes: [],
		...overrides
	};
}

function round(value: number): number {
	const rounded = Math.round(value * 1e6) / 1e6;
	// A rounded-away negative would otherwise fail a deep-equal against 0.
	return rounded === 0 ? 0 : rounded;
}

function roundVec3(vector: Vec3): Vec3 {
	return { x: round(vector.x), y: round(vector.y), z: round(vector.z) };
}

test('[R-05] two opposed inward columns clash into a purely vertical aim', () => {
	// The PDF's worked example, with a 2D input: l = 1, w = 1 at +x and -x.
	const aggregate = foldAggregate([sign({ atDeg: 0 }), sign({ atDeg: 180 })]);

	assert.equal(round(aggregate.budget), 2, 'S sums the drawn lengths');
	assert.equal(round(aggregate.lateral.x), 0, 'P cancels');
	assert.equal(round(aggregate.lateral.y), 0, 'P cancels');
	assert.equal(round(aggregate.convergence), 2, 'C is the clash, never an input');
	assert.deepEqual(roundVec3(aimVector(aggregate)), { x: 0, y: 0, z: 2 });
	assert.equal(dispersionScalar(aggregate), 0);
});

test('[R-05] the aim leans where the long sign points, not toward where it sits', () => {
	// Canon's sign-length demo: the long column is drawn on the left and points
	// right, so the jet throws right. The first field implementation shipped this
	// lean inverted and pinned it in place with its own tests.
	const plan = resolvePlan(
		reading([sign({ atDeg: 180, length: 2 }), sign({ atDeg: 0, length: 1 })])
	);

	assert.ok(plan.aim.x > 0, `aim should tilt +x, got ${plan.aim.x}`);
	assert.ok(plan.aim.z > 0, 'the inward pair still clashes upward');
});

test('[R-05] a tangential pinwheel of columns is circulation, not aim', () => {
	// Positive circulation is counter-clockwise seen from +z, which on screen is
	// a facing twisted -90 from inward.
	const counterClockwise = foldAggregate(
		[0, 120, 240].map((atDeg) => sign({ atDeg, facingDeg: atDeg + 90 }))
	);
	const clockwise = foldAggregate(
		[0, 120, 240].map((atDeg) => sign({ atDeg, facingDeg: atDeg + 270 }))
	);

	assert.ok(counterClockwise.circulation > 0, 'counter-clockwise reads positive');
	assert.ok(clockwise.circulation < 0, 'clockwise reads negative');
	assert.equal(round(counterClockwise.convergence), 0, 'a pinwheel neither converges nor fans');
	assert.equal(round(Math.hypot(counterClockwise.lateral.x, counterClockwise.lateral.y)), 0);
});

test('[R-06] a sign below the trust floor adds power, not direction', () => {
	const trusted = resolvePlan(reading([sign({ atDeg: 0 })]));
	const withSloppy = resolvePlan(
		reading([sign({ atDeg: 0 }), sign({ atDeg: 90, facingTrust: FACING_TRUST_FLOOR - 0.01 })])
	);

	assert.equal(round(withSloppy.budget), round(trusted.budget) + 1, 'its length still counts');
	assert.deepEqual(roundVec3(withSloppy.aim), roundVec3(trusted.aim), 'the aim is untouched');
	assert.equal(withSloppy.dispersion, trusted.dispersion);
	assert.equal(withSloppy.circulation, trusted.circulation);
});

test('[R-07] outward columns fan instead of aiming', () => {
	const plan = resolvePlan(
		reading([sign({ atDeg: 0, facingDeg: 0 }), sign({ atDeg: 180, facingDeg: 180 })])
	);

	assert.equal(plan.aim.z, 0, 'a divergent ring has no vertical clash');
	assert.equal(round(plan.dispersion), 2, 'C < 0 becomes the plane-hugging fan');
	assert.equal(round(Math.hypot(plan.aim.x, plan.aim.y)), 0);
});

test('[R-08] dispersion contributes the same geometry and differs only in timing', () => {
	const arrangement = (manifestation: string) => [
		sign({ manifestation, atDeg: 0, facingDeg: 0 }),
		sign({ manifestation, atDeg: 180, facingDeg: 180 })
	];
	const columns = resolvePlan(reading(arrangement('column')));
	const dispersions = resolvePlan(reading(arrangement('dispersion')));

	assert.deepEqual(roundVec3(dispersions.aim), roundVec3(columns.aim));
	assert.equal(dispersions.dispersion, columns.dispersion);
	assert.equal(dispersions.budget, columns.budget);
	assert.ok(dispersions.notes.includes('dispersion-leak'), 'the score reads the leak from here');
	assert.ok(!columns.notes.includes('dispersion-leak'));
});

// ---------------------------------------------------------------------------
// The geometry the plan keeps beside the fold. Ruled in `docs/animation-cells.md`
// as additive and ruling-neutral: sites shape form, and R-05 still pays for it.
// ---------------------------------------------------------------------------

test('[R-05] sites keep the arrangement the fold flattens, and buy nothing with it', () => {
	const signs = [0, 120, 240].map((atDeg) => sign({ atDeg }));
	const plan = resolvePlan(reading(signs));

	assert.equal(plan.sites.column.length, 3, 'three columns are three sites');
	assert.deepEqual(
		roundVec3(plan.aim),
		roundVec3(aimVector(foldAggregate(signs))),
		'the aim is still the fold and only the fold'
	);
	assert.equal(round(plan.budget), 3, 'count still pays magnitude through the budget alone');
	// A site is a placement, not a second budget. Give it a length or a power and
	// there are two places the same ink can be spent from.
	assert.deepEqual(Object.keys(plan.sites.column[0]).sort(), ['at', 'facing']);
});

test('[R-08] a site belongs to the manifestation that was drawn', () => {
	// The fold cannot separate the two, so the authored manifestation is the cut:
	// the fan performs dispersion ink and the jet performs the column's.
	const plan = resolvePlan(
		reading([
			sign({ manifestation: 'column', atDeg: 0 }),
			sign({ manifestation: 'dispersion', atDeg: 180, facingDeg: 180 })
		])
	);

	assert.equal(plan.sites.column.length, 1);
	assert.equal(plan.sites.dispersion.length, 1);
	assert.equal(round(plan.sites.column[0].at.x), 1, 'the column sat east');
	assert.equal(round(plan.sites.dispersion[0].at.x), -1, 'the dispersion sign sat west');
});

test('sites are ordered around the seal, so stroke order cannot move a plan', () => {
	const bearings = [0, 90, 180, 270];
	const drawn = resolvePlan(reading(bearings.map((atDeg) => sign({ atDeg }))));
	const redrawn = resolvePlan(reading([180, 270, 0, 90].map((atDeg) => sign({ atDeg }))));

	assert.deepEqual(redrawn.sites, drawn.sites, 'one arrangement serializes one way');
	assert.deepEqual(
		drawn.sites.column.map((site) => round(angleDegFromCenter(site.at, { x: 0, y: 0 }))),
		bearings,
		'counter-clockwise from east, the bearing the whole plan layer reads in'
	);
});

test('[R-06] an untrusted sign leaves a site a position, never a direction', () => {
	const plan = resolvePlan(reading([sign({ atDeg: 0, facingTrust: FACING_TRUST_FLOOR - 0.01 })]));

	assert.equal(plan.sites.column.length, 1, 'its ink is still on the seal');
	assert.deepEqual(plan.sites.column[0].facing, { x: 0, y: 0 }, 'and its facing is not evidence');
});

test('the plan carries the reading n-fold snap unchanged', () => {
	assert.equal(resolvePlan(reading([sign()], { symmetry: 4 })).symmetry, 4);
	assert.equal(resolvePlan(reading([sign()])).symmetry, null, 'uneven spacing snaps to nothing');
});

test('[R-09] rule 1: a seal with no chevrons emits from the whole disc', () => {
	const region = resolveRegion([]);

	assert.equal(region.row, 1);
	assert.equal(region.aperture.kind, 'disc');
	assert.deepEqual(region.exhaust, { x: 0, y: 0, z: 0 }, 'omnidirectional');
	assert.equal(region.hardness, 0);
	assert.equal(region.reach, 1);
});

test('[R-09] rule 2: an all-inward rim ring collimates the whole disc upward', () => {
	const region = resolveRegion([0, 120, 240].map((atDeg) => sign({ atDeg })));

	assert.equal(region.row, 2);
	assert.equal(region.aperture.kind, 'disc');
	assert.deepEqual(region.exhaust, { x: 0, y: 0, z: 1 });
	assert.ok(region.hardness > 0, 'hardness grows with member count');
	assert.ok(region.reach > 1, 'so does reach');
});

test('[R-09] rule 3: an all-outward rim ring relocates the source to a moat', () => {
	const region = resolveRegion([0, 120, 240].map((atDeg) => sign({ atDeg, facingDeg: atDeg })));

	assert.equal(region.row, 3);
	assert.deepEqual(region.aperture, { kind: 'annulus', inner: 1, outer: 1.5 });
	assert.ok(region.exhaust.z > 0, 'outward, plus a small rise');
	assert.equal(round(Math.hypot(region.exhaust.x, region.exhaust.y)), 0, 'radial has no one side');
});

test('[R-09] rule 6: crossed chevrons at the center pin manifestation to a point', () => {
	const region = resolveRegion([
		sign({ atDeg: 0, radius: 0.1 }),
		sign({ atDeg: 90, radius: 0.1, facingDeg: 90 })
	]);

	assert.equal(region.row, 6);
	assert.deepEqual(region.aperture, { kind: 'point', at: { x: 0, y: 0 } });
	assert.deepEqual(region.exhaust, { x: 0, y: 0, z: 1 });
});

test('[R-09] rule 7: a lone inward rim chevron biases the disc away from itself', () => {
	const region = resolveRegion([sign({ atDeg: 0 })]);

	assert.equal(region.row, 7);
	assert.equal(region.aperture.kind, 'disc');
	const bias = region.aperture.kind === 'disc' ? region.aperture.bias : undefined;
	assert.ok(bias, 'the disc carries a bias');
	assert.ok(bias.x < 0, 'the chevron sits at +x, so the bias goes the other way');
});

test('[R-09, R-19] the table has one threshold left, and it is the named fence gate', () => {
	// R-09 matches on classes — count, radial position, facing — so wherever the
	// set already reads as a ring, one degree of separation cannot flip a rule.
	const ringAt = (second: number, fourth: number) =>
		resolveRegion([0, second, 180, fourth].map((atDeg) => sign({ atDeg })));
	const narrow = ringAt(59, 239);
	const wide = ringAt(60, 240);

	assert.equal(narrow.row, wide.row);
	assert.deepEqual(narrow.aperture, wide.aperture);
	assert.deepEqual(narrow.exhaust, wide.exhaust);

	// R-19 reintroduces exactly one threshold, because ground truth section 5
	// states it: a radial ring fuses only once its members span 60 degrees of
	// azimuth. A pair does flip there, so this pins where the gate sits rather
	// than letting it drift. It is the only place in the table that flips.
	const pairAt = (spreadDeg: number) =>
		resolveRegion([0, spreadDeg].map((atDeg) => sign({ atDeg })));
	assert.notEqual(pairAt(59).row, pairAt(60).row, 'the fence gate must sit at 60 degrees');
	assert.equal(pairAt(60).row, 2, 'above it, two inward members close the disc');
	assert.equal(pairAt(59).row, 1, 'below it, the pair names no row and takes the default disc');
});

test('[R-10] the sigil class table decides create versus manipulate', () => {
	const modeOf = (sigil: string, element: SealReading['element']) =>
		resolvePlan(reading([], { sigil, element })).mode;

	assert.equal(modeOf('fire', 'fire'), 'create');
	assert.equal(modeOf('water', 'water'), 'create');
	assert.equal(modeOf('light', 'light'), 'create');
	assert.equal(modeOf('wind-directs-air', 'wind'), 'manipulate');
	assert.equal(modeOf('earth', 'earth'), 'manipulate');
	// The two sigils whose dictionary source notes say they create, against the
	// default their element would give them.
	assert.equal(modeOf('crystal', 'earth'), 'create');
	assert.equal(modeOf('aeroform', 'wind'), 'create');
});

test('[R-11] a pull-only seal manifests nothing of its own, and says so', () => {
	const plan = resolvePlan(
		reading([
			sign({ manifestation: 'pull', atDeg: 0 }),
			sign({ manifestation: 'pull', atDeg: 180 })
		])
	);

	assert.equal(plan.budget, 0, 'the whole output is spent on the ambient coupling');
	assert.ok(plan.intake, 'the pull family owns its own budget');
	assert.equal(round(plan.intake.draw), 2, 'inward pulls inhale');
	assert.ok(plan.notes.includes('intake-only'), 'nothing is a look, never an empty canvas');
});

test('[R-13] each family owns a separate budget: levitation never moves the column aim', () => {
	const columns = [sign({ atDeg: 0 }), sign({ atDeg: 180 })];
	const alone = resolvePlan(reading(columns));
	const withHold = resolvePlan(
		reading([...columns, sign({ manifestation: 'levitation', atDeg: 90 })])
	);

	assert.deepEqual(roundVec3(withHold.aim), roundVec3(alone.aim));
	assert.equal(withHold.budget, alone.budget, 'the levitation ink pays into its own budget');
	assert.equal(withHold.circulation, alone.circulation);
	assert.ok(withHold.hold, 'and resolves to a hold');
	assert.deepEqual(
		withHold.couplings,
		[{ holder: 'hold', captures: ['burst', 'jet'] }],
		'where the plan combines primitives, it declares the coupling'
	);
});

test('[R-13] the convergence lens is one-sided and touches no other budget', () => {
	const columns = [sign({ atDeg: 0 }), sign({ atDeg: 180 })];
	const plain = resolvePlan(reading(columns));
	const lensed = resolvePlan(
		reading([...columns, sign({ manifestation: 'convergence', atDeg: 90 })])
	);

	assert.equal(plain.focus, 1, 'no convergence ink is no lens');
	assert.ok(lensed.focus > 1);
	assert.deepEqual(roundVec3(lensed.aim), roundVec3(plain.aim));
	assert.equal(lensed.budget, plain.budget);
});

test('[R-15] cancelled ink keeps its budget and names the case', () => {
	// Two inward columns and two outward ones: every moment cancels. The budget
	// survives and the arrangement is tagged, so the score can spend R-15's bare
	// shockwave on it rather than rendering literal nothing (R-11).
	const plan = resolvePlan(
		reading([
			sign({ atDeg: 0 }),
			sign({ atDeg: 180 }),
			sign({ atDeg: 90, facingDeg: 90 }),
			sign({ atDeg: 270, facingDeg: 270 })
		])
	);

	assert.equal(round(plan.budget), 4);
	assert.deepEqual(roundVec3(plan.aim), { x: 0, y: 0, z: 0 });
	assert.equal(round(plan.dispersion), 0);
	assert.ok(plan.notes.includes('inert-quadrupole'));
});

test('[R-14] unopposed convergence still lifts: the flux law is not gated on opposition', () => {
	// The half-ring, which R-14 calls the most common hand-drawn arrangement.
	// S = 3, |P| = 1, C = 3: the uncancelled lateral residue is the minority term.
	const halfRing = resolvePlan(reading([-90, 0, 90].map((atDeg) => sign({ atDeg }))));

	assert.equal(round(halfRing.aim.z), 3, 'C is the whole inward flux, not the cancelled part');
	assert.ok(
		halfRing.aim.z > Math.hypot(halfRing.aim.x, halfRing.aim.y),
		'a half-ring is a geyser leaning off its open side, never a ground-hugging surge'
	);
	// A lone rim sign is the shallow end of the same law, not a separate case.
	assert.ok(
		resolvePlan(reading([sign({ atDeg: 0 })])).aim.z > 0,
		'nothing opposes it, and it lifts'
	);
});

test('[R-16] tangential levitation is a rotor: it spins without a grip', () => {
	const plan = resolvePlan(
		reading(
			[0, 90, 180, 270].map((atDeg) =>
				sign({ manifestation: 'levitation', atDeg, facingDeg: (atDeg + 90) % 360 })
			)
		)
	);

	assert.ok(plan.hold, 'either channel makes a hold, so a pinwheel is not a dud');
	assert.equal(round(plan.hold.grip), 0, 'a rotor grips nothing');
	assert.equal(round(plan.hold.spin), 4, 'and carries the whole levitation circulation');
	// R-13 survives R-16: levitation still never moves the column aggregate.
	assert.equal(plan.circulation, 0);
});

test('[R-17] inverted levitation is a dud, and the plan says which dud it is', () => {
	const outward = resolvePlan(
		reading([sign({ manifestation: 'levitation', atDeg: 0, facingDeg: 0 })])
	);

	assert.equal(outward.hold, null, 'C_lev < 0 grips nothing, and no press is invented for it');
	assert.ok(outward.notes.includes('levitation-inverted'));

	// The other dud: R-06 ink that pays into the budget and no channel at all.
	const untrusted = resolvePlan(
		reading([sign({ manifestation: 'levitation', atDeg: 0, facingTrust: FACING_TRUST_FLOOR / 2 })])
	);

	assert.equal(untrusted.hold, null);
	assert.ok(
		untrusted.notes.includes('levitation-inert'),
		'inert is not the same failure as inverted'
	);
});

test('[R-19] two agreeing radial chevrons complete a fence, and a pair is two senses', () => {
	const ring = (count: number, sense: 'in' | 'out') =>
		resolveRegion(
			Array.from({ length: count }, (_, index) => {
				const atDeg = (360 / count) * index;
				return sign({
					manifestation: 'directed',
					atDeg,
					facingDeg: sense === 'in' ? atDeg + 180 : atDeg
				});
			})
		);

	// Two members fuse. Ground truth section 5: a radial ring is collective, so a
	// lone chevron stays a shutter and never completes anything.
	assert.deepEqual(ring(2, 'in').aperture, { kind: 'disc' }, 'two inward members close the disc');
	assert.deepEqual(
		ring(2, 'out').aperture,
		{ kind: 'annulus', inner: 1, outer: 1.5 },
		'and two outward members open the moat rather than the rim pinch'
	);
	assert.ok(ring(2, 'out').exhaust.z < 0.5, 'an outward pair exhausts into the moat, not upward');
	assert.notDeepEqual(ring(1, 'in').aperture, { kind: 'disc' }, 'one chevron is still a shutter');

	// Completion is a threshold; staging is not, so the scalars stay monotone.
	for (const sense of ['in', 'out'] as const) {
		assert.deepEqual(ring(4, sense).aperture, ring(2, sense).aperture, 'the fence is stable in N');
		assert.ok(ring(4, sense).reach > ring(2, sense).reach, 'extra aligned ink still stages');
	}
});

test('[PDF defect I] every manifestation in the dictionary resolves to something', () => {
	for (const entry of readRealDictionary().signs) {
		const manifestation = entry.semantic?.manifestation;
		assert.ok(manifestation, `${entry.id} has no manifestation`);
		const plan = resolvePlan(reading([sign({ manifestation, atDeg: 0 })]));
		const resolved =
			plan.budget > 0 ||
			plan.hold !== null ||
			plan.intake !== null ||
			plan.focus > 1 ||
			plan.hardness > 0;
		assert.ok(resolved, `${manifestation} resolved to nothing at all`);
		if (!plan.notes.some((note) => note.startsWith('unmodeled-'))) {
			continue;
		}
		assert.ok(plan.budget > 0, `unmodeled ${manifestation} must still pay into the budget`);
	}
});

test('[PDF defect J] the canon snap seam ships as a passthrough', () => {
	const plan = resolvePlan(reading([sign({ atDeg: 0 }), sign({ atDeg: 180 })]));

	assert.deepEqual(snapPlan(planFingerprint(plan), plan), plan);
	assert.ok(planFingerprint(plan).includes('aim:up'), 'the fingerprint reads classes, not numbers');
});
