<!--
	@component The lab's plan inspector: the `SpellPlan` the loaded preset
	resolves to, in the same text form the plan goldens commit, plus the engine
	switch the cutover will flip.

	The plan does not drive anything yet — the field still renders — so this panel
	is how a ruling change is seen before phase 3 exists to play it.
-->
<script lang="ts">
	import { planText } from '$lib/compiler/plan/planText.js';
	import type { SpellPlan } from '$lib/types.js';

	let { plan }: { plan: SpellPlan } = $props();

	const text = $derived(planText(plan));

	/** The `cast` engine lands in phase 3; the switch point exists from here on. */
	let engine = $state<'field' | 'cast'>('field');
</script>

<details class="diagnostic-block plan-panel" open>
	<summary>Resolved Plan</summary>

	<fieldset class="plan-engine">
		<legend>Engine</legend>
		<label>
			<input
				type="radio"
				name="engine"
				value="field"
				bind:group={engine}
				data-testid="lab-engine-field"
			/>
			<span>field</span>
		</label>
		<label class="plan-engine-pending">
			<input type="radio" name="engine" value="cast" disabled data-testid="lab-engine-cast" />
			<span>cast <small>(phase 3)</small></span>
		</label>
	</fieldset>

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

	.plan-engine {
		display: flex;
		gap: 14px;
		align-items: center;
		margin: 0 0 8px;
		border: 0;
		padding: 0;
	}

	.plan-engine legend {
		float: left;
		margin-right: 10px;
		color: var(--muted-ink);
		font-size: 12px;
	}

	.plan-engine label {
		display: flex;
		gap: 5px;
		align-items: center;
		color: var(--muted-ink);
		font-size: 12px;
	}

	.plan-engine-pending {
		opacity: 0.55;
	}

	.plan-text {
		max-height: 320px;
	}
</style>
