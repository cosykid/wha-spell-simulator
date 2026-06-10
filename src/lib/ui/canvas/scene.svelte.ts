import type { Command } from './commands.js';
import { paperEntity } from './entities/paperEntity.js';
import type { Entity } from './entity.js';

/**
 * A Scene is a list of Entities drawn on the canvas.
 * It keeps them ordered by their `z` index, so that it can render them back-to-front.
 * It also manages a command-based undo/redo history. If you want to track an edit,
 * call the `do(command)` method, and the Scene will track it for undo/redo.
 */
export interface Scene {
	/** Insert an Entity directly, while not recording it in the undo/redo history. This is an escape hatch for special actions that should not be undoable (e.g. "rendering a background") */
	add(entity: Entity): void;
	/** Remove an entity by id directly (not recorded in history). */
	remove(id: string): void;
	/** Get an entity by id. */
	get(id: string): Entity | undefined;
	/** Get all entities in the scene, in back-to-front order. */
	getEntities(): Entity[];
	/** Run a command and record it for undo. */
	do(command: Command): void;
	undo(): void;
	redo(): void;
	canUndo(): boolean;
	canRedo(): boolean;
	/** Drop every entity and clear history. */
	clear(): void;
	render(ctx: CanvasRenderingContext2D, timestamp: number): void;
}

export function createScene(initialEntities: Entity[] = [paperEntity()]): Scene {
	const entities = $state<Entity[]>([...initialEntities]);
	const undoStack = $state<Command[]>([]);
	const redoStack = $state<Command[]>([]);

	return {
		add(entity) {
			entities.push(entity);
			// Keep back-to-front order; the list is small, so sorting on insert is cheap.
			entities.sort((a, b) => a.z - b.z);
		},
		remove(id) {
			const index = entities.findIndex((entity) => entity.id === id);
			if (index !== -1) {
				entities.splice(index, 1);
			}
		},
		get(id) {
			return entities.find((entity) => entity.id === id);
		},
		getEntities() {
			return entities;
		},
		do(command) {
			command.do();
			undoStack.push(command);
			// A fresh action invalidates any redo history.
			redoStack.length = 0;
		},
		undo() {
			const command = undoStack.pop();
			if (command) {
				command.undo();
				redoStack.push(command);
			}
		},
		redo() {
			const command = redoStack.pop();
			if (command) {
				command.do();
				undoStack.push(command);
			}
		},
		canUndo() {
			return undoStack.length > 0;
		},
		canRedo() {
			return redoStack.length > 0;
		},
		clear() {
			entities.splice(0, entities.length, ...initialEntities);
			undoStack.length = 0;
			redoStack.length = 0;
		},
		render(ctx, timestamp) {
			for (const entity of entities) {
				entity.render(ctx, timestamp);
			}
		}
	};
}
