export const ML_DEBUG_BUILD_ID = 'ml-debug-visible-trace-2026-06-13-01';

export type MlDebugConsoleLevel = 'silent' | 'info' | 'warn' | 'error';

export interface MlDebugEvent {
	at: number;
	buildId: string;
	source: string;
	message: string;
	detail?: unknown;
	consoleLevel?: MlDebugConsoleLevel;
}

declare global {
	interface Window {
		__WHA_ML_DEBUG?: boolean;
		__WHA_ML_EVENTS?: MlDebugEvent[];
	}
}

function browserWindow(): Window | null {
	return typeof window === 'undefined' ? null : window;
}

export function mlDebugEnabled(configDebug = false): boolean {
	if (configDebug) {
		return true;
	}

	const win = browserWindow();
	if (win?.__WHA_ML_DEBUG) {
		return true;
	}

	try {
		return typeof localStorage !== 'undefined' && localStorage.getItem('wha:ml-debug') === '1';
	} catch {
		return false;
	}
}

export function mlDebugEventsSnapshot(): MlDebugEvent[] {
	return [...(browserWindow()?.__WHA_ML_EVENTS ?? [])];
}

export function emitMlDebug(
	source: string,
	message: string,
	detail?: unknown,
	configDebug = false,
	consoleLevel: MlDebugConsoleLevel = 'silent'
): void {
	if (!mlDebugEnabled(configDebug) && consoleLevel === 'silent') {
		return;
	}

	const event: MlDebugEvent = {
		at: Date.now(),
		buildId: ML_DEBUG_BUILD_ID,
		source,
		message,
		detail,
		consoleLevel
	};
	const win = browserWindow();
	if (win) {
		win.__WHA_ML_EVENTS = [...(win.__WHA_ML_EVENTS ?? []), event].slice(-80);
		win.dispatchEvent(new CustomEvent<MlDebugEvent>('wha:ml-debug', { detail: event }));
	}

	if (consoleLevel === 'silent') {
		return;
	}

	if (detail === undefined) {
		console[consoleLevel](`[wha:ml][${source}] ${message}`);
		return;
	}
	console[consoleLevel](`[wha:ml][${source}] ${message}`, detail);
}
