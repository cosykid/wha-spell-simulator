<script lang="ts">
  import { writeJson } from "$lib/debug/debugOverlay.js";

  type DiagnosticKey = "parser" | "ast" | "ir";

  interface Diagnostics {
    parser: unknown;
    ast: unknown;
    ir: unknown;
  }

  interface Props {
    diagnostics: Diagnostics;
  }

  let { diagnostics }: Props = $props();

  let activeTab = $state<DiagnosticKey>("parser");
  let copyLabels = $state<Record<DiagnosticKey, string>>({ parser: "Copy", ast: "Copy", ir: "Copy" });

  let parserPre = $state<HTMLPreElement | null>(null);
  let astPre = $state<HTMLPreElement | null>(null);
  let irPre = $state<HTMLPreElement | null>(null);

  // Reuse the existing collapsible JSON-tree renderer, driving it imperatively
  // whenever the diagnostic state changes. writeJson also stashes the raw JSON
  // on the element's dataset for the copy button.
  $effect(() => {
    if (parserPre) {
      writeJson(parserPre, diagnostics.parser);
    }
    if (astPre) {
      writeJson(astPre, diagnostics.ast);
    }
    if (irPre) {
      writeJson(irPre, diagnostics.ir);
    }
  });

  async function copy(key: DiagnosticKey, panel: HTMLPreElement | null) {
    const text = panel?.dataset.rawJson ?? panel?.textContent ?? "";
    if (!text.trim() || !panel) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      copyLabels[key] = "Copied";
      setTimeout(() => {
        copyLabels[key] = "Copy";
      }, 900);
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(panel);
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand("copy");
      selection?.removeAllRanges();
    }
  }
</script>

<section class="diagnostics-panel" id="diagnosticsPanel">
  <div class="diagnostics-tabs">
    <button type="button" class="diagnostic-tab-button" class:active={activeTab === "parser"} onclick={() => (activeTab = "parser")}>Parser</button>
    <button type="button" class="diagnostic-tab-button" class:active={activeTab === "ast"} onclick={() => (activeTab = "ast")}>AST</button>
    <button type="button" class="diagnostic-tab-button" class:active={activeTab === "ir"} onclick={() => (activeTab = "ir")}>IR</button>
  </div>

  <div class="diagnostic-panel-shell" hidden={activeTab !== "parser"}>
    <p class="panel-description">
      Parser shows the raw drawing analysis: cleaned strokes, ring detection, stroke classification, symbol candidates, and recognition scores.
    </p>
    <div class="diagnostic-viewer-shell">
      <button type="button" class="diagnostic-copy-button" aria-label="Copy Parser JSON" onclick={() => copy("parser", parserPre)}>
        {copyLabels.parser}
      </button>
      <pre bind:this={parserPre} class="diagnostic-output"></pre>
    </div>
  </div>

  <div class="diagnostic-panel-shell" hidden={activeTab !== "ast"}>
    <p class="panel-description">
      AST (Abstract Syntax Tree) is the parsed glyph structure, similar to programming-language ASTs: ring, candidates, primary sigil, signs, unknown marks, and parser warnings.
    </p>
    <div class="diagnostic-viewer-shell">
      <button type="button" class="diagnostic-copy-button" aria-label="Copy AST JSON" onclick={() => copy("ast", astPre)}>
        {copyLabels.ast}
      </button>
      <pre bind:this={astPre} class="diagnostic-output"></pre>
    </div>
  </div>

  <div class="diagnostic-panel-shell" hidden={activeTab !== "ir"}>
    <p class="panel-description">
      IR (Intermediate Representation) is the compiled spell behavior used after parsing: validity, active or prepared state, element, direction, strength, quality, stability, and warnings.
    </p>
    <div class="diagnostic-viewer-shell">
      <button type="button" class="diagnostic-copy-button" aria-label="Copy IR JSON" onclick={() => copy("ir", irPre)}>
        {copyLabels.ir}
      </button>
      <pre bind:this={irPre} class="diagnostic-output"></pre>
    </div>
  </div>
</section>
