<!--
	@component The lab's plan inspector: the `SpellPlan` the loaded preset
	resolves to, in the same text form the plan goldens commit, plus the engine
	switch the cutover will flip.

	`field` renders the shipping effect, `cast` plays the plan through the
	redesign's score, sim and painter. The switch is how the same ruling is seen
	under both engines before phase 5 deletes the older one.
-->
<script lang="ts">
	import { planText } from '$lib/compiler/plan/planText.js';
	import type { SpellPlan } from '$lib/types.js';
	import { LAB_ENGINES, type LabEngine } from './lab-engines.js';

	let {
		plan,
		engine,
		onEngine
	}: { plan: SpellPlan; engine: LabEngine; onEngine: (engine: LabEngine) => void } = $props();

	const text = $derived(planText(plan));
</script>

<details class="diagnostic-block plan-panel" open>
	<summary>Resolved Plan</summary>

	<fieldset class="plan-engine">
		<legend>Engine</legend>
		{#each LAB_ENGINES as option (option)}
			<label>
				<input
					type="radio"
					name="engine"
					value={option}
					checked={engine === option}
					onchange={() => onEngine(option)}
					data-testid="lab-engine-{option}"
				/>
				<span>{option}</span>
			</label>
		{/each}
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

	.plan-text {
		max-height: 320px;
	}
</style>
