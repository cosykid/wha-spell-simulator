<script lang="ts">
	import { writeJson } from '$lib/debug/debugOverlay.js';

	type DiagnosticKey = 'parser' | 'ml' | 'ast' | 'ir';

	interface Diagnostics {
		parser: unknown;
		ml: unknown;
		ast: unknown;
		ir: unknown;
	}

	interface Props {
		diagnostics: Diagnostics;
	}

	let { diagnostics }: Props = $props();

	// The parser payload carries a plain-language reading of the parse alongside
	// its raw fields. It is narrowed here and split back out below so the JSON
	// tree and the copy button stay pure parser output.
	let parserPayload = $derived(diagnostics.parser as { summary?: string } | null | undefined);
	let parserSummary = $derived(parserPayload?.summary ?? '');
	let parserJson = $derived.by(() => {
		if (!parserPayload) {
			return parserPayload;
		}
		const { summary: _summary, ...rest } = parserPayload;
		return rest;
	});

	let activeTab = $state<DiagnosticKey>('parser');
	let copyLabels = $state<Record<DiagnosticKey, string>>({
		parser: 'Copy',
		ml: 'Copy',
		ast: 'Copy',
		ir: 'Copy'
	});

	let parserPre = $state<HTMLPreElement | null>(null);
	let mlPre = $state<HTMLPreElement | null>(null);
	let astPre = $state<HTMLPreElement | null>(null);
	let irPre = $state<HTMLPreElement | null>(null);

	function flashCopyLabel(key: DiagnosticKey, label: string) {
		copyLabels[key] = label;
		setTimeout(() => {
			copyLabels[key] = 'Copy';
		}, 900);
	}

	// Reuse the existing collapsible JSON-tree renderer, driving it imperatively
	// whenever the diagnostic state changes. writeJson also stashes the raw JSON
	// on the element's dataset for the copy button.
	$effect(() => {
		if (parserPre) {
			writeJson(parserPre, parserJson);
		}
		if (mlPre) {
			writeJson(mlPre, diagnostics.ml);
		}
		if (astPre) {
			writeJson(astPre, diagnostics.ast);
		}
		if (irPre) {
			writeJson(irPre, diagnostics.ir);
		}
	});

	async function copy(key: DiagnosticKey, panel: HTMLPreElement | null) {
		const text = panel?.dataset.rawJson ?? panel?.textContent ?? '';
		if (!text.trim() || !panel) {
			return;
		}

		try {
			await navigator.clipboard.writeText(text);
			flashCopyLabel(key, 'Copied');
		} catch {
			flashCopyLabel(key, 'Copy failed');
		}
	}
</script>

<section class="diagnostics-panel" id="diagnosticsPanel">
	<div class="diagnostics-tabs">
		<button
			type="button"
			class="diagnostic-tab-button"
			class:active={activeTab === 'parser'}
			onclick={() => (activeTab = 'parser')}>Parser</button
		>
		<button
			type="button"
			class="diagnostic-tab-button"
			class:active={activeTab === 'ml'}
			onclick={() => (activeTab = 'ml')}>ML</button
		>
		<button
			type="button"
			class="diagnostic-tab-button"
			class:active={activeTab === 'ast'}
			onclick={() => (activeTab = 'ast')}>AST</button
		>
		<button
			type="button"
			class="diagnostic-tab-button"
			class:active={activeTab === 'ir'}
			onclick={() => (activeTab = 'ir')}>IR</button
		>
	</div>

	<div class="diagnostic-panel-shell" hidden={activeTab !== 'parser'}>
		{#if parserSummary}
			<p class="panel-description" data-testid="parser-summary">{parserSummary}</p>
		{/if}
		<p class="panel-description">
			Parser shows the raw drawing analysis: cleaned strokes, ring detection, stroke classification,
			symbol candidates, and recognition scores.
		</p>
		<div class="diagnostic-viewer-shell">
			<button
				type="button"
				class="diagnostic-copy-button"
				aria-label="Copy Parser JSON"
				onclick={() => copy('parser', parserPre)}
			>
				{copyLabels.parser}
			</button>
			<pre bind:this={parserPre} class="diagnostic-output"></pre>
		</div>
	</div>

	<div class="diagnostic-panel-shell" hidden={activeTab !== 'ml'}>
		<p class="panel-description">
			ML shows the hybrid recognizer state: whether the ONNX model loaded, what template recognition
			chose, and whether the ML result was accepted.
		</p>
		<div class="diagnostic-viewer-shell">
			<button
				type="button"
				class="diagnostic-copy-button"
				aria-label="Copy ML JSON"
				onclick={() => copy('ml', mlPre)}
			>
				{copyLabels.ml}
			</button>
			<pre bind:this={mlPre} class="diagnostic-output"></pre>
		</div>
	</div>

	<div class="diagnostic-panel-shell" hidden={activeTab !== 'ast'}>
		<p class="panel-description">
			AST (Abstract Syntax Tree) is the parsed glyph structure, similar to programming-language
			ASTs: ring, candidates, primary sigil, signs, unknown marks, and parser warnings.
		</p>
		<div class="diagnostic-viewer-shell">
			<button
				type="button"
				class="diagnostic-copy-button"
				aria-label="Copy AST JSON"
				onclick={() => copy('ast', astPre)}
			>
				{copyLabels.ast}
			</button>
			<pre bind:this={astPre} class="diagnostic-output"></pre>
		</div>
	</div>

	<div class="diagnostic-panel-shell" hidden={activeTab !== 'ir'}>
		<p class="panel-description">
			IR (Intermediate Representation) is the compiled spell behavior used after parsing: validity,
			active or prepared state, element, direction, strength, quality, stability, and warnings.
		</p>
		<div class="diagnostic-viewer-shell">
			<button
				type="button"
				class="diagnostic-copy-button"
				aria-label="Copy IR JSON"
				onclick={() => copy('ir', irPre)}
			>
				{copyLabels.ir}
			</button>
			<pre bind:this={irPre} class="diagnostic-output"></pre>
		</div>
	</div>
</section>

<style>
	.diagnostic-copy-button {
		position: absolute;
		top: 7px;
		right: 21px;
		z-index: 1;
		min-height: 28px;
		padding: 0 9px;
		border-radius: 6px;
		background: rgba(255, 242, 197, 0.92);
		color: var(--muted-ink);
		font-size: 12px;
	}

	.diagnostic-panel-shell {
		min-height: 0;
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
	}

	.diagnostic-panel-shell[hidden] {
		display: none;
	}

	.diagnostic-viewer-shell {
		position: relative;
		min-height: 0;
		flex: 1 1 auto;
		display: flex;
	}

	.diagnostic-viewer-shell .diagnostic-output {
		flex: 1 1 auto;
		min-height: 0;
	}
</style>
