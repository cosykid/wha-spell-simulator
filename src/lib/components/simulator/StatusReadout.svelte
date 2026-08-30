<!--
@component
Compact spell status, always rendered so recognition state stays visible and the
E2E hooks (`status-value`, `element-value`, `manifestation-value`) remain in the
DOM. The status dot is a CSS pseudo-element so `status-value` text stays exactly
the status string: an unsettled reading pulses that dot, never the text.
-->
<script lang="ts">
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	let summary = $derived(simulator.recognition.summary);
	let revealed = $derived(summary.element !== 'None' || summary.manifestation !== 'None');

	// A cast is a one-shot, so the paper stays tilted and the status keeps reading
	// "Active spell" long after the effect canvas has emptied. Waiting out the
	// score's own duration is what turns that silence into a finished performance.
	let castSpent = $state(false);

	$effect(() => {
		const endsAt = summary.castEndsAt;
		if (endsAt === null) {
			castSpent = false;
			return;
		}
		const remainingMs = endsAt - performance.now();
		if (remainingMs <= 0) {
			castSpent = true;
			return;
		}
		castSpent = false;
		const timer = setTimeout(() => (castSpent = true), remainingMs);
		return () => clearTimeout(timer);
	});
</script>

<div class="status-readout" role="status" aria-live="polite">
	<span
		class="status-line {summary.statusClass}"
		class:reading={simulator.recognition.reading}
		id="statusValue"
		data-testid="status-value"
		data-status-class={summary.statusClass}
	>
		{summary.statusText}
	</span>
	<div class="status-meta" class:revealed aria-hidden={!revealed}>
		<span class="meta-pair">
			<span class="meta-label">Element</span>
			<strong id="elementValue" data-testid="element-value">{summary.element}</strong>
		</span>
		<span class="meta-divider">·</span>
		<span class="meta-pair">
			<span class="meta-label">Manifestation</span>
			<strong id="manifestationValue" data-testid="manifestation-value"
				>{summary.manifestation}</strong
			>
		</span>
	</div>
	{#if castSpent}
		<span class="status-note" data-testid="status-note"
			>Spell spent - erase or undo to draw again</span
		>
	{/if}
</div>

<style>
	.status-readout {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		text-align: center;
		pointer-events: none;
	}

	.status-line {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: min(70vw, 460px);
		font-size: 13px;
		color: var(--ink-sepia-70);
	}

	.status-line::before {
		content: '';
		width: 8px;
		height: 8px;
		flex: 0 0 auto;
		border-radius: 999px;
		background: var(--ink-sepia-45);
	}

	.status-line.active::before,
	.status-line.prepared::before {
		background: var(--teal);
	}

	.status-line.invalid::before {
		background: #8d5149;
	}

	.status-line.closed::before {
		background: var(--violet);
	}

	/* The template verdict is on screen and the ML pass may still overturn it, so
	   the dot breathes until the reading settles. */
	.status-line.reading::before {
		animation: status-reading 1.6s ease-in-out infinite;
	}

	@keyframes status-reading {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	.status-meta {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-size: 12px;
		color: var(--ink-sepia-45);
		opacity: 0;
		transition: opacity 200ms ease;
	}

	.status-meta.revealed {
		opacity: 1;
	}

	.meta-label {
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10px;
	}

	.meta-pair strong {
		margin-left: 5px;
		color: var(--teal);
		font-weight: 600;
		text-transform: capitalize;
	}

	.meta-divider {
		color: var(--ink-sepia-20);
	}

	.status-note {
		font-size: 12px;
		color: var(--ink-sepia-45);
	}

	@media (prefers-reduced-motion: reduce) {
		.status-meta {
			transition: none;
		}

		.status-line.reading::before {
			animation: none;
		}
	}
</style>
