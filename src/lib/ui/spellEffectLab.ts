/**
 * Control definitions and pure SpellIR <-> slider-value mapping for the Spell
 * Effect Lab. The lab synthesizes a SpellIR and a test ring from a set of
 * sliders so the effect renderer can be tuned without drawing a real spell.
 * No DOM access lives here.
 */
import { clamp } from '../utils/geometry.js';
import { directionFromTiltAngles } from '../compiler/spellDirection.js';
import { sigilRegistry } from '../dictionary/dictionaryLoader.js';
import type { SpellIR, Manifestation, ElementId, AppConfig, SigilEntry } from '../types.js';

/** A single slider control definition. */
interface ControlDef {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	description: string;
}

/** The key-value map of all slider values. */
type ControlValues = Record<string, number>;

/**
 * Ordered slider definitions. `value` is the initial/default value; the
 * component seeds its reactive state from these and mutates copies only.
 */
export const EFFECT_CONTROLS: Record<string, ControlDef> = {
	effectScale: {
		label: 'Sigil Size',
		value: 1.6,
		min: 1,
		max: 2.35,
		step: 0.01,
		description: 'Scales the portal and particle body from the primary sigil size.'
	},
	force: {
		label: 'Force',
		value: 0.62,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Raises speed, pressure, flame size, and overall push.'
	},
	spread: {
		label: 'Spread',
		value: 0.48,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Widens the emission area and loosens particle paths.'
	},
	focus: {
		label: 'Focus',
		value: 0.65,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Tightens the emission area and makes particles drift less.'
	},
	gravity: {
		label: 'Gravity',
		value: 1,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Controls falling versus suspended motion. Lower values act like levitation.'
	},
	convergenceStrength: {
		label: 'Convergence',
		value: 0,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Compresses the spread into a narrow centerline as the effect travels.'
	},
	convergenceRadius: {
		label: 'Compression Radius',
		value: 0.08,
		min: 0.03,
		max: 0.35,
		step: 0.01,
		description: 'Sets how narrow the final compressed stream becomes.'
	},
	convergenceRigidity: {
		label: 'Rigidity',
		value: 0.9,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Controls how strongly particles stay near the compressed path.'
	},
	convergenceX: {
		label: 'Centerline X',
		value: 0,
		min: -1,
		max: 1,
		step: 0.01,
		description: 'Offsets the compressed path sideways from the ring center.'
	},
	convergenceY: {
		label: 'Centerline Y',
		value: 0,
		min: -1,
		max: 1,
		step: 0.01,
		description: 'Offsets the compressed path forward or backward along the effect direction.'
	},
	dispersion: {
		label: 'Dispersion',
		value: 0,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Sprays the effect outward on all sides instead of along one direction.'
	},
	bolt: {
		label: 'Bolt',
		value: 0,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Looses faster, shorter particles in rhythmic volleys, like projectiles.'
	},
	duration: {
		label: 'Duration',
		value: 5,
		min: 0.5,
		max: 8.5,
		step: 0.1,
		description: 'Sets how long the active spell effect remains alive.'
	},
	stability: {
		label: 'Stability',
		value: 0.72,
		min: 0,
		max: 1,
		step: 0.01,
		description: 'Reduces jitter, flicker, and unstable particle drift.'
	},
	xTiltDeg: {
		label: 'Tilt Toward X',
		value: 0,
		min: -82,
		max: 82,
		step: 1,
		description: 'Leans the effect direction toward the left or right side.'
	},
	yTiltDeg: {
		label: 'Tilt Toward Y',
		value: -42,
		min: -82,
		max: 82,
		step: 1,
		description: 'Leans the effect direction toward the top or bottom side.'
	},
	ringRadius: {
		label: 'Ring Size',
		value: 0.34,
		min: 0.2,
		max: 0.46,
		step: 0.01,
		description: 'Changes the drawn test ring and the portal size.'
	}
};

/** Default element selection for the lab. */
export const DEFAULT_ELEMENT: ElementId = 'water';

/** Default sigil selection for the lab. */
export const DEFAULT_SIGIL = 'water';

