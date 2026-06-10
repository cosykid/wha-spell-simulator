import type { SignEntry } from '../../types.js';

export default {
	kind: 'sign',
	id: 'crush',
	displayName: 'Crush',
	allowedLayers: ['middle', 'outer'],
	sourceNotes:
		'Crush is a semi-directional sign that breaks things apart. With earth magic it disintegrates objects into tiny sand-like or powdered pieces; inverted crush can reform powdered material into its original shape until the spell ends.',
	semantic: {
		manifestation: 'crush',
		directionMode: 'position',
		force: 0.26,
		focus: 0.08,
		spread: 0.06
	},
	strokeTemplate: {
		sourceAspectRatio: 1,
		strokes: [
			[
				{
					x: 0.06,
					y: 0.6168
				},
				{
					x: 0.1089,
					y: 0.5679
				},
				{
					x: 0.223,
					y: 0.4104
				},
				{
					x: 0.261,
					y: 0.3832
				},
				{
					x: 0.2936,
					y: 0.3886
				},
				{
					x: 0.4131,
					y: 0.519
				},
				{
					x: 0.4728,
					y: 0.5788
				},
				{
					x: 0.4946,
					y: 0.5896
				},
				{
					x: 0.538,
					y: 0.5788
				},
				{
					x: 0.7064,
					y: 0.3941
				},
				{
					x: 0.7499,
					y: 0.3832
				},
				{
					x: 0.7825,
					y: 0.4049
				},
				{
					x: 0.94,
					y: 0.6168
				}
			]
		]
	}
} satisfies SignEntry;
