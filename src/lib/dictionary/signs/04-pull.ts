import type { SignEntry } from '../../types.js';

export default {
	kind: 'sign',
	id: 'pull',
	displayName: 'Pull',
	allowedLayers: ['middle', 'outer'],
	sourceNotes:
		'Pull is a directional sign that draws matching matter, such as water, air, or fire, toward the seal when its arrow portion points inward. If angled, it likely adds a twisting pull; if inverted, it probably pushes matter away.',
	semantic: {
		manifestation: 'pull',
		directionMode: 'inward',
		force: 0.18,
		focus: 0.16,
		spread: -0.22,
		range: 0.16
	},
	strokeTemplate: {
		sourceAspectRatio: 1,
		strokes: [
			[
				{
					x: 0.2173,
					y: 0.3156
				},
				{
					x: 0.4385,
					y: 0.0846
				},
				{
					x: 0.4975,
					y: 0.06
				},
				{
					x: 0.5221,
					y: 0.06
				},
				{
					x: 0.5811,
					y: 0.0846
				},
				{
					x: 0.7827,
					y: 0.3156
				}
			],
			[
				{
					x: 0.5074,
					y: 0.06
				},
				{
					x: 0.5074,
					y: 0.2665
				}
			],
			[
				{
					x: 0.3599,
					y: 0.468
				},
				{
					x: 0.3746,
					y: 0.3992
				},
				{
					x: 0.4336,
					y: 0.3107
				},
				{
					x: 0.473,
					y: 0.2812
				},
				{
					x: 0.5074,
					y: 0.2665
				},
				{
					x: 0.5221,
					y: 0.2714
				}
			],
			[
				{
					x: 0.5123,
					y: 0.4705
				},
				{
					x: 0.5074,
					y: 0.3009
				},
				{
					x: 0.5221,
					y: 0.2812
				},
				{
					x: 0.586,
					y: 0.3156
				},
				{
					x: 0.645,
					y: 0.4041
				},
				{
					x: 0.6549,
					y: 0.468
				}
			],
			[
				{
					x: 0.5123,
					y: 0.94
				},
				{
					x: 0.5123,
					y: 0.4828
				}
			],
			[
				{
					x: 0.6549,
					y: 0.4631
				},
				{
					x: 0.5221,
					y: 0.473
				},
				{
					x: 0.3648,
					y: 0.468
				}
			]
		]
	}
} satisfies SignEntry;
