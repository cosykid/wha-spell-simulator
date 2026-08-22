/**
 * @file The probe table: the lab's old scorecard closures rewritten as data.
 *
 * One row is one claim about one preset at one point and time, tagged with the
 * ruling it pins (`docs/animation-spec.md`). Thresholds are deliberately loose:
 * a row pins the qualitative claim of its ruling, not today's tuning constants.
 *
 * `rulingId: 'legacy'` marks a claim about current-engine behaviour that no
 * ruling covers yet. A legacy row is a placeholder for a future ruling, never a
 * canon assertion, and the redesign is allowed to change what it says.
 *
 * The row shape and the metrics live in [`probeMetrics.ts`](probeMetrics.ts).
 */

import type { Probe } from './probeMetrics.js';

// Force below this magnitude is float noise, not a behaviour.
const SILENT = 1e-9;

/** Rows that all probe one preset, so the preset id is written once per group. */
function on(presetId: string, rows: Array<Omit<Probe, 'presetId'>>): Probe[] {
	return rows.map((row) => ({ presetId, ...row }));
}

export const PROBES: Probe[] = [
	...on('none', [
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'lateralForce', below: SILENT },
			rulingId: 'legacy',
			claim: 'an empty field exerts no force; the legacy per-element renderer covers the spell'
		},
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'forceZ', below: SILENT },
			rulingId: 'legacy',
			claim: 'and nothing lifts, so R-11 (nothing is a look) has no implementation yet'
		}
	]),

	...on('column-balanced', [
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'lateralForce', below: 1e-6 },
			rulingId: 'R-05',
			claim: 'a balanced ring of columns cancels its lateral momentum P'
		},
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'forceZ', above: 0.5 },
			rulingId: 'R-05',
			claim: 'their convergence C stays positive, so the aim is straight out of the seal'
		},
		{
			atMs: 600,
			point: { x: 0, y: 0 },
			expect: { metric: 'meanHeight', above: 0.3 },
			rulingId: 'R-05',
			claim: 'the beam lifts the population off the paper'
		}
	]),

	...on('column-unbalanced', [
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'forceZ', above: 0.2 },
			rulingId: 'R-05',
			claim: 'a lone column still beams out of the seal'
		},
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'forceX', above: 0.05 },
			rulingId: 'legacy',
			claim:
				'today the beam leans toward the sign own rim position, east. R-05 leans it where the sign points, so this row is the axial-lean tripwire and flips with that fix'
		},
		{
			atMs: 0,
			point: { x: -0.9, y: 0 },
			expect: { metric: 'forceX', above: 0 },
			rulingId: 'legacy',
			claim: 'outside the footprint the chimney draft pulls back toward the beam axis'
		}
	]),

	...on('pull-inward', [
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'inwardForce', above: 0.1 },
			rulingId: 'R-13',
			claim: 'pull owns the intake verb: it draws toward the seal from the east'
		},
		{
			atMs: 0,
			point: { x: 0, y: -0.5 },
			expect: { metric: 'inwardForce', above: 0.1 },
			rulingId: 'R-13',
			claim: 'and from the north, so the intake is not one-sided'
		},
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'forceZ', below: SILENT },
			rulingId: 'legacy',
			claim: 'a straight pull gains no swirl lift and stays flat on the paper'
		},
		{
			atMs: 1800,
			point: { x: 0, y: 0 },
			expect: { metric: 'meanRadius', below: 0.5 },
			rulingId: 'R-13',
			claim: 'the population gathers toward the seal instead of dispersing'
		}
	]),

	...on('pull-vortex', [
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'swirl', above: 0.05 },
			rulingId: 'R-05',
			claim: 'angled pulls carry circulation Gamma: one rotation sense east of the center'
		},
		{
			atMs: 0,
			point: { x: 0, y: 0.5 },
			expect: { metric: 'swirl', above: 0.05 },
			rulingId: 'R-05',
			claim: 'the same sense south of it, so the pinwheel turns one way everywhere'
		},
		{
			atMs: 0,
			point: { x: 0.2, y: 0 },
			expect: { metric: 'forceX', above: 0 },
			rulingId: 'legacy',
			claim: 'inside the vortex eye the flow pushes back out, so the funnel stays hollow'
		},
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'forceZ', above: 0.1 },
			rulingId: 'legacy',
			claim: 'swirl lift climbs the seal axis; no ruling covers the updraft yet'
		}
	]),

	...on('pull-inverted', [
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'inwardForce', below: -0.1 },
			rulingId: 'R-07',
			claim: 'outward-facing signs read as dispersion: the flow fans away from the seal'
		},
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'forceZ', below: SILENT },
			rulingId: 'R-07',
			claim: 'and hugs the plane rather than climbing'
		}
	]),

	...on('dispersion', [
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'inwardForce', below: -0.1 },
			rulingId: 'R-07',
			claim: 'dispersion gives C < 0, a radial fan east of the center'
		},
		{
			atMs: 0,
			point: { x: 0, y: -0.5 },
			expect: { metric: 'inwardForce', below: -0.1 },
			rulingId: 'R-07',
			claim: 'and north of it, on every side'
		},
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'forceZ', below: SILENT },
			rulingId: 'R-07',
			claim: 'the fan hugs the plane (canon Snugstone dispersal)'
		}
	]),

	...on('region-sector', [
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'forceX', above: 0.2 },
			rulingId: 'R-09',
			claim: 'row 10: collinear agreeing chevrons exhaust laterally along their facing'
		},
		{
			atMs: 0,
			point: { x: 0.7, y: 0 },
			expect: { metric: 'density', radius: 1, above: 0.9 },
			rulingId: 'R-09',
			claim: 'the aperture puts the whole population on the exhaust side'
		},
		{
			atMs: 0,
			point: { x: -0.7, y: 0 },
			expect: { metric: 'density', radius: 0.5, below: 0.01 },
			rulingId: 'R-09',
			claim: 'and nothing spawns behind the chevrons'
		}
	]),

	...on('region-inside', [
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'density', radius: 0.61, above: 0.99 },
			rulingId: 'R-09',
			claim: 'row 2: chevrons all inward emit from the disc, never outside the ring'
		},
		{
			atMs: 0,
			point: { x: 0, y: 0.5 },
			expect: { metric: 'inwardForce', above: 0.1 },
			rulingId: 'R-09',
			claim: 'their exhaust confines the flow toward the seal center'
		}
	]),

	...on('region-ring', [
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'meanRadius', above: 0.9, below: 1.09 },
			rulingId: 'R-09',
			claim: 'row 4: opposed pairs open an annulus on the ring line'
		},
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'density', radius: 0.5, below: 0.01 },
			rulingId: 'R-09',
			claim: 'and pinch the interior off'
		}
	]),

	...on('swirl-pushes', [
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'swirl', above: 0.05 },
			rulingId: 'R-05',
			claim: 'tangential chevrons sum to circulation east of the center'
		},
		{
			atMs: 0,
			point: { x: 0, y: 0.5 },
			expect: { metric: 'swirl', above: 0.05 },
			rulingId: 'R-05',
			claim: 'with the same sense south of it: one emergent vortex, not three pushes'
		},
		{
			atMs: 0,
			point: { x: 0.5, y: 0 },
			expect: { metric: 'forceZ', above: 0.1 },
			rulingId: 'legacy',
			claim: 'the emergent vortex climbs the seal axis; the updraft term is unruled'
		}
	]),

	...on('levitation', [
		{
			atMs: 0,
			point: { x: 0, y: 0 },
			expect: { metric: 'lateralForce', below: 1e-6 },
			rulingId: 'R-13',
			claim: 'levitation owns the spring verb: a balanced ring cancels its press at the locus'
		},
		{
			atMs: 0,
			point: { x: 0.1, y: 0 },
			expect: { metric: 'forceZ', above: 0.5 },
			rulingId: 'R-13',
			claim: 'the hold lifts on the paper'
		},
		{
			atMs: 0,
			point: { x: 0.1, y: 0, z: 0.9 },
			expect: { metric: 'forceZ', below: SILENT },
			rulingId: 'legacy',
			claim: 'and stops lifting above the hover ceiling; the ceiling height is unruled tuning'
		},
		{
			atMs: 1800,
			point: { x: 0, y: 0 },
			expect: { metric: 'meanHeight', above: 0.05, below: 0.85 },
			rulingId: 'R-13',
			claim: 'so held magic settles into a hovering mass instead of climbing away'
		}
	])
];
