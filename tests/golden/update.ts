/**
 * @file Regenerates the committed baselines the pure-Node golden tiers compare
 * against: motion PNGs and plan text. Run it only when a field, plan or harness
 * change is intended, and read the resulting diff before committing.
 *
 *   npm run test:golden:update
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_DIR, FIELD_PRESETS, renderPresetFrames } from './frames.js';
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

mkdirSync(BASELINE_DIR, { recursive: true });
mkdirSync(PLAN_DIR, { recursive: true });

const frames = new Set<string>();
const plans = new Set<string>();
for (const preset of FIELD_PRESETS) {
	for (const frame of renderPresetFrames(preset)) {
		writeFileSync(join(BASELINE_DIR, frame.fileName), frame.png);
		frames.add(frame.fileName);
	}
	const planName = planFileName(preset.id);
	writeFileSync(join(PLAN_DIR, planName), renderPresetPlan(preset));
	plans.add(planName);
}

const staleFrames = pruneStale(BASELINE_DIR, '.png', frames);
const stalePlans = pruneStale(PLAN_DIR, '.txt', plans);

console.log(
	`wrote ${frames.size} motion baselines and ${plans.size} plan baselines for ` +
		`${FIELD_PRESETS.length} presets` +
		(staleFrames + stalePlans ? `, removed ${staleFrames + stalePlans} stale` : '')
);
