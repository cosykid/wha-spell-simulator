import type { SignEntry } from '../../types.js';

export default {
	kind: 'sign',
	id: 'convergence',
	displayName: 'Convergence',
	allowedLayers: ['middle', 'outer'],
	sourceNotes:
		"Convergence focuses a spell's magic down toward a single point. It can also pack loose particles tightly enough to become somewhat rigid, as with the compacted sand in Serpent's Bed of Sand.",
	semantic: {
		manifestation: 'convergence',
		directionMode: 'inward',
		force: 0.08,
		focus: 0.36,
		spread: -0.32,
		range: -0.04,
		lifetimeBias: 0.08
	},
	strokeTemplate: {
		sourceAspectRatio: 1,
		strokes: [
			[
				{
					x: 0.076,
					y: 0.104
				},
				{
					x: 0.06,
					y: 0.128
				},
				{
					x: 0.092,
					y: 0.24
				},
				{
					x: 0.116,
					y: 0.264
				},
				{
					x: 0.132,
					y: 0.312
				},
				{
					x: 0.164,
					y: 0.352
				},
				{
					x: 0.164,
					y: 0.368
				},
				{
					x: 0.196,
					y: 0.408
				},
				{
					x: 0.22,
					y: 0.464
				},
				{
					x: 0.244,
					y: 0.488
				},
				{
					x: 0.252,
					y: 0.52
				},
				{
					x: 0.276,
					y: 0.544
				},
				{
					x: 0.284,
					y: 0.584
				},
				{
					x: 0.308,
					y: 0.608
				},
				{
					x: 0.316,
					y: 0.64
				},
				{
					x: 0.34,
					y: 0.664
				},
				{
					x: 0.348,
					y: 0.696
				},
				{
					x: 0.372,
					y: 0.72
				},
				{
					x: 0.38,
					y: 0.752
				},
				{
					x: 0.404,
					y: 0.776
				},
				{
					x: 0.444,
					y: 0.864
				},
				{
					x: 0.5,
					y: 0.896
				},
				{
					x: 0.54,
					y: 0.88
				},
				{
					x: 0.564,
					y: 0.856
				},
				{
					x: 0.572,
					y: 0.824
				},
				{
					x: 0.596,
					y: 0.8
				},
				{
					x: 0.604,
					y: 0.768
				},
				{
					x: 0.628,
					y: 0.744
				},
				{
					x: 0.636,
					y: 0.712
				},
				{
					x: 0.66,
					y: 0.688
				},
				{
					x: 0.7,
					y: 0.6
				},
				{
					x: 0.724,
					y: 0.576
				},
				{
					x: 0.74,
					y: 0.528
				},
				{
					x: 0.82,
					y: 0.408
				},
				{
					x: 0.828,
					y: 0.368
				},
				{
					x: 0.852,
					y: 0.344
				},
				{
					x: 0.86,
					y: 0.312
				},
				{
					x: 0.916,
					y: 0.232
				},
				{
					x: 0.94,
					y: 0.112
				}
			],
			[
				{
					x: 0.084,
					y: 0.104
				},
				{
					x: 0.924,
					y: 0.104
				}
			]
		]
	}
} satisfies SignEntry;
