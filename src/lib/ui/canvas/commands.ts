import type { Entity, TransformableEntity } from './entity.js';

import type { PlacementTransform } from '../../types.js';
import type { Scene } from './scene.svelte.js';

/** A reversible edit on a {@link Scene} (e.g. adding, removing or transforming an entity). */
export interface Command {
	do(): void;
	undo(): void;
	label?: string;
}

export function addEntity(scene: Scene, entity: Entity): Command {
	return {
		label: 'add',
		do: () => scene.add(entity),
		undo: () => scene.remove(entity.id)
	};
}

export function removeEntity(scene: Scene, entity: Entity): Command {
	return {
		label: 'remove',
		do: () => scene.remove(entity.id),
		undo: () => scene.add(entity)
	};
}

/**
 * Record a whole transform (scale/rotate) as one undo step.
 */
export function transformEntity(
	entity: TransformableEntity,
	before: PlacementTransform,
	after: PlacementTransform
): Command {
	return {
		label: 'transform',
		do: () => (entity.placement.transform = after),
		undo: () => (entity.placement.transform = before)
	};
}
