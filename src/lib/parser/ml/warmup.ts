import * as ort from 'onnxruntime-web/webgpu';
import type { AppConfig, Dictionary } from '../../types.js';
import { debugLog, describeError, mlConfig } from './config.js';
import { ensureCanonicalAngles } from './predictions.js';
import { loadRuntime } from './runtime.js';
import { runSession } from './sessionQueue.js';
import type { MlConfig, MlRuntime } from './types.js';

function startRuntimeWarmup(runtime: MlRuntime, config: MlConfig): void {
	if (runtime.warmed || runtime.warmupPromise) {
		return;
	}

	runtime.warmupPromise = (async () => {
		try {
			const input = new Float32Array(config.inputSize * config.inputSize).fill(-1);
			const inputName = runtime.session.inputNames[0];
			await runSession(runtime, {
				[inputName]: new ort.Tensor('float32', input, [1, 1, config.inputSize, config.inputSize])
			});
			runtime.warmed = true;
			debugLog(config, 'warm inference complete');
		} catch (error) {
			debugLog(config, 'warm inference failed', { error: describeError(error) }, 'warn');
		} finally {
			runtime.warmupPromise = undefined;
		}
	})();
}

/**
 * Warms the runtime so the first real recognition is fast. The first inference
 * at each input shape pays a one-time WGSL shader compile (seconds on Firefox);
 * this compiles the common batch=1 path in the background.
 *
 * Canonical-angle calibration follows the warm inference, queued behind it. It
 * used to wait for the first recognition, but that recognition awaits it anyway
 * before returning a facing it can trust, so waiting only moved the cost onto
 * the first spell of the session. Here it runs while the reader is still
 * reaching for the pen.
 */
export function warmMlRecognizer(config: AppConfig, dictionary: Dictionary): void {
	const cfg = mlConfig(config);
	void loadRuntime(cfg).then(async (runtime) => {
		if (!runtime) {
			return;
		}
		startRuntimeWarmup(runtime, cfg);
		await runtime.warmupPromise;
		await ensureCanonicalAngles(dictionary, runtime, cfg);
	});
}
