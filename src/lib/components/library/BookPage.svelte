<!--
@component
One leaf of the library book. It sits on the right half of the open book and
rotates around the spine. The front face reads on the right page, the back face
reads on the left page once the leaf has turned. Under reduced motion the turn
is instant.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		flipped: boolean;
		zIndex: number;
		front: Snippet;
		back: Snippet;
	}

	let { flipped, zIndex, front, back }: Props = $props();
</script>

<div class="leaf" class:flipped style:z-index={zIndex}>
	<div class="face front">{@render front()}</div>
	<div class="face back">{@render back()}</div>
</div>

<style>
	.leaf {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 50%;
		transform-origin: left center;
		transform-style: preserve-3d;
		transition: transform 620ms cubic-bezier(0.35, 0.05, 0.2, 1);
		will-change: transform;
	}

	.leaf.flipped {
		transform: rotateY(-180deg);
	}

	.face {
		position: absolute;
		inset: 0;
		overflow: hidden;
		backface-visibility: hidden;
		background:
			linear-gradient(105deg, rgba(96, 74, 46, 0.16), transparent 12%), var(--panel, #f2ecd6);
		border: 1px solid var(--panel-line);
	}

	.face.front {
		border-radius: 0 10px 10px 0;
	}

	.face.back {
		transform: rotateY(180deg);
		border-radius: 10px 0 0 10px;
		background:
			linear-gradient(-105deg, rgba(96, 74, 46, 0.16), transparent 12%), var(--panel, #f2ecd6);
	}

	@media (prefers-reduced-motion: reduce) {
		.leaf {
			transition: none;
		}
	}
</style>
