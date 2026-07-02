import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import { compileSpell } from '../src/lib/compiler/spellBuilder.js';
import {
	buildSpellField,
	emptySpellField,
	facingTwistDeg,
	spellFieldSignature
} from '../src/lib/field/buildSpellField.js';
import {
	fieldBuoyancy,
	sampleFieldForce,
	spawnDomainPosition
} from '../src/lib/field/sampleField.js';
import type { GlyphAST, Recognition, Vector } from '../src/lib/types.js';

/**
 * Minimal recognized-sign fixture. `angleDeg` is the ring position bearing
 * (0 = east, 90 = top) and `facingDeg` the direction the sign points. Facing
 * is carried the way real recognitions carry it: as the ML pose head's
 * rotationOffsetDeg. `mlAccepted: false` mimics a template-only recognition,
 * whose offset holds no facing information.
 */
function sign({
	id,
	manifestation,
	angleDeg,
	facingDeg,
	radiusNorm = 0.8,
	radialFacing = 'unclear',
	sizeNorm = 0.16,
	mlAccepted = true
}: {
	id: string;
	manifestation: string;
	angleDeg: number;
	facingDeg: number;
	radiusNorm?: number;
	radialFacing?: string;
	sizeNorm?: number;
	mlAccepted?: boolean;
}): Recognition {
	const twistDeg = facingDeg - (angleDeg + 180);
	return {
		id,
		kind: 'sign',
		recognized: true,
		recognitionStatus: 'valid',
		confidence: 0.9,
		neatness: 0.85,
		layer: 'outer',
		nearBoundary: false,
		angleDeg,
		radiusNorm,
		sizeNorm,
		lengthNorm: 0.5,
		orientationDeg: facingDeg % 180,
		directedOrientationDeg: facingDeg,
		rotationOffsetDeg: ((-(twistDeg + angleDeg + 90) % 360) + 360) % 360,
		radialFacing,
		semantic: { manifestation, directionMode: 'inward' },
		shape: {},
		diagnostics: { ml: { accepted: mlAccepted } }
	} as unknown as Recognition;
}

/** Facing bearing that points a sign at `angleDeg` straight at the seal center. */
function inwardFacing(angleDeg: number): number {
	return (angleDeg + 180) % 360;
}

function forceAt(field: ReturnType<typeof buildSpellField>, x: number, y: number) {
	return sampleFieldForce(field, { x, y });
}

/** Screen-space z of cross(position, force); same sign everywhere = coherent swirl. */
function swirlAt(field: ReturnType<typeof buildSpellField>, p: Vector): number {
	const force = sampleFieldForce(field, p);
	return p.x * force.y - p.y * force.x;
}

const RING_SAMPLES: Vector[] = [
	{ x: 0.5, y: 0 },
	{ x: 0, y: 0.5 },
	{ x: -0.5, y: 0 },
	{ x: 0, y: -0.5 }
];

test('no signs produce an empty field with zero force', () => {
	const field = buildSpellField([]);
	assert.equal(field.sources.length, 0);
	assert.deepEqual(field.domain, emptySpellField().domain);
	assert.deepEqual(forceAt(field, 0.4, -0.2), { x: 0, y: 0, z: 0 });
});

test('facingTwistDeg measures rotation away from inward', () => {
	assert.equal(
		facingTwistDeg(sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 180 })),
		0
	);
	assert.equal(
		facingTwistDeg(sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 270 })),
		90
	);
	assert.equal(
		facingTwistDeg(sign({ id: 'pull', manifestation: 'pull', angleDeg: 90, facingDeg: 270 })),
		0
	);
	assert.equal(
		Math.abs(
			facingTwistDeg(sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 0 }))
		),
		180
	);
});

test('template-recognized signs default to canon inward facing', () => {
	// Hand-drawn signs the ML did not accept carry no facing information: the
	// template matcher pre-rotates them into the bottom-of-ring frame. Canon
	// default pose faces inward, so side columns must stay axial beams instead
	// of flipping to inverted/outward (the fire-burst regression).
	const field = buildSpellField(
		[0, 90, 180, 270].map((angleDeg) =>
			sign({
				id: 'column',
				manifestation: 'column',
				angleDeg,
				facingDeg: angleDeg, // draw-order junk claiming outward
				mlAccepted: false
			})
		)
	);
	assert.ok(
		field.sources.every((source) => source.kind === 'axial'),
		'all columns stay beams'
	);
	const force = forceAt(field, 0, 0);
	assert.ok(force.z > 1, 'the balanced beam rises');
	assert.ok(Math.hypot(force.x, force.y) < 1e-6, 'no outward spray');
});

