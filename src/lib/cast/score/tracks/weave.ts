/** @file One supplied solid target, softened and pulled to demonstrate R-22's Stretch. */
import { WEAVE_CURRENTS } from './weaveCurrents.js';
import type { FlowWeaveMaterial, Population, SpellPlan, Track } from '../../../types.js';

export const WEAVE_TUNING = {
	rate: 190,
	length: 3.4,
	width: 0.35,
	stretchMs: 1200,
	materialCount: 650
} as const;

export function weaveTrack(plan: SpellPlan, population: Population): Track<'weave'> | null {
	if (!plan.weave) return null;
	const style = WEAVE_CURRENTS[plan.weave.material as FlowWeaveMaterial];
	if (style) {
		return {
			id: 'weave-current',
			kind: 'weave',
			population,
			params: {
				length: 3.4,
				width: style.width,
				stretchMs: 500,
				materialCount: 750,
				current: { ...style.current }
			},
			emission: { from: 'strike', to: 'body', curve: 'hold', gain: WEAVE_TUNING.rate },
			drive: { from: 'strike', to: 'body', curve: 'hold', gain: 1 },
			look: 'body'
		};
	}
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
