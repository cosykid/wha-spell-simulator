<script lang="ts">
	import type { Snippet } from 'svelte';
	import '$lib/styles/styles.css';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

{@render children()}