test('a column gathers magic toward its beam instead of spraying', () => {
	const field = buildSpellField([
		sign({ id: 'column', manifestation: 'column', angleDeg: 0, facingDeg: 180 })
	]);
	// Outside the beam the draft points back toward the beam axis (east side).
	const westEdge = forceAt(field, -0.9, 0);
	assert.ok(westEdge.x > 0, 'draft pulls toward the beam axis');
	// The jet is strongest near the axis and soft far away.
	const source = field.sources[0];
	assert.ok(source.kind === 'axial');
	const axis = source.kind === 'axial' ? { x: source.at.x * 0.55, y: source.at.y * 0.55 } : null;
	const onAxis = sampleFieldForce(field, axis!);
	assert.ok(onAxis.z > westEdge.z * 2, 'the jet concentrates in the beam footprint');
});

test('levitation lift fades with height into a hover equilibrium', () => {
	const field = buildSpellField([
		sign({ id: 'levitation', manifestation: 'levitation', angleDeg: 0, facingDeg: 180 }),
		sign({ id: 'levitation', manifestation: 'levitation', angleDeg: 180, facingDeg: 0 })
	]);
	const ground = sampleFieldForce(field, { x: 0.1, y: 0 }, 0).z;
	const midway = sampleFieldForce(field, { x: 0.1, y: 0 }, 0.5).z;
	const ceiling = sampleFieldForce(field, { x: 0.1, y: 0 }, 0.9).z;
	assert.ok(ground > midway, 'lift weakens as the mass rises');
	assert.ok(midway > ceiling, 'and keeps weakening');
	assert.ok(ceiling < 1e-9, 'no lift above the hover ceiling');

	const gather = sampleFieldForce(field, { x: 0.5, y: 0 }, 0.4);
	assert.ok(gather.x < 0, 'held magic gathers toward the seal axis');
});

test('a lone column beams upward and leans toward its own side', () => {
	const field = buildSpellField([
		sign({ id: 'column', manifestation: 'column', angleDeg: 0, facingDeg: 180 })
	]);
	assert.equal(field.sources.length, 1);
	assert.equal(field.sources[0].kind, 'axial');

	const force = forceAt(field, 0, 0);
	assert.ok(force.z > 0, 'column pushes out of the seal');
	assert.ok(force.x > 0.05, 'unbalanced column leans toward the sign side');
	assert.ok(Math.abs(force.y) < 1e-9);
});

test('balanced columns cancel their lean into a straight beam', () => {
	const field = buildSpellField(
		[0, 120, 240].map((angleDeg) =>
			sign({ id: 'column', manifestation: 'column', angleDeg, facingDeg: inwardFacing(angleDeg) })
		)
	);
	const force = forceAt(field, 0, 0);
	assert.ok(Math.hypot(force.x, force.y) < 1e-6, 'lateral lean cancels');
	assert.ok(force.z > 0.5, 'the beam strengths still add');
});

test('an inverted column pours outward like dispersion', () => {
	const field = buildSpellField([
		sign({
			id: 'column',
			manifestation: 'column',
			angleDeg: 0,
			facingDeg: 0,
			radialFacing: 'outward'
		})
	]);
	assert.equal(field.sources[0].kind, 'radial');
	const force = forceAt(field, 0.5, 0);
	assert.ok(force.x > 0, 'force points away from the seal center');
});

test('an inward pull draws toward the seal center from everywhere', () => {
	const field = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 180 })
	]);
	for (const p of RING_SAMPLES) {
		const force = sampleFieldForce(field, p);
		const towardCenter = -(p.x * force.x + p.y * force.y);
		assert.ok(towardCenter > 0, `pulls inward at (${p.x}, ${p.y})`);
	}
});

test('a pull rotated 90 degrees swirls around a hollow vortex eye', () => {
	const field = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 270 })
	]);
	for (const p of RING_SAMPLES) {
		assert.ok(swirlAt(field, p) > 0, 'consistent rotation direction');
		assert.ok(sampleFieldForce(field, p).z > 0, 'swirl pumps lift up the seal axis');
	}
	// The swirl holds a funnel: displaced magic is restored toward the eye
	// ring from both sides instead of collapsing to the center point.
	const radialToward = (x: number) => {
		const force = sampleFieldForce(field, { x, y: 0 });
		return -(x * force.x) / Math.abs(x);
	};
	assert.ok(radialToward(0.2) < 0, 'inside the eye the flow pushes back out');
	assert.ok(radialToward(1) > 0, 'outside the eye the flow pulls back in');
	assert.ok(Math.abs(radialToward(0.45)) < 0.05, 'the eye ring itself is calm');
});

