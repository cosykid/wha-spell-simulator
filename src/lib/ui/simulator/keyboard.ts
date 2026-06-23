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
		const selectedPlacementId = options.selectedPlacementId();

		if (options.activeTool() === 'arrange' && selectedPlacementId && !typing) {
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

		const isMac = navigator.platform.toUpperCase().includes('MAC');
		const ctrl = isMac ? event.metaKey : event.ctrlKey;

		// Bare letter keys switch tools, the way drawing apps do. Skip when a
		// modifier is held (so Cmd+P, Ctrl+E, etc. stay native) or while typing.
		if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
			const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
			if (tool) {
				event.preventDefault();
				options.selectTool(tool);
				return;
			}
		}

		if (!ctrl) return;
		const key = event.key.toLowerCase();

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
