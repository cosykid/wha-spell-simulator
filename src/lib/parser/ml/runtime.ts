import * as ort from 'onnxruntime-web/webgpu';
import { BATCH_INFERENCE_PROBE_ENABLED } from './runtimeFlags.js';
import { canRunInBrowser, debugLog, describeError } from './config.js';
import type { MlConfig, MlRuntime, NavigatorWithGpu, OrtExecutionProvider } from './types.js';

/**
 * Base URL for the ONNX Runtime wasm binary and its JS glue, stamped in by
 * `vite.config.ts`. A deployed build points at jsDelivr so the 22MB binary never
 * crosses our own bandwidth; the dev server points at the postinstall-synced copy
 * in `static/onnxruntime/` so local work and the e2e suite need no network.
 */
declare const __ORT_WASM_BASE__: string;

let runtimePromise: Promise<MlRuntime | null> | null = null;
let runtimeKey = '';
let ortConfigured = false;
let runtimeUnavailableReason = '';

function configureOrtRuntime(): void {
	if (ortConfigured) {
		return;
	}
	ort.env.wasm.wasmPaths = __ORT_WASM_BASE__;
	ort.env.logLevel = 'error';
	ort.env.webgpu.powerPreference = 'high-performance';
	ortConfigured = true;
}

async function webGpuSupported(): Promise<boolean> {
	const gpu = typeof navigator === 'undefined' ? null : (navigator as NavigatorWithGpu).gpu;
	if (!gpu?.requestAdapter) {
		return false;
	}

	try {
		return Boolean(await gpu.requestAdapter({ powerPreference: 'high-performance' }));
	} catch {
		return false;
	}
}

async function executionProviders(): Promise<OrtExecutionProvider[]> {
	return (await webGpuSupported())
		? (['webgpu', 'wasm'] as OrtExecutionProvider[])
		: (['wasm'] as OrtExecutionProvider[]);
}

async function fetchClassMap(url: string): Promise<string[]> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`class map ${url} returned ${response.status}`);
	}
	const classToIdx = (await response.json()) as Record<string, number>;
	const idxToId: string[] = [];
	for (const [id, index] of Object.entries(classToIdx)) {
		idxToId[index] = id;
	}
	return idxToId;
}

/** Last runtime-load error, used when attaching unavailable ML diagnostics. */
export function getRuntimeUnavailableReason(): string {
	return runtimeUnavailableReason;
}

/** Loads and memoizes the ONNX runtime for the current model/class map pair. */
export async function loadRuntime(config: MlConfig): Promise<MlRuntime | null> {
	if (!config.enabled || !canRunInBrowser()) {
		debugLog(config, 'skipped', {
			enabled: config.enabled,
			canRunInBrowser: canRunInBrowser()
		});
		return null;
	}

	const key = `${config.modelUrl}|${config.classMapUrl}|${config.externalDataUrl}`;
	if (runtimePromise && runtimeKey === key) {
		return runtimePromise;
	}

	const loadingKey = key;
	const loadingPromise: Promise<MlRuntime | null> = (async () => {
		try {
			const providers = await executionProviders();
			debugLog(config, 'loading model', {
				modelUrl: config.modelUrl,
				classMapUrl: config.classMapUrl,
				externalDataUrl: config.externalDataUrl,
				externalDataPath: config.externalDataPath,
				executionProviders: providers
			});
			configureOrtRuntime();
			const [idxToId, session] = await Promise.all([
				fetchClassMap(config.classMapUrl),
				ort.InferenceSession.create(config.modelUrl, {
					executionProviders: providers,
					graphOptimizationLevel: 'all',
					logSeverityLevel: 3,
					externalData: [
						{
							path: config.externalDataPath,
							data: config.externalDataUrl
						}
					]
				})
			]);
			runtimeUnavailableReason = '';
			debugLog(config, 'model loaded', { classes: idxToId.length });
			return {
				session,
				idxToId,
				batchSupported: BATCH_INFERENCE_PROBE_ENABLED,
				warmed: false
			};
		} catch (error) {
			runtimeUnavailableReason = describeError(error);
			debugLog(
				config,
				'unavailable; using template recognizer only',
				{
					error: runtimeUnavailableReason
				},
				'warn'
			);
			if (runtimeKey === loadingKey) {
				runtimePromise = null;
				runtimeKey = '';
			}
			return null;
		}
	})();
	runtimeKey = loadingKey;
	runtimePromise = loadingPromise;

	return runtimePromise;
}
