<!--
@component
The sheet's masthead: the library title, the section tabs (shared library and
the reader's own spells), and the "Sort by" orderings for the shared feed, all
set on one line over an engraved double rule. Opening My Spells asks the reader
to sign in first.
-->
<script lang="ts">
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import type { LibrarySession } from '$lib/ui/library/library-session.svelte.js';

	interface Props {
		session: LibrarySession;
	}

	let { session }: Props = $props();
	const auth = getAuthState();

	function openGrimoire() {
		void auth.requireUser(() => session.setSection('grimoire'));
	}
</script>

<header class="masthead">
	<h1 class="title">Spell Library</h1>

	<div class="sections" role="tablist" aria-label="Library sections">
		<button
			type="button"
			role="tab"
			class="section-tab"
			class:active={session.section === 'shared'}
			aria-selected={session.section === 'shared'}
			data-testid="library-section-shared"
			onclick={() => session.setSection('shared')}
		>
			Shared Library
		</button>
		<button
			type="button"
			role="tab"
			class="section-tab"
			class:active={session.section === 'grimoire'}
			aria-selected={session.section === 'grimoire'}
			data-testid="library-section-grimoire"
			onclick={openGrimoire}
		>
			My Spells
		</button>
	</div>

	<div class="arranged" class:idle={session.section !== 'shared'} aria-label="Sort spells">
		<span class="arranged-label">Sort by</span>
		<button
			type="button"
			class="arranged-option"
			class:active={session.sort === 'top'}
			data-testid="library-sort-top"
			aria-pressed={session.sort === 'top'}
			onclick={() => session.setSort('top')}
		>
			Most liked
		</button>
		<button
			type="button"
			class="arranged-option"
			class:active={session.sort === 'new'}
			data-testid="library-sort-new"
			aria-pressed={session.sort === 'new'}
			onclick={() => session.setSort('new')}
		>
			Newest
		</button>
	</div>
</header>
<div class="masthead-rule" aria-hidden="true"></div>

<style>
	.masthead {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: baseline;
		gap: 10px 24px;
	}

	.title {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-weight: 600;
		font-size: clamp(1.15rem, 2.2vw, 1.5rem);
		letter-spacing: 0.12em;
		color: var(--ink-sepia);
	}

	.sections {
		display: flex;
		gap: 26px;
	}

	.section-tab {
		min-height: 0;
		padding: 2px 0 5px;
		border: 0;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-family: 'Cinzel', serif;
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-sepia-45);
		transition:
			color 180ms ease,
			border-color 180ms ease;
	}

	.section-tab:hover {
		background: none;
		color: var(--ink-sepia-70);
	}

	.section-tab.active {
		color: var(--ink-sepia);
		border-bottom-color: var(--accent);
	}

	.section-tab:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	.arranged {
		display: flex;
		gap: 14px;
		align-items: baseline;
		justify-self: end;
	}

	/* My Spells keeps its owner's order, so the note withdraws without
	   letting the rule line jump. */
	.arranged.idle {
		visibility: hidden;
	}

	.arranged-label {
		font-style: italic;
		font-size: 0.88rem;
		color: var(--muted-ink);
	}

	.arranged-option {
		min-height: 0;
		padding: 2px 0 4px;
		border: 0;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-family: 'Cinzel', serif;
		font-size: 0.74rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-sepia-45);
	}

	.arranged-option:hover {
		background: none;
		color: var(--ink-sepia-70);
	}

	.arranged-option.active {
		color: var(--ink-sepia);
		border-bottom-color: var(--accent);
	}

	.arranged-option:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* An engraved double rule closes the masthead, an inked lozenge at its center. */
	.masthead-rule {
		position: relative;
		height: 5px;
		margin: 10px 0 0;
		border-top: 1px solid var(--ink-sepia-45);
		border-bottom: 1px solid var(--ink-sepia-20);
	}

	.masthead-rule::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 7px;
		height: 7px;
		transform: translate(-50%, -50%) rotate(45deg);
		background: var(--accent);
		box-shadow: 0 0 0 3px var(--panel);
	}

	@media (max-width: 900px) {
		.masthead {
			grid-template-columns: 1fr;
			justify-items: center;
			gap: 8px;
		}

		.arranged {
			justify-self: center;
		}

		.arranged.idle {
			display: none;
		}
	}
</style>
