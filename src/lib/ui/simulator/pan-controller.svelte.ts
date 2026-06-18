/**
 * Tracks canvas pan offsets and owns the global pointer listeners for an active
 * pan gesture.
 */
export class PanController {
	/** Horizontal canvas translation in CSS pixels. */
	panX = $state(0);
	/** Vertical canvas translation in CSS pixels. */
	panY = $state(0);

	#startClientX = 0;
	#startClientY = 0;
	#startPanX = 0;
	#startPanY = 0;
	readonly #enabled: () => boolean;

	constructor(enabled: () => boolean) {
		this.#enabled = enabled;
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
		window.addEventListener('pointermove', this.#move);
		window.addEventListener('pointerup', this.end);
		window.addEventListener('pointercancel', this.end);
	};

	/** Ends the active pan gesture and removes global pointer listeners. */
	end = (_event?: PointerEvent) => {
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
