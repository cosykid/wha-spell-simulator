<script lang="ts">
	import '$lib/styles/styles.css';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="app-background" aria-hidden="true"></div>
<div class="app-content">
	{@render children()}
</div>
