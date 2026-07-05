/**
 * Render traces to a three-panel PNG snapshot:
 *   left   = top view,  world x → right, world z (north) → up;
 *   middle = side view, world z (north) → right, world y (height) → up;
 *   right  = angled ¾ view: orthographic camera south-east of the seal,
 *            elevation 28° (north-east is to the upper right).
 * Red glow = spawn density (mask × prox, the demo diagrams' red region),
 * element color = tracer paths (additive), steel ink = ring + sign glyphs
 * (opaque overlay with a dark halo, so the seal stays readable under a
 * bright field).
 */
import { spawnWeight, type Nozzle } from '../src/nozzle';
import { ELEMENT_COLOR } from '../src/model';
import { v2, type Vec2 } from '../src/math2';
import type { Seal } from '../src/model';
import type { TracePoint } from './harness';
import { encodePng } from './png';

const PANEL = 420;
const GAP = 10;
const W = PANEL * 3 + GAP * 4;
const H = PANEL + GAP * 2;
const SPAN = 4.4; // world units per panel: x,z ∈ [-2.2, 2.2], y ∈ [-0.2, 4.2]

const INK = [0.74, 0.84, 0.98]; // seal-ink steel, composited over the field

class Canvas {
	readonly acc = new Float32Array(W * H * 3); // additive field (tracers, glow)
	readonly ov = new Float32Array(W * H); //     opaque seal-ink overlay alpha

	splat(px: number, py: number, r: number, g: number, b: number, i: number): void {
		const x = Math.round(px);
		const y = Math.round(py);
		if (x < 0 || x >= W || y < 0 || y >= H) return;
		const o = (y * W + x) * 3;
		this.acc[o] += r * i;
		this.acc[o + 1] += g * i;
		this.acc[o + 2] += b * i;
	}

	line(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		r: number,
		g: number,
		b: number,
		i: number
	): void {
		const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.7));
		for (let s = 0; s <= steps; s++) {
			const t = s / steps;
			this.splat(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, g, b, i);
		}
	}

	oSplat(px: number, py: number, a: number): void {
		const x = Math.round(px);
		const y = Math.round(py);
		if (x < 0 || x >= W || y < 0 || y >= H) return;
		const o = y * W + x;
		this.ov[o] = Math.max(this.ov[o], a);
	}

	oLine(x0: number, y0: number, x1: number, y1: number, a: number, thick = 1): void {
		const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.7));
		const off = (thick - 1) / 2;
		for (let s = 0; s <= steps; s++) {
			const t = s / steps;
			const px = x0 + (x1 - x0) * t;
			const py = y0 + (y1 - y0) * t;
			for (let dy = 0; dy < thick; dy++)
				for (let dx = 0; dx < thick; dx++) this.oSplat(px + dx - off, py + dy - off, a);
		}
	}

	toRgb(): Uint8Array {
		const rgb = new Uint8Array(W * H * 3);
		// 1px-dilated overlay → the dark halo that separates ink from field
		const halo = new Float32Array(W * H);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				let m = 0;
				for (let dy = -1; dy <= 1; dy++) {
					const yy = y + dy;
					if (yy < 0 || yy >= H) continue;
					for (let dx = -1; dx <= 1; dx++) {
						const xx = x + dx;
						if (xx < 0 || xx >= W) continue;
						m = Math.max(m, this.ov[yy * W + xx]);
					}
				}
				halo[y * W + x] = Math.min(1, m);
			}
		}
		for (let i = 0; i < W * H; i++) {
			const a = Math.min(1, this.ov[i]);
			const dim = 1 - 0.82 * halo[i];
			for (let ch = 0; ch < 3; ch++) {
				const field = 255 * Math.pow(1 - Math.exp(-this.acc[i * 3 + ch]), 1 / 1.6);
				rgb[i * 3 + ch] = Math.min(255, Math.round(field * dim * (1 - a) + 255 * INK[ch] * a));
			}
		}
		return rgb;
	}
}

// panel mappings (seal 2D (x, y) is world (x, z), so top view draws 2D directly)
const topX = (wx: number) => GAP + ((wx + 2.2) / SPAN) * PANEL;
const topY = (wz: number) => GAP + ((2.2 - wz) / SPAN) * PANEL;
const sideX = (wz: number) => GAP * 2 + PANEL + ((wz + 2.2) / SPAN) * PANEL;
const sideY = (wy: number) => GAP + ((4.2 - wy) / SPAN) * PANEL;

