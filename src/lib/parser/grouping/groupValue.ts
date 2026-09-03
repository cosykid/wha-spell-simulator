/**
 * @file The partition objective: what one group is worth.
 *
 * A group earns its ink share times a blend of two readings. Wholeness, from
 * the recognizer, says how much the ink reads as one complete glyph. Cohesion,
 * from affinity, says how much of each member's pull stays inside the group.
 * Weighting by ink means orphaning a glyph's satellites costs the partition
 * their ink, and a flat cost per group breaks ties toward fewer groups.
 */
import type { AppConfig } from '../../types.js';
import { clamp } from '../../utils/geometry.js';
import { SELF_AFFINITY, WHOLENESS_FLOOR } from './constants.js';
import type { ComponentContext } from './types.js';

/** Ink-weighted share of each member's affinity that stays inside the group. */
export function groupCohesion(members: number[], context: ComponentContext): number {
	const inside = new Set(members);
	const groupInk = members.reduce((sum, member) => sum + context.inkShare[member], 0);
	if (groupInk <= 0) {
		return 1;
	}
	let cohesion = 0;
	for (const member of members) {
		let held = SELF_AFFINITY;
		let total = SELF_AFFINITY;
		context.affinity[member].forEach((affinity, other) => {
			if (other === member) {
				return;
			}
			total += affinity;
			if (inside.has(other)) {
				held += affinity;
			}
		});
		cohesion += (context.inkShare[member] / groupInk) * (held / total);
	}
	return cohesion;
}

/** Value of one group under the partition objective. */
export function groupValue(
	members: number[],
	wholeness: number,
	context: ComponentContext,
	config: AppConfig
): number {
	const { wholenessWeight, groupCost } = config.recognition.grouping;
	const inkShare = members.reduce((sum, member) => sum + context.inkShare[member], 0);
	const shapedWholeness = clamp((wholeness - WHOLENESS_FLOOR) / (1 - WHOLENESS_FLOOR));
	const reading =
		wholenessWeight * shapedWholeness + (1 - wholenessWeight) * groupCohesion(members, context);
	return inkShare * reading - groupCost;
}
