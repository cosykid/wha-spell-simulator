<!--
@component
The mark between two groups of canvas chrome, where the controls either side of
it do different kinds of work.

It is a stroke, not a border: the ink is strongest in the middle and fades to
nothing at both ends, the way a pen touches down and lifts. A flat hairline with
hard-cut ends reads as something CSS put there, on a sheet where every other
mark is drawn.

It spans one icon-only ChromeButton, running across to part a column of them and
down to part a row, so the ink always sits centred on the run it cuts.

  <ChromeRule direction="down" />
-->
<script lang="ts">
	interface Props {
		/** Which way the stroke is drawn: across a column, or down a row. */
		direction?: 'across' | 'down';
	}

	let { direction = 'across' }: Props = $props();
</script>

<div class="chrome-rule {direction}" aria-hidden="true"></div>

<style>
	/* One ink recipe, turned by --rule-angle rather than written out twice. */
	.chrome-rule {
		background: linear-gradient(
			var(--rule-angle),
			transparent,
			var(--ink-sepia-30) 28%,
			var(--ink-sepia-30) 72%,
			transparent
		);
	}

	.across {
		--rule-angle: 90deg;
		width: var(--chrome-control-width);
		height: 1px;
		margin: var(--chrome-rule-gap) 0;
	}

	.down {
		--rule-angle: 180deg;
		width: 1px;
		height: var(--chrome-control-height);
		margin: 0 var(--chrome-rule-gap);
	}
</style>
