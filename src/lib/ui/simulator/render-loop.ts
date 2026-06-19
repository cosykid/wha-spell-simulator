import { CONFIG } from '$lib/config.js';
import { CanvasRenderer } from '$lib/renderer/canvasRenderer.js';
import type { ClassifiedDrawing, PlacementHandles, RingInfo, SpellIR, Stroke } from '$lib/types.js';

/**
 * Live state getters required to render the simulator each animation frame.
 *
 * Getters keep the loop independent from Svelte runes while still reading fresh
 * session state on every frame.
 */
interface SimulatorRenderLoopOptions {
	/** Canvas used for glyph and guide rendering. */
	glyphCanvas: () => HTMLCanvasElement;
	/** Canvas used for activated spell effects. */
	effectCanvas: () => HTMLCanvasElement;
	/** Current in-progress freehand stroke. */
	currentStroke: () => Stroke | null;
	/** Complete stroke set to render. */
	strokes: () => Stroke[];
	/** Latest recognition pipeline result. */
	pipeline: () => ClassifiedDrawing | null;
	/** Latest compiled spell IR. */
	spellIR: () => SpellIR | null;
	/** Latest detected ring, if any. */
	ring: () => RingInfo | undefined;
	/** Whether guide overlays are enabled. */
	showGuides: () => boolean;
	/** Whether debug overlays are enabled. */
	showDiagnostics: () => boolean;
	/** Transform handles for the selected placement. */
	selection: () => PlacementHandles | null;
}

/**
 * Owns the requestAnimationFrame loop that renders glyph ink, activation
 * overlays, spell effects, diagnostics, and selection handles.
 */
export class SimulatorRenderLoop {
	#renderer: CanvasRenderer | null = null;
	#rafId: number | null = null;
	readonly #options: SimulatorRenderLoopOptions;

	constructor(options: SimulatorRenderLoopOptions) {
		this.#options = options;
	}

	/** Creates the canvas renderer and starts the animation loop. */
	start() {
		this.#renderer = new CanvasRenderer({
			glyphCanvas: this.#options.glyphCanvas(),
			effectCanvas: this.#options.effectCanvas(),
			config: CONFIG
		});
		this.#rafId = requestAnimationFrame(this.#frame);
	}

	/** Cancels the animation loop. */
	stop() {
		if (this.#rafId) {
			cancelAnimationFrame(this.#rafId);
		}
		this.#rafId = null;
	}

	#frame = (timestamp: number) => {
		const pipeline = this.#options.pipeline();
		const spellIR = this.#options.spellIR();
		const strokes = this.#options.strokes();

		this.#renderer!.renderGlyph({
			strokes,
			currentStroke: this.#options.currentStroke(),
			pipeline,
			showGuides: this.#options.showGuides(),
			showDebug: this.#options.showDiagnostics(),
			selection: this.#options.selection()
		});

		if (spellIR?.active) {
			this.#renderer!.renderActivatedGlyph({
				activatedAt: spellIR.activatedAt,
				duration: spellIR.duration,
				strokes,
				pipeline,
				timestamp
			});
		}

		this.#renderer!.renderEffect({
			spellIR,
			ring: this.#options.ring(),
			timestamp,
			showGuides: this.#options.showGuides()
		});
		this.#rafId = requestAnimationFrame(this.#frame);
	};
}
