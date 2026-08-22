/**
 * @file What classes an arrangement of region chevrons has. R-09's rule table
 * ({@link file://./region.ts}) matches on these and never on raw geometry, so
 * every quantization the grammar depends on lives here, in one place, named.
 *
 * Facing classes are not among them: those arrive already quantized from the
 * reading, with hysteresis, which is what keeps a facing on a boundary from
 * changing meaning between recognition passes.
 */

import { angleDegFromCenter, mean, normalizeAngleDeg } from '../../utils/geometry.js';
import type { SignReading, Vector } from '../../types.js';

const CHEVRON_TUNING = {
	/** Radial position classes. A chevron is at the center, at mid radius, or on the rim. */
	centerRadius: 0.33,
	rimRadius: 0.66,
	/** How near two facings must be to count as one direction class (ground truth section 5). */
	agreementDeg: 25,
	/** How near antipodal two positions must be to form an opposed pair. */
	pairingDeg: 30,
	/** R-19: azimuth two same-sense radial chevrons must span before they fuse into a fence. */
	ringSpreadDeg: 60
};

const ORIGIN: Vector = { x: 0, y: 0 };

export type PositionClass = 'center' | 'mid' | 'rim' | 'mixed';

/** How far the members spread around the seal, and where that spread sits. */
export interface ArcExtent {
	/** True when the members huddle on one arc rather than ringing the seal. */
	confined: boolean;
	arcDeg: number;
	bearingDeg: number;
}

/** Every class a rule may match on, read once so the table stays declarative. */
export interface ChevronSet {
	members: SignReading[];
	count: number;
	position: PositionClass;
	arc: ArcExtent;
	allInward: boolean;
	allOutward: boolean;
	/** Facings near-parallel: one direction class, a stack of gates. */
	agreeing: boolean;
	/** More than one direction class, which at the center is the pin. */
	crossed: boolean;
	/** Members that sit opposite another member and disagree with it about direction. */
	opposedPairs: number;
	/** R-19: the members cover enough azimuth for a same-sense pair to fuse into a fence. */
	spreadsRing: boolean;
	/** Mean facing, unnormalized: a symmetric set cancels to zero. */
	meanFacing: Vector;
	/** Mean sign power, which scales hardness and nothing else. */
	power: number;
	/** Mean distance from the center, for the band rule. */
	radius: number;
}

export function meanVector(vectors: Vector[]): Vector {
	const sum = vectors.reduce((total, item) => ({ x: total.x + item.x, y: total.y + item.y }), {
		x: 0,
		y: 0
	});
	return { x: sum.x / vectors.length, y: sum.y / vectors.length };
}

export function normalized(vector: Vector): Vector {
	const magnitude = Math.hypot(vector.x, vector.y);
	return magnitude < 1e-9 ? { x: 0, y: 0 } : { x: vector.x / magnitude, y: vector.y / magnitude };
}

export function bearingOf(at: Vector): number {
	return angleDegFromCenter(at, ORIGIN);
}

function positionClass(at: Vector): Exclude<PositionClass, 'mixed'> {
	const radius = Math.hypot(at.x, at.y);
	if (radius < CHEVRON_TUNING.centerRadius) {
		return 'center';
	}
	return radius >= CHEVRON_TUNING.rimRadius ? 'rim' : 'mid';
}

function setPositionClass(members: SignReading[]): PositionClass {
	const classes = new Set(members.map((member) => positionClass(member.at)));
	return classes.size === 1 ? [...classes][0] : 'mixed';
}

/**
 * The widest gap between neighbouring members is what tells a ring from an arc:
 * a gap wider than half the circle means every member sits on one side.
 */
function arcExtent(members: SignReading[]): ArcExtent {
	const bearings = members.map((member) => bearingOf(member.at)).sort((a, b) => a - b);
	if (bearings.length < 2) {
		return { confined: true, arcDeg: 0, bearingDeg: bearings[0] ?? 0 };
	}
	let widestGap = 360 - (bearings[bearings.length - 1] - bearings[0]);
	let gapStart = bearings[bearings.length - 1];
	for (let index = 1; index < bearings.length; index += 1) {
		const gap = bearings[index] - bearings[index - 1];
		if (gap > widestGap) {
			widestGap = gap;
			gapStart = bearings[index - 1];
		}
	}
	const arcDeg = 360 - widestGap;
	return {
		confined: widestGap > 180,
		arcDeg,
		bearingDeg: normalizeAngleDeg(gapStart + widestGap + arcDeg / 2)
	};
}

function facingsAgree(members: SignReading[]): boolean {
	const limit = Math.cos((CHEVRON_TUNING.agreementDeg * Math.PI) / 180);
	const axis = normalized(meanVector(members.map((member) => member.facing)));
	return members.every((member) => member.facing.x * axis.x + member.facing.y * axis.y >= limit);
}

/**
 * Members claim each other pairwise, so one chevron cannot partner two others.
 *
 * R-19: a pair is two direction classes, per ground truth section 5. Counting on
 * position alone made two chevrons of the *same* sense read as a pinch pair, so
 * an outward pair exhausted upward instead of into the moat.
 */
function countOpposedPairs(members: SignReading[]): number {
	const bearings = members.map((member) => bearingOf(member.at));
	const partnered = new Set<number>();
	for (let index = 0; index < bearings.length; index += 1) {
		for (let other = index + 1; other < bearings.length; other += 1) {
			if (partnered.has(index) || partnered.has(other)) {
				continue;
			}
			if (members[index].facingClass === members[other].facingClass) {
				continue;
			}
			const separation = Math.abs(normalizeAngleDeg(bearings[index] - bearings[other]) - 180);
			if (separation <= CHEVRON_TUNING.pairingDeg) {
				partnered.add(index);
				partnered.add(other);
			}
		}
	}
	return partnered.size / 2;
}

export function readChevrons(members: SignReading[]): ChevronSet {
	const arc = arcExtent(members);
	return {
		members,
		count: members.length,
		position: setPositionClass(members),
		arc,
		allInward: members.every((member) => member.facingClass === 'inward'),
		allOutward: members.every((member) => member.facingClass === 'outward'),
		agreeing: facingsAgree(members),
		crossed: new Set(members.map((member) => member.facingClass)).size > 1,
		opposedPairs: countOpposedPairs(members),
		spreadsRing: arc.arcDeg >= CHEVRON_TUNING.ringSpreadDeg,
		meanFacing: meanVector(members.map((member) => member.facing)),
		power: mean(members.map((member) => member.power)),
		radius: mean(members.map((member) => Math.hypot(member.at.x, member.at.y)))
	};
}
