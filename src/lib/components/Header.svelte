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
		{ route: '/', title: 'Canvas' },
		{ route: '/library', title: 'Spell Library' },
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

<style>
	.app-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 18px;
		margin-bottom: 18px;
		color: #fff9e8;
	}

	.app-header h1 {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 28px;
		line-height: 1.1;
		font-weight: 700;
		letter-spacing: 0;
	}

	.header-link {
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		border: 1px solid rgba(255, 247, 219, 0.34);
		border-radius: 999px;
		padding: 0 14px;
		color: #fff8df;
		text-decoration: none;
		background: rgba(36, 27, 22, 0.28);
	}

	.header-link:hover {
		background: rgba(36, 27, 22, 0.44);
	}

	.status-pill {
		min-width: 156px;
		border: 1px solid rgba(255, 247, 219, 0.34);
		border-radius: 999px;
		padding: 9px 14px;
		text-align: center;
		color: #fff8df;
		background: rgba(36, 27, 22, 0.44);
	}

	.status-pill.active {
		border-color: rgba(255, 209, 93, 0.8);
		background: rgba(184, 69, 49, 0.58);
	}

	.status-pill.prepared {
		border-color: rgba(101, 181, 184, 0.86);
		background: rgba(31, 111, 115, 0.62);
	}

	.status-pill.invalid {
		border-color: rgba(255, 173, 143, 0.8);
		background: rgba(84, 47, 43, 0.72);
	}

	@media (max-width: 640px) {
		.app-header {
			display: grid;
			align-items: start;
		}

		.app-header h1 {
			font-size: 23px;
		}
	}
</style>
