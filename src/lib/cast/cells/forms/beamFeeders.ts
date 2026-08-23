/**
 * @file The strands that feed the beam: one inked stroke per drawn column,
 * running from where that column sat, in along the paper, and up into the
 * beam's foot.
 *
 * This is what keeps three columns from reading as one averaged spike. R-05
 * pays magnitude out of the count and the plan carries the arrangement beside
 * it (`SpellPlan.sites`), so the arrangement is spent here, on form: three sites
 * make three strands converging into one throat, and one site makes one.
 *
 * Seal space, unrotated: a strand is drawn on the paper the sites were drawn
 * on, so it stays put while the shaft above it leans onto `aim`.
 *
 * @example
 * const feeders = createBeamFeeders({ look, material, sites, roughness: 0.4, rng });
 * feeders.setFlow({ rise: 0.5, throat: 0.3, width: 0.16, alpha: 0.8, flow: 2.4 });
 */

import * as THREE from 'three';
import { FLOW_INK_GLSL, bandDepth, edgeMode } from './flowInk.js';
import { inkBlending, inkColor } from '../ink.js';
import type { Rng } from '../../stage/rng.js';
import type { Look, MaterialProfile } from '../../looks/look.js';
import type { Site } from '../../../types.js';

/** Steps along one strand. It is a short curve, so it needs fewer than a ribbon. */
const SEGMENTS = 24;

/** How far a strand bows sideways on its way in, as a fraction of its own reach. */
const BOW = 0.34;

