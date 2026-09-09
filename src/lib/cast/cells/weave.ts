/** @file R-22's demonstration: one solid sample is softened, stretched, then left in shape. */
import { shapeOf } from './arc.js';
import { hushed, reportOf } from './perform.js';
import { ribbonPoint, type RibbonFlow } from '../volume/ribbon.js';
import { smooth01 } from '../volume/noise.js';
import { createFlowWeaveCell } from './flowWeave.js';
import type { Cell, CellConstraint, CellContext } from './cell.js';
import type { Track } from '../../types.js';

export function createWeaveCell(track: Track<'weave'>, ctx: CellContext): Cell {
	if (track.params.current) return createFlowWeaveCell(track, ctx);
	const { channel } = ctx;
	const { params } = track;
	const flow = channel.flow;
	const ribbon: RibbonFlow = {
		length: params.length,
		width: params.width,
		stretch: 0,
		materialCount: params.materialCount
	};
	const root = { x: 0, y: 0, z: 0 };
	const tip = { ...root };
	let held: CellConstraint | null = null;
	let elapsedMs = 0;
	let ink = 0;
	flow.spawn = 'ribbon';
	flow.ribbon = ribbon;
	flow.pinchMul = 0;
	flow.weightMul = 0;
	flow.turbMul = 0;
	flow.gustMul = 0;
	flow.footprint = params.width;
	flow.burn = 0;

	return {
		update(frame) {
			if (hushed(frame, channel)) return;
			elapsedMs += frame.dtMs;
			// Pause on the contact sample before the illustrative pull. No sign
			// direction or extra ribbon count is inferred from the drawing.
			ribbon.stretch = smooth01((elapsedMs - 250) / params.stretchMs);
			ribbon.length = params.length;
			if (held && held.closed > 0) {
				const cap = Math.max(0.75, (held.at.z + held.radius) / 0.78);
				ribbon.length +=
					(Math.min(ribbon.length, cap) - ribbon.length) * Math.min(1, held.closed / 0.3);
			}
			flow.reach = params.length * 1.5;
			flow.speed = 0;
			flow.emission = shapeOf(frame.emission, track.emission.gain);
			flow.punch = 0;
			// The one-shot preview fades at its end. The solid does not unravel,
			// evaporate or acquire a canonically unestablished hardening trigger.
			ink = frame.beat === 'afterglow' ? 1 - frame.beatT : 1;
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
					length: 0.75 + (ribbon.length - 0.75) * ribbon.stretch,
					width: ribbon.width,
					stretch: ribbon.stretch,
					targets: 1
				}
			);
		},
		dispose() {
			channel.reset();
		}
	};
}
