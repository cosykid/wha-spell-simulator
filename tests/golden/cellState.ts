/**
 * @file What a cast baseline says: each cell's own state at one moment, as text
 * a reviewer can read.
 *
 * The volume rework keeps the mass on the CPU — a cast is a tracer cloud the
 * GPU only skins — so this tier reads the choreography directly: what each
 * cell reported, and its channel's population quantized into a digest. The
 * digest's band and ring masses are legible in a diff ("the column's mass
 * moved a height band"), and the grid hash pins the fine distribution a tuning
 * drift cannot dodge. Pixel truth belongs to the Playwright look tier.
 *
 * Everything printed is quantized before it is written, so float dust in the
 * last bits cannot rewrite a baseline.
 *
 * @example
 * const text = frameText(cast, 1600);
 */

import { beatAt, progressThrough } from '../../src/lib/cast/score/beats.js';
import { evaluateEnvelope } from '../../src/lib/cast/score/envelopes.js';
import type { HeadlessCast } from './cellHarness.js';
import type { Performer } from '../../src/lib/cast/stage/frames.js';
import type { VolumeChannel } from '../../src/lib/cast/volume/substrate.js';

/** Decimals kept on every number in a baseline. */
const PLACES = 4;

/** One indent level. Two spaces. */
const INDENT = '  ';

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

/** The population this channel reached, quantized. */
function tracerText(channel: VolumeChannel): string {
	const digest = channel.tracers.digest();
	const bands = digest.bands.map((band) => band.toFixed(1)).join(' ');
	const rings = digest.rings.map((ring) => ring.toFixed(1)).join(' ');
	return `tracers pooled=${digest.pooled} bands=[${bands}] rings=[${rings}] grid=${digest.grid}`;
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
function cellText(performer: Performer, channel: VolumeChannel): string[] {
	const report = performer.cell.report();
	const detail = Object.keys(report.detail)
		.sort()
		.map((name) => `${name}=${fixed(report.detail[name])}`)
		.join(' ');
	return [
		`${INDENT}ink=${fixed(report.ink)} marks=${report.marks} born=${report.born} parcels=${channel.parcels}`,
		`${INDENT}at=${triple(report.at.x, report.at.y, report.at.z)} tip=${triple(report.tip.x, report.tip.y, report.tip.z)}`,
		`${INDENT}detail ${detail}`,
		`${INDENT}${tracerText(channel)}`,
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
		lines.push(...cellText(performer, cast.substrate.channels[index]));
	});
	return lines.join('\n');
}
