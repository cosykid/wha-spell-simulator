<!--
@component
Left slide-out menu: app identity, navigation, view toggles, and the fan-project
disclaimer. This is the home for the page chrome that the full-bleed canvas no
longer shows inline.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Drawer from './Drawer.svelte';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	const auth = getAuthState();
	let ui = $derived(simulator.ui);
</script>

<Drawer side="left" open={ui.menuOpen} label="Menu" modal onClose={ui.closeDrawers}>
	<header class="menu-head">
		<p class="eyebrow">Witch Hat Atelier</p>
		<h2>Spell Simulator</h2>
	</header>

	<nav class="menu-nav" aria-label="Primary">
		<a class="menu-link current" href={resolve('/')} aria-current="page">Canvas</a>
		<a class="menu-link" href={resolve('/library')}>
			Spell Library
			<ArrowRight aria-hidden="true" />
		</a>
		<a class="menu-link" href={resolve('/tools')}>
			Tools
			<ArrowRight aria-hidden="true" />
		</a>
		<a
			class="menu-link"
			href="https://github.com/cosykid/wha-spell-simulator"
			target="_blank"
			rel="noreferrer"
		>
			GitHub
			<ArrowRight aria-hidden="true" />
		</a>
		<!-- The only way out of an account. Guests are offered the sign-in where
		     it buys them something, in the My Spells drawer. -->
		{#if auth.user}
			<p class="menu-account">
				Signed in as <strong>{auth.user.username}</strong>
				<button
					type="button"
					class="menu-signout"
					data-testid="menu-signout"
					onclick={() => void auth.signOut()}
				>
					Sign out
				</button>
			</p>
		{/if}
	</nav>

	<section class="menu-section" aria-label="View">
		<h3 class="menu-section-title">View</h3>
		<label class="toggle">
			<input
				type="checkbox"
				id="guidesToggle"
				bind:checked={ui.showGuides}
				onchange={simulator.handleToggleGuides}
			/>
			<span>Construction guides</span>
		</label>
		<label class="toggle">
			<input type="checkbox" id="diagnosticsToggle" bind:checked={ui.showDiagnostics} />
			<span>Glyph diagnostics</span>
		</label>
	</section>

	<footer class="menu-disclaimer">
		<p>
			Unofficial fan-made spell diagram simulator inspired by Witch Hat Atelier. Not affiliated
			with, endorsed by, or sponsored by the official creators, publishers, licensors, or production
			partners.
		</p>
		<p>
			Witch Hat Atelier and related names, artwork, symbols, and trademarks belong to their
			respective rights holders. The sigils, signs, and spell effects here are partial fan
			references for learning and experimentation.
		</p>
	</footer>
</Drawer>

<style>
	.menu-head {
		margin: 4px 0 18px;
	}

	.menu-head .eyebrow {
		margin: 0 0 4px;
		font-family: 'Cinzel', serif;
		color: var(--gold);
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.menu-head h2 {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 22px;
		font-weight: 600;
		color: var(--ink-sepia);
	}

	.menu-nav {
		display: grid;
		gap: 6px;
		padding-bottom: 16px;
		margin-bottom: 16px;
		border-bottom: 1px solid var(--ink-sepia-20);
	}

	.menu-link {
		display: flex;
		align-items: center;
		min-height: 40px;
		padding: 0 12px;
		border-radius: 8px;
		color: var(--ink-sepia-70);
		text-decoration: none;
		font-size: 15px;
	}

	.menu-link:hover {
		color: var(--ink-sepia);
		background: var(--chrome-glass);
	}

	.menu-link.current {
		color: var(--ink-sepia);
		background: var(--chrome-glass);
	}

	/* Trailing arrow marks links that lead away from the current page. */
	.menu-link :global(svg) {
		width: 16px;
		height: 16px;
		margin-left: auto;
		flex-shrink: 0;
		color: var(--ink-sepia-45);
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform 160ms ease;
	}

	.menu-link:hover :global(svg) {
		color: var(--ink-sepia-70);
		transform: translateX(2px);
	}

	@media (prefers-reduced-motion: reduce) {
		.menu-link :global(svg) {
			transition: none;
		}
	}

	.menu-account {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 10px;
		align-items: baseline;
		margin: 6px 0 0;
		padding: 0 12px;
		font-size: 13px;
		color: var(--ink-sepia-45);
	}

	.menu-account strong {
		font-weight: 600;
		color: var(--ink-sepia-70);
	}

	.menu-signout {
		min-height: 0;
		padding: 0 1px;
		border: 0;
		border-bottom: 1px solid var(--ink-sepia-20);
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-size: 13px;
		font-style: italic;
		color: var(--ink-sepia-70);
	}

	.menu-signout:hover {
		background: none;
		border-bottom-color: var(--gold);
		color: var(--ink-sepia);
	}

	.menu-signout:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}

	.menu-section {
		display: grid;
		gap: 8px;
		padding-bottom: 16px;
		margin-bottom: 16px;
		border-bottom: 1px solid var(--ink-sepia-20);
	}

	.menu-section-title {
		margin: 0 0 2px;
		font-family: 'Cinzel', serif;
		font-size: 13px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-sepia-70);
	}

	.menu-section .toggle {
		width: 100%;
		justify-content: space-between;
		background: var(--chrome-glass);
		border-color: var(--ink-sepia-20);
	}

	.menu-disclaimer {
		margin-top: auto;
		display: grid;
		gap: 6px;
		padding-top: 14px;
		color: var(--ink-sepia-45);
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
		font-size: 11px;
		line-height: 1.45;
	}

	.menu-disclaimer p {
		margin: 0;
	}
</style>
