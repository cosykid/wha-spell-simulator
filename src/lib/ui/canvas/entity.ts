import type { Placement, Vector } from '$lib/types.js';

/**
 * An Entity is something that can be drawn on the canvas. All the drawing logic goes within its `render()` method.
 */
export interface Entity {
	id: string;

	/** The canvas will draw entities in this order, from lower to higher `z` values. So entities with higher `z` will appear on top of those with lower `z`. */
	z: number;

	/**
	 * Render the entity on the canvas.
	 * You get the canvas context itself (`ctx`) and the current `timestamp` [ms] in case you want to do time-based animation.
	 */
	render(ctx: CanvasRenderingContext2D, timestamp: number): void;

	/** Specify how to rescale the entity as the canvas is resized. If not provided, the entity will simply not be rescaled (this is the case for backgrounds for instance). */
	scale?(scaleX: number, scaleY: number): void;
}

/**
 * A TrasformableEntity is an Entity that can be selected and transformed (moved/rotated/scaled) by the user.
 */
export interface TransformableEntity extends Entity {
	/**
	 * Position, rotation and scale of the entity.
	 */
	placement: Placement;

	/**
	 * Test if `point` is within the entity's hitbox. Used to determine if the user has clicked on an entity to select it.
	 */
	hitTest(point: Vector): boolean;
}

export function isTransformable(entity: Entity): entity is TransformableEntity {
	return 'placement' in entity;
}
