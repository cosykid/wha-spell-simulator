/**
 * Canvas mode state helpers for the simulator's mutually exclusive tools.
 *
 * The UI exposes draw, arrange, erase, and pan controls, but panning behaves like
 * a mode rather than a drawing tool. This module keeps those transitions pure so
 * the Svelte route can derive `activeTool` and `panEnabled` from one source of
 * truth.
 *
 * @packageDocumentation
 */
export type CanvasTool = 'draw' | 'arrange' | 'erase';
export type CanvasMode = CanvasTool | 'pan';

/**
 * Derives the drawing tool controller that should be active for a mode.
 *
 * Pan mode intentionally reports `draw` as the active tool so draw/arrange/erase
 * toggles remain mutually exclusive while pan state is rendered separately.
 *
 * @param mode - Current high-level canvas mode.
 * @returns The tool-facing mode consumed by canvas controls and controllers.
 */
export function toolForMode(mode: CanvasMode): CanvasTool {
	return mode === 'pan' ? 'draw' : mode;
}

/**
 * Determines whether the pan toggle should be rendered as active.
 *
 * @param mode - Current high-level canvas mode.
 * @returns `true` when pointer input should pan the canvas shell.
 */
export function panEnabledForMode(mode: CanvasMode): boolean {
	return mode === 'pan';
}

/**
 * Toggles a non-draw tool, returning to draw mode when the tool is already active.
 *
 * @param current - Current high-level canvas mode.
 * @param tool - Tool toggle being requested.
 * @returns The next mutually exclusive canvas mode.
 */
export function toggleToolMode(current: CanvasMode, tool: Exclude<CanvasTool, 'draw'>): CanvasMode {
	return current === tool ? 'draw' : tool;
}

/**
 * Toggles pan mode, returning to draw mode when pan is already active.
 *
 * @param current - Current high-level canvas mode.
 * @returns The next mutually exclusive canvas mode.
 */
export function togglePanMode(current: CanvasMode): CanvasMode {
	return current === 'pan' ? 'draw' : 'pan';
}

/**
 * Determines whether freehand capture should be locked for the current mode.
 *
 * Arrange, erase, and pan all disable freehand drawing without necessarily
 * applying the sealed-canvas styling. A sealed/invalid canvas locks input in any
 * mode.
 *
 * @param mode - Current high-level canvas mode.
 * @param canvasLocked - Whether spell state has sealed or invalidated the canvas.
 * @returns `true` when the freehand drawing capture should ignore input.
 */
export function locksFreehandInput(mode: CanvasMode, canvasLocked: boolean): boolean {
	return canvasLocked || mode !== 'draw';
}
