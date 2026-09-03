import { emitMlDebug, type MlDebugConsoleLevel } from '../../debug/mlDebug.js';
import type { AppConfig } from '../../types.js';
import type { MlConfig } from './types.js';

/**
 * Content hash of the deployed model files, stamped in by `vite.config.ts`. It is
 * absent outside a Vite build, which is where the tsx unit suite runs this module.
 */
declare const __MODEL_ASSET_VERSION__: string | undefined;

/**
 * Appends the model's content version, so a retrained model arrives on a fresh
 * URL. The files under `/models/` keep the same names forever, and `vercel.json`
 * caches that path as immutable for a year: without this stamp a returning
 * visitor would keep the old graph, or worse, pair a new graph with a cached
 * sidecar. Every `/models/` fetch the recognizer makes goes through here.
 */
function versioned(url: string): string {
	const version = typeof __MODEL_ASSET_VERSION__ === 'string' ? __MODEL_ASSET_VERSION__ : '';
	return version ? `${url}?v=${version}` : url;
}

/** Converts app recognition settings into a flat ML config object. */
export function mlConfig(config: AppConfig): MlConfig {
	const ml = config.recognition.ml;
	const modelFileName = ml.modelUrl.split('/').pop() ?? 'glyph-recognizer.onnx';
	return {
		enabled: ml.enabled,
		modelUrl: versioned(ml.modelUrl),
		classMapUrl: versioned(ml.classMapUrl),
		externalDataUrl: versioned(`${ml.modelUrl}.data`),
		// The graph names its sidecar internally, so this one stays unstamped.
		externalDataPath: `${modelFileName}.data`,
		inputSize: ml.inputSize,
		margin: ml.margin,
		strokeWidth: ml.strokeWidth,
		acceptConfidence: ml.acceptConfidence,
		acceptMargin: ml.acceptMargin,
		overrideConfidence: ml.overrideConfidence,
		overrideMargin: ml.overrideMargin,
		superConfidence: ml.superConfidence,
		superMargin: ml.superMargin,
		debug: ml.debug
	};
}

/** Whether the current environment has browser APIs required for ONNX + canvas. */
export function canRunInBrowser(): boolean {
	return (
		typeof fetch !== 'undefined' &&
		(typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined')
	);
}

/** Debug logging wrapper for ML recognition internals. */
export function debugLog(
	config: MlConfig,
	message: string,
	detail?: unknown,
	consoleLevel: MlDebugConsoleLevel = 'silent'
): void {
	emitMlDebug('mlRecognizer', message, detail, config.debug, consoleLevel);
}

/** Formats unknown thrown values for diagnostics. */
export function describeError(error: unknown): string {
	if (error instanceof Error) {
		return `${error.name}: ${error.message}`;
	}
	return String(error);
}
