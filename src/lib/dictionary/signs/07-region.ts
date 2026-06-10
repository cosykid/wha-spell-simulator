import type { SignEntry } from '../../types.js';

export default {
	kind: 'sign',
	id: 'region',
	displayName: 'Region (Direction)',
	allowedLayers: ['middle', 'outer'],
	sourceNotes:
		'Region is a directional sign that determines where magic manifests relative to the seal. Inward-facing region signs confine magic inside the ring, outward-facing signs push it outside, and one-sided arrangements make it shoot in that direction.',
	semantic: {
		manifestation: 'directed',
		directionMode: 'orientation',
		force: 0.06,
		focus: 0.16,
		spread: -0.14,
		range: 0.24
	},
	strokeTemplate: {
		sourceAspectRatio: 1,
		strokes: [
			[
				{
					x: 0.06,
					y: 0.7736
				},
				{
					x: 0.06,
					y: 0.7588
				},
				{
					x: 0.2892,
					y: 0.4704
				},
				{
					x: 0.2966,
					y: 0.4482
				},
				{
					x: 0.4076,
					y: 0.3003
				},
				{
					x: 0.4667,
					y: 0.2338
				},
				{
					x: 0.4889,
					y: 0.2264
				},
				{
					x: 0.5333,
					y: 0.2338
				},
				{
					x: 0.5776,
					y: 0.2782
				},
				{
					x: 0.7034,
					y: 0.4556
				},
				{
					x: 0.7625,
					y: 0.5222
				},
				{
					x: 0.7921,
					y: 0.5739
				},
				{
					x: 0.8513,
					y: 0.6405
				},
				{
					x: 0.8808,
					y: 0.6923
				},
				{
					x: 0.94,
					y: 0.7588
				},
				{
					x: 0.94,
					y: 0.7736
				}
			]
		]
	}
} satisfies SignEntry;
