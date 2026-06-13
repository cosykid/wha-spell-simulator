import { createContext } from 'svelte';
import type { CanvasBehavior } from '$canvas/canvasBehavior.js';
import { addEntity, removeEntity, transformEntity } from '$canvas/commands.js';
import { gridEntity } from '$canvas/entities/gridEntity.js';
import { paperEntity } from '$canvas/entities/paperEntity.js';
import { isStrokeEntity } from '$canvas/entities/strokeEntity.js';
import { isSymbolEntity, makeSymbolEntity } from '$canvas/entities/symbolEntity.js';
import { isTransformable, type TransformableEntity } from '$canvas/entity.js';
import { createScene, type Scene } from '$canvas/scene.svelte.js';
import { createDrawTool } from '$canvas/tools/drawTool.svelte.js';
import { createSelectTool } from '$canvas/tools/selectTool.svelte.js';
import { loadSymbolRenderPath } from '$lib/dictionary/svgStrokes.js';
import { persistedString } from '$lib/persistedState.svelte.js';
import type { Placement, Stroke } from '$lib/types.js';
import { buildSampleSubmission, REFERENCE_SIZE } from './buildSample.js';
import { SYMBOL_ID } from './constants.js';
import { optimizePlacement } from './optimize.js';
import {
	createSampleCountLookup,
	sampleCountForSymbol,
	SamplePicker,
	weightedSample
} from './sample-picker.svelte.js';
import { SAMPLE_SYMBOLS, type SampleSymbol } from './symbols.js';
import type { PageData } from './$types';

/**
 * The Sample Maker's shared session: the single source of truth that every panel component
 * reaches through context instead of prop-drilling. It owns the canvas {@link Scene} and its
 * draw/select tools, the pick-and-preview flow (suggest/label), and the submission deriveds —
 * so each button or panel can be its own small, self-contained component.
 */
export class MakerSession {
	// Declared first so the $derived fields below can reference them — class field initializers
	// run in source order, before the constructor body.
	/** The canvas scene; every panel reaches plain scene ops (undo/redo) through `getMakerSession().scene`. */
	readonly scene: Scene = createScene([paperEntity(), gridEntity(REFERENCE_SIZE)]);
	readonly #draw = createDrawTool(this.scene);
	readonly #select = createSelectTool(this.scene);
	/** Weighted sign picker; biases toward signs we have fewer examples of. */
	readonly picker = new SamplePicker(weightedSample(SAMPLE_SYMBOLS, () => this.sampleCounts));

	/** The sign currently stamped on the canvas as the reference glyph, or `null`. */
	selected = $state<SampleSymbol | null>(null);
	/** Canvas 2D context, captured once the `<Canvas>` mounts; used for sample pixel dimensions. */
	ctx = $state<CanvasRenderingContext2D | null>(null);
	/** Whether pointer input draws strokes or transforms the stamped glyph. */
	mode = $state<'draw' | 'select'>('draw');
	/** Suggested orientation for the previewed sign, in degrees clockwise. */
	rotationDeg = $state(0);
	/** Guards the submit button against a double submit while a sample is uploading. */
	submitting = $state(false);

	// Ephemeral view-state for the overlays — owned here so the header button that opens an overlay
	// and the overlay itself (rendered elsewhere in the tree) share one source of truth.
	/** Whether the slide-up symbol picker sheet is open. */
	pickerOpen = $state(false);
	/** Whether the full-page reference-glyph overlay is open. */
	symbolOverlayOpen = $state(false);
	/** Whether the Discord-username editor modal is open. */
	usernameModalOpen = $state(false);

	/** While locked, advancing after a submit keeps the current sign instead of picking a new one.
	 *  Intentionally session-only (not persisted) — it resets on reload. */
	locked = $state(false);

	/** Sample counts added during this browser session, layered on top of the server snapshot. */
	#submittedSampleCounts = $state<Record<string, number>>({});

