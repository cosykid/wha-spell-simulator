<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { RouteId } from '$app/types';
	import { header } from '$lib/state.svelte';

	interface Props {
		eyebrow?: string;
		title?: string;
		/** Set this to true to display the status pill, which can be set via setStatus() */
		showStatus?: boolean;
	}

	let { eyebrow = '', title = '', showStatus = false }: Props = $props();

	/** Navigation links to the app's main sections */
	const nav: { route: RouteId; title: string }[] = [
		{ route: '/', title: 'Simulator' },
		{ route: '/tools', title: 'Tools' }
	];

	const filteredNav = $derived(nav.filter((link) => link.route !== page.route.id));
</script>

<header class="app-header">
	<div>
		<p class="eyebrow">{eyebrow}</p>
		<h1>{title}</h1>
	</div>
	<div class="header-actions">
		{#each filteredNav as link (link.route)}
			<a class="header-link" href={resolve(link.route)}>{link.title}</a>
		{/each}

		<a
			class="header-link"
			href="https://github.com/cosykid/wha-spell-simulator"
			target="_blank"
			rel="noreferrer">GitHub</a
		>

		{#if showStatus}
			<div class="status-pill {header.status.className}">{header.status.message}</div>
		{/if}
	</div>
</header>