const VERTEX_SHADER = /* glsl */ `
	uniform float uRise;
	uniform float uThroat;
	uniform float uWidth;
	attribute float aAxial;
	attribute float aSide;
	attribute vec2 aRoot;
	attribute float aBow;
	varying float vAxial;
	varying float vSide;
	varying float vSeed;

	// Hangs at the site, then rushes in and up: the ink is drawn off the paper by
	// the column it feeds, so the climb is late and the turn is quick.
	vec3 strandAt(float a) {
		float draw = a * a;
		vec2 inward = aRoot * mix(1.0, uThroat, draw);
		vec2 sideways = vec2(-aRoot.y, aRoot.x) * aBow * ${BOW.toFixed(2)} * sin(a * 3.1415927);
		return vec3(inward + sideways, uRise * draw);
	}

	void main() {
		vec3 center = strandAt(aAxial);
		vec3 tangent = normalize(strandAt(min(aAxial + 0.04, 1.0)) - strandAt(max(aAxial - 0.04, 0.0)));
		// Flat on the paper at the root, which is where the stroke has to read as ink.
		vec3 across = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
		float width = uWidth * (0.4 + 0.6 * (1.0 - smoothstep(0.55, 1.0, aAxial)));
		vAxial = aAxial;
		vSide = aSide;
		vSeed = aBow;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(center + across * aSide * width, 1.0);
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
	uniform float uFlicker;
	varying float vAxial;
	varying float vSide;
	varying float vSeed;

	${FLOW_INK_GLSL}

	void main() {
		float edge = inkEdge(vSide, uEdgeMode, vAxial * 6.0 - uFlow);
		// The same phase the shaft is banded by, so ink visibly runs up into it.
		float band = flowBand(vAxial, uBands, uFlow, uBandDepth);
		float head = 0.4 + 0.6 * smoothstep(0.1, 0.95, vAxial);
		float jitter = inkFlicker(vSeed * 17.0 + vAxial * 4.0, uFlow, uFlicker);
		float alpha = uAlpha * edge * band * head * jitter;
		if (alpha < 0.003) discard;
		gl_FragColor = vec4(mix(uEdge, uCore, head * band), alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;

/** How hard the strands are running this frame, in seal units. */
export interface FeederFlow {
	/** Seal units the strand climbs to, where it meets the beam's foot. */
	rise: number;
	/** Fraction of its own radius the strand closes to. Small is a tight throat. */
	throat: number;
	/** Half-width of one strand. */
	width: number;
	alpha: number;
	/** Turns. The beam's axial flow phase. */
	flow: number;
}

export interface BeamFeeders {
	readonly mesh: THREE.Mesh;
	/** How many drawn columns this beam stands on. Zero where none were drawn. */
	readonly strands: number;
	setFlow(flow: FeederFlow): void;
	dispose(): void;
}

function feedersGeometry(
	sites: readonly Site[],
	roughness: number,
	rng: Rng
): THREE.BufferGeometry {
	const perStrand = (SEGMENTS + 1) * 2;
	const total = sites.length * perStrand;
	const position = new Float32Array(total * 3);
	const axial = new Float32Array(total);
	const side = new Float32Array(total);
	const root = new Float32Array(total * 2);
	const bow = new Float32Array(total);

	sites.forEach((site, strand) => {
		// A drawn column's own bow, seeded so two spells curve differently and the
		// same spell always curves the same way. A sloppier seal bows further.
		const strandBow = 0.55 + rng() * roughness;
		for (let step = 0; step <= SEGMENTS; step += 1) {
			for (let edge = 0; edge < 2; edge += 1) {
				const index = strand * perStrand + step * 2 + edge;
				axial[index] = step / SEGMENTS;
				side[index] = edge === 0 ? -1 : 1;
				root[index * 2] = site.at.x;
				root[index * 2 + 1] = site.at.y;
				bow[index] = strandBow;
				position[index * 3] = site.at.x;
				position[index * 3 + 1] = site.at.y;
			}
		}
	});

	const indices: number[] = [];
	for (let strand = 0; strand < sites.length; strand += 1) {
		const base = strand * perStrand;
		for (let step = 0; step < SEGMENTS; step += 1) {
			const a = base + step * 2;
			indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
	geometry.setAttribute('aAxial', new THREE.BufferAttribute(axial, 1));
	geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
	geometry.setAttribute('aRoot', new THREE.BufferAttribute(root, 2));
	geometry.setAttribute('aBow', new THREE.BufferAttribute(bow, 1));
	geometry.setIndex(indices);
	return geometry;
}

/** One strand per site. A beam no column was drawn for gets a form with no strands. */
export function createBeamFeeders(options: {
	look: Look;
	material: MaterialProfile;
	sites: readonly Site[];
	/** 0 is a machined curve, 1 is a sloppy hand. The cell reads it off the seal's quality. */
	roughness: number;
	rng: Rng;
}): BeamFeeders {
	const { look, material, sites } = options;
	const geometry = feedersGeometry(sites, options.roughness, options.rng);
	const shader = new THREE.ShaderMaterial({
		uniforms: {
			uRise: { value: 0 },
			uThroat: { value: 0.25 },
			uWidth: { value: 0 },
			uAlpha: { value: 0 },
			uFlow: { value: 0 },
			uBands: { value: Math.max(material.bands, 4) },
			uBandDepth: { value: Math.max(bandDepth(material), 0.35) },
			uEdgeMode: { value: edgeMode(material) },
			uFlicker: { value: material.flicker },
			uCore: { value: inkColor(look.tint.core) },
			uEdge: { value: inkColor(look.tint.edge) }
		},
		vertexShader: VERTEX_SHADER,
		fragmentShader: FRAGMENT_SHADER,
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		blending: inkBlending(look)
	});

	const mesh = new THREE.Mesh(geometry, shader);
	mesh.frustumCulled = false;
	mesh.visible = false;

	return {
		mesh,
		strands: sites.length,
		setFlow(flow) {
			const uniforms = shader.uniforms;
			uniforms.uRise.value = flow.rise;
			uniforms.uThroat.value = flow.throat;
			uniforms.uWidth.value = flow.width;
			uniforms.uAlpha.value = flow.alpha;
			uniforms.uFlow.value = flow.flow;
			mesh.visible = sites.length > 0 && flow.alpha > 0;
		},
		dispose() {
			geometry.dispose();
			shader.dispose();
		}
	};
}