	/** Optional contributor attribution, remembered across draws and visits. */
	readonly discordUsername = persistedString('sample-maker:discord-username');

	readonly #data: () => PageData;

	constructor(data: () => PageData) {
		this.#data = data;

		// Switch mode by whether the symbol is in the scene, autoselecting it so its handles show up.
		$effect(() => {
			const inScene = this.scene.getEntities().some((e) => e.id === SYMBOL_ID);
			this.mode = inScene ? 'select' : 'draw';
			this.#select.setSelectedId(inScene ? SYMBOL_ID : null);
		});
	}

	/** The active tool for the canvas controller. */
	readonly tool = $derived<CanvasBehavior>(this.mode === 'draw' ? this.#draw : this.#select);

	/** Whether the canvas has at least one hand-drawn stroke. */
	readonly hasStrokes = $derived(this.scene.getEntities().some(isStrokeEntity));

	/** The drawn strokes, in scene order. */
	readonly strokes = $derived<Stroke[]>(
		this.scene
			.getEntities()
			.filter(isStrokeEntity)
			.map((e) => e.stroke)
	);

	/** The reference glyph entity, or `null` when none is stamped on the canvas. */
	readonly symbolEntity = $derived.by<TransformableEntity | null>(() => {
		const e = this.scene.get(SYMBOL_ID);
		return e && isTransformable(e) ? e : null;
	});

	/** Server sample counts merged with this session's submissions, driving the picker weighting. */
	readonly sampleCounts = $derived.by(() => {
		const seenSignIds: string[] = [];
		const merged = this.#data().sampleCounts.map((count) => {
			seenSignIds.push(count.signId);
			return {
				...count,
				count: count.count + (this.#submittedSampleCounts[count.signId] ?? 0)
			};
		});
		for (const [signId, count] of Object.entries(this.#submittedSampleCounts)) {
			if (!seenSignIds.includes(signId)) merged.push({ signId, count });
		}
		return merged;
	});

	/** The sample payload, or `null` until a sign is picked, drawn, and stamped. */
	readonly submission = $derived.by(() => {
		if (!this.selected || !this.symbolEntity || this.strokes.length === 0) return null;
		const canvas = this.ctx?.canvas;
		return buildSampleSubmission({
			strokes: this.strokes,
			symbol: this.selected,
			transform: this.symbolEntity.placement.transform,
			canvasWidth: canvas?.width ?? 0,
			canvasHeight: canvas?.height ?? 0,
			devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
			discordUsername: this.discordUsername.value
		});
	});

	/** The submission serialized for the form's hidden payload field. */
	readonly payload = $derived(this.submission ? JSON.stringify(this.submission, null, 2) : '');

	/** Whether the sample is ready to submit (a sign is picked, drawn, and not already uploading). */
	readonly canSubmit = $derived(!!this.selected && this.strokes.length > 0 && !this.submitting);

	/** Whether "Fit label" can run — a sign must be stamped and there must be strokes to fit to. */
	readonly canFit = $derived(!!this.selected && this.hasStrokes);

	/**
	 * The UI phase: `'draw'` while the user sketches the suggested sign, `'label'` once the reference
	 * glyph has been stamped (so the bottom bar can switch from "Label" to fit/submit controls).
	 */
	readonly phase = $derived<'draw' | 'label'>(this.symbolEntity ? 'label' : 'draw');

	/**
	 * Scale that keeps the rotated square glyph inside its square preview container: a unit square
	 * rotated by θ has a bounding box of |cos θ| + |sin θ| (1 at right angles, √2 at 45°), so the
	 * previews pair `rotate(…) scale(…)` with this to avoid overflowing their frame.
	 */
	readonly previewScale = $derived.by(() => {
		const rad = (this.rotationDeg * Math.PI) / 180;
		return 1 / (Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)));
	});

	/** How many examples the previewed sign already has — shown beside its name in the header. */
	readonly currentCount = $derived.by(() => {
		const id = this.picker.current?.id;
		if (!id) return 0;
		return sampleCountForSymbol(id, createSampleCountLookup(this.sampleCounts));
	});

	/**
	 * Preview a sign at a random orientation — weighted toward underrepresented signs when called
	 * bare, or the given sign when picked from the grid. Only updates the preview, never the canvas.
	 */
	suggest(symbol?: SampleSymbol): void {
		if (symbol) this.picker.pick(symbol);
		else this.picker.suggest();
		if (!this.picker.current) return;
		// Switching to a different sign mid-labeling restarts the sample: the strokes and the
		// stamped glyph belong to the previous sign, so they'd be submitted under the wrong label.
		if (this.phase === 'label' && this.picker.current.id !== this.selected?.id) this.clear();
		this.rotationDeg = Math.floor(Math.random() * 360);
	}

	/** Stamp the previewed glyph onto the canvas for fine-tuning. No-op until a sign is previewed. */
	label(): void {
		if (this.picker.current) this.pickSymbol(this.picker.current, this.rotationDeg);
	}

	/**
	 * Stamp the picked symbol onto the canvas as the reference glyph (replacing any previous one),
	 * centered at a default scale and orientation — suggestions pass a random `rotationDeg`.
	 */
	pickSymbol(symbol: SampleSymbol, rotationDeg = 0): void {
		// At most one symbol entity at a time — drop the previous one before stamping,
		// going through the history so undo/redo stays consistent with the stamp below.
		const previous = this.scene.get(SYMBOL_ID);
		if (previous) this.scene.do(removeEntity(this.scene, previous));
		const placement: Placement = {
			id: SYMBOL_ID,
			kind: 'sign',
			sourceId: symbol.id,
			baseStrokes: [], // sampled lazily by getBaseStrokes() only if the user runs "fit"
			transform: {
				cx: 400,
				cy: 400,
				scaleX: REFERENCE_SIZE,
				scaleY: REFERENCE_SIZE,
				rotationDeg
			}
		};
		this.scene.do(
			addEntity(this.scene, makeSymbolEntity(placement, loadSymbolRenderPath(symbol.id), 10, 7))
		);
		this.selected = symbol; // mode and selection are managed by the symbolInScene effect
	}

	/** Fit the reference glyph to the drawn strokes, making it easier to align submitted samples. */
	fitLabel(): void {
		const symbolEntity = this.scene.get(SYMBOL_ID);
		if (!symbolEntity || !isSymbolEntity(symbolEntity)) return;
		const strokes = this.scene
			.getEntities()
			.filter(isStrokeEntity)
			.map((e) => e.stroke);
		if (!strokes.length) return;
		const before = symbolEntity.placement.transform;
		const after = optimizePlacement({
			strokes,
			baseStrokes: symbolEntity.getBaseStrokes(),
			initial: before,
			canvasWidth: this.ctx!.canvas.width,
			canvasHeight: this.ctx!.canvas.height
		});
		this.scene.do(transformEntity(symbolEntity, before, after));
	}

	/** Toggle whether the current sign stays put when advancing to the next sample. */
	toggleLock(): void {
		this.locked = !this.locked;
	}

	/** Clear only the canvas state, keeping the current drawing prompt intact. */
	clear(): void {
		this.scene.clear();
		this.selected = null;
	}

	/** Keep prompt weighting current after this browser session adds a sample. */
	incrementSampleCount(signId: string): void {
		this.#submittedSampleCounts = {
			...this.#submittedSampleCounts,
			[signId]: (this.#submittedSampleCounts[signId] ?? 0) + 1
		};
	}

	/** Start the next sample after a successful upload. */
	clearAndSuggestNext(): void {
		const submittedSignId = this.selected?.id;
		const locked = this.locked ? this.picker.current : null;
		this.clear();
		if (submittedSignId) this.incrementSampleCount(submittedSignId);
		if (locked) this.suggest(locked);
		else this.suggest();
	}
}

export const [getMakerSession, setMakerSession] = createContext<MakerSession>();
