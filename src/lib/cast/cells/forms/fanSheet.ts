/**
 * @file The fan's sheet: a curved sector of ink rooted flat on the seal plane and
 * peeling off it toward a leading edge that advances.
 *
 * One mesh holds every sector, because a dispersion sign's arrangement is fixed
 * for the life of the cell: each vertex carries the azimuth it belongs to, and
 * the vertex shader only has to say how far the front has run. The radial
 * shading scrolls on the same phase that front advances by, so outflow reads in
 * a still frame.
 *
 * @example
 * const sheet = createFanSheet({ look, material, sectors, streaks: 9, sideFade: 1 });
 * sheet.setSweep({ inner: 0.4, outer: 1.6, lift: 0.2, alpha: 0.8, flow: 1.2 });
 */

import * as THREE from 'three';
import { FLOW_INK_GLSL, bandDepth, edgeMode } from './flowInk.js';
import { inkBlending, inkColor } from '../ink.js';
import type { Look, MaterialProfile } from '../../looks/look.js';

/** Steps across the band, and around one sector. */
const RADIAL_STEPS = 16;
const SWEEP_STEPS = 30;

/** How deep the leading edge is cut, by edge treatment. A crisp front barely breaks. */
const SERRATION: Record<MaterialProfile['edge'], number> = {
	crisp: 0.02,
	feather: 0.05,
	serrated: 0.16
};

/** Teeth around the whole seal. Few enough to read as a torn edge, not as noise. */
const TEETH = 22;

const VERTEX_SHADER = /* glsl */ `
	uniform float uInner;
	uniform float uOuter;
	uniform float uLift;
	uniform float uSerration;
	uniform float uFlow;
	uniform float uUndulation;
	attribute float aRadial;
	attribute float aSweep;
	attribute float aAngle;
	attribute float aSeed;
	varying float vRadial;
	varying float vSweep;
	varying float vAngle;
	varying float vSeed;

	void main() {
		float saw = abs(fract(aAngle * ${TEETH}.0 / 6.2831853 - uFlow * 0.15) * 2.0 - 1.0);
		float front = uOuter * (1.0 + uSerration * (saw - 0.5));
		float radius = mix(uInner, front, aRadial);
		// R-07: the sheet is rooted flat on the paper and peels off it as it runs, so
		// the front stands as a lip with a silhouette instead of a flat annulus.
		float lip = 0.12 + 0.88 * aRadial * aRadial;
		float swell = uUndulation * sin((aRadial * 3.0 - uFlow) * 6.2831853 + aSeed * 6.2831853);
		vRadial = aRadial;
		vSweep = aSweep;
		vAngle = aAngle;
		vSeed = aSeed;
		vec3 seal = vec3(cos(aAngle) * radius, sin(aAngle) * radius, uLift * (lip + swell));
		gl_Position = projectionMatrix * modelViewMatrix * vec4(seal, 1.0);
	}
`;