test('three angled pulls hold a climbing vortex instead of an orb', () => {
	// Grasping Wind: a pinwheel of angled pulls must read as a wide spiral
	// that climbs, never a mass gathered at the center.
	const field = buildSpellField(
		[0, 120, 240].map((angleDeg) =>
			sign({
				id: 'pull',
				manifestation: 'pull',
				angleDeg,
				facingDeg: (inwardFacing(angleDeg) + 60) % 360
			})
		)
	);
	const nearCenter = sampleFieldForce(field, { x: 0.1, y: 0 });
	assert.ok(0.1 * nearCenter.x > 0, 'the eye pushes magic off the center point');
	const outside = sampleFieldForce(field, { x: 1, y: 0 });
	assert.ok(1 * outside.x < 0, 'far flow still spirals back in');
	for (const p of RING_SAMPLES) {
		assert.ok(swirlAt(field, p) > 0, 'the pinwheel rotates one way');
	}
});

test('straight pulls and dispersion gain no swirl lift', () => {
	const pull = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 180 })
	]);
	const dispersion = buildSpellField([
		sign({ id: 'dispersion', manifestation: 'dispersion', angleDeg: 45, facingDeg: 45 })
	]);
	for (const p of RING_SAMPLES) {
		assert.ok(Math.abs(sampleFieldForce(pull, p).z) < 1e-12, 'plain pull stays flat');
		assert.ok(Math.abs(sampleFieldForce(dispersion, p).z) < 1e-12, 'dispersion pours flat');
	}
});

test('lift scales with the tangential fraction of the twist', () => {
	const halfTwist = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 225 })
	]);
	const fullTwist = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 270 })
	]);
	const point = { x: 0.5, y: 0 };
	const partialLift = sampleFieldForce(halfTwist, point).z;
	const fullLift = sampleFieldForce(fullTwist, point).z;
	assert.ok(partialLift > 0, 'a 45 degree twist still lifts');
	assert.ok(partialLift < fullLift, 'a full vortex lifts harder');
});

test('three angled pulls sum into a stronger rotational force', () => {
	const single = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 270 })
	]);
	const triple = buildSpellField(
		[0, 120, 240].map((angleDeg) =>
			sign({
				id: 'pull',
				manifestation: 'pull',
				angleDeg,
				facingDeg: (inwardFacing(angleDeg) + 90) % 360
			})
		)
	);
	const point = { x: 0.5, y: 0 };
	assert.ok(swirlAt(triple, point) > swirlAt(single, point) * 2.9, 'swirl scales with sign count');

	const center = forceAt(triple, 0, 0);
	assert.ok(Math.hypot(center.x, center.y) < 1e-6, 'no net translation at the center');
});

test('an inverted pull pushes away from the seal', () => {
	const field = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 90, facingDeg: 90 })
	]);
	const force = forceAt(field, 0.5, 0);
	assert.ok(force.x > 0, 'force points outward');
});

test('dispersion pours outward on all sides', () => {
	const field = buildSpellField([
		sign({ id: 'dispersion', manifestation: 'dispersion', angleDeg: 45, facingDeg: 45 })
	]);
	for (const p of RING_SAMPLES) {
		const force = sampleFieldForce(field, p);
		const outward = p.x * force.x + p.y * force.y;
		assert.ok(outward > 0, `pushes outward at (${p.x}, ${p.y})`);
	}
});

test('collection gathers inward', () => {
	const field = buildSpellField([
		sign({ id: 'collection', manifestation: 'collection', angleDeg: 200, facingDeg: 20 })
	]);
	const force = forceAt(field, 0, -0.6);
	assert.ok(force.y > 0, 'force points back toward the center');
});

test('convergence signs merge into one attractor at their weighted point', () => {
	const field = buildSpellField([
		sign({ id: 'convergence', manifestation: 'convergence', angleDeg: 90, facingDeg: 270 }),
		sign({ id: 'convergence', manifestation: 'convergence', angleDeg: 90, facingDeg: 270 })
	]);
	assert.equal(field.sources.length, 1);
	const source = field.sources[0];
	assert.equal(source.kind, 'radial');
	assert.ok(source.kind === 'radial' && source.center.y < -0.1, 'focus sits toward the signs');

	const force = forceAt(field, 0, 0.4);
	assert.ok(force.y < 0, 'magic converges toward the focus point');
});

