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
		if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
			const tool = TOOL_SHORTCUTS[key];
			if (tool) {
				event.preventDefault();
				options.selectTool(tool);
				return;
			}
		}

		if (!ctrl) return;

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