// angled panel: screen-right = north-east, depth axis = north-west (away)
const ANG_SPAN = 5.2; // wider window: the tilted height range needs the room
const ANG_COS = Math.cos((28 * Math.PI) / 180);
const ANG_SIN = Math.sin((28 * Math.PI) / 180);
const angX = (wx: number, wz: number) =>
	GAP * 3 + PANEL * 2 + ((Math.SQRT1_2 * (wx + wz) + 2.6) / ANG_SPAN) * PANEL;
const angY = (wx: number, wy: number, wz: number) =>
	GAP + ((4.1 - (wy * ANG_COS + Math.SQRT1_2 * (wz - wx) * ANG_SIN)) / ANG_SPAN) * PANEL;

const rot = (v: Vec2, a: number): Vec2 =>
	v2(v.x * Math.cos(a) - v.y * Math.sin(a), v.x * Math.sin(a) + v.y * Math.cos(a));

function drawSeal(c: Canvas, seal: Seal, n: Nozzle): void {
	// spawn-density underlay (top + angled ground plane), sampled every 2px
	for (let py = 0; py < PANEL; py += 2) {
		for (let px = 0; px < PANEL; px += 2) {
			const wx = (px / PANEL) * SPAN - 2.2;
			const wz = 2.2 - (py / PANEL) * SPAN;
			const w = spawnWeight(n, v2(wx, wz));
			if (w < 0.01) continue;
			for (let dy = 0; dy < 2; dy++)
				for (let dx = 0; dx < 2; dx++)
					c.splat(GAP + px + dx, GAP + py + dy, 0.5, 0.09, 0.11, 0.15 * w);
			c.splat(angX(wx, wz), angY(wx, 0, wz), 0.5, 0.09, 0.11, 0.12 * w);
			c.splat(angX(wx, wz) + 1, angY(wx, 0, wz), 0.5, 0.09, 0.11, 0.12 * w);
		}
	}

	// ring (top + angled) + ground and ring segment (side)
	for (let i = 0; i < 720; i++) {
		const a = (i / 720) * 2 * Math.PI;
		c.oSplat(topX(Math.cos(a)), topY(Math.sin(a)), 0.55);
		c.oSplat(angX(Math.cos(a), Math.sin(a)), angY(Math.cos(a), 0, Math.sin(a)), 0.55);
	}
	c.oLine(sideX(-2.2), sideY(0), sideX(2.2), sideY(0), 0.3);
	c.oLine(sideX(-1), sideY(0), sideX(1), sideY(0), 0.55);
	c.oLine(sideX(0), sideY(0), sideX(0), sideY(0.06), 0.8); // north marker at z=0
	c.oLine(angX(0, 1), angY(0, 0, 1), angX(0, 1), angY(0, 0.14, 1), 0.8); // north tick on the ring

	// sign glyphs (seal-plane 2D coords, drawn in the top AND angled panels)
	const seg = (a: Vec2, b: Vec2): void => {
		c.oLine(topX(a.x), topY(a.y), topX(b.x), topY(b.y), 1.0, 2);
		c.oLine(angX(a.x, a.y), angY(a.x, 0, a.y), angX(b.x, b.y), angY(b.x, 0, b.y), 1.0, 2);
	};
	for (const s of seal.signs) {
		if (s.kind === 'column' || s.kind === 'levitation') {
			const tip = v2(s.pos.x + s.dir.x * s.len, s.pos.y + s.dir.y * s.len);
			seg(s.pos, tip);
			const cb = rot(s.dir, Math.PI / 2); // crossbar at the application point
			seg(
				v2(s.pos.x - cb.x * 0.1, s.pos.y - cb.y * 0.1),
				v2(s.pos.x + cb.x * 0.1, s.pos.y + cb.y * 0.1)
			);
			if (s.kind === 'levitation') {
				for (const a of [2.6, -2.6]) {
					// the arrowhead is what tells levitation apart from the column's plain T
					const h = rot(s.dir, a);
					seg(tip, v2(tip.x + h.x * 0.12, tip.y + h.y * 0.12));
				}
			}
		} else if (s.kind === 'pull') {
			// bare tail, hollow triangle head mid-stem, barbed tip (no crossbar)
			const tip = v2(s.pos.x + s.dir.x * s.len, s.pos.y + s.dir.y * s.len);
			seg(s.pos, tip);
			const p = rot(s.dir, Math.PI / 2);
			const base = v2(s.pos.x + s.dir.x * s.len * 0.52, s.pos.y + s.dir.y * s.len * 0.52);
			const apex = v2(s.pos.x + s.dir.x * s.len * 0.84, s.pos.y + s.dir.y * s.len * 0.84);
			const bl = v2(base.x - p.x * 0.08, base.y - p.y * 0.08);
			const br = v2(base.x + p.x * 0.08, base.y + p.y * 0.08);
			seg(bl, apex);
			seg(br, apex);
			seg(bl, br);
			for (const a of [2.6, -2.6]) {
				const h = rot(s.dir, a);
				seg(tip, v2(tip.x + h.x * 0.12, tip.y + h.y * 0.12));
			}
		} else if (s.kind === 'convergence') {
			// closed regular triangle (the lens): centroid at pos, apex along dir
			const cr = s.len / Math.sqrt(3);
			const ir = s.len / (2 * Math.sqrt(3));
			const p = rot(s.dir, Math.PI / 2);
			const apex = v2(s.pos.x + s.dir.x * cr, s.pos.y + s.dir.y * cr);
			const b1 = v2(
				s.pos.x - s.dir.x * ir + p.x * s.len * 0.5,
				s.pos.y - s.dir.y * ir + p.y * s.len * 0.5
			);
			const b2 = v2(
				s.pos.x - s.dir.x * ir - p.x * s.len * 0.5,
				s.pos.y - s.dir.y * ir - p.y * s.len * 0.5
			);
			seg(apex, b1);
			seg(b1, b2);
			seg(b2, apex);
		} else if (s.kind === 'orb') {
			// circle with a through-line (the vessel): the law reads only the diameter
			const r = s.len / 2;
			let prev = v2(s.pos.x + r, s.pos.y);
			for (let k = 1; k <= 24; k++) {
				const a = (k / 24) * 2 * Math.PI;
				const next = v2(s.pos.x + r * Math.cos(a), s.pos.y + r * Math.sin(a));
				seg(prev, next);
				prev = next;
			}
			const over = r * 1.31; // the line overshoots the circle (icon proportions)
			seg(
				v2(s.pos.x - s.dir.x * over, s.pos.y - s.dir.y * over),
				v2(s.pos.x + s.dir.x * over, s.pos.y + s.dir.y * over)
			);
		} else {
			for (const a of [2.5, -2.5]) {
				const arm = rot(s.dir, a); // chevron: apex at pos, arms swept back
				seg(s.pos, v2(s.pos.x + arm.x * 0.16, s.pos.y + arm.y * 0.16));
			}
		}
	}

	// §9 vessel: invisible in canon — drawn as a faint diagram outline here
	// (top = equator footprint, side = great circle, angled = equator ellipse)
	if (n.orb) {
		const { radius, h, x } = n.orb;
		for (let i = 0; i < 480; i++) {
			const a = (i / 480) * 2 * Math.PI;
			const cx = x.x + radius * Math.cos(a);
			const cz = x.y + radius * Math.sin(a);
			c.oSplat(topX(cx), topY(cz), 0.25);
			c.oSplat(angX(cx, cz), angY(cx, h, cz), 0.25);
			c.oSplat(sideX(x.y + radius * Math.cos(a)), sideY(h + radius * Math.sin(a)), 0.3);
		}
	}
}

