import type * as ort from 'onnxruntime-web/webgpu';
import type { DictionaryEntry, RecognitionKind, RecognizedSymbol, TopMatch } from '../../types.js';

/** Fully resolved machine-learning recognition config from app config. */
export interface MlConfig {
	enabled: boolean;
	modelUrl: string;
	classMapUrl: string;
	externalDataUrl: string;
	externalDataPath: string;
	inputSize: number;
	margin: number;
	strokeWidth: number;
	acceptConfidence: number;
	acceptMargin: number;
	overrideConfidence: number;
	overrideMargin: number;
	superConfidence: number;
	superMargin: number;
	debug: boolean;
}

/** Loaded ONNX session plus runtime-specific caches and feature flags. */
export interface MlRuntime {
	session: ort.InferenceSession;
	idxToId: string[];
	batchSupported: boolean;
	warmed: boolean;
	warmupPromise?: Promise<void>;
	canonicalAnglesPromise?: Promise<Map<string, number>>;
	/** Calibrated canonical angles once ready. Read non-blocking; empty until then. */
	canonicalAngles?: Map<string, number>;
	/** Serializes session.run calls so they never overlap. See sessionQueue.ts. */
	runChain?: Promise<unknown>;
}

/** One ML prediction projected back into dictionary identity space. */
export interface MlPrediction {
	available: boolean;
	id: string | null;
	kind: RecognitionKind;
	entry: DictionaryEntry | null;
	confidence: number;
	angleDeg: number;
	scaleX: number;
	scaleY: number;
	centerX: number;
	centerY: number;
	topMatches: TopMatch[];
	reason?: string;
	error?: string;
}

/** Result of comparing an ML prediction against the template recognizer baseline. */
export interface MlAcceptanceDecision {
	accept: boolean;
	reason: string;
	margin: number;
	superConfident: boolean;
	verifierPassed: boolean;
}

export type OrtFeeds = Record<string, ort.Tensor>;
export type OrtSessionOptions = Parameters<typeof ort.InferenceSession.create>[1];
export type OrtExecutionProvider =
	NonNullable<OrtSessionOptions>['executionProviders'] extends Array<infer Provider>
		? Provider
		: string;
export type ShouldContinue = () => boolean;
export type MlProgress = (results: RecognizedSymbol[]) => void;

export type NavigatorWithGpu = Navigator & {
	gpu?: {
		requestAdapter?: (options?: {
			powerPreference?: 'high-performance' | 'low-power';
		}) => Promise<unknown>;
	};
};
