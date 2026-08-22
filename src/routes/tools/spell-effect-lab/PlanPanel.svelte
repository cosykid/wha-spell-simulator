<!--
	@component The lab's plan inspector: the `SpellPlan` the loaded preset
	resolves to, in the same text form the plan goldens commit, so what a reviewer
	approves is what the lab shows.
-->
<script lang="ts">
	import { planText } from '$lib/compiler/plan/planText.js';
	import type { SpellPlan } from '$lib/types.js';

	let { plan }: { plan: SpellPlan } = $props();

	const text = $derived(planText(plan));
</script>

<details class="diagnostic-block plan-panel" open>
	<summary>Resolved Plan</summary>
	<pre class="diagnostic-output plan-text" data-testid="lab-plan-text">{text}</pre>
</details>

<style>
	.plan-panel summary {
		margin: 0 0 8px;
		color: var(--ink);
		font-family: 'Cinzel', serif;
		font-size: 15px;
		cursor: pointer;
	}

	.plan-text {
		max-height: 320px;
	}
</style>
