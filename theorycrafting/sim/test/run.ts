/**
 * Test runner. `npm test` from sim/, or `bash ci.sh test`.
 *   --only=<substr>   run only presets whose name contains the substring
 *   --probe=x,y,z     print u(X) per selected preset instead of running checks
 * Every run renders test/out/NN-<name>.png per preset (top + side view) for
 * visual verification; numeric checks live in checks.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSeal } from '../src/nozzle';
import { SPELLS } from '../src/spells';
import { CHECKS } from './checks';
import { f, makeCtx, trace, traceAmbient, traceVesselPopulation } from './harness';
import { renderPreset } from './render';

let only: string | null = null;
let probe: [number, number, number] | null = null;
for (const a of process.argv.slice(2)) {
	if (a.startsWith('--only=')) only = a.slice(7).toLowerCase();
	else if (a.startsWith('--probe=')) {
		const p = a.slice(8).split(',').map(Number);
		if (p.length !== 3 || p.some(Number.isNaN)) {
			console.error(`bad --probe value: ${a}`);
			process.exit(2);
		}
		probe = p as [number, number, number];
	} else {
		console.error(`unknown arg ${a} (use --only=<substr> or --probe=x,y,z)`);
		process.exit(2);
	}
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
mkdirSync(outDir, { recursive: true });

let failedPresets = 0;
let checkCount = 0;

// stale-name guard: every check must point at a real preset
for (const key of Object.keys(CHECKS)) {
	if (!SPELLS.some((s) => s.name === key)) {
		console.error(`✗ check "${key}" matches no preset in spells.ts`);
		failedPresets++;
	}
}

SPELLS.forEach((seal, i) => {
	if (only && !seal.name.toLowerCase().includes(only)) return;
	const n = compileSeal(seal);

	if (probe) {
		const ctx = makeCtx(n, []);
		const u = ctx.u(...probe);
		console.log(
			`${seal.name.padEnd(42)} u(${probe.join(',')}) = (${f(u.x)}, ${f(u.y)}, ${f(u.z)})`
		);
		return;
	}

	const traces = trace(n, 500, i + 1);
	// the ambient medium only shows on seals that address it — old presets keep
	// their exact snapshots. Vessel seals need the real population (§9: pour,
	// shell and pooling are population effects single paths can't see).
	const ambient = n.orb
		? traceVesselPopulation(n, !!seal.pour, 30, i + 101)
		: n.pull
			? traceAmbient(n, 350, i + 101)
			: [];
	const slug = seal.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
	writeFileSync(
		join(outDir, `${String(i).padStart(2, '0')}-${slug}.png`),
		renderPreset(seal, n, traces, ambient)
	);

	const check = CHECKS[seal.name];
	if (!check) {
		console.log(`  · ${seal.name}  (no checks — png only)`);
		return;
	}
	const ctx = makeCtx(n, traces);
	check(ctx);
	checkCount++;
	if (ctx.failures.length === 0) {
		console.log(`  ✓ ${seal.name}`);
	} else {
		failedPresets++;
		console.log(`  ✗ ${seal.name}`);
		for (const msg of ctx.failures) console.log(`      ${msg}`);
	}
});

if (!probe) {
	console.log(`\n${checkCount} presets checked, ${failedPresets} failed · snapshots in ${outDir}`);
}
process.exit(failedPresets > 0 ? 1 : 0);
