/**
 * Local-storage persistence for simulator display and tool preferences.
 *
 * Preferences are intentionally best-effort: unavailable storage, invalid JSON,
 * or schema drift should never prevent the simulator from loading with defaults.
 *
 * @packageDocumentation
 */
import type { EffectStyle } from '$lib/structures/effectStyle.js';
import type { CanvasTool } from './mode.js';

const TOGGLE_PREFERENCES_STORAGE_KEY = 'wha-spell-simulator:toggle-preferences';

interface TogglePreferences {
	showGuides: boolean;
	showDiagnostics: boolean;
	arrangeShapes: boolean;
	/** Which engine performs a cast. Per-device display choice, like its neighbours. */
	effectStyle: EffectStyle;
}

/**
 * Loads persisted simulator toggle preferences.
 *
 * @returns A partial preference object, or an empty object when storage cannot be read.
 */
export function loadSimulatorPreferences(): Partial<TogglePreferences> {
	try {
		const stored = localStorage.getItem(TOGGLE_PREFERENCES_STORAGE_KEY);
		return stored ? (JSON.parse(stored) as Partial<TogglePreferences>) : {};
	} catch {
		return {};
	}
}

/**
 * Persists simulator toggle preferences to local storage.
 *
 * @param preferences - Current display and tool state from the route.
 */
export function saveSimulatorPreferences({
	showGuides,
	showDiagnostics,
	activeTool,
	effectStyle
}: {
	showGuides: boolean;
	showDiagnostics: boolean;
	activeTool: CanvasTool;
	effectStyle: EffectStyle;
}) {
	try {
		localStorage.setItem(
			TOGGLE_PREFERENCES_STORAGE_KEY,
			JSON.stringify({
				showGuides,
				showDiagnostics,
				arrangeShapes: activeTool === 'arrange',
				effectStyle
			})
		);
	} catch {
		// Preference persistence is best-effort.
	}
}
