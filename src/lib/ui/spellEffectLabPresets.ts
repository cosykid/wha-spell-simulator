// Canned sign arrangements for the Spell Effect Lab. Each preset synthesizes the
// Recognition fixtures a drawn spell would produce, so the whole pipeline below
// the reading (readSeal -> resolvePlan -> cast) can be exercised without drawing
// signs. This list is also the golden corpus: every preset owes a plan text, a
// set of cast motion PNGs and a set of look snapshots.

import { normalizeAngleDeg } from '../utils/geometry.js';
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

export interface LabPreset {
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
	// Facing travels the way real recognitions carry it: as the ML pose head's
	// rotationOffsetDeg (see `readFacing` in compiler/reading/facing.ts).
	const twistDeg = facingDeg - (angleDeg + 180);
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
		rotationOffsetDeg: normalizeAngleDeg(-(twistDeg + angleDeg + 90)),
		radialFacing,
		overdrawAmount: 0,
		element: null,
		semantic: { manifestation, directionMode: 'inward' },
		referenceSizeNorm: sizeNorm,
		shape: {},
		diagnostics: { ml: { accepted: true } }
	} as unknown as Recognition;
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

export const LAB_PRESETS: LabPreset[] = [
	{
		id: 'none',
		label: 'No signs (element only)',
		description: 'A sigil with no signs: the plan resolves to nothing, which R-11 makes a look.',
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
		description:
			'One column on the east side, facing inward; the beam leans west, away from it, as in canon.',
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
		description:
			'Pulls rotated 90° from inward swirl around a hollow eye and climb (Grasping Wind).',
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
		label: 'Levitation ×4 — hover blob',
		description:
			'Lift fades with height; the element gathers into a mass held above the seal (water orb).',
		signs: signsAt([0, 90, 180, 270], (angleDeg) => ({
			id: 'levitation',
			manifestation: 'levitation',
			facingDeg: inward(angleDeg)
		}))
	},
	{
		id: 'column-levitation',
		label: 'Columns ×2 + levitation ×2 — held beam',
		description:
			'A column pair beams straight out while an opposed levitation pair grips it; the only arrangement whose plan declares a coupling.',
		signs: [
			...signsAt([0, 180], (angleDeg) => ({
				id: 'column',
				manifestation: 'column',
				facingDeg: inward(angleDeg)
			})),
			...signsAt([90, 270], (angleDeg) => ({
				id: 'levitation',
				manifestation: 'levitation',
				facingDeg: inward(angleDeg)
			}))
		]
	},
	{
		id: 'column-half-ring',
		label: 'Columns ×3 — half ring',
		description:
			'R-14: three inward columns spanning half the ring. The most common hand-drawn arrangement, and a steep diagonal geyser rather than a ground-hugging surge.',
		signs: signsAt([270, 0, 90], (angleDeg) => ({
			id: 'column',
			manifestation: 'column',
			facingDeg: inward(angleDeg)
		}))
	},
	{
		id: 'column-cancelled',
		label: 'Columns ×4 — cancelled ink',
		description:
			'R-15: two inward columns and two outward ones, so every moment cancels. The budget is spent and the seal fires the bare shockwave.',
		signs: [
			...signsAt([0, 180], (angleDeg) => ({
				id: 'column',
				manifestation: 'column',
				facingDeg: inward(angleDeg)
			})),
			...signsAt([90, 270], (angleDeg) => ({
				id: 'column',
				manifestation: 'column',
				facingDeg: angleDeg
			}))
		]
	},
	{
		id: 'column-pinwheel',
		label: 'Columns ×4 — tangential pinwheel',
		description:
			'R-05: four columns drawn across the ring instead of at it. Every lean cancels and every moment adds, so the fold spends the ink as circulation and the seal raises a vortex.',
		signs: signsAt([0, 90, 180, 270], (angleDeg) => ({
			id: 'column',
			manifestation: 'column',
			facingDeg: (angleDeg + 90) % 360
		}))
	},
	{
		id: 'levitation-pinwheel',
		label: 'Levitation ×4 — rotor',
		description:
			'R-16: four tangential levitation arrows. No clash, so no grip, but the torque still turns: a flat swirl at the hover height.',
		signs: signsAt([0, 90, 180, 270], (angleDeg) => ({
			id: 'levitation',
			manifestation: 'levitation',
			facingDeg: (inward(angleDeg) + 90) % 360
		}))
	},
	{
		id: 'levitation-inverted',
		label: 'Levitation ×4 — inverted',
		description:
			'R-17: four outward levitation arrows. Negative convergence grips nothing, so this is a dud, named rather than silently blank.',
		signs: signsAt([0, 90, 180, 270], (angleDeg) => ({
			id: 'levitation',
			manifestation: 'levitation',
			facingDeg: angleDeg
		}))
	},
	{
		id: 'region-pair',
		label: 'Regions ×2 — fused fence',
		description:
			'R-19: two outward chevrons, opposed. Two members complete a fence, so this opens the moat instead of pinching the rim.',
		signs: signsAt([0, 180], (angleDeg) => ({
			id: 'region',
			manifestation: 'directed',
			facingDeg: angleDeg
		}))
	},
	{
		id: 'spun-column',
		label: 'Columns ×4 + pulls ×4 — fire whirl',
		description:
			'R-21: an inward clash ringed by slanted pulls. The helical inflow spins the column it feeds, so the seal raises one turning whirl instead of a beam with intake branches.',
		signs: [
			...signsAt([0, 90, 180, 270], (angleDeg) => ({
				id: 'column',
				manifestation: 'column',
				facingDeg: inward(angleDeg)
			})),
			...signsAt([45, 135, 225, 315], (angleDeg) => ({
				id: 'pull',
				manifestation: 'pull',
				facingDeg: (inward(angleDeg) + 45) % 360
			}))
		]
	}
];

export function presetById(id: string): LabPreset {
	return LAB_PRESETS.find((preset) => preset.id === id) ?? LAB_PRESETS[0];
}
