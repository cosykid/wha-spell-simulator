/**
 * @file The classifier client's warm protocol: the worker starts with its
 * template recognizer alone, and the ~25 MB ML runtime behind it is fetched only
 * once something asks. A visitor who lands on the page and leaves without
 * drawing must not pay for the model.
 *
 * The request is page-lifetime state inside the client module, so these tests
 * read top to bottom as one session: the cold cases come before the warm ones.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import {
	disposeDrawingClassifierClient,
	warmDrawingClassifierMl,
	warmDrawingClassifierWorker
} from '../src/lib/parser/drawingClassifierClient.js';
import type { Dictionary } from '../src/lib/types.js';

interface PostedMessage {
	type: string;
}

const spawned: FakeWorker[] = [];

/**
 * A stand-in classifier worker that records what the client posts to it. The
 * unit suite has no `Worker`, so the client installs this one instead.
 */
class FakeWorker {
	readonly posted: PostedMessage[] = [];
	onmessage: unknown = null;
	onerror: unknown = null;

	constructor() {
		spawned.push(this);
	}

	postMessage(message: PostedMessage) {
		this.posted.push(message);
	}

	terminate() {}
}

(globalThis as { Worker?: unknown }).Worker = FakeWorker;

/** A dictionary is only an identity here, and identity is what respawns a worker. */
function emptyDictionary(): Dictionary {
	return { sigils: [], signs: [] };
}

/** Spawns a worker the way the simulator does once its dictionary has loaded. */
function spawnWorker(): FakeWorker {
	warmDrawingClassifierWorker(emptyDictionary(), CONFIG);
	return spawned[spawned.length - 1];
}

function postedTypes(worker: FakeWorker): string[] {
	return worker.posted.map((message) => message.type);
}

test('a freshly spawned worker is initialized without the ML runtime', () => {
	assert.deepEqual(postedTypes(spawnWorker()), ['init']);
});

test('the first intent to draw asks for the ML runtime, and only the first', () => {
	const worker = spawnWorker();

	warmDrawingClassifierMl();
	warmDrawingClassifierMl();

	assert.deepEqual(postedTypes(worker), ['init', 'warm-ml']);
});

test('a worker spawned after the request comes up warm', () => {
	// A new dictionary identity respawns the worker, which happens whenever the
	// reader passes through the library page and back.
	assert.deepEqual(postedTypes(spawnWorker()), ['init', 'warm-ml']);
	disposeDrawingClassifierClient();
});
