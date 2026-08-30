/**
 * Diagnostics projection for the simulator sidebar.
 *
 * The parser/compiler pipeline keeps rich internal state that is useful for
 * debugging but awkward for the Svelte component to consume directly. This module
 * flattens that state into the stable payload expected by `Diagnostics.svelte`.
 *
 * @packageDocumentation
 */
import { CONFIG } from '$lib/config.js';
import { buildDiagnosticState } from '$lib/debug/diagnosticState.js';
import { ML_DEBUG_BUILD_ID, type MlDebugEvent } from '$lib/debug/mlDebug.js';
import type { ClassifiedDrawing, Recognition, SpellIR, Stroke } from '$lib/types.js';
import type { SimulatorDiagnostics } from './types.js';

function ringPhrase(pipeline: ClassifiedDrawing | null): string {
	if (!pipeline?.ring?.found) {
		return 'No ring detected.';
	}
	return pipeline.ring.complete ? 'Ring closed.' : 'Ring open.';
}

/**
 * One plain-language sentence about the parse, for readers who do not want to
 * count entries in the JSON tree below it.
 */
function describeParse(pipeline: ClassifiedDrawing | null): string {
	const markCount = pipeline?.candidates?.length ?? 0;
	const recognitions = pipeline?.recognitions ?? [];
	const recognizedCount = recognitions.filter((recognition) => recognition.recognized).length;
	const unclearCount = recognitions.length - recognizedCount;
	const markWord = markCount === 1 ? 'mark' : 'marks';
	return `${markCount} ${markWord} found, ${recognizedCount} recognized, ${unclearCount} unclear. ${ringPhrase(pipeline)}`;
}

/**
 * Builds the diagnostics panel payload from the latest pipeline state.
 *
 * @param input - Current strokes, parser result, compiled spell IR, and ML debug state.
 * @returns A plain object suitable for rendering in the diagnostics sidebar.
 */
export function buildSimulatorDiagnostics({
	rawStrokes,
	pipeline,
	spellIR,
	mlDebugEnabled,
	mlDebugEvents
}: {
	rawStrokes: Stroke[];
	pipeline: ClassifiedDrawing | null;
	spellIR: SpellIR | null;
	mlDebugEnabled: boolean;
	mlDebugEvents: MlDebugEvent[];
}): SimulatorDiagnostics {
	const state = buildDiagnosticState({
		rawStrokes,
		pipeline,
		spellIR
	});
	const pipelineRecognitions = (
		state.recognitions instanceof Array ? state.recognitions : []
	) as Recognition[];
	const mlRecognitions = pipelineRecognitions.map((recognition) => ({
		candidateId: recognition.candidateId,
		template: {
			recognized: recognition.recognized,
			status: recognition.recognitionStatus,
			kind: recognition.kind,
			id: recognition.id,
			confidence: recognition.confidence,
			topMatches: recognition.diagnostics?.topMatches ?? []
		},
		ml: recognition.diagnostics?.ml ?? null
	}));
	const attachedMlDiagnostics = mlRecognitions.flatMap((recognition) =>
		recognition.ml ? [recognition.ml] : []
	);
	return {
		ast: state.glyphAST,
		ir: state.spellIR,
		ml: {
			status:
				attachedMlDiagnostics.length > 0
					? 'hybrid diagnostics attached'
					: pipeline
						? 'pipeline has no ML diagnostics yet'
						: 'waiting for recognition pipeline',
			debugEnabled: mlDebugEnabled,
			enabled: CONFIG.recognition.ml.enabled,
			buildId: ML_DEBUG_BUILD_ID,
			modelUrl: CONFIG.recognition.ml.modelUrl,
			classMapUrl: CONFIG.recognition.ml.classMapUrl,
			source: 'classifyDrawingOffThread -> drawingClassifierWorker -> recognizeCandidatesHybridMl',
			strokeCount: rawStrokes.length,
			pipelineReady: Boolean(pipeline),
			ringFound: pipeline?.ring?.found ?? false,
			candidateCount: state.candidates instanceof Array ? state.candidates.length : 0,
			recognitionCount: state.recognitions instanceof Array ? state.recognitions.length : 0,
			mlDiagnosticsAttached: attachedMlDiagnostics.length,
			mlAvailableCount: attachedMlDiagnostics.filter((ml) => ml.available).length,
			mlAcceptedCount: attachedMlDiagnostics.filter((ml) => ml.accepted).length,
			mlUnavailableReasons: [
				...new Set(
					attachedMlDiagnostics
						.filter((ml) => !ml.available)
						.map((ml) => ml.reason ?? 'unavailable')
				)
			],
			events: mlDebugEvents,
			recognitions: mlRecognitions
		},
		parser: {
			summary: describeParse(pipeline),
			rawStrokes: state.rawStrokes,
			ring: state.ring,
			classifications: state.classifications,
			candidates: state.candidates,
			recognitions: state.recognitions
		}
	};
}
