/**
 * Shared route/component types for the main simulator page.
 *
 * These are UI-facing shapes, not parser/compiler data models. Keeping them in
 * one place lets route orchestration and extracted simulator components agree on
 * tab, selection, and diagnostics contracts.
 *
 * @packageDocumentation
 */
import type { PlacementTransform } from '$lib/types.js';

export type RootTab = 'dictionary' | 'shapes' | 'diagnostic';

/** Which slide-out drawer is currently open, if any. */
export type DrawerId = 'menu' | 'reference';

/**
 * Snapshot of the selected editable shape shown by the shape inspector.
 */
export interface SelectedShape {
	kind: string;
	sourceId: string;
	transform: PlacementTransform;
}

/**
 * Diagnostics payload rendered by the simulator sidebar.
 */
export interface SimulatorDiagnostics {
	ast: unknown;
	ir: unknown;
	parser: unknown;
	ml: unknown;
}
