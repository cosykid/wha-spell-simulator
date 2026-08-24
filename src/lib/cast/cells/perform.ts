/**
 * @file The two things every cell does the same way: falling silent, and saying
 * what it reached.
 *
 * Silence is a law rather than a convenience. R-01 gives the charge beat to the
 * ambient medium alone, so a cell that manifests anything is _absent_ there, not
 * merely dark: it asks its channel for no parcels and lays no marks, which also
 * keeps every accumulator at zero until the strike.
 */

import { blankShape } from '../hybrid/flow.js';
import type { Channel } from '../hybrid/substrate.js';
import type { CellFrame, CellReport } from './cell.js';
import type { Vec3 } from '../../types.js';

/**
 * Whether this frame is the charge, and if so, hushes the channel. Every cell
 * but the medium's opens with `if (hushed(frame, channel)) return;`.
 */
export function hushed(frame: CellFrame, channel: Channel): boolean {
	if (frame.beat !== 'charge') {
		return false;
	}
	channel.shape.emission = 0;
	channel.shape.punch = 0;
	channel.arc.rate = 0;
	channel.arc.punch = 0;
	channel.perform(frame.tMs, frame.dtMs / 1000);
	return true;
}

const reading = { x: 0, y: 0, z: 0, reach: 0, speed: 0 };

/**
 * What a cell reached: how loudly it is painting, its channel's own
 * measurements, the tip it declares, and whatever named scalars its archetype
 * publishes.
 *
 * `ink` is declared rather than derived because emission and presence are not
 * the same question. A burst has stopped emitting well before its front has
 * stopped spreading, and R-01's silence is a claim about presence.
 */
export function reportOf(
	channel: Channel,
	ink: number,
	from: Vec3,
	tip: Vec3,
	detail: Record<string, number>
): CellReport {
	channel.read(reading);
	return {
		ink,
		at: { x: reading.x, y: reading.y, z: reading.z },
		from,
		tip,
		marks: channel.live,
		born: channel.born,
		detail: { ...detail, reach: reading.reach, speed: reading.speed }
	};
}

/** The shape a cell starts from, so a cell only writes what it means. */
export { blankShape };
