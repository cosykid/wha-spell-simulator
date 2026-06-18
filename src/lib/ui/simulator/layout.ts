/**
 * Responsive layout helpers for the main simulator workspace.
 *
 * The desktop layout can let the square canvas match the workspace height only
 * when both side columns still have enough horizontal room. This keeps the
 * central drawing surface large without forcing cramped side panels.
 *
 * @packageDocumentation
 */
const DESKTOP_LAYOUT_MIN_WIDTH = 1051;
const CANVAS_LAYOUT_MIN_SIDE_COLUMNS = 230 + 280;

/**
 * Checks whether the current workspace can support height-matched canvas layout.
 *
 * @param workspace - The grid element that contains controls, canvas, and sidebar.
 * @returns `true` when the viewport and workspace are wide enough for the mode.
 */
export function shouldMatchCanvasHeight(workspace: HTMLElement): boolean {
	const rect = workspace.getBoundingClientRect();
	const styles = getComputedStyle(workspace);
	const columnGap = Number.parseFloat(styles.columnGap) || 0;
	const requiredWidth = rect.height + CANVAS_LAYOUT_MIN_SIDE_COLUMNS + columnGap * 2;
	return window.innerWidth >= DESKTOP_LAYOUT_MIN_WIDTH && rect.width >= requiredWidth;
}
