import { getContext, setContext } from 'svelte';

/**
 * Keys that may follow the modifier(s) in a {@link Shortcut}. Letters are spelled
 * uppercase (their display form); `event.key` matching is case-insensitive.
 */
type ChordKey =
	| 'A'
	| 'B'
	| 'C'
	| 'D'
	| 'E'
	| 'F'
	| 'G'
	| 'H'
	| 'I'
	| 'J'
	| 'K'
	| 'L'
	| 'M'
	| 'N'
	| 'O'
	| 'P'
	| 'Q'
	| 'R'
	| 'S'
	| 'T'
	| 'U'
	| 'V'
	| 'W'
	| 'X'
	| 'Y'
	| 'Z'
	| 'Enter';

/**
 * Modifier prefixes, written in canonical order (Ctrl, Alt, Shift). Bare Shift is
 * excluded since "Shift+<letter>" is just typing a capital.
 */
type Modifiers = 'Ctrl' | 'Alt' | 'Ctrl+Alt' | 'Ctrl+Shift' | 'Alt+Shift' | 'Ctrl+Alt+Shift';

/**
 * A modifier chord label such as `"Ctrl+Z"`, `"Alt+Enter"` or `"Ctrl+Alt+L"`. This
 * is the single source of truth for a shortcut: the matched key and required
 * modifiers are parsed from it (see {@link parseShortcut}), never stored twice.
 */
export type Shortcut = `${Modifiers}+${ChordKey}`;

export interface ButtonWithShortcut {
	/** Shortcut to trigger the action, specified as a {Modifier}+{Key} string {@link Shortcut}, e.g. "Ctrl+Z". On Mac, "Ctrl" will be automatically mapped to ⌘. */
	shortcut: Shortcut;
	description: string;
	/** When true, the button is disabled and the keyboard shortcut is suppressed. */
	disabled?: () => boolean;
	action: () => void;
}

/**
 * Splits a {@link Shortcut} into the `event.key` to match (compared
 * case-insensitively) and the modifiers that must be held. On macOS the Ctrl
 * modifier maps to ⌘ rather than Ctrl — see {@link createKeyDownHandler}.
 */
function parseShortcut(shortcut: Shortcut): {
	key: string;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
} {
	return {
		key: shortcut.slice(shortcut.lastIndexOf('+') + 1),
		ctrl: shortcut.includes('Ctrl+'),
		alt: shortcut.includes('Alt+'),
		shift: shortcut.includes('Shift+')
	};
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
 * Rewrites a shortcut label for the current platform: on macOS "Ctrl+" becomes ⌘,
 * "Alt+" becomes ⌥ and "Shift+" becomes ⇧ (e.g. "Ctrl+Z" → "⌘Z", "Ctrl+Alt+L" →
 * "⌘⌥L"); elsewhere the label is returned unchanged.
 */
export function formatShortcut(shortcut: Shortcut, isMac: boolean): string {
	return isMac
		? shortcut.replace('Ctrl+', '⌘').replace('Alt+', '⌥').replace('Shift+', '⇧')
		: shortcut;
}

const PLATFORM_KEY = Symbol('platform');

export interface Platform {
	/** True on macOS/iOS, where chord shortcuts display ⌘ instead of "Ctrl". */
	readonly isMac: boolean;
}

/**
 * Publishes platform info from the root layout so descendants can format
 * shortcut labels via {@link getPlatform} without re-detecting per component.
 * Pass an object with a reactive `isMac` getter so updates after hydration
 * propagate.
 */
export function setPlatformContext(platform: Platform): void {
	setContext(PLATFORM_KEY, platform);
}

/**
 * Reads the platform context. Falls back to non-Mac ("Ctrl") when no provider
 * is present — e.g. during SSR or in isolated component tests.
 */
export function getPlatform(): Platform {
	return getContext<Platform>(PLATFORM_KEY) ?? { isMac: false };
}

/**
 * Returns a `keydown` handler that fires each item's action when its exact
 * modifier+key chord is pressed and `disabled` (if provided) returns false — the
 * same condition that disables the corresponding toolbar button. Modifiers are
 * matched exactly (no extras), and the Ctrl modifier is ⌘ (Cmd) on macOS and Ctrl
 * on every other platform.
 */
export function createKeyDownHandler(items: ButtonWithShortcut[]): (event: KeyboardEvent) => void {
	const useMeta = isApplePlatform();
	return function onKeyDown(event: KeyboardEvent): void {
		for (const item of items) {
			const { key, ctrl, alt, shift } = parseShortcut(item.shortcut);
			if ((useMeta ? event.metaKey : event.ctrlKey) !== ctrl) continue;
			if (event.altKey !== alt) continue;
			if (event.shiftKey !== shift) continue;
			if (event.key.toLowerCase() !== key.toLowerCase()) continue;
			if (item.disabled?.()) continue;
			event.preventDefault();
			item.action();
			break;
		}
	};
}
