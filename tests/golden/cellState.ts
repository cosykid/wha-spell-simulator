/**
 * @file What a cast baseline says: each cell's own state at one moment, as text
 * a reviewer can read.
 *
 * The hybrid rework moved the mass into a GPU texture no assertion can reach, so
 * this tier reads what put it there instead: what each cell reported, the flow
 * field it wrote, and the ceiling it publishes. All three are plain CPU numbers,
 * which is the whole reason the layer is arranged this way — the choreography is
 * the testable part, and pixel truth belongs to the Playwright look tier, which
 * has a GPU.
 *
 * A diff therefore says _what changed about the performance_ ("the column stands
 * 0.3 units shorter at 1600ms", "the medium lays forty fewer marks") rather than
 * "these pixels moved".
 *
 * Everything printed is rounded to fixed decimals, so float dust in the last
 * bits cannot rewrite a baseline.
 *
 * @example
 * const text = frameText(cast, 1600);
 */

import { beatAt, progressThrough } from '../../src/lib/cast/score/beats.js';
import { evaluateEnvelope } from '../../src/lib/cast/score/envelopes.js';
import { flowAccel, type FlowSample } from '../../src/lib/cast/hybrid/flow.js';
import type { HeadlessCast } from './cellHarness.js';
import type { Performer } from '../../src/lib/cast/stage/frames.js';
import type { Channel } from '../../src/lib/cast/hybrid/substrate.js';

/** Decimals kept on every number in a baseline. */
const PLACES = 4;

/** One indent level. Two spaces. */
const INDENT = '  ';

/**
 * Seal-space points every channel's field is measured at: over the seal, out on
 * the rim, low and to the near side, and high and off-axis. Four numbers a cell
 * cannot fake, because they are the field it actually wrote.
 */
const FIELD_PROBES: readonly (readonly [number, number, number])[] = [
	[0, 0, 0.3],
	[0.7, 0, 0.15],
	[0, -0.5, 0.9],
	[0.5, 0.5, 1.5]
];

function fixed(value: number, places = PLACES): string {
	if (!Number.isFinite(value)) {
		return String(value);
	}
	// `-0.00004` rounds to `-0.0000`, which would differ from `0.0000` in a byte
	// comparison while meaning the same thing.
	const rounded = Number(value.toFixed(places));
	return (rounded === 0 ? 0 : rounded).toFixed(places);
}

function triple(x: number, y: number, z: number): string {
	return `(${fixed(x)}, ${fixed(y)}, ${fixed(z)})`;
}

/** One track's header: what the score asked of it at this moment. */
function trackText(cast: HeadlessCast, performer: Performer, atMs: number): string {
	const { track } = performer;
	const emission = evaluateEnvelope(track.emission, cast.score.beats, atMs);
	const drive = evaluateEnvelope(track.drive, cast.score.beats, atMs);
	const captured = track.capturedBy ? ` capturedBy=${track.capturedBy}` : '';
	return (
		`track ${track.id} kind=${track.kind} look=${track.look} population=${track.population}` +
		`${captured} emission=${fixed(emission)} drive=${fixed(drive)}`
	);
}

const sample: FlowSample = { x: 0, y: 0, z: 0, outward: 0 };

/** The flow this channel wrote, measured where a cell cannot choose the point. */
function fieldText(channel: Channel, atMs: number): string[] {
	return FIELD_PROBES.map(([x, y, z]) => {
		// Read at mid-life, which is where most of a channel's population sits.
		flowAccel(sample, channel.shape, x, y, z, atMs / 1000, 0.5);
		return `${INDENT}${INDENT}at ${triple(x, y, z)} -> ${triple(sample.x, sample.y, sample.z)}`;
	});
}

/** The ceiling this cell publishes to whatever it holds, if it holds anything. */
function ceilingText(performer: Performer): string {
	const ceiling = performer.cell.constraint?.();
	if (!ceiling) {
		return 'ceiling none';
	}
	const { at, radius, closed } = ceiling;
	return `ceiling at=${triple(at.x, at.y, at.z)} radius=${fixed(radius)} closed=${fixed(closed)}`;
}

/** Everything one cell reached, indented under its track. */
function cellText(performer: Performer, channel: Channel, atMs: number): string[] {
	const report = performer.cell.report();
	const detail = Object.keys(report.detail)
		.sort()
		.map((name) => `${name}=${fixed(report.detail[name])}`)
		.join(' ');
	return [
		`${INDENT}ink=${fixed(report.ink)} marks=${report.marks} born=${report.born} parcels=${channel.parcels}`,
		`${INDENT}at=${triple(report.at.x, report.at.y, report.at.z)} tip=${triple(report.tip.x, report.tip.y, report.tip.z)}`,
		`${INDENT}detail ${detail}`,
		`${INDENT}field`,
		...fieldText(channel, atMs),
		`${INDENT}${ceilingText(performer)}`
	];
}

/**
 * The whole cast at `atMs`, assuming it has already been stepped there. Advancing
 * is the caller's job because a cast is stepped through its timestamps in order,
 * which is the cheap way to render a whole preset.
 */
export function frameText(cast: HeadlessCast, atMs: number): string {
	const beat = beatAt(cast.score.beats, atMs);
	const lines = [
		`@${String(atMs).padStart(4, '0')}ms beat=${beat} beatT=${fixed(progressThrough(cast.score.beats[beat], atMs))}`
	];
	cast.performers.forEach((performer, index) => {
		lines.push(trackText(cast, performer, atMs));
		lines.push(...cellText(performer, cast.substrate.channels[index], atMs));
	});
	return lines.join('\n');
}
