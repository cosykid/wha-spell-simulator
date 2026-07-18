<!--
	@file Dev harness for iterating on the 3D field effect look (fire tornado,
	etc.) without the recognition pipeline. Drives FieldEffect3D in a real-time
	rAF loop with a hand-built SimSeal, and can snapshot the frame at a chosen
	elapsed time to disk. Exposes window.__fireLab for automated capture.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { FieldEffect3D } from '$lib/sim3d/renderer/fieldEffect3d.js';
	import { ELEMENT_COLOR } from '$lib/sim3d/core/model.js';
	import type { SimSeal, SimSign, SimElement } from '$lib/sim3d/core/model.js';
	import type { SpellIR } from '$lib/types.js';
	import type { RingInfo } from '$lib/types/rings.js';

	const TILT_MS = 980;
	const W = 720;
	const H = 960;
	const RING: RingInfo = { found: true, center: { x: W / 2, y: H * 0.52 }, radius: 235 };

	let canvas: HTMLCanvasElement;
	let effect: FieldEffect3D | null = null;
	let runId = 0;

	// --- seal builders --------------------------------------------------------
	function inwardPull(angleDeg: number, r: number, len: number): SimSign {
		const a = (angleDeg * Math.PI) / 180;
		const pos = { x: r * Math.cos(a), y: r * Math.sin(a) };
		const m = Math.hypot(pos.x, pos.y) || 1;
		return { kind: 'pull', pos, dir: { x: -pos.x / m, y: -pos.y / m }, len };
	}

	function fireTornadoSeal(): SimSeal {
		// three inward pulls gather the fire; ELEMENT_VORTEX[fire] spins it up
		return {
			element: 'fire',
			signs: [inwardPull(90, 0.8, 1.0), inwardPull(210, 0.8, 1.0), inwardPull(330, 0.8, 1.0)]
		};
	}

	function spellIR(seal: SimSeal, signature: string): SpellIR {
		return {
			valid: true,
			active: true,
			activatedAt: 0,
			duration: 30,
			quality: 0.9,
			strength: 0.85,
			signature,
			seal
		} as unknown as SpellIR;
	}

	async function post(path: string, dataUrl: string): Promise<unknown> {
		const res = await fetch('/tools/fire-lab/capture', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ path, dataUrl })
		});
		return res.json();
	}

	// Deterministic capture: step the effect's own clock at 60fps through one
	// continuous run (fresh signature resets the populations), grabbing the
	// frame at each checkpoint second, then write them all to disk. Synchronous
	// stepping keeps captures reproducible and runs regardless of tab focus.
	async function captureSequence(
		dir: string,
		times: number[],
		seal: SimSeal = fireTornadoSeal()
	): Promise<unknown[]> {
		if (!effect) return [];
		const ir = spellIR(seal, `firelab-${++runId}`);
		const stepMs = 1000 / 60;
		const checkpoints = [...times].sort((a, b) => a - b);
		const grabbed: { path: string; url: string }[] = [];
		const maxMs = checkpoints[checkpoints.length - 1] * 1000;
		let next = 0;
		for (let ms = 0; ms <= maxMs + stepMs; ms += stepMs) {
			effect.render(ir, RING, TILT_MS + ms, 1);
			while (next < checkpoints.length && ms >= checkpoints[next] * 1000) {
				grabbed.push({
					path: `${dir}/fire-${checkpoints[next]}s.png`,
					url: canvas.toDataURL('image/png')
				});
				next++;
			}
		}
		const out: unknown[] = [];
		for (const g of grabbed) out.push(await post(g.path, g.url));
		return out;
	}

	// prime a visible frame so the page shows the tornado without waiting
	function restart() {
		if (!effect) return;
		const ir = spellIR(fireTornadoSeal(), `firelab-${++runId}`);
		for (let ms = 0; ms <= 4000; ms += 1000 / 60) effect.render(ir, RING, TILT_MS + ms, 1);
	}

	onMount(() => {
		canvas.width = W;
		canvas.height = H;
		effect = new FieldEffect3D(canvas, TILT_MS);
		restart();
		(window as unknown as Record<string, unknown>).__fireLab = {
			captureSequence,
			snapshot: () => canvas.toDataURL('image/png'),
			ELEMENT_COLOR,
			setSeal: (element: SimElement, signs: SimSign[]) =>
				captureSequence('/tmp', [5], { element, signs })
		};
		return () => effect?.dispose();
	});
</script>

<div class="lab">
	<h1>Fire Lab</h1>
	<p>
		Real-time 3D field-effect harness. <code>window.__fireLab.captureSequence(dir, [3.5, 5])</code>
	</p>
	<div class="controls">
		<button onclick={() => restart()}>Restart</button>
	</div>
	<div class="stage">
		<canvas id="fieldCanvas3d" bind:this={canvas}></canvas>
	</div>
</div>

<style>
	.lab {
		padding: 1rem;
		font-family: system-ui, sans-serif;
	}
	.stage {
		display: inline-block;
		background: #f4ecd8;
		border: 1px solid #caa;
	}
	canvas {
		display: block;
		width: 720px;
		height: 960px;
	}
	.controls {
		margin: 0.5rem 0;
		display: flex;
		gap: 0.5rem;
	}
</style>