test('levitation and float become buoyancy lift', () => {
	const field = buildSpellField([
		sign({ id: 'levitation', manifestation: 'levitation', angleDeg: 0, facingDeg: 180 }),
		sign({ id: 'float', manifestation: 'levitation', angleDeg: 180, facingDeg: 0 })
	]);
	assert.equal(field.sources.filter((source) => source.kind === 'buoyancy').length, 2);
	assert.ok(fieldBuoyancy(field) > 0.5);
	assert.ok(forceAt(field, 0.3, 0.3).z > 0.5, 'lift acts everywhere');
});

test('a lone levitation sign blows the magic aside instead of holding an orb', () => {
	const field = buildSpellField([
		sign({ id: 'levitation', manifestation: 'levitation', angleDeg: 0, facingDeg: 180 })
	]);
	const center = forceAt(field, 0, 0);
	assert.ok(center.x < -0.1, 'pressure pushes away from the sign');
	assert.ok(Math.abs(center.y) < 1e-9, 'no sideways component off the press axis');
	assert.ok(center.z > 0, 'the sign still lifts');
	// No equilibrium anywhere down-pressure: the magic keeps going and never
	// coheres into a held mass.
	assert.ok(forceAt(field, -0.5, 0).x < 0, 'still blowing away at mid-seal');
	assert.ok(forceAt(field, -1, 0).x < 0, 'still blowing away past the ring');
});

test('balanced levitation signs squeeze an orb into being between them', () => {
	const single = buildSpellField([
		sign({ id: 'levitation', manifestation: 'levitation', angleDeg: 0, facingDeg: 180 })
	]);
	const balanced = buildSpellField(
		[0, 90, 180, 270].map((angleDeg) =>
			sign({
				id: 'levitation',
				manifestation: 'levitation',
				angleDeg,
				facingDeg: inwardFacing(angleDeg)
			})
		)
	);
	const center = forceAt(balanced, 0, 0);
	assert.ok(Math.hypot(center.x, center.y) < 1e-6, 'symmetric pressure cancels dead center');
	assert.ok(center.z > forceAt(single, 0, 0).z * 2, 'lift adds with sign count');
	// The squeeze restores displaced magic back toward the center, which is
	// what makes the hovering orb exist at all.
	for (const p of RING_SAMPLES) {
		const force = sampleFieldForce(balanced, p);
		const inward = -(p.x * force.x + p.y * force.y);
		assert.ok(inward > 0, `squeeze restores toward center at (${p.x}, ${p.y})`);
	}
});

test('field signatures change when a levitation sign moves', () => {
	const east = buildSpellField([
		sign({ id: 'levitation', manifestation: 'levitation', angleDeg: 0, facingDeg: 180 })
	]);
	const north = buildSpellField([
		sign({ id: 'levitation', manifestation: 'levitation', angleDeg: 90, facingDeg: 270 })
	]);
	assert.notEqual(spellFieldSignature(east), spellFieldSignature(north));
});

test('one-sided regions emit a sector toward their shared facing', () => {
	const field = buildSpellField(
		[150, 180, 210].map((angleDeg) =>
			sign({ id: 'region', manifestation: 'directed', angleDeg, facingDeg: 0 })
		)
	);
	assert.equal(field.domain.mode, 'sector');
	assert.ok(field.domain.direction && field.domain.direction.x > 0.9, 'sector faces east');

	const force = forceAt(field, 0, 0);
	assert.ok(force.x > 0.2, 'the pushes drive magic toward that side');
});

test('region facings map to canon domains: inside, outside, and on-ring', () => {
	const inward = buildSpellField(
		[0, 90, 180, 270].map((angleDeg) =>
			sign({ id: 'region', manifestation: 'directed', angleDeg, facingDeg: inwardFacing(angleDeg) })
		)
	);
	assert.equal(inward.domain.mode, 'inside');

	const outward = buildSpellField(
		[0, 90, 180, 270].map((angleDeg) =>
			sign({ id: 'region', manifestation: 'directed', angleDeg, facingDeg: angleDeg })
		)
	);
	assert.equal(outward.domain.mode, 'outside');

	const opposed = buildSpellField([
		sign({ id: 'region', manifestation: 'directed', angleDeg: 0, facingDeg: 180 }),
		sign({ id: 'region', manifestation: 'directed', angleDeg: 180, facingDeg: 180 })
	]);
	assert.equal(opposed.domain.mode, 'ring');
});