/** Selectable sigils, including element-variant sigils that reuse a base element's effect. */
export const SIGIL_OPTIONS: Array<{ id: string; element: ElementId; label: string }> = sigilRegistry
	.all()
	.filter((entry): entry is SigilEntry & { element: ElementId } => Boolean(entry.element))
	.map((entry) => ({
		id: entry.id,
		element: entry.element,
		label:
			entry.id === entry.element ? entry.displayName : `${entry.displayName} (${entry.element})`
	}));

/** Resolves the base element a sigil id renders as. */
export function elementForSigil(sigil: string): ElementId {
	return sigilRegistry.get(sigil)?.element ?? DEFAULT_ELEMENT;
}

/** Builds the initial { key: value } map from the control definitions. */
export function defaultControlValues(): ControlValues {
	return Object.fromEntries(
		Object.entries(EFFECT_CONTROLS).map(([key, control]) => [key, control.value])
	);
}

/** Formats a slider value for display, matching the original tool's units. */
export function formatControlValue(key: string, value: number): string {
	if (key === 'xTiltDeg' || key === 'yTiltDeg') {
		return `${Math.round(value)} deg`;
	}
	if (key === 'duration') {
		return `${Math.round(value * 10) / 10}s`;
	}
	return String(Math.round(value * 100) / 100);
}

function buildManifestations(values: ControlValues): {
	primaryManifestation: string;
	manifestations: Record<string, Manifestation>;
} {
	const levitationStrength = clamp(1 - values.gravity!, 0, 1);
	const convergenceStrength = values.convergenceStrength!;
	const manifestations: Record<string, Manifestation> = {};

	if (levitationStrength > 0) {
		manifestations.levitation = {
			strength: levitationStrength
		};
	}

	if (convergenceStrength > 0) {
		manifestations.convergence = {
			strength: convergenceStrength,
			point: {
				x: values.convergenceX!,
				y: values.convergenceY!
			},
			radius: values.convergenceRadius,
			rigidity: values.convergenceRigidity
		};
	}

	const dispersionStrength = clamp(values.dispersion ?? 0, 0, 1);
	if (dispersionStrength > 0) {
		manifestations.dispersion = { strength: dispersionStrength };
	}

	const boltStrength = clamp(values.bolt ?? 0, 0, 1);
	if (boltStrength > 0) {
		manifestations.bolt = { strength: boltStrength };
	}

	const primaryManifestation = Object.entries(manifestations).sort(
		([, left], [, right]) => right.strength - left.strength
	)[0]?.[0];

	if (!primaryManifestation) {
		return {
			primaryManifestation: 'aura',
			manifestations: {
				aura: {
					strength: 1
				}
			}
		};
	}

	return {
		primaryManifestation,
		manifestations
	};
}

/** Synthesizes a SpellIR from the current slider values and element. */
export function buildSpellIR({
	values,
	element,
	sigil,
	activatedAt,
	config
}: {
	values: ControlValues;
	element: ElementId;
	sigil?: string;
	activatedAt: number | null;
	config: AppConfig;
}): SpellIR {
	const { effectScale, force, spread, focus, gravity, duration, stability } =
		values as Required<ControlValues>;
	const direction = directionFromTiltAngles(
		values.xTiltDeg!,
		values.yTiltDeg!
	) as SpellIR['direction'];
	const { primaryManifestation, manifestations } = buildManifestations(values);

	return {
		type: 'SpellIR',
		active: true,
		prepared: false,
		valid: true,
		status: 'Active spell',
		activatedAt,
		element,
		sigil: sigil ?? element,
		elementConfidence: 1,
		primarySizeNorm:
			(effectScale - config.renderer.effectSize.baseScale) /
			config.renderer.effectSize.sigilSizeInfluence,
		effectScale,
		primaryManifestation,
		manifestations,
		direction,
		directionCoherence: clamp(Math.hypot(direction.x, direction.y), 0, 1),
		gravity,
		force,
		spread,
		focus,
		range: 0.55,
		duration,
		stability,
		quality: stability,
		neatness: stability,
		warnings: [],
		signature: [
			'lab',
			element,
			sigil ?? element,
			Math.round(effectScale * 100),
			Math.round(force * 100),
			Math.round(spread * 100),
			Math.round(focus * 100),
			Math.round(gravity * 100),
			Math.round(values.convergenceStrength! * 100),
			Math.round(values.convergenceRadius! * 100),
			Math.round(values.convergenceRigidity! * 100),
			Math.round(values.convergenceX! * 100),
			Math.round(values.convergenceY! * 100),
			Math.round((values.dispersion ?? 0) * 100),
			Math.round((values.bolt ?? 0) * 100),
			Math.round(duration * 10),
			Math.round(stability * 100),
			Math.round(values.xTiltDeg!),
			Math.round(values.yTiltDeg!),
			Math.round(values.ringRadius! * 100)
		].join(':')
	};
}

