export interface ButtonWithShortcut {
	key: string;
	shift?: boolean;
	shortcut: string;
	description: string;
	/** When true, the button is disabled and the keyboard shortcut is suppressed. */
	disabled?: () => boolean;
	action: () => void;
}

/**
 * True on macOS/iOS, where the primary chord modifier is ⌘ (Cmd) rather than
 * Ctrl. Safe to call during SSR — returns false when `navigator` is absent.
 */
export function isApplePlatform(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
}

/**
 * Rewrites a "Ctrl+…" shortcut label for the current platform: on macOS the
 * "Ctrl+" prefix becomes the ⌘ symbol (e.g. "Ctrl+Z" → "⌘Z"); elsewhere it is
 * returned unchanged.
 */
export function formatShortcut(shortcut: string, isMac: boolean): string {
	return isMac ? shortcut.replace('Ctrl+', '⌘') : shortcut;
}

/**
 * Returns a `keydown` handler that fires each item's action when its modifier+key
 * chord is pressed and `disabled` (if provided) returns false — the same
 * condition that disables the corresponding toolbar button. The chord modifier
 * is ⌘ (Cmd) on macOS and Ctrl on every other platform.
 */
export function createKeyDownHandler(items: ButtonWithShortcut[]): (event: KeyboardEvent) => void {
	const useMeta = isApplePlatform();
	return function onKeyDown(event: KeyboardEvent): void {
		if (!(useMeta ? event.metaKey : event.ctrlKey)) return;
		for (const item of items) {
			if (event.key !== item.key) continue;
			if (item.shift !== undefined && event.shiftKey !== item.shift) continue;
			if (item.disabled?.()) continue;
			event.preventDefault();
			item.action();
			break;
		}
	};
}