test('three tangential pushes produce an emergent vortex', () => {
	const field = buildSpellField(
		[0, 120, 240].map((angleDeg) =>
			sign({
				id: 'region',
				manifestation: 'directed',
				angleDeg,
				facingDeg: (inwardFacing(angleDeg) + 90) % 360
			})
		)
	);
	assert.equal(field.domain.mode, 'anywhere', 'no net side to emit toward');

	const swirls = RING_SAMPLES.map((p) => swirlAt(field, p));
	assert.ok(
		swirls.every((swirl) => Math.sign(swirl) === Math.sign(swirls[0]) && swirl !== 0),
		'pushes combine into one consistent rotation'
	);
});

test('an emergent region vortex climbs the seal axis', () => {
	const field = buildSpellField(
		[0, 120, 240].map((angleDeg) =>
			sign({
				id: 'region',
				manifestation: 'directed',
				angleDeg,
				facingDeg: (inwardFacing(angleDeg) + 90) % 360
			})
		)
	);
	for (const p of RING_SAMPLES) {
		assert.ok(sampleFieldForce(field, p).z > 0, `tangential pushes lift at (${p.x}, ${p.y})`);
	}
});

test('spawnDomainPosition respects each domain', () => {
	let seed = 1;
	const random = () => {
		seed = (seed * 16807) % 2147483647;
		return (seed - 1) / 2147483646;
	};

	for (let i = 0; i < 40; i += 1) {
		const inside = spawnDomainPosition({ mode: 'inside', strength: 1 }, random);
		assert.ok(Math.hypot(inside.x, inside.y) <= 0.6 + 1e-9);

		const outside = spawnDomainPosition({ mode: 'outside', strength: 1 }, random);
		assert.ok(Math.hypot(outside.x, outside.y) >= 1.08 - 1e-9);

		const ring = spawnDomainPosition({ mode: 'ring', strength: 1 }, random);
		const ringRadius = Math.hypot(ring.x, ring.y);
		assert.ok(ringRadius >= 0.92 - 1e-9 && ringRadius <= 1.08 + 1e-9);

		const sector = spawnDomainPosition(
			{ mode: 'sector', direction: { x: 1, y: 0 }, strength: 1 },
			random
		);
		const radius = Math.hypot(sector.x, sector.y);
		assert.ok(sector.x / radius > 0.2, 'sector spawns bias toward its direction');
	}
});

test('field signatures change when a sign twist changes', () => {
	const straight = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 180 })
	]);
	const angled = buildSpellField([
		sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 240 })
	]);
	assert.notEqual(spellFieldSignature(straight), spellFieldSignature(angled));
	assert.equal(
		spellFieldSignature(straight),
		spellFieldSignature(
			buildSpellField([sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg: 180 })])
		)
	);
});

function glyphASTWithSigns(signs: Recognition[]): GlyphAST {
	return {
		type: 'GlyphAST',
		ring: {
			found: true,
			complete: true,
			completeness: 1,
			neatness: 0.8
		},
		primarySigil: {
			id: 'fire',
			element: 'fire',
			kind: 'sigil',
			confidence: 0.91,
			neatness: 0.82,
			sizeNorm: 0.2,
			semantic: {}
		} as unknown as Recognition,
		signs,
		unknowns: [],
		globalMetrics: { neatness: 0.8, radialSymmetry: 0.5, instability: 0 },
		warnings: []
	} as unknown as GlyphAST;
}

test('compileSpell carries the field and keys the signature on it', () => {
	const pullAt = (facingDeg: number) =>
		compileSpell({
			glyphAST: glyphASTWithSigns([
				sign({ id: 'pull', manifestation: 'pull', angleDeg: 0, facingDeg })
			]),
			config: CONFIG
		});

	const straight = pullAt(180);
	assert.equal(straight.field.sources.length, 1);
	assert.equal(straight.field.sources[0].kind, 'radial');

	const angled = pullAt(240);
	assert.notEqual(straight.signature, angled.signature, 'twist changes reset the effect');

	const bare = compileSpell({ glyphAST: glyphASTWithSigns([]), config: CONFIG });
	assert.equal(bare.field.sources.length, 0);
	assert.equal(bare.field.domain.mode, 'anywhere');
});
