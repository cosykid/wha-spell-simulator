import { emitMlDebug, type MlDebugConsoleLevel } from '../../debug/mlDebug.js';
import type { AppConfig } from '../../types.js';
import type { MlConfig } from './types.js';

/** Converts app recognition settings into a flat ML config object. */
export function mlConfig(config: AppConfig): MlConfig {
	const ml = config.recognition.ml;
	const modelFileName = ml.modelUrl.split('/').pop() ?? 'glyph-recognizer.onnx';
	return {
		enabled: ml.enabled,
		modelUrl: ml.modelUrl,
		classMapUrl: ml.classMapUrl,
		externalDataUrl: `${ml.modelUrl}.data`,
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
