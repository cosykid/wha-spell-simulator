/** @file R-23's creative currents: gather, unfurl, flow, release to the medium, fade. */
import { shapeAt, shapeOf, type BeatShape } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { smooth01 } from '../volume/noise.js';
import { ribbonPoint, type RibbonFlow } from '../volume/ribbon.js';
import { mulberry32 } from '../rng.js';
import type { Cell, CellConstraint, CellContext } from './cell.js';
import type { Track } from '../../types.js';

const ATTACHMENT: BeatShape = {
	charge: () => 0,
	strike: () => 1,
	body: () => 1,
	release: (t) => 1 - smooth01(t * 2),
	afterglow: () => 0
};

export function createFlowWeaveCell(track: Track<'weave'>, ctx: CellContext): Cell {
	const { channel } = ctx;
	const { params } = track;
	const current = {
		...params.current!,
		phase: mulberry32(ctx.seed)() * Math.PI * 2,
		open: 0,
		attachment: 0
	};
	const ribbon: RibbonFlow = {
		length: params.length,
		width: params.width,
		stretch: 1,
		materialCount: params.materialCount,
		current
	};
	const flow = channel.flow;
	const root = { x: 0, y: 0, z: 0 },
		tip = { ...root };
	let elapsedMs = 0,
		ink = 0;
	let held: CellConstraint | null = null;
	flow.spawn = 'ribbon';
	flow.ribbon = ribbon;
	flow.pinchMul = 0;
	flow.footprint = params.width;
	flow.reach = params.length * 1.5;
	flow.burn = 0;

	return {
		update(frame) {
			if (hushed(frame, channel)) return;
			elapsedMs += frame.dtMs;
			current.phase += (current.speed * frame.dtMs) / 1000;
			current.open = 0.12 + 0.88 * smooth01(elapsedMs / params.stretchMs);
			current.attachment = shapeAt(ATTACHMENT, frame);
			current.height = params.current!.height;
			if (held && held.closed > 0) {
				const cap = Math.max(0.35, held.at.z + held.radius - 0.3);
				current.height +=
					(Math.min(current.height, cap) - current.height) * Math.min(1, held.closed / 0.3);
			}
			const released = 1 - current.attachment;
			flow.weightMul = released * current.releaseWeight;
			flow.turbMul = released * current.releaseTurbulence;
			flow.gustMul = released * current.releaseTurbulence;
			flow.emission = shapeOf(frame.emission, track.emission.gain);
			flow.drain = frame.beat === 'afterglow' ? frame.beatT : 0;
			ink =
				(1 - released * current.releaseFade) * (frame.beat === 'afterglow' ? 1 - frame.beatT : 1);
			flow.deposit = ink;
			ribbonPoint(ribbon, 0, 0, 0, root);
			ribbonPoint(ribbon, 1, 0, 0, tip);
			channel.perform(frame.tMs);
		},
		bind(constraint) {
			held = constraint;
		},
		report() {
			return reportOf(
				channel,
				ink,
				{ ...root },
				{ ...tip },
				{
					length: params.length * current.open,
					width: params.width,
					phase: current.phase,
					attachment: current.attachment,
					targets: 1
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
