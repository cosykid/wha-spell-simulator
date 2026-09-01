/**
 * @file State for the first-spell guide: the welcome and celebration cards, the
 * walk through ring, sigil, and seal, and the once-per-device auto-offer.
 *
 * The guide never keeps a cursor of its own. The walk step is derived from
 * recognition, so a drawer who skips ahead, undoes, or ignores the captions
 * always sees the instruction that matches the paper. Step logic lives in
 * [`first-spell-script.ts`](first-spell-script.ts), ghost geometry in
 * [`first-spell-geometry.ts`](first-spell-geometry.ts).
 */

import { GLYPH_WARNINGS } from '$lib/parser/glyphWarnings.js';
import { normalizeStrokesForTemplate } from '$lib/parser/templateNormalizer.js';
import type { Point } from '$lib/types.js';
import { hasPendingCast } from '$lib/ui/spells/castHandoff.js';
import { buildFirstSpellPractice } from './first-spell-geometry.js';
import {
	firstSpellCoaching,
	resolveFirstSpellStep,
	stepHasGhost,
	stepOffersPractice,
	type FirstSpellSignals,
	type FirstSpellStep
} from './first-spell-script.js';
import { visibleCanvasShortAxis } from './layout.js';
import type { SimulatorDrawingActions } from './drawing-actions.js';
import type { RecognitionPipeline } from './recognition-pipeline.svelte.js';
import type { SimulatorUiState } from './ui-state.svelte.js';

/** The sigil the guide teaches: four strokes, distinctive, reliably recognized. */
const FIRST_SPELL_SIGIL_ID = 'fire';
/** Matches the recognizers' own template resampling density. */
const GHOST_SAMPLES_PER_STROKE = 40;

export type FirstSpellPhase = 'idle' | 'welcome' | 'walk' | 'done';

interface FirstSpellGuideOptions {
	ui: SimulatorUiState;
	recognition: RecognitionPipeline;
	actions: SimulatorDrawingActions;
	/** Whether the canvas already holds strokes or placements. */
	hasMarks: () => boolean;
	/** Puts the canvas in freehand draw mode. */
	selectDraw: () => void;
}

/**
 * The first-spell guide's phase, walk step, and commands. Construct during
 * component initialization: the auto-offer and the cast-finished hand-off are
 * `$effect`s created here.
 */
export class FirstSpellGuide {
	readonly #ui: SimulatorUiState;
	readonly #recognition: RecognitionPipeline;
	readonly #actions: SimulatorDrawingActions;
	readonly #hasMarks: () => boolean;
	readonly #selectDraw: () => void;

	/** Which card or walk the guide is showing. */
	phase = $state<FirstSpellPhase>('idle');

	/** One-shot per session, so a dismissed offer never pops back. */
	#autoOffered = false;
	/**
	 * Plain memory of the last resolved step, not reactive state: the resolver
	 * folds over it so an unsettled reading holds the walk in place instead of
	 * flashing an earlier caption.
	 */
	#stepMemory: FirstSpellStep | null = null;

	/** The walk step the drawing is on, resolved from recognition alone. */
	step = $derived.by<FirstSpellStep>(() => {
		const step = resolveFirstSpellStep(this.#signals(), this.#stepMemory);
		this.#stepMemory = step;
		return step;
	});

	/** The gentle fix-it line under the caption, or null when on course. */
	coaching = $derived.by(() => firstSpellCoaching(this.#signals()));

	/** Whether the walk captions are on screen. */
	active = $derived(this.phase === 'walk');

	/** Whether the ghost entity should trace on the paper this frame. */
	ghostVisible = $derived(this.phase === 'walk' && stepHasGhost(this.step));

	/** Whether the current step offers to place the practice spell. */
	practiceOffered = $derived.by(
		() =>
			this.phase === 'walk' &&
			stepOffersPractice(this.step) &&
			!this.#recognition.summary.canvasLocked
	);

	/** The fire sigil's template, resampled for smooth ghost tracing. */
	sigilTemplate = $derived.by<Point[][] | null>(() => {
		const template = this.#recognition.dictionary?.sigils.find(
			(sigil) => sigil.id === FIRST_SPELL_SIGIL_ID
		)?.strokeTemplate;
		if (!template) {
			return null;
		}
		return normalizeStrokesForTemplate(template.strokes, {
			samplesPerStroke: GHOST_SAMPLES_PER_STROKE,
			fitToBounds: true
		}).strokes;
	});

	constructor(options: FirstSpellGuideOptions) {
		this.#ui = options.ui;
		this.#recognition = options.recognition;
		this.#actions = options.actions;
		this.#hasMarks = options.hasMarks;
		this.#selectDraw = options.selectDraw;

		// Offer the guide once per device, and only to a drawer who has nothing on
		// the canvas and no spell arriving from the library.
		$effect(() => {
			if (!this.#ui.inputReady || this.#autoOffered) {
				return;
			}
			this.#autoOffered = true;
			if (this.#ui.firstSpellGuideSeen || this.phase !== 'idle') {
				return;
			}
			if (hasPendingCast() || this.#hasMarks()) {
				return;
			}
			this.phase = 'welcome';
		});

		// The walk ends itself: when the cast the drawer sealed finishes playing,
		// the celebration takes over.
		$effect(() => {
			if (this.phase === 'walk' && this.#recognition.castSpent) {
				this.#ui.firstSpellGuideSeen = true;
				this.phase = 'done';
			}
		});
	}

	/** Shows the welcome card, from the menu or the auto-offer. */
	open = () => {
		this.phase = 'welcome';
	};

	/**
	 * Starts the walk. A locked page (sealed or spent) is torn off first, the
	 * way `freshPage` always does it, so the previous spell stays one undo away.
	 */
	begin = () => {
		this.#ui.firstSpellGuideSeen = true;
		if (this.#recognition.summary.canvasLocked) {
			this.#actions.freshPage();
		}
		this.#selectDraw();
		this.#stepMemory = null;
		this.phase = 'walk';
	};

	/** Dismisses the guide from any phase. The menu can always reopen it. */
	skip = () => {
		this.#ui.firstSpellGuideSeen = true;
		this.phase = 'idle';
	};

	/** Closes the celebration card. */
	finish = () => {
		this.phase = 'idle';
	};

	/**
	 * Places the practice spell for a drawer the recognizer keeps refusing: the
	 * open ring and the fire sigil land as real ink, leaving only the seal to
	 * draw. The previous drawing stays one undo away.
	 */
	placePractice = () => {
		const canvas = this.#ui.glyphCanvas;
		const sigilStrokes = this.sigilTemplate;
		if (!canvas?.width || !sigilStrokes) {
			return;
		}
		this.#actions.loadPreset(
			buildFirstSpellPractice(
				{
					canvasWidth: canvas.width,
					canvasHeight: canvas.height,
					referenceSize: visibleCanvasShortAxis(canvas)
				},
				sigilStrokes
			)
		);
	};

	#signals(): FirstSpellSignals {
		const summary = this.#recognition.summary;
		const ring = this.#recognition.ring;
		const spellIR = this.#recognition.spellIR;
		return {
			ringFound: Boolean(ring?.found),
			ringComplete: Boolean(ring?.complete),
			sigilRecognized: Boolean(spellIR?.sigil),
			active: summary.statusClass === 'active',
			castSpent: this.#recognition.castSpent,
			readingSettled: !this.#recognition.reading,
			sigilUnclear: Boolean(spellIR?.warnings?.includes(GLYPH_WARNINGS.primarySigilConfidenceLow))
		};
	}
}
