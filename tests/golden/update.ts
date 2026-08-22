/**
 * @file Regenerates the motion tier's committed baselines. Run it only when a
 * field or harness change is intended, and read the resulting image diff before
 * committing.
 *
 *   npm run test:golden:update
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_DIR, FIELD_PRESETS, renderPresetFrames } from './frames.js';

mkdirSync(BASELINE_DIR, { recursive: true });

const written = new Set<string>();
for (const preset of FIELD_PRESETS) {
	for (const frame of renderPresetFrames(preset)) {
		writeFileSync(join(BASELINE_DIR, frame.fileName), frame.png);
		written.add(frame.fileName);
	}
}

// A renamed preset or a dropped timestamp would otherwise leave a baseline
// nothing compares against.
const stale = readdirSync(BASELINE_DIR).filter(
	(name) => name.endsWith('.png') && !written.has(name)
);
for (const name of stale) {
	rmSync(join(BASELINE_DIR, name));
}

console.log(
	`wrote ${written.size} motion baselines for ${FIELD_PRESETS.length} presets` +
		(stale.length ? `, removed ${stale.length} stale` : '')
);
