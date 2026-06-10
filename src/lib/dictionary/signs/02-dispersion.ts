import type { SignEntry } from '../../types.js';

export default {
	kind: 'sign',
	id: 'dispersion',
	displayName: 'Dispersion',
	allowedLayers: ['middle', 'outer'],
	sourceNotes:
		'Dispersion makes the magic of a seal pour or spread outward instead of firing as a focused beam. The source notes compare it to a leaky column effect, and both normal and inverted forms are seen with unclear differences.',
	semantic: {
		manifestation: 'dispersion',
		directionMode: 'position',
		force: -0.04,
		focus: -0.3,
		spread: 0.34,
		range: 0.1
	},
	strokeTemplate: {
		sourceAspectRatio: 1,
		strokes: [
			[
				{
					x: 0.5029,
					y: 0.06
				},
				{
					x: 0.4971,
					y: 0.6563
				}
			],
			[
				{
					x: 0.2134,
					y: 0.6621
				},
				{
					x: 0.4971,
					y: 0.6563
				},
				{
					x: 0.7808,
					y: 0.6679
				}
			],
			[
				{
					x: 0.2018,
					y: 0.8068
				},
				{
					x: 0.2945,
					y: 0.8879
				},
				{
					x: 0.3524,
					y: 0.9168
				},
				{
					x: 0.4508,
					y: 0.94
				},
				{
					x: 0.555,
					y: 0.94
				},
				{
					x: 0.6476,
					y: 0.9168
				},
				{
					x: 0.7229,
					y: 0.8763
				},
				{
					x: 0.7982,
					y: 0.8068
				}
			]
		]
	}
} satisfies SignEntry;
