/**
 * @file The inked-volume dress: the marching-cubes body shaded as flat
 * height-stepped watercolor washes with a DARK ink contour. No lights, no cel
 * bands, no bloom — pigment flats posterized by height, granulated like paper,
 * and outlined where the surface turns away from the eye, so the mass reads as
 * an ink-outlined watercolor shape on the page. The rim runs dark, never
 * light; water's subtle glint is the one concession to shine in the table.
 */

import * as THREE from 'three';
import { INK_STYLE, INKS, rampGlsl } from './pigment.js';
import type { VolumeElement } from './elements.js';

const KEY_DIR = new THREE.Vector3(2.5, 4.0, 1.5).normalize();

const INK_VERTEX = /* glsl */ `
varying vec3 vNrm;
varying vec3 vWPos;
varying vec3 vViewDir;
void main() {
	vec4 wp = modelMatrix * vec4(position, 1.0);
	vWPos = wp.xyz;
	vNrm = normalize(mat3(modelMatrix) * normal);
	vViewDir = normalize(cameraPosition - wp.xyz);
	gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

function inkFragment(element: VolumeElement): string {
	return /* glsl */ `
uniform float uTime;
uniform float uHeatLo;
uniform float uHeatHi;
uniform float uOpacity;
uniform float uBands;
uniform float uRim;
uniform float uGlint;
uniform float uHeatBase;
uniform float uHeatSpan;
uniform float uWobble;
uniform float uFacet;
uniform vec3 uInk;
uniform vec3 uKeyDir;
varying vec3 vNrm;
varying vec3 vWPos;
varying vec3 vViewDir;

${rampGlsl(element)}

void main() {
	vec3 nrm = normalize(vNrm);
	// Crystal alone shades by face rather than by vertex: screen-space
	// derivatives of the world position give true polyhedral facets, which is
	// the one row where the angular read is the design.
	if (uFacet > 0.5) nrm = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
	// A face can arrive flipped (double-sided isosurface); shade the near side.
	if (dot(nrm, vViewDir) < 0.0) nrm = -nrm;

	// World y is seal height, read against the band the mass itself spans, so a
	// held ball is hot at its own base wherever it hovers. Wobble keeps the wash
	// borders hand-laid.
	float heightN = clamp((vWPos.y - uHeatLo) / (uHeatHi - uHeatLo), 0.0, 1.15);
	float wobble = 0.10 * sin(vWPos.x * 5.1 + uTime * uWobble) * sin(vWPos.z * 4.3 - uTime * 0.9 * uWobble)
		+ 0.06 * sin(vWPos.y * 6.7 + uTime * 0.7 * uWobble);
	float heat = uHeatBase + uHeatSpan * heightN + wobble;

	// Flat washes: quantize the ramp into a few steps with soft borders.
	float hb = heat * uBands;
	float q = (floor(hb) + smoothstep(0.35, 0.65, fract(hb))) / uBands;
	vec3 wash = pigment(q);

	// Paper granulation, kept coarse so it reads as tooth rather than static.
	float grain = 0.5 + 0.5 * sin(vWPos.x * 23.0) * sin(vWPos.z * 21.0 + vWPos.y * 17.0);
	wash *= 0.95 + 0.07 * grain;

	// Facet mode tones each plane by its own aspect, so the interior reads as
	// cut faces of one wash rather than as a smooth blob. Not lighting: two
	// values of the same pigment, keyed off a fixed direction.
	if (uFacet > 0.5) {
		float face = 0.72 + 0.55 * max(0.0, dot(nrm, uKeyDir));
		wash *= face;
	}

	// The ink line: fresnel runs DARK here, never bright, and only at the true
	// silhouette so the interior bumps stay wash rather than speckle.
	float fres = pow(1.0 - clamp(dot(nrm, vViewDir), 0.0, 1.0), 2.2);
	float rim = smoothstep(0.42, 0.85, fres) * uRim;
	vec3 col = mix(wash, uInk, rim);

	// Water's one concession to shine, kept subtle.
	if (uGlint > 0.0) {
		vec3 nRip = nrm;
		nRip.xz += 0.2 * vec2(
			sin(vWPos.x * 7.0 + uTime * 2.6 + vWPos.y * 3.0),
			sin(vWPos.z * 7.0 - uTime * 2.2 + vWPos.y * 4.0));
		nRip = normalize(nRip);
		float glint = smoothstep(0.95, 0.975, dot(nRip, normalize(uKeyDir + vViewDir)));
		col += vec3(0.9, 0.97, 1.0) * glint * 0.6 * uGlint;
	}

	float alpha = uOpacity * (0.88 + 0.28 * rim);
	gl_FragColor = vec4(col * alpha, alpha);
}
`;
}

/** The uniforms a cast drives per paint. `uTime` is cast seconds. */
export interface InkSkinHandles {
	material: THREE.ShaderMaterial;
	uTime: { value: number };
	uHeatLo: { value: number };
	uHeatHi: { value: number };
}

/** The inked-volume material for one element row. */
export function inkSkinMaterial(element: VolumeElement): InkSkinHandles {
	const row = INK_STYLE[element];
	const ink = INKS[element];
	const uTime = { value: 0 };
	const uHeatLo = { value: 0 };
	const uHeatHi = { value: 1.5 };
	const material = new THREE.ShaderMaterial({
		uniforms: {
			uTime,
			uHeatLo,
			uHeatHi,
			uOpacity: { value: row.opacity },
			uBands: { value: row.bands },
			uRim: { value: row.rim },
			uGlint: { value: row.glint },
			uHeatBase: { value: row.heatBase },
			uHeatSpan: { value: row.heatSpan },
			uWobble: { value: row.wobbleRate },
			uFacet: { value: row.facet },
			uInk: { value: new THREE.Vector3(ink[0], ink[1], ink[2]) },
			uKeyDir: { value: KEY_DIR.clone() }
		},
		vertexShader: INK_VERTEX,
		fragmentShader: inkFragment(element),
		transparent: true,
		depthWrite: row.opacity > 0.5,
		side: THREE.DoubleSide,
		// Premultiplied over: pigment composites, it never adds to neon.
		blending: THREE.CustomBlending,
		blendSrc: THREE.OneFactor,
		blendDst: THREE.OneMinusSrcAlphaFactor,
		blendSrcAlpha: THREE.OneFactor,
		blendDstAlpha: THREE.OneMinusSrcAlphaFactor
	});
	return { material, uTime, uHeatLo, uHeatHi };
}
