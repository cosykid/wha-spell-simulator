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
 * Returns a `keydown` handler that fires each item's action when its Ctrl+key
 * chord is pressed and `disabled` (if provided) returns false — the same
 * condition that disables the corresponding toolbar button.
 */
export function createKeyDownHandler(items: ButtonWithShortcut[]): (event: KeyboardEvent) => void {
	return function onKeyDown(event: KeyboardEvent): void {
		if (!event.ctrlKey) return;
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
