<!--
@component
A waiting line on the sheet: the note's text with its ellipsis written one dot
at a time, the only motion a blank library shows.

@example
```svelte
<LoadingNote text="Fetching the folios" />
```
-->
<script lang="ts">
	interface Props {
		text: string;
	}

	let { text }: Props = $props();
</script>

<p class="loading-note">
	{text}<span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>
</p>

<style>
	.loading-note {
		margin: 0;
		text-align: center;
		font-style: italic;
		font-size: 0.92rem;
		color: var(--muted-ink);
	}

	.dots span {
		opacity: 0;
		animation: dot-ink 1.5s ease-in-out infinite;
	}

	.dots span::before {
		content: '.';
	}

	.dots span:nth-child(2) {
		animation-delay: 0.25s;
	}

	.dots span:nth-child(3) {
		animation-delay: 0.5s;
	}

	@keyframes dot-ink {
		0% {
			opacity: 0;
		}
		20%,
		70% {
			opacity: 1;
		}
		90%,
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dots span {
			opacity: 1;
			animation: none;
		}
	}
</style>
