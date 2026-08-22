/**
 * @file `resolvePlan` — the Plan layer's entry point, and the only place canon
 * rulings take effect. Turns a gated `SealReading` into a `SpellPlan`.
 *
 * The shape of the pass is R-13 plus PDF defect L: **gather every family's
 * budget, then resolve**, one layer, no precedence. Each family owns a different
 * verb — column the engine, region the valve, levitation the spring, pull the
 * ambient coupling, convergence the lens — so nothing overrides anything and no
 * ordering rule is needed.
 *
 * @example
 * const plan = resolvePlan(readSeal(glyphAST));
 */

import { emptySealReading } from '../reading/readSeal.js';
import { aimVector, dispersionScalar, foldAggregate } from './columns.js';
import { resolveFocus } from './focus.js';
import { holdFailure, resolveHold } from './hold.js';
import { resolveIntake } from './intake.js';
import { resolveRegion } from './region.js';
import { planFingerprint, snapPlan } from './snap.js';
import type {
	Coupling,
	ElementId,
	PlanMode,
	PlanNote,
	PlanPrimitive,
	SealReading,
	SignReading,
	SpellPlan
} from '../../types.js';

/** Below this a component reads as absent rather than small. */
const NEGLIGIBLE = 1e-6;

type Family = 'column' | 'region' | 'levitation' | 'pull' | 'convergence' | 'power';

/**
 * Which verb a manifestation speaks. Every manifestation the dictionary can emit
 * needs a row (PDF defect I): one missing row used to mean a sign silently did
 * nothing. Anything not listed still pays its ink into the budget and says so in
 * a note, so a new sign is visible the day it is authored.
 */
const MANIFESTATION_FAMILY: Record<string, Family> = {
	column: 'column',
	// R-08: dispersion contributes identically to (S, P, C, Gamma). What differs
	// is timing, and timing is a note the score reads.
	dispersion: 'column',
	directed: 'region',
	levitation: 'levitation',
	pull: 'pull',
	convergence: 'convergence',
	// R-13, deferred: crush contributes power only until it is ruled.
	crush: 'power'
};

/**
 * R-10, the sigil class table. Create-class sigils emit their own element;
 * manipulate-only sigils move the ambient medium. Element is the fallback, so
 * only a sigil that departs from its element needs a row — and both that do say
 * so in their dictionary `sourceNotes`: crystal "creates and manipulates
 * crystalline objects", aeroform "creates and manipulates air", while the wind
 * sigil proper "moves air without creating it".
 */
const SIGIL_MODE: Record<string, PlanMode> = {
	crystal: 'create',
	aeroform: 'create'
};

const ELEMENT_MODE: Record<ElementId, PlanMode> = {
	fire: 'create',
	water: 'create',
	light: 'create',
	wind: 'manipulate',
	earth: 'manipulate'
};

function planMode(sigil: string | null, element: ElementId | null): PlanMode {
	// A seal with no element still gets the default spend, the burst (section 3
	// of `docs/ground-truth.md`), so 'create' is the fallback.
	return SIGIL_MODE[sigil ?? ''] ?? ELEMENT_MODE[element as ElementId] ?? 'create';
}

interface FamilyBudgets {
	column: SignReading[];
	region: SignReading[];
	levitation: SignReading[];
	pull: SignReading[];
	convergence: SignReading[];
	/** Signs whose only ruled contribution is power. */
	power: SignReading[];
	/** Manifestations with no ruling yet, unique and sorted so notes stay stable. */
	unmodeled: string[];
	/** R-08: the seal carries dispersion ink, so its body beat is a slow leak. */
	leak: boolean;
}

/** Pass one: every sign lands in exactly one family's budget, or in `power`. */
function gatherFamilies(signs: SignReading[]): FamilyBudgets {
	const budgets: FamilyBudgets = {
		column: [],
		region: [],
		levitation: [],
		pull: [],
		convergence: [],
		power: [],
		unmodeled: [],
		leak: false
	};
	const unmodeled = new Set<string>();
	for (const sign of signs) {
		const family = MANIFESTATION_FAMILY[sign.manifestation];
		if (!family) {
			unmodeled.add(sign.manifestation);
			budgets.power.push(sign);
			continue;
		}
		budgets[family].push(sign);
		budgets.leak ||= sign.manifestation === 'dispersion';
	}
	budgets.unmodeled = [...unmodeled].sort();
	return budgets;
}

/**
 * The primitives this plan's own manifestation implies. The burst is
 * unconditional because the score's is: R-11 makes every plan strike, so a
 * grip has a ring to catch even when the seal spends no column ink at all.
 */
