import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import { DrawingCapture } from '../src/lib/input/drawingCapture.js';
import { createStrokeStore } from '../src/lib/input/strokeStore.js';

type PointerHandler = (event: PointerEvent) => void;

/**
 * A stand-in glyph canvas that records its listeners so a test can deliver
 * pointer events by hand. The unit suite has no DOM.
 */
function fakeCanvas() {
	const listeners = new Map<string, Set<PointerHandler>>();
	const element = {
		width: 1000,
		height: 1000,
		addEventListener(type: string, handler: PointerHandler) {
			const handlers = listeners.get(type) ?? new Set<PointerHandler>();
			handlers.add(handler);
			listeners.set(type, handlers);
		},
		removeEventListener(type: string, handler: PointerHandler) {
			listeners.get(type)?.delete(handler);
		},
		getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
		setPointerCapture: () => {},
		releasePointerCapture: () => {}
	};

	return {
		element: element as unknown as HTMLCanvasElement,
		listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
		send(type: string, event: PointerEvent) {
			for (const handler of listeners.get(type) ?? []) {
				handler(event);
			}
		}
	};
}

function pointerEvent(pointerId: number, x: number, y: number): PointerEvent {
	return {
		pointerId,
		clientX: x,
		clientY: y,
		button: 0,
		preventDefault() {}
	} as unknown as PointerEvent;
}

/** A capture wired to a real stroke store, enabled and ready for events. */
function mounted() {
	const canvas = fakeCanvas();
	const store = createStrokeStore();
	const capture = new DrawingCapture(canvas.element, store, CONFIG);
	capture.enable();
	return { canvas, store, capture };
}

/** The x of every point in the capture's in-progress stroke. */
function previewXs(capture: DrawingCapture) {
	return capture.getCurrentStroke()?.points.map((point) => point.x);
}

test('commits the stroke the lifted pointer drew', () => {
	const { canvas, store, capture } = mounted();

	canvas.send('pointerdown', pointerEvent(1, 100, 100));
	canvas.send('pointermove', pointerEvent(1, 140, 100));
	canvas.send('pointerup', pointerEvent(1, 140, 100));

	assert.equal(store.count(), 1);
	assert.equal(capture.getCurrentStroke(), null);
});

test('ignores a second pointer while a stroke is in flight', () => {
	const { canvas, store, capture } = mounted();

	canvas.send('pointerdown', pointerEvent(1, 100, 100));
	canvas.send('pointermove', pointerEvent(1, 140, 100));

	// A palm landing, or a second finger, must not take the canvas over.
	canvas.send('pointerdown', pointerEvent(2, 600, 600));
	canvas.send('pointermove', pointerEvent(2, 640, 600));
	assert.deepEqual(previewXs(capture), [100, 140]);

	canvas.send('pointerup', pointerEvent(1, 140, 100));
	assert.equal(store.count(), 1);
	assert.deepEqual(
		store.peekStrokes()[0]?.points.map((point) => point.x),
		[100, 140]
	);
});

test('lets the next pointer draw once the first stroke commits', () => {
	const { canvas, store } = mounted();

	canvas.send('pointerdown', pointerEvent(1, 100, 100));
	canvas.send('pointermove', pointerEvent(1, 140, 100));
	canvas.send('pointerup', pointerEvent(1, 140, 100));

	canvas.send('pointerdown', pointerEvent(2, 600, 600));
	canvas.send('pointermove', pointerEvent(2, 640, 600));
	canvas.send('pointerup', pointerEvent(2, 640, 600));

	assert.equal(store.count(), 2);
});

test('discards the stroke when its pointer is cancelled', () => {
	const { canvas, store, capture } = mounted();

	canvas.send('pointerdown', pointerEvent(1, 100, 100));
	canvas.send('pointermove', pointerEvent(1, 140, 100));
	canvas.send('pointercancel', pointerEvent(1, 140, 100));

	assert.equal(store.count(), 0);
	assert.equal(capture.getCurrentStroke(), null);

	// A pointerup arriving after the cancel must not commit it either.
	canvas.send('pointerup', pointerEvent(1, 140, 100));
	assert.equal(store.count(), 0);
});

test('draws again after a cancelled stroke', () => {
	const { canvas, store } = mounted();

	canvas.send('pointerdown', pointerEvent(1, 100, 100));
	canvas.send('pointercancel', pointerEvent(1, 100, 100));

	canvas.send('pointerdown', pointerEvent(2, 300, 300));
	canvas.send('pointermove', pointerEvent(2, 340, 300));
	canvas.send('pointerup', pointerEvent(2, 340, 300));

	assert.equal(store.count(), 1);
});

test('draws nothing while a sealed canvas locks input', () => {
	const { canvas, store, capture } = mounted();
	capture.setLocked(true);

	canvas.send('pointerdown', pointerEvent(1, 100, 100));
	canvas.send('pointermove', pointerEvent(1, 140, 100));
	canvas.send('pointerup', pointerEvent(1, 140, 100));

	assert.equal(store.count(), 0);
	assert.equal(capture.getCurrentStroke(), null);
});

test('removes every listener it added on disable', () => {
	const { canvas, capture } = mounted();
	assert.equal(canvas.listenerCount(), 4);

	capture.disable();
	assert.equal(canvas.listenerCount(), 0);
});
