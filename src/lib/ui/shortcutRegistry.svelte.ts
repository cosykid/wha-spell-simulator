import { createContext } from 'svelte';
import { createKeyDownHandler, type ButtonWithShortcut } from './keybindings.js';

/**
 * A keyboard-shortcut registry that lets buttons own their own chord instead of a central list.
 * Each {@link ShortcutButton} registers its definition on mount and unregisters on destroy, and
 * the page wires a single `<svelte:window onkeydown={registry.handleKeyDown}>`.
 *
 * {@link createKeyDownHandler} closes over the `defs` array by reference and re-reads it on every
 * keypress, so pushing/splicing entries is enough — no extra bookkeeping or re-binding needed.
 */
export interface ShortcutRegistry {
	/** Register a shortcut; returns a cleanup that unregisters it. */
	register(def: ButtonWithShortcut): () => void;
	/** `keydown` handler that dispatches to the matching registered shortcut. */
	handleKeyDown(event: KeyboardEvent): void;
}

export function createShortcutRegistry(): ShortcutRegistry {
	// Plain (non-reactive) array on purpose: the handler re-reads it by reference on each keypress,
	// so nothing observes it reactively. Making it `$state` would be actively wrong — registering
	// inside an `$effect` (push reads then writes `length`) would self-trigger into an infinite loop.
	const defs: ButtonWithShortcut[] = [];
	const handleKeyDown = createKeyDownHandler(defs);

	return {
		register(def) {
			defs.push(def);
			return () => {
				const index = defs.indexOf(def);
				if (index !== -1) defs.splice(index, 1);
			};
		},
		handleKeyDown
	};
}

export const [getShortcutRegistry, setShortcutRegistry] = createContext<ShortcutRegistry>();