function ownPrimitives(plan: SpellPlan): PlanPrimitive[] {
	const primitives: PlanPrimitive[] = ['burst'];
	if (Math.hypot(plan.aim.x, plan.aim.y, plan.aim.z) > NEGLIGIBLE) {
		primitives.push('jet');
	}
	if (plan.dispersion > NEGLIGIBLE) {
		primitives.push('fan');
	}
	if (Math.abs(plan.circulation) > NEGLIGIBLE) {
		primitives.push('vortex');
	}
	return primitives;
}

/**
 * Where the plan combines primitives, it says so. Superposition used to leave
 * these emergent and unpredictable; a declared coupling shows up in a text
 * golden instead.
 *
 * R-18 ranks the pair the plan declares here: drive wins while driven, grip wins
 * on coast. The plan's job is only to say the two meet; the hand-off itself is
 * the hold kernel's capture speed.
 *
 * A rotor holds nothing. R-16 lets a hold exist on spin alone, and such a hold
 * has no ceiling to catch anything with, so only a gripping hold couples.
 */
function declareCouplings(plan: SpellPlan): Coupling[] {
	if (!plan.hold || plan.hold.grip <= NEGLIGIBLE) {
		return [];
	}
	return [{ holder: 'hold', captures: ownPrimitives(plan) }];
}

function planNotes(
	plan: SpellPlan,
	reading: SealReading,
	budgets: FamilyBudgets,
	regionRow: number
): PlanNote[] {
	const notes: PlanNote[] = [];
	const lateral = Math.hypot(plan.aim.x, plan.aim.y);

	if (reading.notes.includes('facing-untrusted')) {
		notes.push('facing-untrusted');
	}
	if (budgets.leak) {
		notes.push('dispersion-leak');
	}
	// R-15: ink whose moments cancel keeps its budget and fires the bare
	// shockwave, so "your drawing did nothing" is a designed look and the
	// arrangement stays legible here rather than being rendered as blank.
	if (
		plan.budget > NEGLIGIBLE &&
		lateral <= NEGLIGIBLE &&
		plan.aim.z <= NEGLIGIBLE &&
		plan.dispersion <= NEGLIGIBLE &&
		Math.abs(plan.circulation) <= NEGLIGIBLE
	) {
		notes.push('inert-quadrupole');
	}
	// R-16 and R-17: levitation ink that closed neither channel, named by which
	// dud it is. Tangential ink never reaches here — under R-16 it is a rotor.
	if (budgets.levitation.length && !plan.hold) {
		notes.push(holdFailure(budgets.levitation));
	}
	// R-11 and the pull-only ruling: the seal manifests nothing of its own, which
	// is a look (ambient streaming inward), never an empty canvas.
	if (plan.intake && plan.budget <= NEGLIGIBLE && !plan.hold) {
		notes.push('intake-only');
	}
	// R-09's table is exhaustive by construction, its last row being the default
	// disc. When that row catches chevrons the table does not name, say so.
	if (regionRow === 1 && budgets.region.length) {
		notes.push('region-unruled');
	}
	for (const manifestation of budgets.unmodeled) {
		notes.push(`unmodeled-${manifestation}`);
	}
	return notes;
}

export function resolvePlan(reading: SealReading): SpellPlan {
	const budgets = gatherFamilies(reading.signs);
	const columns = foldAggregate(budgets.column);
	const region = resolveRegion(budgets.region);
	const power = budgets.power.reduce((total, sign) => total + sign.length, 0);

	const draft: SpellPlan = {
		version: 1,
		sigil: reading.sigil,
		element: reading.element,
		mode: planMode(reading.sigil, reading.element),
		aim: aimVector(columns),
		dispersion: dispersionScalar(columns),
		circulation: columns.circulation,
		// R-13 keeps the families' budgets apart. This one is the burst's: column
		// ink, plus ink whose only ruled contribution is power.
		budget: columns.budget + power,
		aperture: region.aperture,
		exhaust: region.exhaust,
		hardness: region.hardness,
		reach: region.reach,
		hold: resolveHold(budgets.levitation),
		intake: resolveIntake(budgets.pull),
		// R-13, deferred: the orb sign is not in the dictionary yet.
		vessel: null,
		focus: resolveFocus(budgets.convergence),
		quality: reading.quality,
		couplings: [],
		notes: []
	};

	const plan: SpellPlan = {
		...draft,
		couplings: declareCouplings(draft),
		notes: planNotes(draft, reading, budgets, region.row)
	};
	return snapPlan(planFingerprint(plan), plan);
}

/**
 * The plan of a seal that resolved to nothing. `invalidSpell` needs a plan with
 * the same shape as a real one, for the same reason `emptySealReading` exists:
 * consumers read these fields unguarded.
 */
export function inertPlan(): SpellPlan {
	return resolvePlan(emptySealReading());
}
