/*
PaperSimulation - modular single-file paper interaction system
- Attach with `attachPaperSimulation(renderer)` where `renderer` is an instance
  of CanvasRenderer from the project. The renderer exposes `effectRenderer`.
- Deleting this file and the attach calls will remove the feature.

Design notes:
- Read-only: inspects effectRenderer.state.particles each frame to detect hits.
- Paper objects are simple JS objects with position, size (circle), and state flags.
- Keeps all logic contained here and exposes a minimal API for testing.
*/

import type { CanvasRenderer } from '$lib/renderer/canvasRenderer.js';
import type { EffectState } from '$lib/renderer/effects/effectUtils.js';
import { activePortalPlane } from '$lib/renderer/effects/effectUtils.js';
import type { RingInfo } from '$lib/types.js';

type Vec2 = { x: number; y: number };

export interface PaperParams {
	id?: string;
	pos?: Vec2; // screen space
	radius?: number;
	flammability?: number; // 0..1 higher -> easier
	burnRate?: number; // integrity/sec when burning
	dryRate?: number; // wetness/sec
	windDrag?: number; // multiplier
	// vertical offset to spawn the paper above the given pos so it can fall when created
	lift?: number;
}

interface Paper {
	id: string;
	pos: Vec2;
	radius: number;
	flammability: number;
	burnRate: number;
	dryRate: number;
	windDrag: number;
	// dynamic state
	wetness: number; // 0..1
	integrity: number; // 0..1
	burning: boolean;
	burnAge: number;
	crushed: boolean;
	removed: boolean; // destroyed -> ash
	vy: number; // vertical velocity in canvas px/sec
	vx: number; // horizontal velocity in canvas px/sec
	_onChange?: () => void; // optional hook for UI/tests
}

const DEFAULT: Required<PaperParams> = {
	id: 'paper',
	pos: { x: 400, y: 300 },
	radius: 46,
	flammability: 0.9,
	burnRate: 0.33,
	dryRate: 0.04,
	windDrag: 1.0,
	lift: 48
};

// Simple ID counter for papers created without an id
let NEXT_ID = 1;

