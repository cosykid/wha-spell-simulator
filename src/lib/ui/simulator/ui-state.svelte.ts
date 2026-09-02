import {
	DEFAULT_EFFECT_STYLE,
	effectStyleFrom,
	type EffectStyle
} from '$lib/structures/effectStyle.js';
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
	/** Which engine performs a cast. Read at the canvas, never per spell. */
	effectStyle = $state<EffectStyle>(DEFAULT_EFFECT_STYLE);
	/** Whether a cast is heard. On by default, and muting never stops a cast from being scheduled. */
	soundEnabled = $state(true);
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
	/** Whether the first-spell guide has been offered and answered on this device. */
	firstSpellGuideSeen = $state(false);
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

	/**
	 * Reactive on purpose. The persistence `$effect` re-collects its dependencies
	 * on every run, and on the first one this is false, so it returns without
	 * reading a single saved field and subscribes to none of them. Making the flag
	 * itself a dependency re-runs the effect the moment loading finishes, which is
	 * when the fields below become subscriptions.
	 */
	#preferencesLoaded = $state(false);

	constructor() {
		$effect(() => {
			document.body.classList.toggle('diagnostics-visible', this.showDiagnostics);
			if (this.#preferencesLoaded) {
				this.#savePreferences();
			}
			return () => document.body.classList.remove('diagnostics-visible');
		});
	}

	/** Loads persisted guide, diagnostics, effect-style, sound, arrange-mode, and first-spell preferences. */
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
		if (preferences.firstSpellGuideSeen === true) {
			this.firstSpellGuideSeen = true;
		}
		if (typeof preferences.soundEnabled === 'boolean') {
			this.soundEnabled = preferences.soundEnabled;
		}
		// A union has no `typeof` guard, so the narrowing helper is the validation
		// and it already returns the default for a missing or unknown value.
		this.effectStyle = effectStyleFrom(preferences.effectStyle);
		this.#preferencesLoaded = true;
	}

	/** Swaps the engine the canvas performs a cast with. */
	setEffectStyle = (style: EffectStyle) => {
		this.effectStyle = style;
	};

	/** Mutes or unmutes the cast. Lands mid-performance, because the sound reads it every frame. */
	toggleSound = () => {
		this.soundEnabled = !this.soundEnabled;
	};

	/** Sets canvas zoom, clamped to the configured bounds. */
	setZoom = (level: number) => {
		this.zoomLevel = Math.min(this.zoomMax, Math.max(this.zoomMin, level));
	};

	/** Increases canvas zoom by one configured step. */
	zoomIn = () => {
		this.setZoom(this.zoomLevel + this.#zoomStep);
	};

	/** Decreases canvas zoom by one configured step. */
	zoomOut = () => {
		this.setZoom(this.zoomLevel - this.#zoomStep);
	};

	/** Returns the view to its resting magnification, as part of re-centring it. */
	resetZoom = () => {
		this.setZoom(1);
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

	/**
	 * Re-arms the first-use canvas hint. An emptied canvas puts the user back at
	 * the step the hint describes, so dismissal is per drawing, not per session.
	 */
	resetCanvasHint() {
		this.canvasHintDismissed = false;
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

	// Every field read here is a dependency of the persistence `$effect` in the
	// constructor, which is the only thing that subscribes them. A preference
	// saved anywhere else is a preference that never gets written.
	#savePreferences() {
		saveSimulatorPreferences({
			showGuides: this.showGuides,
			showDiagnostics: this.showDiagnostics,
			activeTool: this.activeTool,
			effectStyle: this.effectStyle,
			firstSpellGuideSeen: this.firstSpellGuideSeen,
			soundEnabled: this.soundEnabled
		});
	}
}
