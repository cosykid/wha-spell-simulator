/**
 * Tracks canvas pan offsets and owns the global pointer listeners for an active
 * pan gesture.
 */
export class PanController {
	/** Horizontal canvas translation in CSS pixels. */
	panX = $state(0);
	/** Vertical canvas translation in CSS pixels. */
	panY = $state(0);
	/**
	 * Whether a pan gesture is dragging the canvas right now. The canvas drops its
	 * eased transform transition while this is true, so it tracks the pointer
	 * instead of trailing a fifth of a second behind it.
	 */
	panning = $state(false);

	#startClientX = 0;
	#startClientY = 0;
	#startPanX = 0;
	#startPanY = 0;
	readonly #enabled: () => boolean;

	constructor(enabled: () => boolean) {
		this.#enabled = enabled;
		this.recenter = this.recenter.bind(this);
	}

	/** Whether the canvas has been panned away from its centred resting position. */
	get isOffset() {
		return this.panX !== 0 || this.panY !== 0;
	}

	/** Starts a pan gesture when pan mode is enabled and the primary pointer is used. */
	start = (event: PointerEvent) => {
		if (!this.#enabled()) return;
		if (event.button !== undefined && event.button !== 0) return;
		event.preventDefault();
		this.#startClientX = event.clientX;
		this.#startClientY = event.clientY;
		this.#startPanX = this.panX;
		this.#startPanY = this.panY;
		this.panning = true;
		window.addEventListener('pointermove', this.#move);
		window.addEventListener('pointerup', this.end);
		window.addEventListener('pointercancel', this.end);
	};

	/** Slides the canvas back to its centred resting position. */
	recenter() {
		this.panX = 0;
		this.panY = 0;
	}

	/** Ends the active pan gesture and removes global pointer listeners. */
	end = (_event?: PointerEvent) => {
		this.panning = false;
		window.removeEventListener('pointermove', this.#move);
		window.removeEventListener('pointerup', this.end);
		window.removeEventListener('pointercancel', this.end);
	};

	#move = (event: PointerEvent) => {
		if (!this.#enabled()) return;
		this.panX = this.#startPanX + event.clientX - this.#startClientX;
		this.panY = this.#startPanY + event.clientY - this.#startClientY;
	};
}
