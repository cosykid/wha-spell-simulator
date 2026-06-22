import { shouldMatchCanvasHeight } from './layout.js';
import {
	panEnabledForMode,
	togglePanMode,
	toggleToolMode,
	toolForMode,
	type CanvasMode
} from './mode.js';
import { loadSimulatorPreferences, saveSimulatorPreferences } from './preferences.js';
import type { DrawerId, RootTab } from './types.js';

/**
 * Bindable UI state for the simulator route.
 *
 * This keeps route bindings and view-only preferences out of the runtime
 * coordinator. Domain state such as strokes and recognition lives elsewhere.
 */
export class SimulatorUiState {
	readonly zoomMin = 0.5;
	readonly zoomMax = 3;
	readonly #zoomStep = 0.25;

	/** Whether recognition and construction guides are shown. */
	showGuides = $state(true);
	/** Whether diagnostics overlays and sidebar details are shown. */
	showDiagnostics = $state(false);
	/** Whether pointer input has been enabled after dictionary loading. */
	inputReady = $state(false);
	/** Active reference-drawer tab. */
	rootTab = $state<RootTab>('dictionary');
	/** Which slide-out drawer is open, if any. Only one opens at a time. */
	openDrawer = $state<DrawerId | null>(null);
	/** Whether the left menu drawer is open. */
	menuOpen = $derived(this.openDrawer === 'menu');
	/** Whether the right reference drawer is open. */
	referenceOpen = $derived(this.openDrawer === 'reference');
	/** Current canvas zoom multiplier. */
	zoomLevel = $state(1);
	/** Current interaction mode for the canvas. */
	canvasMode = $state<CanvasMode>('draw');
	/** Tool exposed to canvas controls and summary logic. */
	activeTool = $derived(toolForMode(this.canvasMode));
	/** Whether the first-use canvas hint has been dismissed. */
	canvasHintDismissed = $state(false);
	/** Whether pan gestures are currently enabled. */
	panEnabled = $derived(panEnabledForMode(this.canvasMode));
	/** Whether desktop layout should match canvas height to workspace height. */
	canvasHeightMatched = $state(false);
	/**
	 * Fraction of the canvas height that is on screen (visible height / canvas
	 * height), fed to the portal tilt as `--portal-fit`. The cover-square canvas
	 * stands taller than the viewport on landscape, so this scales the tilt's
	 * vertical metrics back onto the visible area. 1 when the canvas fits.
	 */
	portalFit = $state(1);

	/** Bound glyph canvas element. */
	glyphCanvas = $state<HTMLCanvasElement>(null!);
	/** Bound spell-effect canvas element. */
	effectCanvas = $state<HTMLCanvasElement>(null!);
	/** Bound canvas shell element. */
	canvasShell = $state<HTMLDivElement>(null!);
	/** Bound workspace element. */
	workspace = $state<HTMLElement>(null!);

	#preferencesLoaded = false;

	constructor() {
		$effect(() => {
			document.body.classList.toggle('diagnostics-visible', this.showDiagnostics);
			if (this.#preferencesLoaded) {
				this.#savePreferences();
			}
			return () => document.body.classList.remove('diagnostics-visible');
		});
	}

	/** Loads persisted guide, diagnostics, and arrange-mode preferences. */
	loadPreferences() {
		const preferences = loadSimulatorPreferences();
		if (typeof preferences.showGuides === 'boolean') {
			this.showGuides = preferences.showGuides;
		}
		if (typeof preferences.showDiagnostics === 'boolean') {
			this.showDiagnostics = preferences.showDiagnostics;
		}
		if (preferences.arrangeShapes === true) {
			this.canvasMode = 'arrange';
		}
		this.#preferencesLoaded = true;
	}

	/** Increases canvas zoom by one configured step. */
	zoomIn = () => {
		this.zoomLevel = Math.min(this.zoomMax, this.zoomLevel + this.#zoomStep);
	};

	/** Decreases canvas zoom by one configured step. */
	zoomOut = () => {
		this.zoomLevel = Math.max(this.zoomMin, this.zoomLevel - this.#zoomStep);
	};

	/** Returns the mode produced by toggling arrange mode. */
	toggleArrangeMode() {
		return toggleToolMode(this.canvasMode, 'arrange');
	}

	/** Returns the mode produced by toggling erase mode. */
	toggleEraseMode() {
		return toggleToolMode(this.canvasMode, 'erase');
	}

	/** Returns the mode produced by toggling pan mode. */
	togglePanMode() {
		return togglePanMode(this.canvasMode);
	}

	/** Toggles the left menu drawer, closing any other open drawer. */
	toggleMenu = () => {
		this.openDrawer = this.openDrawer === 'menu' ? null : 'menu';
	};

	/** Opens the reference drawer to a tab, or toggles it closed if already on that tab. */
	openReference = (tab: RootTab) => {
		if (this.openDrawer === 'reference' && this.rootTab === tab) {
			this.openDrawer = null;
			return;
		}
		this.rootTab = tab;
		this.openDrawer = 'reference';
	};

	/** Closes whichever drawer is open. */
	closeDrawers = () => {
		this.openDrawer = null;
	};

	/** Marks the first-use canvas hint as dismissed. */
	dismissCanvasHint() {
		if (this.canvasHintDismissed) {
			return false;
		}
		this.canvasHintDismissed = true;
		return true;
	}

	/** Recomputes viewport-derived layout: canvas-height matching and portal fit. */
	updateCanvasLayoutMode = () => {
		const longEdge = Math.max(window.innerWidth, window.innerHeight);
		this.portalFit = longEdge > 0 ? window.innerHeight / longEdge : 1;
		if (!this.workspace) {
			return;
		}
		this.canvasHeightMatched = shouldMatchCanvasHeight(this.workspace);
	};

	#savePreferences() {
		saveSimulatorPreferences({
			showGuides: this.showGuides,
			showDiagnostics: this.showDiagnostics,
			activeTool: this.activeTool
		});
	}
}
