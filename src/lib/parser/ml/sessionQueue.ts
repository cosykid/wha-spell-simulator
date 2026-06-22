/**
 * @file Serializes inference runs on a loaded session.
 *
 * onnxruntime-web does not support overlapping `run()` calls on a single
 * session. Firefox's WebGPU backend deadlocks when a second run is submitted
 * while the first is still in flight (Chrome happens to tolerate it). Chaining
 * every run through the runtime keeps them strictly sequential, so warmup,
 * canonical-angle calibration, and prediction never submit concurrently.
 */
import type * as ort from 'onnxruntime-web/webgpu';
import type { MlRuntime, OrtFeeds } from './types.js';

/** Runs feeds through the session, queued after any run already in flight. */
export function runSession(
	runtime: MlRuntime,
	feeds: OrtFeeds
): Promise<ort.InferenceSession.ReturnType> {
	const prior = runtime.runChain ?? Promise.resolve();
	const result = prior.then(() => runtime.session.run(feeds));
	// The next run waits for this one to settle; its success or failure is the
	// caller's to handle, so the chain itself never rejects.
	runtime.runChain = result.then(
		() => undefined,
		() => undefined
	);
	return result;
}
