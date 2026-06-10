import type { SignEntry } from '../../types.js';

export default {
	kind: 'sign',
	id: 'float',
	displayName: 'Float',
	allowedLayers: ['middle', 'outer'],
	sourceNotes:
		'Float is a non-directional sign that makes things float in midair, apparently letting them ignore gravity. The source notes say it usually levitates the object bearing the seal, while exceptions require extra instruction or remain ambiguous.',
	semantic: {
		manifestation: 'levitation',
		directionMode: 'position',
		force: -0.06,
		focus: -0.04,
		spread: 0.06,
		lifetimeBias: 0.26
	},
	strokeTemplate: {
		sourceAspectRatio: 1,
		strokes: [
			[
				{
					x: 0.408,
					y: 0.06
				},
				{
					x: 0.3447,
					y: 0.1405
				},
				{
					x: 0.2987,
					y: 0.221
				},
				{
					x: 0.2814,
					y: 0.2843
				},
				{
					x: 0.2757,
					y: 0.3533
				},
				{
					x: 0.2814,
					y: 0.3821
				},
				{
					x: 0.339,
					y: 0.4454
				},
				{
					x: 0.3447,
					y: 0.4684
				},
				{
					x: 0.3792,
					y: 0.4971
				},
				{
					x: 0.3907,
					y: 0.4971
				},
				{
					x: 0.431,
					y: 0.5374
				},
				{
					x: 0.4367,
					y: 0.5604
				},
				{
					x: 0.4885,
					y: 0.6064
				},
				{
					x: 0.4942,
					y: 0.7214
				},
				{
					x: 0.4827,
					y: 0.7387
				},
				{
					x: 0.477,
					y: 0.779
				},
				{
					x: 0.4425,
					y: 0.825
				},
				{
					x: 0.4367,
					y: 0.848
				},
				{
					x: 0.362,
					y: 0.94
				}
			],
			[
				{
					x: 0.638,
					y: 0.06
				},
				{
					x: 0.5748,
					y: 0.1405
				},
				{
					x: 0.5288,
					y: 0.221
				},
				{
					x: 0.5115,
					y: 0.2843
				},
				{
					x: 0.5058,
					y: 0.3533
				},
				{
					x: 0.5115,
					y: 0.3821
				},
				{
					x: 0.569,
					y: 0.4454
				},
				{
					x: 0.5748,
					y: 0.4684
				},
				{
					x: 0.6093,
					y: 0.4971
				},
				{
					x: 0.6208,
					y: 0.4971
				},
				{
					x: 0.661,
					y: 0.5374
				},
				{
					x: 0.6668,
					y: 0.5604
				},
				{
					x: 0.7186,
					y: 0.6064
				},
				{
					x: 0.7243,
					y: 0.7214
				},
				{
					x: 0.7128,
					y: 0.7387
				},
				{
					x: 0.7071,
					y: 0.779
				},
				{
					x: 0.6725,
					y: 0.825
				},
				{
					x: 0.6668,
					y: 0.848
				},
				{
					x: 0.592,
					y: 0.94
				}
			]
		]
	}
} satisfies SignEntry;
