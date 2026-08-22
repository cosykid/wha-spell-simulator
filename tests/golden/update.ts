/**
 * @file Regenerates the committed baselines the pure-Node golden tiers compare
 * against: cast PNGs and plan text. Run it only when a plan, score, sim or
 * harness change is intended, and read the resulting diff before committing.
 *
 *   npm run test:golden:update
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CAST_DIR, LAB_PRESETS, renderPresetCast } from './casts.js';
import { PLAN_DIR, planFileName, renderPresetPlan } from './plans.js';

/** A renamed preset would otherwise leave a baseline nothing compares against. */
function pruneStale(directory: string, extension: string, written: Set<string>): number {
	const stale = readdirSync(directory).filter(
		(name) => name.endsWith(extension) && !written.has(name)
	);
	for (const name of stale) {
		rmSync(join(directory, name));
	}
	return stale.length;
}

mkdirSync(CAST_DIR, { recursive: true });
mkdirSync(PLAN_DIR, { recursive: true });

const casts = new Set<string>();
const plans = new Set<string>();
for (const preset of LAB_PRESETS) {
	for (const frame of renderPresetCast(preset)) {
		writeFileSync(join(CAST_DIR, frame.fileName), frame.png);
		casts.add(frame.fileName);
	}
	const planName = planFileName(preset.id);
	writeFileSync(join(PLAN_DIR, planName), renderPresetPlan(preset));
	plans.add(planName);
}

const stale = pruneStale(CAST_DIR, '.png', casts) + pruneStale(PLAN_DIR, '.txt', plans);

console.log(
	`wrote ${casts.size} cast and ${plans.size} plan baselines for ${LAB_PRESETS.length} presets` +
		(stale ? `, removed ${stale} stale` : '')
);
