/**
 * @file The plan's text form: a stable, human-readable rendering of a
 * `SpellPlan`. This is the cheap regression tier below PNG diffing — a golden
 * that a reviewer can actually read, where a changed ruling shows up as a
 * changed line instead of a changed pixel.
 *
 * Stability is the whole point: fixed field order, fixed precision, no
 * timestamps, no object key iteration. The lab's plan inspector renders the same
 * text the goldens store, so what a reviewer approves is what the lab shows.
 *
 * @example
 * planText(resolvePlan(reading)); // 'plan v1\nsigil        water\n...'
 */

import type {
	Aperture,
	Coupling,
	HoldSpec,
	IntakeSpec,
	PlanSites,
	Site,
	SpellPlan,
	Vec3
} from '../../types.js';

const PRECISION = 3;
const LABEL_WIDTH = 12;

function number(value: number): string {
	const scale = 10 ** PRECISION;
	const rounded = Math.round(value * scale) / scale;
	// A rounded-away negative would otherwise print as -0.000 on one machine.
	return (rounded === 0 ? 0 : rounded).toFixed(PRECISION);
}

function vec2(vector: { x: number; y: number }): string {
	return `(${number(vector.x)}, ${number(vector.y)})`;
}

function vec3(vector: Vec3): string {
	return `(${number(vector.x)}, ${number(vector.y)}, ${number(vector.z)})`;
}

function apertureText(aperture: Aperture): string {
	switch (aperture.kind) {
		case 'disc':
			return aperture.bias ? `disc bias=${vec2(aperture.bias)}` : 'disc';
		case 'annulus': {
			const arc =
				aperture.arcDeg === undefined
					? ''
					: ` arc=${number(aperture.arcDeg)} bearing=${number(aperture.bearingDeg ?? 0)}`;
			return `annulus inner=${number(aperture.inner)} outer=${number(aperture.outer)}${arc}`;
		}
		case 'sector':
			return `sector bearing=${number(aperture.bearingDeg)} half=${number(aperture.halfAngleDeg)} inner=${number(aperture.inner)} outer=${number(aperture.outer)}`;
		case 'band':
			return `band normal=${vec2(aperture.normal)} offset=${number(aperture.offset)} width=${number(aperture.width)}`;
		case 'point':
			return `point at=${vec2(aperture.at)}`;
	}
}

/** One site as `position>facing`, the two things a drawn sign contributes to form. */
function siteText(site: Site): string {
	return `${vec2(site.at)}>${vec2(site.facing)}`;
}

/** Both families on one line, the way `hold` and `intake` each keep to one. */
function sitesText(sites: PlanSites): string {
	const family = (list: Site[]) => `[${list.map(siteText).join('; ')}]`;
	return `column=${family(sites.column)} dispersion=${family(sites.dispersion)}`;
}

function holdText(hold: HoldSpec | null): string {
	if (!hold) {
		return 'none';
	}
	return `at=${vec3(hold.at)} grip=${number(hold.grip)} spin=${number(hold.spin)} budget=${number(hold.budget)}`;
}

function intakeText(intake: IntakeSpec | null): string {
	if (!intake) {
		return 'none';
	}
	return `budget=${number(intake.budget)} draw=${number(intake.draw)} swirl=${number(intake.swirl)} lateral=${vec2(intake.lateral)}`;
}

function couplingsText(couplings: Coupling[]): string {
	if (!couplings.length) {
		return 'none';
	}
	return couplings
		.map((coupling) => `${coupling.holder} captures ${coupling.captures.join('+')}`)
		.join('; ');
}

function line(label: string, value: string): string {
	return `${label.padEnd(LABEL_WIDTH)}${value}`;
}

/** One plan, one text block. Field order is the contract; do not sort it. */
export function planText(plan: SpellPlan): string {
	return [
		`plan v${plan.version}`,
		line('sigil', plan.sigil ?? 'none'),
		line('element', plan.element ?? 'none'),
		line('mode', plan.mode),
		line('budget', number(plan.budget)),
		line('aim', vec3(plan.aim)),
		line('dispersion', number(plan.dispersion)),
		line('circulation', number(plan.circulation)),
		line('sites', sitesText(plan.sites)),
		line('focus', number(plan.focus)),
		line('quality', number(plan.quality)),
		line('symmetry', plan.symmetry === null ? 'none' : String(plan.symmetry)),
		line('aperture', apertureText(plan.aperture)),
		line('exhaust', vec3(plan.exhaust)),
		line('hardness', number(plan.hardness)),
		line('reach', number(plan.reach)),
		line('hold', holdText(plan.hold)),
		line('intake', intakeText(plan.intake)),
		line('vessel', plan.vessel ? vec3(plan.vessel.at) : 'none'),
		line('couplings', couplingsText(plan.couplings)),
		line('notes', plan.notes.length ? plan.notes.join(', ') : 'none')
	].join('\n');
}
