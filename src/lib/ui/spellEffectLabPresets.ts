// Canned sign arrangements for the Spell Effect Lab. Each preset synthesizes
// the Recognition fixtures a drawn spell would produce, so the field pipeline
// (buildSpellField -> field effect) can be exercised without drawing signs.

import type { Recognition } from '../types.js';

interface PresetSignSpec {
	id: string;
	manifestation: string;
	/** Ring position bearing: 0 = east, 90 = top. */
	angleDeg: number;
	/** Bearing the sign points toward. */
	facingDeg: number;
	radialFacing?: Recognition['radialFacing'];
	sizeNorm?: number;
}

export interface FieldPreset {
	id: string;
	label: string;
	description: string;
	signs: Recognition[];
}

function presetSign({
	id,
	manifestation,
	angleDeg,
	facingDeg,
	radialFacing = 'unclear',
	sizeNorm = 0.16
}: PresetSignSpec): Recognition {
	return {
		candidateId: `preset-${id}-${angleDeg}`,
		strokeIds: [],
		id,
		displayName: id,
		kind: 'sign',
		recognized: true,
		recognitionStatus: 'valid',
		confidence: 0.92,
		neatness: 0.88,
		layer: 'outer',
		nearBoundary: false,
		angleDeg,
		radiusNorm: 0.8,
		sizeNorm,
		lengthNorm: 0.5,
		orientationDeg: facingDeg % 180,
		directedOrientationDeg: facingDeg,
		rotationOffsetDeg: 0,
		radialFacing,
		overdrawAmount: 0,
		element: null,
		semantic: { manifestation, directionMode: 'inward' },
		referenceSizeNorm: sizeNorm,
		shape: {}
	} as Recognition;
}

function inward(angleDeg: number): number {
	return (angleDeg + 180) % 360;
}

function signsAt(
	angles: number[],
	spec: (angleDeg: number) => Omit<PresetSignSpec, 'angleDeg'>
): Recognition[] {
	return angles.map((angleDeg) => presetSign({ angleDeg, ...spec(angleDeg) }));
}

export const FIELD_PRESETS: FieldPreset[] = [
	{
		id: 'none',
		label: 'No signs (element only)',
		description: 'Legacy per-element effect; the field renderer stays idle.',
		signs: []
	},
	{
		id: 'column-balanced',
		label: 'Columns ×3 — balanced beam',
		description: 'Three columns spread evenly; their leans cancel into a straight beam.',
		signs: signsAt([90, 210, 330], (angleDeg) => ({
			id: 'column',
			manifestation: 'column',
			facingDeg: inward(angleDeg)
		}))
	},
	{
		id: 'column-unbalanced',
		label: 'Column ×1 — leaning beam',
		description: 'One column on the east side; the beam leans toward it, as in canon.',
		signs: signsAt([0], (angleDeg) => ({
			id: 'column',
			manifestation: 'column',
			facingDeg: inward(angleDeg),
			sizeNorm: 0.2
		}))
	},
	{
		id: 'pull-inward',
		label: 'Pulls ×2 — draw inward',
		description: 'Opposing pulls facing the center; magic gathers toward the seal.',
		signs: signsAt([0, 180], (angleDeg) => ({
			id: 'pull',
			manifestation: 'pull',
			facingDeg: inward(angleDeg)
		}))
	},
	{
		id: 'pull-vortex',
		label: 'Pulls ×3 — angled vortex',
		description: 'Pulls rotated 90° from inward: pure twist without pulling (canon).',
		signs: signsAt([0, 120, 240], (angleDeg) => ({
			id: 'pull',
			manifestation: 'pull',
			facingDeg: (inward(angleDeg) + 90) % 360
		}))
	},
	{
		id: 'pull-inverted',
		label: 'Pulls ×2 — inverted push',
		description: 'Pulls facing outward; the field pushes matter away from the seal.',
		signs: signsAt([45, 225], (angleDeg) => ({
			id: 'pull',
			manifestation: 'pull',
			facingDeg: angleDeg,
			radialFacing: 'outward'
		}))
	},
	{
		id: 'dispersion',
		label: 'Dispersion ×2 — pour outward',
		description: 'Magic leaks outward on all sides instead of beaming.',
		signs: signsAt([90, 270], (angleDeg) => ({
			id: 'dispersion',
			manifestation: 'dispersion',
			facingDeg: angleDeg
		}))
	},
	{
		id: 'region-sector',
		label: 'Regions ×3 — one-sided shot',
		description: 'Regions agreeing on one side; the effect emits toward the east.',
		signs: signsAt([150, 180, 210], () => ({
			id: 'region',
			manifestation: 'directed',
			facingDeg: 0
		}))
	},
	{
		id: 'region-inside',
		label: 'Regions ×4 — confined inside',
		description: 'All regions face the center; magic only manifests within the ring.',
		signs: signsAt([0, 90, 180, 270], (angleDeg) => ({
			id: 'region',
			manifestation: 'directed',
			facingDeg: inward(angleDeg)
		}))
	},
	{
		id: 'region-ring',
		label: 'Regions ×4 — on the ring',
		description: 'Opposed inward/outward regions pin the magic onto the ring itself.',
		signs: [
			presetSign({ id: 'region', manifestation: 'directed', angleDeg: 0, facingDeg: 180 }),
			presetSign({ id: 'region', manifestation: 'directed', angleDeg: 180, facingDeg: 180 }),
			presetSign({ id: 'region', manifestation: 'directed', angleDeg: 90, facingDeg: 90 }),
			presetSign({ id: 'region', manifestation: 'directed', angleDeg: 270, facingDeg: 90 })
		]
	},
	{
		id: 'swirl-pushes',
		label: 'Regions ×3 — tangential swirl',
		description: 'Three sideways pushes with no net side; rotation emerges from the sum.',
		signs: signsAt([0, 120, 240], (angleDeg) => ({
			id: 'region',
			manifestation: 'directed',
			facingDeg: (inward(angleDeg) + 90) % 360
		}))
	},
	{
		id: 'levitation',
		label: 'Float ×3 — hover',
		description: 'Buoyancy beats gravity; particles drift upward and hang.',
		signs: signsAt([30, 150, 270], (angleDeg) => ({
			id: 'float',
			manifestation: 'levitation',
			facingDeg: inward(angleDeg)
		}))
	}
];

export function presetById(id: string): FieldPreset {
	return FIELD_PRESETS.find((preset) => preset.id === id) ?? FIELD_PRESETS[0];
}
