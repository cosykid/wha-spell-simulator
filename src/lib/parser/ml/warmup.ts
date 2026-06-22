import * as ort from 'onnxruntime-web/webgpu';
import type { AppConfig } from '../../types.js';
import { debugLog, describeError, mlConfig } from './config.js';
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
 * this compiles the common batch=1 path in the background. Canonical-angle
 * calibration is deferred to the first recognition so it never blocks it.
 */
export function warmMlRecognizer(config: AppConfig): void {
	const cfg = mlConfig(config);
	void loadRuntime(cfg).then((runtime) => {
		if (runtime) {
			startRuntimeWarmup(runtime, cfg);
		}
	});
}
