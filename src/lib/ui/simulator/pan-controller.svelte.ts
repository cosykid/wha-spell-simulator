/**
 * @file The canvas view transform: the pan offsets the shell renders, the pointer
 * gesture that drags them, and the pure wheel math that pans and zooms the same
 * view. The zoom level itself lives on {@link SimulatorUiState}, which owns its
 * bounds.
 */

/** How long after the last wheel event the eased transform transition comes back. */
const WHEEL_SETTLE_MS = 150;

/** `WheelEvent.deltaMode` values, which are DOM constants a unit test cannot read. */
const WHEEL_MODE_LINE = 1;
const WHEEL_MODE_PAGE = 2;

/**
 * What a line and a page of wheel travel are worth in pixels. Browsers that report
 * pixels put a mouse notch at about a hundred of them, and the browsers that report
 * lines send three per notch.
 */
const WHEEL_LINE_PX = 33;
const WHEEL_PAGE_PX = 400;

/** How hard a pixel of wheel travel bites into the zoom. */
const WHEEL_ZOOM_SENSITIVITY = 0.0025;

/** The view a wheel zoom is being applied to, in client (viewport) pixels. */
interface AnchoredZoomView {
	/** Pan offset before the zoom step. */
	panX: number;
	panY: number;
	/** Zoom before the step, and the clamped zoom it lands on. */
	zoom: number;
	nextZoom: number;
	/** Pointer position the zoom is anchored at. */
	pointerX: number;
	pointerY: number;
	/** Centre of the untransformed canvas box, which is what the container scales about. */
	centerX: number;
	centerY: number;
}

/**
 * Normalizes a wheel delta to pixels. The unit depends on the browser and the
 * device, so a mouse notch would otherwise travel three pixels where it should
 * travel a hundred.
 */
export function wheelDeltaPixels(delta: number, deltaMode: number): number {
	if (deltaMode === WHEEL_MODE_LINE) {
		return delta * WHEEL_LINE_PX;
	}
	if (deltaMode === WHEEL_MODE_PAGE) {
		return delta * WHEEL_PAGE_PX;
	}
	return delta;
}

/**
 * The zoom a wheel step lands on, before clamping. Scrolling up sends a negative
 * delta and magnifies, which is also the direction a trackpad pinch-out sends.
 * Exponential, so one notch feels the same at 0.5x as it does at 3x.
 *
 * @example
 * ui.setZoom(zoomAfterWheel(ui.zoomLevel, wheelDeltaPixels(event.deltaY, event.deltaMode)));
 */
export function zoomAfterWheel(zoom: number, deltaPixels: number): number {
	return zoom * Math.exp(-deltaPixels * WHEEL_ZOOM_SENSITIVITY);
}

/**
 * The pan offset that keeps the canvas point under the pointer pinned there across
 * a zoom step.
 *
 * The canvas container is a shell-sized box scaling about its own centre, so the
 * correction is measured from that centre and not from the box corner. A pointer
 * anywhere else would otherwise pull the drawing out from under itself.
 */
export function panAnchoredAtPointer(view: AnchoredZoomView): { panX: number; panY: number } {
	const ratio = view.zoom > 0 ? view.nextZoom / view.zoom : 1;
	const offsetX = view.pointerX - view.centerX;
	const offsetY = view.pointerY - view.centerY;
	return {
		panX: offsetX - ratio * (offsetX - view.panX),
		panY: offsetY - ratio * (offsetY - view.panY)
	};
}

/**
 * Tracks canvas pan offsets and owns the global pointer listeners for an active
 * pan gesture.
 */
export class PanController {
	/** Horizontal canvas translation in CSS pixels. */
	panX = $state(0);
	/** Vertical canvas translation in CSS pixels. */
	panY = $state(0);

	#dragging = $state(false);
	#wheelSettling = $state(false);
	/**
	 * Whether the view is being driven right now, by a pan drag or a wheel burst.
	 * The canvas drops its eased transform transition while this is true, so it
	 * tracks the input instead of trailing a fifth of a second behind it.
	 */
	panning = $derived(this.#dragging || this.#wheelSettling);

	#startClientX = 0;
	#startClientY = 0;
	#startPanX = 0;
	#startPanY = 0;
	#wheelSettleTimer: ReturnType<typeof setTimeout> | null = null;
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
		this.#dragging = true;
		window.addEventListener('pointermove', this.#move);
		window.addEventListener('pointerup', this.end);
		window.addEventListener('pointercancel', this.end);
	};

	/**
	 * Moves the view to an exact offset, for the correction that anchors a wheel
	 * zoom at the pointer. Unlike the drag, this is not gated on pan mode: a wheel
	 * gesture moves the view without touching the drawing, whatever the active tool.
	 */
	panTo = (x: number, y: number) => {
		this.panX = x;
		this.panY = y;
		this.#settleAfterWheel();
	};

	/** Slides the view by a wheel delta. */
	panBy = (dx: number, dy: number) => {
		this.panTo(this.panX + dx, this.panY + dy);
	};

	/** Slides the canvas back to its centred resting position. */
	recenter() {
		this.panX = 0;
		this.panY = 0;
	}

	/** Ends the active pan gesture and removes global pointer listeners. */
	end = (_event?: PointerEvent) => {
		this.#dragging = false;
		this.#clearWheelSettle();
		window.removeEventListener('pointermove', this.#move);
		window.removeEventListener('pointerup', this.end);
		window.removeEventListener('pointercancel', this.end);
	};

	#move = (event: PointerEvent) => {
		if (!this.#enabled()) return;
		this.panX = this.#startPanX + event.clientX - this.#startClientX;
		this.panY = this.#startPanY + event.clientY - this.#startClientY;
	};

	/**
	 * Holds the eased transform down until the wheel gesture stops. A trackpad
	 * sends a burst of events, and easing each one leaves the canvas smearing
	 * behind the fingers the way an eased pan drag did.
	 */
	#settleAfterWheel() {
		this.#clearWheelSettle();
		this.#wheelSettling = true;
		this.#wheelSettleTimer = setTimeout(() => {
			this.#wheelSettleTimer = null;
			this.#wheelSettling = false;
		}, WHEEL_SETTLE_MS);
	}

	#clearWheelSettle() {
		if (this.#wheelSettleTimer) {
			clearTimeout(this.#wheelSettleTimer);
			this.#wheelSettleTimer = null;
		}
		this.#wheelSettling = false;
	}
}
