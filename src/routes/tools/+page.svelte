<script lang="ts">
	import { base } from '$app/paths';

	const tools = [
		{
			href: 'stroke-template-maker',
			eyebrow: 'Template Tool',
			title: 'Stroke Template Maker',
			description:
				'Draw a sigil or sign and export a normalized strokeTemplate to paste into the dictionary.'
		},
		{
			href: 'stroke-template-viewer',
			eyebrow: 'Template Tool',
			title: 'Stroke Template Viewer',
			description:
				'Paste a strokeTemplate or dictionary entry to preview its strokes and inspect its metrics.'
		},
		{
			href: 'sigil-sign-detector-lab',
			eyebrow: 'Detector Tool',
			title: 'Sigil/Sign Detector Lab',
			description:
				'Draw one symbol and watch the recognizer score it against the dictionary in real time.'
		},
		{
			href: 'spell-effect-lab',
			eyebrow: 'Effect Tool',
			title: 'Spell Effect Lab',
			description:
				'Tune a synthetic SpellIR with sliders to preview and refine the animated element effects.'
		}
	];
</script>

<svelte:head>
	<title>Reference Tools - Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<div class="app-shell">
	<header class="app-header">
		<div>
			<p class="eyebrow">Reference Tools</p>
			<h1>Lab Tools</h1>
		</div>
		<div class="header-actions">
			<a class="header-link" href="{base}/">Simulator</a>
			<a
				class="header-link"
				href="https://github.com/ytnrvdf/wha-spell-simulator"
				target="_blank"
				rel="noreferrer">GitHub</a
			>
		</div>
	</header>

	<main class="tools-index">
		<p class="tools-index-intro">
			Companion tools for authoring stroke templates and tuning the recognizer and spell effects.
			Each opens in its own page and shares the simulator's core modules.
		</p>
		<div class="tools-index-grid">
			{#each tools as tool (tool.href)}
				<a class="tools-index-card" href="{base}/tools/{tool.href}">
					<p class="eyebrow">{tool.eyebrow}</p>
					<h2>{tool.title}</h2>
					<p class="tools-index-card-description">{tool.description}</p>
					<span class="tools-index-card-cta">Open tool →</span>
				</a>
			{/each}
		</div>
	</main>
</div>

<style>
	.tools-index {
		width: min(960px, 100%);
		margin: 0 auto;
		padding: 0 clamp(1rem, 3vw, 2.5rem) clamp(2rem, 5vw, 4rem);
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.tools-index-intro {
		max-width: 60ch;
		margin: 0;
		color: var(--ink-soft, #6c5b4d);
		line-height: 1.6;
	}

	.tools-index-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
		gap: 1.25rem;
	}

	.tools-index-card {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 1.4rem 1.5rem;
		border: 1px solid rgba(36, 27, 22, 0.16);
		border-radius: 14px;
		background: rgba(255, 250, 240, 0.7);
		color: inherit;
		text-decoration: none;
		transition:
			border-color 0.18s ease,
			transform 0.18s ease,
			box-shadow 0.18s ease;
	}

	.tools-index-card:hover,
	.tools-index-card:focus-visible {
		border-color: rgba(31, 111, 115, 0.6);
		transform: translateY(-2px);
		box-shadow: 0 10px 24px rgba(36, 27, 22, 0.12);
	}

	.tools-index-card h2 {
		margin: 0;
		font-size: 1.2rem;
	}

	.tools-index-card-description {
		margin: 0;
		line-height: 1.55;
		color: var(--ink-soft, #6c5b4d);
	}

	.tools-index-card-cta {
		margin-top: auto;
		padding-top: 0.4rem;
		font-weight: 600;
		color: rgba(31, 111, 115, 0.95);
	}
</style>