export function renderPreset(
	seal: Seal,
	n: Nozzle,
	traces: TracePoint[][],
	ambient: TracePoint[][] = []
): Buffer {
	const c = new Canvas();
	drawSeal(c, seal, n);

	const hex = ELEMENT_COLOR[seal.element];
	const r = ((hex >> 16) & 0xff) / 255;
	const g = ((hex >> 8) & 0xff) / 255;
	const b = (hex & 0xff) / 255;
	// ambient medium first (dim underlayer): static motes read as a starfield,
	// pulled motes leave faint trails converging on the seal
	for (const path of ambient) {
		for (const p of path) {
			c.splat(topX(p.x), topY(p.z), r, g, b, 0.06);
			c.splat(sideX(p.z), sideY(p.y), r, g, b, 0.06);
			c.splat(angX(p.x, p.z), angY(p.x, p.y, p.z), r, g, b, 0.06);
		}
	}
	for (const path of traces) {
		for (const p of path) {
			const i = 0.3 * p.fade;
			c.splat(topX(p.x), topY(p.z), r, g, b, i);
			c.splat(sideX(p.z), sideY(p.y), r, g, b, i);
			c.splat(angX(p.x, p.z), angY(p.x, p.y, p.z), r, g, b, i);
		}
	}
	return encodePng(W, H, c.toRgb());
}
