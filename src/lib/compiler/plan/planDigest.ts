/**
 * @file The plan's digest form: a compact deterministic string that stands for a
 * whole `SpellPlan` inside `SpellIR.signature`.
 *
 * The signature is a reset key, so this is what decides when a running cast
 * restarts. It replaced the field builder's `spellFieldSignature` when the field
 * died, and it keeps that digest's granularity: every number rounds to
 * hundredths, matching the rest of the signature, so a sub-hundredth wobble
 * tunes in place instead of reseeding the parcel stream.
 *
 * Every field of the plan is folded in, `notes` included. Notes gate no track
 * today, but they name the arrangement a plan came from, and a digest that
 * carries the whole plan cannot silently lose a dial the score starts reading.
 *
 * @example
 * planDigest(resolvePlan(reading)); // 'plan1:create:water/water:b943:...'
 */

import type {
	Aperture,
	Coupling,
	HoldSpec,
	IntakeSpec,
	SpellPlan,
	Vec3,
	VesselSpec,
	Vector
} from '../../types.js';

/** Hundredths, the granularity every other signature component uses. */
const SCALE = 100;

const ABSENT = '-';

function number(value: number): string {
	const rounded = Math.round(value * SCALE);
	// A rounded-away negative would otherwise digest as -0 on one machine only.
	return String(rounded === 0 ? 0 : rounded);
}

function vec2(vector: Vector): string {
	return `${number(vector.x)},${number(vector.y)}`;
}

function vec3(vector: Vec3): string {
	return `${number(vector.x)},${number(vector.y)},${number(vector.z)}`;
}

function apertureDigest(aperture: Aperture): string {
	switch (aperture.kind) {
		case 'disc':
			return `disc${aperture.bias ? `@${vec2(aperture.bias)}` : ''}`;
		case 'annulus': {
			const arc =
				aperture.arcDeg === undefined
					? ''
					: `/${number(aperture.arcDeg)}@${number(aperture.bearingDeg ?? 0)}`;
			return `ann${number(aperture.inner)}-${number(aperture.outer)}${arc}`;
		}
		case 'sector':
			return `sec${number(aperture.bearingDeg)}/${number(aperture.halfAngleDeg)}/${number(aperture.inner)}-${number(aperture.outer)}`;
		case 'band':
			return `band${vec2(aperture.normal)}/${number(aperture.offset)}/${number(aperture.width)}`;
		case 'point':
			return `pt${vec2(aperture.at)}`;
	}
}

function holdDigest(hold: HoldSpec | null): string {
	return hold
		? `${vec3(hold.at)}/${number(hold.grip)}/${number(hold.spin)}/${number(hold.budget)}`
		: ABSENT;
}

function intakeDigest(intake: IntakeSpec | null): string {
	return intake
		? `${number(intake.budget)}/${number(intake.draw)}/${number(intake.swirl)}/${vec2(intake.lateral)}`
		: ABSENT;
}

function vesselDigest(vessel: VesselSpec | null): string {
	return vessel ? `${vec3(vessel.at)}/${number(vessel.radius)}/${number(vessel.stir)}` : ABSENT;
}

function couplingsDigest(couplings: Coupling[]): string {
	return couplings.length
		? couplings.map((coupling) => `${coupling.holder}>${coupling.captures.join('+')}`).join(';')
		: ABSENT;
}

/** One plan, one line. Field order is the contract; do not sort it. */
export function planDigest(plan: SpellPlan): string {
	return [
		`plan${plan.version}`,
		plan.mode,
		`${plan.sigil ?? ABSENT}/${plan.element ?? ABSENT}`,
		`b${number(plan.budget)}`,
		`a${vec3(plan.aim)}`,
		`d${number(plan.dispersion)}`,
		`c${number(plan.circulation)}`,
		`f${number(plan.focus)}`,
		`q${number(plan.quality)}`,
		apertureDigest(plan.aperture),
		`x${vec3(plan.exhaust)}`,
		`h${number(plan.hardness)}`,
		`r${number(plan.reach)}`,
		holdDigest(plan.hold),
		intakeDigest(plan.intake),
		vesselDigest(plan.vessel),
		couplingsDigest(plan.couplings),
		plan.notes.length ? plan.notes.join('+') : ABSENT
	].join(':');
}
