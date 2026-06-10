/**
 * An array that supports undo/redo operations.
 */
interface ReactiveArrayWithHistory<T extends object> {
	/**
	 * Append an item to the array.
	 * After this, previously undone elements cannot be redone anymore.
	 */
	push(item: T): void;

	/**
	 * Remove the last item of the array. Until new items are added, undone elements can be readded with redo().
	 * @returns The removed item if any, or null.
	 */
	undo(): T | null;

	/**
	 * Readd the most recently undone item to the end of the array.
	 * @returns The readded item if any, or null.
	 */
	redo(): T | null;

	/**
	 * Empty the array & clear history.
	 */
	clear(): void;

	/**
	 * Retrieve the current items in the array (excluding undone items).
	 */
	get(): T[];

	/**
	 * The number of items currently in the array (excluding undone items).
	 */
	count(): number;

	/**
	 * The total number of items ever pushed, ignoring undo/redo. Monotonically
	 * increasing until `clear()`, which resets it to 0. Useful for minting
	 * stable, collision-free ids.
	 */
	pushCount(): number;

	/**
	 * Check if there is at least one item that can be undone.
	 */
	canUndo(): boolean;

	/**
	 * Check if there is at least one item that can be readded.
	 */
	canRedo(): boolean;
}

/**
 * Define a reactive array that supports undo/redo operations.
 *
 * @example
 * ```ts
 * const arr = makeReactiveArrayWithHistory<number>();
 * arr.push(1);
 * arr.push(2);
 * console.log(arr.get()); // [1, 2]
 * arr.undo();
 * console.log(arr.get()); // [1]
 * arr.redo();
 * console.log(arr.get()); // [1, 2]
 * ```
 */
export const makeReactiveArrayWithHistory = <T extends object>(
	initial?: T[]
): ReactiveArrayWithHistory<T> => {
	const arr = $state<T[]>(initial ?? []);
	const redoStack = $state<T[]>([]);
	let pushes = $state(initial?.length ?? 0);

	return {
		push(item) {
			arr.push(item);
			// A fresh action invalidates any redo history.
			redoStack.length = 0;
			pushes += 1;
		},
		undo() {
			const item = arr.pop();
			if (item !== undefined) {
				redoStack.push(item);
				return item;
			}
			return null;
		},
		redo() {
			const item = redoStack.pop();
			if (item !== undefined) {
				arr.push(item);
				return item;
			}
			return null;
		},
		clear() {
			arr.length = 0;
			redoStack.length = 0;
			pushes = 0;
		},
		get() {
			return arr;
		},
		count() {
			return arr.length;
		},
		pushCount() {
			return pushes;
		},
		canUndo() {
			return arr.length > 0;
		},
		canRedo() {
			return redoStack.length > 0;
		}
	};
};
