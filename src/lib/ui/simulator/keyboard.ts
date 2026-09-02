import type { Vector } from '$lib/types.js';
import type { CanvasMode, CanvasTool } from './mode.js';

/**
 * Single-key tool shortcuts, following the conventions of popular drawing and
 * editing apps: P for the pen, E for the eraser, V for the move/select (arrange)
 * tool, and H for the hand (pan).
 */
const TOOL_SHORTCUTS: Record<string, CanvasMode> = {
	p: 'draw',
	e: 'erase',
	v: 'arrange',
	h: 'pan'
};

/** M mutes and unmutes the cast, the way players and video apps spell it. */
const MUTE_SHORTCUT = 'm';

const ARROW_DIRECTIONS: Record<string, Vector> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 }
};

/** Canvas pixels one arrow press moves a placement, and the coarse Shift step. */
const NUDGE_STEP = 1;
const NUDGE_STEP_SHIFT = 10;

/**
 * How far an arrow key moves the selected placement, in canvas pixels. Shift takes
 * the coarse step, the way editors do.
 *
 * @returns The offset, or `null` when the key is not an arrow.
 */
export function nudgeForArrowKey(key: string, shiftKey: boolean): Vector | null {
	const direction = ARROW_DIRECTIONS[key];
	if (!direction) {
		return null;
	}
	const step = shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
	return { x: direction.x * step, y: direction.y * step };
}

/**
 * Commands and state getters used by simulator keyboard shortcuts.
 */
interface SimulatorKeyboardOptions {
	/** Returns the active canvas tool. */
	activeTool: () => CanvasTool;
	/** Returns the selected editable placement id. */
	selectedPlacementId: () => string | null;
	/** Switches the active canvas mode (used by the single-key tool shortcuts). */
	selectTool: (mode: CanvasMode) => void;
	/** Moves the selected placement by a canvas-pixel offset. */
	nudgeSelected: (dx: number, dy: number) => void;
	/** Drops a palette item armed for click-to-place. */
	cancelArmedShape: () => void;
	/** Commits the selected placement into permanent ink. */
	commitSelected: () => void;
	/** Deletes the selected placement. */
	deleteSelected: () => void;
	/** Copies the selected placement to the shape clipboard. */
	copySelected: () => void;
	/** Pastes the last copied placement. Returns `true` when a copy was pasted. */
	paste: () => boolean;
	/** Runs undo. */
	undo: () => void;
	/** Runs redo. */
	redo: () => void;
	/** Mutes or unmutes the cast. */
	toggleSound: () => void;
}

/**
 * Creates the simulator's global keydown handler.
 *
 * Handles placement shortcuts in arrange mode and standard undo/redo bindings,
 * while ignoring placement shortcuts during text input.
 */
export function createSimulatorKeyboardHandler(options: SimulatorKeyboardOptions) {
	return (event: KeyboardEvent) => {
		const target = event.target as HTMLElement | null;
		const typing =
			target?.tagName === 'INPUT' ||
			target?.tagName === 'TEXTAREA' ||
			target?.isContentEditable === true;

		const isMac = navigator.platform.toUpperCase().includes('MAC');
		const ctrl = isMac ? event.metaKey : event.ctrlKey;
		const key = event.key.toLowerCase();
		const selectedPlacementId = options.selectedPlacementId();
		// No chord held, so the key is ours to interpret rather than the browser's.
		const bareKey = !event.metaKey && !event.ctrlKey && !event.altKey;

		// Escape drops an armed palette item. It is deliberately not prevented: the
		// same press also closes an open drawer.
		if (event.key === 'Escape' && !typing) {
			options.cancelArmedShape();
			return;
		}

		// Shape editing shortcuts, active only while arranging placements.
		if (options.activeTool() === 'arrange' && !typing) {
			// Copy the selected shape, unless the user is copying selected page text.
			if (ctrl && key === 'c' && selectedPlacementId && !hasTextSelection()) {
				event.preventDefault();
				options.copySelected();
				return;
			}
			// Paste the copied shape, but only when there is one, so an empty
			// clipboard still falls through to the browser's own paste.
			if (ctrl && key === 'v') {
				if (options.paste()) {
					event.preventDefault();
				}
				return;
			}
			if (selectedPlacementId) {
				const nudge = bareKey ? nudgeForArrowKey(event.key, event.shiftKey) : null;
				if (nudge) {
					event.preventDefault();
					options.nudgeSelected(nudge.x, nudge.y);
					return;
				}
				if (event.key === 'Enter') {
					event.preventDefault();
					options.commitSelected();
					return;
				}
				if (event.key === 'Delete' || event.key === 'Backspace') {
					event.preventDefault();
					options.deleteSelected();
					return;
				}
			}
		}

		// Bare letter keys switch tools, the way drawing apps do. Skip when a
		// modifier is held (so Cmd+P, Ctrl+E, etc. stay native) or while typing.
		if (!typing && bareKey) {
			const tool = TOOL_SHORTCUTS[key];
			if (tool) {
				event.preventDefault();
				options.selectTool(tool);
				return;
			}
			if (key === MUTE_SHORTCUT) {
				event.preventDefault();
				options.toggleSound();
				return;
			}
		}

		// While typing in a dialog or field, leave undo and redo to the browser
		// so Ctrl+Z edits the text instead of eating canvas strokes behind it.
		if (typing || !ctrl) return;

		if (key === 'z' && !event.shiftKey) {
			event.preventDefault();
			options.undo();
		} else if (key === 'z' && event.shiftKey) {
			event.preventDefault();
			options.redo();
		} else if (key === 'y') {
			event.preventDefault();
			options.redo();
		}
	};
}

/** True when the user has a non-empty text selection the browser should copy. */
function hasTextSelection() {
	return (window.getSelection()?.toString().trim().length ?? 0) > 0;
}