export function attachPaperSimulation(renderer: CanvasRenderer) {
	// Defensive: if renderer is not what we expect, bail.
	if (!renderer || !('effectRenderer' in renderer)) {
		console.warn('attachPaperSimulation: given renderer missing effectRenderer');
		return null;
	}

	const effectRenderer = (
		renderer as unknown as {
			effectRenderer?: { state: EffectState; render: (...args: unknown[]) => void };
		}
	).effectRenderer!; // defensive access

	// Paper collection
	const papers: Paper[] = [];

	// Simple subscription API so other code can react. This lives internal to the module.
	const listeners: { (p: Paper, ev: string): void }[] = [];

	function emit(p: Paper, ev: string) {
		for (const l of listeners) {
			try {
				l(p, ev);
			} catch (e) {
				console.error('paperSimulation listener error', e);
			}
		}
	}

	// Create a paper with defaults. The `lift` parameter offsets the spawn y so
	// the paper appears slightly above the requested position and can fall.
	function spawn(params: PaperParams = {}) {
		const id = params.id ?? `paper-${NEXT_ID++}`;
		const basePos = params.pos ?? { ...DEFAULT.pos };
		const lift = params.lift ?? DEFAULT.lift;
		const pPos: Vec2 = { x: basePos.x, y: basePos.y - lift };
		const p: Paper = {
			id,
			pos: pPos,
			radius: params.radius ?? DEFAULT.radius,
			flammability: params.flammability ?? DEFAULT.flammability,
			burnRate: params.burnRate ?? DEFAULT.burnRate,
			dryRate: params.dryRate ?? DEFAULT.dryRate,
			windDrag: params.windDrag ?? DEFAULT.windDrag,
			wetness: 0,
			integrity: 1,
			burning: false,
			burnAge: 0,
			crushed: false,
			removed: false,
			vy: 0,
			vx: 0
		};
		p._onChange = () => emit(p, 'change');
		papers.push(p);
		emit(p, 'spawn');
		return p;
	}

	function removePaper(p: Paper) {
		p.removed = true;
		emit(p, 'removed');
	}

	// Public API for tests / debug
	const api: {
		spawn: typeof spawn;
		list: () => Paper[];
		on: (fn: (p: Paper, ev: string) => void) => () => void;
		removeAll?: () => void;
		frame?: (timestamp: number, ring?: RingInfo) => void;
	} = {
		spawn,
		list: () => papers.slice(),
		on: (fn: (p: Paper, ev: string) => void) => {
			listeners.push(fn);
			return () => {
				const i = listeners.indexOf(fn);
				if (i >= 0) listeners.splice(i, 1);
			};
		}
	};

	// Start with no papers by default; host code should call `spawn` when desired.

	// Particle hit helpers -------------------------------------------------

	function pointDist2(a: Vec2, b: Vec2) {
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		return dx * dx + dy * dy;
	}

	function particleHitsPaper(particle: Record<string, unknown>, paper: Paper) {
		// particle: { x, y, vx?, vy?, radius? }
		const pr = Number((particle['radius'] as unknown) ?? 2);
		const x = Number((particle['x'] as unknown) ?? 0);
		const y = Number((particle['y'] as unknown) ?? 0);
		const hit = pointDist2({ x, y }, paper.pos) <= (pr + paper.radius) ** 2;
		return hit;
	}

	// coarse cooldown map so a single paper isn't spam-hit by many particles every frame
	const lastHitMs = new Map<string, number>();

	// Main per-frame update -------------------------------------------------
	let lastFrameMs: number | null = null;

	// physics tuning
	const GRAVITY = 720; // px/sec^2 - strong enough to see falling on a 1000px canvas
	const VERTICAL_DRIFT_SCALE = 0.25; // how much particle vertical velocity feeds into vy

	function frame(timestamp: number, ring?: RingInfo) {
		// timestamp is the rAF timestamp from the host render loop
		const dt = lastFrameMs === null ? 0 : Math.max(0, (timestamp - lastFrameMs) / 1000);
		lastFrameMs = timestamp;

		const state = effectRenderer.state as EffectState | undefined;
		const particles = (state && Array.isArray(state.particles) ? state.particles : []) as Array<
			Record<string, unknown>
		>;

		// Apply particle interactions
		for (const paper of papers) {
			if (paper.removed) continue;

			// natural drying
			paper.wetness = Math.max(0, paper.wetness - paper.dryRate * dt);

			// burning progress hurts integrity
			if (paper.burning) {
				paper.burnAge += dt;
				paper.integrity = Math.max(0, paper.integrity - paper.burnRate * dt);
				if (paper.integrity <= 0) {
					// destroyed -> ash
					removePaper(paper);
					emit(paper, 'ash');
				}
			}

			// simple physics: accumulate a small drift velocity from wind particles
			const drift = { x: 0, y: 0 };

			for (const part of particles) {
				if (!part) continue;
				const p = part as Record<string, unknown>;
				const px = Number((p['x'] as unknown) ?? NaN);
				const py = Number((p['y'] as unknown) ?? NaN);
				if (Number.isNaN(px) || Number.isNaN(py)) continue;
				if (!particleHitsPaper(p, paper)) continue;

				const now = timestamp;
				const key = `${paper.id}:${String((p['type'] as unknown) ?? (p['type'] as unknown) ?? 'p')}:${Math.floor(px)}:${Math.floor(py)}`;
				const last = lastHitMs.get(key) || 0;
				if (now - last < 60) continue; // 60ms cooldown per particle coordinate-ish
				lastHitMs.set(key, now);

				// Decide behaviour by particle "type" if present (effects set any custom fields)
				const kind = String(
					(p['kind'] as unknown) ?? (p['type'] as unknown) ?? (p['type'] as unknown) ?? 'unknown'
				);

				if (kind === 'fire' || kind === 'flame') {
					// try to ignite if not wet
					const wet = paper.wetness;
					const partIntensity = Number(
						(p['intensity'] as unknown) ?? (p['intensity'] as unknown) ?? 1
					);
					const igniteChance = paper.flammability * (1 - wet) * partIntensity;
					if (!paper.burning && Math.random() < igniteChance) {
						// kindle
						paper.burning = true;
						emit(paper, 'ignite');
					}
					// burning makes drift larger
					drift.x += Number((p['vx'] as unknown) ?? (p['vx'] as unknown) ?? 0) * 0.6;
					drift.y += Number((p['vy'] as unknown) ?? (p['vy'] as unknown) ?? 0) * 0.6;
				} else if (kind === 'water' || kind === 'droplet') {
					paper.wetness = Math.min(
						1,
						paper.wetness + Number((p['wet'] as unknown) ?? (p['wet'] as unknown) ?? 0.15)
					);
					emit(paper, 'wet');
					// extinguish if wet enough
					if (paper.burning && paper.wetness >= 0.8) {
						paper.burning = false;
						paper.burnAge = 0;
						emit(paper, 'extinguish');
					}
				} else if (kind === 'wind') {
					// wind has vx/vy
					drift.x +=
						Number((p['vx'] as unknown) ?? (p['vx'] as unknown) ?? 0) *
						Number((p['strength'] as unknown) ?? (p['strength'] as unknown) ?? 1) *
						0.9;
					drift.y +=
						Number((p['vy'] as unknown) ?? (p['vy'] as unknown) ?? 0) *
						Number((p['strength'] as unknown) ?? (p['strength'] as unknown) ?? 1) *
						0.9;
				} else if (kind === 'earth') {
					// earth crush toggles crushed state. Use intensity threshold.
					if (
						!paper.crushed &&
						Number((p['intensity'] as unknown) ?? (p['intensity'] as unknown) ?? 0) >= 0.6
					) {
						paper.crushed = true;
						emit(paper, 'crush');
					}
					if (Boolean((p['reversed'] as unknown) ?? (p['reversed'] as unknown)) && paper.crushed) {
						paper.crushed = false;
						emit(paper, 'restore');
					}
				} else {
					// unknown particle types still impart small drift
					drift.x += Number((p['vx'] as unknown) ?? (p['vx'] as unknown) ?? 0) * 0.12;
					drift.y += Number((p['vy'] as unknown) ?? (p['vy'] as unknown) ?? 0) * 0.12;
				}
			}

			// apply horizontal drift scaled by windDrag and dt (keeps previous feel)
			paper.pos.x += drift.x * paper.windDrag * dt;

			// vertical physics: gravity + particle vertical influence applied to vertical velocity
			paper.vy += GRAVITY * dt; // gravity pulls down
			paper.vy += drift.y * paper.windDrag * VERTICAL_DRIFT_SCALE;

			// integrate
			paper.pos.y += paper.vy * dt;

			// subtle damping so papers stabilize
			paper.vy *= Math.max(0, 1 - 1.0 * dt);

			// clamp to canvas bounds if renderer has canvas dimensions available
			try {
				const canvas = (effectRenderer as unknown as { canvas?: HTMLCanvasElement }).canvas as
					| HTMLCanvasElement
					| undefined;
				if (canvas) {
					// If a ring is present, check for collision with the portal ellipse and push papers out.
					if (ring && ring.found) {
						try {
							const portal = activePortalPlane(canvas, ring);
							const dx = paper.pos.x - portal.center.x;
							const dy = paper.pos.y - portal.center.y;
							const rx = Math.max(4, portal.radiusX);
							const ry = Math.max(4, portal.radiusY);
							const norm = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
							if (norm < 1 && norm > 0) {
								// push the paper just outside the portal ellipse along the radial direction
								const s = 1 / norm;
								const outScale = 1 + (paper.radius / Math.max(rx, ry)) * 0.9;
								paper.pos.x = portal.center.x + dx * s * outScale;
								paper.pos.y = portal.center.y + dy * s * outScale;
								// damp/reflect a bit so it looks like a bounce off the rim
								paper.vy = -Math.abs(paper.vy) * 0.28;
								paper.vx *= 0.4;
							}
						} catch {
							// ignore portal collision failures
						}
					}
					const w = canvas.width;
					const h = canvas.height;
					const bottom = h - paper.radius;
					paper.pos.x = Math.max(0, Math.min(w, paper.pos.x));
					if (paper.pos.y > bottom) {
						// hit ground: settle or bounce a little
						paper.pos.y = bottom;
						if (Math.abs(paper.vy) > 100) {
							paper.vy *= -0.28; // small bounce
						} else {
							paper.vy = 0;
						}
					}
				}
			} catch {
				// ignore
			}

			// notify listeners on change
			paper._onChange?.();
		}

		// periodic cleanup of lastHitMs to avoid memory growth
		if (lastHitMs.size > 5000) {
			const cutoff = timestamp - 2000;
			for (const [k, v] of lastHitMs) {
				if (v < cutoff) lastHitMs.delete(k);
			}
		}

		// draw simple debug overlays onto the effect canvas
		try {
			const canvas = (effectRenderer as unknown as { canvas?: HTMLCanvasElement }).canvas as
				| HTMLCanvasElement
				| undefined;
			if (canvas) {
				const ctx = canvas.getContext('2d');
				if (ctx) {
					for (const p of papers) {
						if (p.removed) continue;
						ctx.save();
						// visual: base paper circle
						ctx.beginPath();
						ctx.fillStyle = `rgba(250, 235, 180, 0.9)`;
						ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
						ctx.fill();
						// wetness overlay
						if (p.wetness > 0) {
							ctx.fillStyle = `rgba(72, 138, 194, ${Math.min(0.8, p.wetness * 0.6)})`;
							ctx.beginPath();
							ctx.arc(p.pos.x, p.pos.y, p.radius * (1 - p.wetness * 0.28), 0, Math.PI * 2);
							ctx.fill();
						}
						// burning overlay
						if (p.burning) {
							ctx.fillStyle = `rgba(255, 120, 40, ${Math.min(0.85, 0.25 + p.burnAge * 0.08)})`;
							ctx.beginPath();
							ctx.arc(p.pos.x, p.pos.y - p.radius * 0.2, p.radius * 0.6, 0, Math.PI * 2);
							ctx.fill();
						}
						// crushed visual
						if (p.crushed) {
							ctx.strokeStyle = 'rgba(80,60,40,0.9)';
							ctx.lineWidth = 2;
							ctx.beginPath();
							ctx.ellipse(
								p.pos.x,
								p.pos.y + p.radius * 0.08,
								p.radius * 1.05,
								p.radius * 0.55,
								0,
								0,
								Math.PI * 2
							);
							ctx.stroke();
						}
						// integrity ring
						ctx.beginPath();
						ctx.lineWidth = 2;
						ctx.strokeStyle = `rgba(50,50,50,0.5)`;
						ctx.arc(p.pos.x, p.pos.y, p.radius + 8, 0, Math.PI * 2);
						ctx.stroke();
						// inner integrity fill
						ctx.beginPath();
						ctx.fillStyle = `rgba(40,40,40, ${0.06 + (1 - p.integrity) * 0.25})`;
						ctx.arc(p.pos.x, p.pos.y, p.radius + 8 - (1 - p.integrity) * 12, 0, Math.PI * 2);
						ctx.fill();
						ctx.restore();
					}
					// subtle composite to let effect visuals still show through
					ctx.globalCompositeOperation = 'lighter';
				}
			}
		} catch {
			// don't let debug draw failures break rendering
		}

		// drawing is now driven by the host render loop via api.frame(timestamp)
	}

	// expose a host-driven frame hook so the page render loop can call into this
	// module after effects are rendered. This keeps the paper visuals on top.
	api.frame = frame;

	// extend API with removal helpers
	api.removeAll = () => {
		for (const p of papers.slice()) {
			try {
				removePaper(p);
			} catch (e) {
				console.error('paper removeAll item failed', e);
			}
		}
		// purge the internal array so list() returns an empty set
		papers.length = 0;
	};

	// return public API so host files can interact
	return api;
}
