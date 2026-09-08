/** @file One supplied solid target, softened and pulled to demonstrate R-22's Stretch. */
import type { Population, SpellPlan, Track } from '../../../types.js';

export const WEAVE_TUNING = {
	rate: 190,
	length: 3.4,
	width: 0.35,
	stretchMs: 1200,
	materialCount: 650
} as const;

export function weaveTrack(plan: SpellPlan, population: Population): Track<'weave'> | null {
	if (!plan.weave) return null;
	return {
		id: 'weave-solid',
		kind: 'weave',
		population,
		params: {
			length: WEAVE_TUNING.length,
			width: WEAVE_TUNING.width,
			stretchMs: WEAVE_TUNING.stretchMs,
			materialCount: WEAVE_TUNING.materialCount
		},
		emission: { from: 'strike', to: 'strike', curve: 'hold', gain: WEAVE_TUNING.rate },
		drive: { from: 'strike', to: 'body', curve: 'hold', gain: 1 },
		look: 'body'
	};
}
