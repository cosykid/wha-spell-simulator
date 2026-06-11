import { onMount } from 'svelte';

/**
 * A string `$state` mirrored to localStorage under `key`.
 *
 * The stored value is loaded on mount (so server-rendered markup matches the first client
 * render) and every change is persisted automatically — trimmed, with the key removed when
 * the trimmed value is empty, so cleared fields don't linger in storage.
 *
 * Must be called during component initialization — it registers `onMount` and an `$effect`.
 */
export function persistedString(key: string, initial = '') {
	let value = $state(initial);
	// Guards against persisting the placeholder initial value before the stored one is read.
	let loaded = false;

	onMount(() => {
		value = localStorage.getItem(key) ?? initial;
		loaded = true;
	});

	$effect(() => {
		const trimmed = value.trim();
		if (!loaded) return;
		if (trimmed) localStorage.setItem(key, trimmed);
		else localStorage.removeItem(key);
	});

	return {
		get value() {
			return value;
		},
		set value(next: string) {
			value = next;
		}
	};
}
