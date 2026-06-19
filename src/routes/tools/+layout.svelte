<script lang="ts">
	import { page } from '$app/state';
	import Header from '$lib/components/Header.svelte';
	import type { Snippet } from 'svelte';
	import { tools } from './tools';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	const tool = $derived(tools.find((t) => t.path === page.route.id));
</script>

<div class="app-shell">
	<Header
		title={tool ? tool.title : 'Tools'}
		eyebrow="WHA Spell Simulator"
		showStatus={tool?.showStatus}
	/>

	{@render children()}
</div>