const FRAGMENT_SHADER = /* glsl */ `
	uniform vec3 uCore;
	uniform vec3 uEdge;
	uniform float uAlpha;
	uniform float uFlow;
	uniform float uBands;
	uniform float uBandDepth;
	uniform float uEdgeMode;
	uniform float uStreaks;
	uniform float uSideFade;
	uniform float uOpacity;
	uniform float uEmissive;
	uniform float uFlicker;
	varying float vRadial;
	varying float vSweep;
	varying float vAngle;
	varying float vSeed;

	${FLOW_INK_GLSL}

	void main() {
		// A sector's cut sides are its drawn edges, so the row's edge treatment goes
		// there. The leading edge is the serration in the geometry, not an alpha ramp.
		float sides = mix(1.0, inkEdge(vSweep, uEdgeMode, vRadial * 5.0 - uFlow), uSideFade);
		// The wave has a body and a drawn line at its head. The line is what stays
		// legible over bright paper, where a broad additive ramp washes out.
		float front = smoothstep(0.68, 0.94, vRadial);
		float rim = smoothstep(0.92, 1.0, vRadial);
		float sheet = 1.0 - smoothstep(0.05, 1.0, vRadial);
		// Ridges standing in the outflow, brightened by the band travelling through.
		float streak = 0.62 + 0.38 * cos(vAngle * uStreaks + vSeed);
		float flow = flowBand(vRadial, uBands, uFlow, uBandDepth);
		float jitter = inkFlicker(vAngle * 2.0, uFlow, uFlicker);
		float alpha = uAlpha * (0.5 * uOpacity * sheet + 0.45 * front + rim) * streak * flow * sides * jitter;
		if (alpha < 0.003) discard;
		float hot = clamp(rim + front * 0.35 * uEmissive + 0.2 * flow, 0.0, 1.0);
		gl_FragColor = vec4(mix(uEdge, uCore, hot), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** One sector of sheet: where it points and how wide it opens, in radians. */
export interface FanSector {
	bearing: number;
	halfAngle: number;
}

/** Where the sheet stands this frame, in seal units. */
export interface Sweep {
	/** Radius the sheet starts at. It runs outward from the aperture core. */
	inner: number;
	/** Radius of the leading edge. */
	outer: number;
	/** Seal units the lip curls to. Small: R-07's fan hugs the plane. */
	lift: number;
	alpha: number;
	/** Turns of the radial pattern, advanced by the same push the front runs on. */
	flow: number;
}

export interface FanSheet {
	readonly mesh: THREE.Mesh;
	setSweep(sweep: Sweep): void;
	dispose(): void;
}

function sheetGeometry(sectors: readonly FanSector[]): THREE.BufferGeometry {
	const rows = RADIAL_STEPS + 1;
	const columns = SWEEP_STEPS + 1;
	const perSector = rows * columns;
	const total = sectors.length * perSector;
	const position = new Float32Array(total * 3);
	const radial = new Float32Array(total);
	const sweep = new Float32Array(total);
	const angle = new Float32Array(total);
	const seed = new Float32Array(total);

	sectors.forEach((sector, index) => {
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const at = index * perSector + row * columns + column;
				const across = (column / SWEEP_STEPS) * 2 - 1;
				radial[at] = row / RADIAL_STEPS;
				sweep[at] = across;
				angle[at] = sector.bearing + across * sector.halfAngle;
				seed[at] = index;
				position[at * 3] = Math.cos(angle[at]);
				position[at * 3 + 1] = Math.sin(angle[at]);
			}
		}
	});

	const indices: number[] = [];
	for (let index = 0; index < sectors.length; index += 1) {
		const base = index * perSector;
		for (let row = 0; row < RADIAL_STEPS; row += 1) {
			for (let column = 0; column < SWEEP_STEPS; column += 1) {
				const a = base + row * columns + column;
				const b = a + columns;
				indices.push(a, b, b + 1, a, b + 1, a + 1);
			}
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aRadial', new THREE.BufferAttribute(radial, 1));
	geometry.setAttribute('aSweep', new THREE.BufferAttribute(sweep, 1));
	geometry.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1));
	geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
	geometry.setIndex(indices);
	return geometry;
}

/**
 * One sheet over the sectors it is given. A sheet that closes the whole seal
 * asks for no side fade, so a ring of dispersion has no seams in it.
 */
export function createFanSheet(options: {
	look: Look;
	material: MaterialProfile;
	sectors: readonly FanSector[];
	/** Ridges around the seal. The cell snaps this to the seal's own fold. */
	streaks: number;
	/** 0 where the sectors close the ring, 1 where each one has two open sides. */
	sideFade: number;
}): FanSheet {
	const { look, material } = options;
	const geometry = sheetGeometry(options.sectors);
	const shader = new THREE.ShaderMaterial({
		uniforms: {
			uInner: { value: 0 },
			uOuter: { value: 0 },
			uLift: { value: 0 },
			uAlpha: { value: 0 },
			uFlow: { value: 0 },
			uSerration: { value: SERRATION[material.edge] },
			uEdgeMode: { value: edgeMode(material) },
			uBands: { value: Math.max(material.bands, 3) },
			uBandDepth: { value: Math.max(bandDepth(material), 0.3) },
			uStreaks: { value: options.streaks },
			uSideFade: { value: options.sideFade },
			uOpacity: { value: material.opacity },
			uEmissive: { value: material.emissive },
			uFlicker: { value: material.flicker },
			uUndulation: { value: material.undulation * 0.5 },
			uCore: { value: inkColor(look.tint.core) },
			uEdge: { value: inkColor(look.tint.edge) }
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		// The seal root's matrix is a reflection, so culled faces would show the back.
		side: THREE.DoubleSide,
		blending: inkBlending(look)
	});

	const mesh = new THREE.Mesh(geometry, shader);
	mesh.frustumCulled = false;

	return {
		mesh,
		setSweep(sweep) {
			const uniforms = shader.uniforms;
			uniforms.uInner.value = sweep.inner;
			uniforms.uOuter.value = sweep.outer;
			uniforms.uLift.value = sweep.lift;
			uniforms.uAlpha.value = sweep.alpha;
			uniforms.uFlow.value = sweep.flow;
			mesh.visible = sweep.alpha > 0 && sweep.outer > sweep.inner;
		},
		dispose() {
			geometry.dispose();
			shader.dispose();
		}
	};
}