function clampToControl(key: string, value: number): number | undefined {
	const control = EFFECT_CONTROLS[key];
	if (!control || typeof value !== 'number' || Number.isNaN(value)) {
		return undefined;
	}
	return clamp(value, control.min, control.max);
}

/**
 * Derives slider values and element from a pasted SpellIR object, clamping
 * each value to its control range. Returns the patch to merge into state.
 * Throws if the input is not an object.
 */
export function valuesFromSpellIR(
	spellIR: unknown,
	currentValues: ControlValues
): { values: ControlValues; element: ElementId | undefined; sigil: string | undefined } {
	if (!spellIR || typeof spellIR !== 'object') {
		throw new Error('Paste a SpellIR JSON object.');
	}

	// Cast to a loose record for safe property access
	const ir = spellIR as Record<string, unknown>;
	const irManifestations = (ir.manifestations ?? {}) as Record<string, Record<string, unknown>>;
	const irConvergence = (irManifestations.convergence ?? {}) as Record<string, unknown>;
	const irConvergencePoint = (irConvergence.point ?? {}) as Record<string, unknown>;
	const irDispersion = (irManifestations.dispersion ?? {}) as Record<string, unknown>;
	const irBolt = (irManifestations.bolt ?? {}) as Record<string, unknown>;
	const irDirection = (ir.direction ?? {}) as Record<string, unknown>;

	const next: ControlValues = { ...currentValues };
	const set = (key: string, value: number): void => {
		const clamped = clampToControl(key, value);
		if (clamped !== undefined) {
			next[key] = clamped;
		}
	};

	set('effectScale', Number(ir.effectScale));
	set('force', Number(ir.force));
	set('spread', Number(ir.spread));
	set('focus', Number(ir.focus ?? clamp(1 - Number(ir.spread) * 0.72, 0, 1)));
	set('gravity', Number(ir.gravity));
	set('convergenceStrength', Number(irConvergence.strength ?? 0));
	set('convergenceRadius', Number(irConvergence.radius ?? currentValues.convergenceRadius));
	set('convergenceRigidity', Number(irConvergence.rigidity ?? currentValues.convergenceRigidity));
	set('convergenceX', Number(irConvergencePoint.x ?? currentValues.convergenceX));
	set('convergenceY', Number(irConvergencePoint.y ?? currentValues.convergenceY));
	set('dispersion', Number(irDispersion.strength ?? 0));
	set('bolt', Number(irBolt.strength ?? 0));
	set('duration', Number(ir.duration));
	set('stability', Number(ir.stability));

	if (ir.direction) {
		if (typeof irDirection.xTiltDeg === 'number' || typeof irDirection.yTiltDeg === 'number') {
			set('xTiltDeg', Number(irDirection.xTiltDeg ?? 0));
			set('yTiltDeg', Number(irDirection.yTiltDeg ?? 0));
		} else {
			set(
				'xTiltDeg',
				Math.atan2(Number(irDirection.x ?? 0), Number(irDirection.z ?? 1)) * (180 / Math.PI)
			);
			set(
				'yTiltDeg',
				Math.atan2(Number(irDirection.y ?? 0), Number(irDirection.z ?? 1)) * (180 / Math.PI)
			);
		}
	}

	return {
		values: next,
		element: (ir.element as ElementId | undefined) ?? undefined,
		sigil: (ir.sigil as string | undefined) ?? undefined
	};
}
