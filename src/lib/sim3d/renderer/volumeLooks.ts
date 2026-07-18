/**
 * @file Per-element look of the marching-cubes volume: field-shaping knobs
 * (LOOKS) and the materials that skin the isosurface. Most elements share a
 * cel-banded toon material; water adds ripple glints, fire swaps in a fully
 * emissive noise shader (fire is a light source, not a lit surface).
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import type { SimElement } from '../core/model.js';

export interface VolumeLook {
	color: number;
	emissive: number;
	emissiveIntensity: number;
	opacity: number; // < 1 ⇒ transparent
	// field shaping: how eagerly this element's deposits fuse into one surface
	isoScale: number; //      × VOLUME_ISOLATION (lower ⇒ fatter, merges sooner)
	smearScale: number; //    × VOLUME_SMEAR
	smooth: number; //        0 = off; else field diffusion, bridges nearby blobs
	smoothPasses: number; //  more passes ⇒ rounder, softer silhouette
	cohesion: number; //      × VOLUME_COHESION: deposits contract toward the
	//                        local tracer centroid, loners fade to droplets
	// ambient skinning: how the pull's gathered element reads as matter
	stream: number; //        0 = inflow motes stay dots; else fast motes deposit
	//                        velocity-smeared balls — the inflow becomes ribbons
	plume: number; //         0 = the pool lies flat; else gathered mass sprouts a
	//                        rising column, sheared into a helix by the churn
	pool: number; //          0 = the gathered heap stays glowing dots (wind — air
	//                        has no body); else pooled motes skin into the volume
}

export const LOOKS: Record<SimElement, VolumeLook> = {
	// fire's color/emissive fields are unused: makeFireMaterial paints its own
	// temperature ramp. The field knobs fuse the blobs into one plume the
	// eroding shader can carve tongues out of.
	fire: {
		color: 0xff7043,
		emissive: 0xd83a12,
		emissiveIntensity: 0.25,
		opacity: 1,
		isoScale: 0.8,
		smearScale: 1.4,
		// light touch: heavy diffusion welds the helical ropes into one trunk and
		// the spiral grooves vanish — just enough to bridge same-rope beads
		smooth: 0.65,
		smoothPasses: 2,
		cohesion: 0.35,
		stream: 1,
		plume: 1,
		pool: 1
	},
	// water flows: one merged rounded body, lone tracers pinch off as droplets.
	// The inflow skins as ribbons — pulled water arrives as liquid runnels, not
	// sparks — and the gathered heap reads as a standing mound of water.
	water: {
		color: 0x4fc3f7,
		emissive: 0x0b3d5c,
		emissiveIntensity: 0.35,
		opacity: 0.8,
		isoScale: 0.5,
		smearScale: 1.5,
		smooth: 0.85,
		smoothPasses: 2,
		cohesion: 1,
		stream: 1,
		plume: 0,
		pool: 1
	},
	earth: {
		color: 0xa1887f,
		emissive: 0x000000,
		emissiveIntensity: 0,
		opacity: 1,
		isoScale: 1,
		smearScale: 1,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0,
		stream: 0,
		plume: 0,
		pool: 1
	},
	// wind has no body: gathered air stays streaks and glowing dots
	wind: {
		color: 0xb2fff2,
		emissive: 0x9adfd4,
		emissiveIntensity: 0.25,
		opacity: 0.32,
		isoScale: 1,
		smearScale: 1,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0,
		stream: 0,
		plume: 0,
		pool: 0
	},
	crystal: {
		color: 0xce93d8,
		emissive: 0x4a148c,
		emissiveIntensity: 0.3,
		opacity: 0.88,
		isoScale: 1,
		smearScale: 1,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0,
		stream: 0,
		plume: 0,
		pool: 1
	},
	light: {
		color: 0xffe082,
		emissive: 0xffd54f,
		emissiveIntensity: 0.9,
		opacity: 0.78,
		isoScale: 1,
		smearScale: 1,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0,
		stream: 0,
		plume: 0,
		pool: 1
	}
};

/** 3-step cel ramp shared by every toon element material. */
function makeGradientMap(): THREE.DataTexture {
	const steps = [55, 160, 255];
	const data = new Uint8Array(steps.length * 4);
	steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
	const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
	tex.minFilter = THREE.NearestFilter;
	tex.magFilter = THREE.NearestFilter;
	tex.needsUpdate = true;
	return tex;
}

function makeToonMaterial(look: VolumeLook, gradient: THREE.DataTexture): THREE.MeshToonMaterial {
	return new THREE.MeshToonMaterial({
		color: look.color,
		emissive: look.emissive,
		emissiveIntensity: look.emissiveIntensity,
		gradientMap: gradient,
		transparent: look.opacity < 1,
		opacity: look.opacity,
		depthWrite: look.opacity >= 0.5, // wispy elements shouldn't occlude themselves
		side: THREE.DoubleSide // isosurface gets clipped open at the grid border
	});
}

/**
 * Water: toon base + rippled normals driving a hard specular glint and a
 * fresnel rim — the "wet" reading is those two moving highlights, not the
 * base color. uTime is advanced by ElementVolume3D.update.
 */
function makeWaterMaterial(
	look: VolumeLook,
	gradient: THREE.DataTexture,
	uTime: { value: number }
): THREE.MeshToonMaterial {
	const mat = makeToonMaterial(look, gradient);
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = uTime;
		shader.uniforms.uKeyDir = { value: new THREE.Vector3(2.5, 4.0, 1.5).normalize() }; // main.ts key light
		shader.vertexShader = shader.vertexShader
			.replace('void main() {', 'varying vec3 vWPos;\nvoid main() {')
			.replace(
				'#include <project_vertex>',
				'#include <project_vertex>\n  vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'void main() {',
				'uniform float uTime;\nuniform vec3 uKeyDir;\nvarying vec3 vWPos;\nvoid main() {'
			)
			.replace(
				'#include <opaque_fragment>',
				/* glsl */ `
  vec3 nView = normalize( normal );
  vec3 vDir = normalize( vViewPosition );
  // ripple: world-position sines wobble the shading normal, so the glint
  // and rim shimmer as the surface (and time) moves
  vec3 nRip = nView;
  nRip.xy += 0.22 * vec2(
    sin( vWPos.x * 7.0 + uTime * 2.6 + vWPos.y * 3.0 ),
    sin( vWPos.z * 7.0 - uTime * 2.2 + vWPos.y * 4.0 ) );
  nRip = normalize( nRip );
  vec3 lDir = normalize( ( viewMatrix * vec4( uKeyDir, 0.0 ) ).xyz );
  float glint = smoothstep( 0.95, 0.97, dot( nRip, normalize( lDir + vDir ) ) );
  float fres = pow( 1.0 - saturate( dot( nView, vDir ) ), 3.0 );
  outgoingLight += vec3( 0.90, 0.97, 1.0 ) * glint * 0.85;
  outgoingLight += vec3( 0.55, 0.85, 1.0 ) * fres * 0.6;
  diffuseColor.a = min( 1.0, diffuseColor.a + fres * 0.18 + glint * 0.3 );
#include <opaque_fragment>`
			);
	};
	return mat;
}

// Shared GLSL: cheap 3D value noise (stylized fire doesn't need simplex).
const NOISE_GLSL = /* glsl */ `
float hashN(vec3 p) {
	return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hashN(i);
	float n100 = hashN(i + vec3(1.0, 0.0, 0.0));
	float n010 = hashN(i + vec3(0.0, 1.0, 0.0));
	float n110 = hashN(i + vec3(1.0, 1.0, 0.0));
	float n001 = hashN(i + vec3(0.0, 0.0, 1.0));
	float n101 = hashN(i + vec3(1.0, 0.0, 1.0));
	float n011 = hashN(i + vec3(0.0, 1.0, 1.0));
	float n111 = hashN(i + vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
		mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
		f.z);
}
float fbm(vec3 p) {
	return (0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03) + 0.125 * vnoise(p * 4.07)) / 0.875;
}
`;

const FIRE_VERTEX = /* glsl */ `
uniform float uTime;
varying vec3 vW;
varying float vRim;
${NOISE_GLSL}
void main() {
	vec3 nrm = normalize(normal);
	vec4 w = modelMatrix * vec4(position, 1.0);
	// flicker: tips wobble along the normal, base stays anchored to the seal
	float hV = clamp(w.y / 1.8, 0.0, 1.0);
	float wob = vnoise(vec3(w.x * 2.2, w.y * 1.4 - uTime * 3.4, w.z * 2.2));
	vec3 displaced = position + nrm * (wob - 0.5) * (0.015 + 0.1 * hV);
	vec3 nv = normalize(normalMatrix * nrm);
	vRim = 1.0 - abs(nv.z);
	w = modelMatrix * vec4(displaced, 1.0);
	vW = w.xyz;
	gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FIRE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uPhase;
varying vec3 vW;
varying float vRim;
// Spiral bands wound around the fire column, LOCKED to the vortex rope
// geometry: same arm count as VORTEX_STRANDS, same winding as VORTEX_PITCH,
// rotated by the whirl phase (uPhase, from ambient3d's spinPhase). The bright
// bands therefore sit ON the physical ropes and turn with them — shading and
// silhouette agree, which is what sells rotation in a still frame. On seals
// with no whirl uPhase stays 0 and the winding is static; the noise field
// still animates the flame. CUT erodes the cool troughs so the winding also
// notches the silhouette.
const float SPIRAL_ARMS = ${CONFIG.VORTEX_STRANDS.toFixed(1)};
const float SPIRAL_PITCH = ${CONFIG.VORTEX_PITCH.toFixed(2)};
const float SPIRAL_CONTRAST = 0.44;
const float SPIRAL_CUT = 0.2;
${NOISE_GLSL}
// cel-banded temperature ramp: deep ember -> red-orange -> orange -> yellow -> white core
vec3 fireRamp(float t) {
	vec3 c = vec3(0.58, 0.09, 0.04);
	c = mix(c, vec3(0.93, 0.28, 0.05), smoothstep(0.18, 0.24, t));
	c = mix(c, vec3(1.00, 0.62, 0.10), smoothstep(0.40, 0.46, t));
	c = mix(c, vec3(1.00, 0.86, 0.25), smoothstep(0.62, 0.68, t));
	c = mix(c, vec3(1.00, 0.98, 0.82), smoothstep(0.86, 0.92, t));
	return c;
}
void main() {
	// helical domain: the noise frame corkscrews with height and spins over
	// time, so the erosion pattern visibly whirls around the column
	float tw = vW.y * 1.5 - uTime * 4.2;
	float cs = cos(tw);
	float sn = sin(tw);
	// vertically stretched noise rising over time: tongues, not cauliflower
	vec3 q = vec3((vW.x * cs - vW.z * sn) * 2.8, vW.y * 1.3 - uTime * 3.6, (vW.x * sn + vW.z * cs) * 2.8);
	float n = fbm(q);
	// SPIRAL BANDS: a barber-pole wound up the column, the one cue that reads as
	// rotation in a still frame. (azimuth − whirl phase − height·pitch) is a
	// rope's own coordinate: cos peaks exactly on each rope strand and troughs
	// in the groove between ropes. Mild noise ripples the stripes like flame
	// rather than lathe-cut grooves.
	float ang = atan(vW.z, vW.x);
	float spiral = (ang - uPhase - vW.y * SPIRAL_PITCH) * SPIRAL_ARMS;
	float wave = cos(spiral) + 0.5 * (n - 0.5);
	// band strength flickers over the surface so the stripes surge and gutter
	// like flame instead of reading as painted-on lathe grooves
	float bandAmp = SPIRAL_CONTRAST * (0.7 + 0.7 * vnoise(vec3(vW.x * 1.2, vW.y * 0.8 - uTime * 0.9, vW.z * 1.2)));
	// cool troughs (wave < 0) also bite into the skin so the winding shows in the
	// silhouette, not just the shading
	float trough = smoothstep(0.1, -0.7, wave);
	// erosion plateaus low: the crown's physical break-up (mote shred past the
	// deposit gate) does the dissolving now — heavy shader erosion up top eats
	// the skin into disconnected plates instead of ragged flame
	float h = clamp(vW.y / 2.6, 0.0, 0.5);
	// erosion grows with height and toward the silhouette: the top dissolves
	// into ragged licks and the sides go lacy. Kept moderate so the upper column
	// keeps enough body to carry the spiral bands, not only the dense base
	float erode = 0.08 + 0.4 * h + 0.18 * vRim + SPIRAL_CUT * trough;
	if (n < erode) discard;
	float edge = 1.0 - smoothstep(erode, erode + 0.20, n);
	// hot at the base, ember rims; burn-through edges flash only low down.
	// cooling uses a longer scale than erosion so tall plumes tip out at
	// ember orange, never soot maroon
	float hh = clamp(vW.y / 3.4, 0.0, 1.0);
	// base sits mid-ramp (orange) so the spiral bands swing the full orange↔white
	// range instead of saturating white and washing the barber-pole flat — even
	// the hot foot keeps its stripes instead of blowing out to a solid cone
	float heat = 0.72 - 0.54 * hh + 0.35 * (n - 0.5) - 0.34 * vRim + 0.30 * edge * (1.0 - 0.6 * h);
	// paint the barber-pole: ridges flare hot (yellow/white), troughs drop to
	// ember — bright diagonal stripes winding around the funnel
	heat += bandAmp * wave;
	// backfaces are the inside of the shell: the furnace core glimpsed
	// through the eroded holes and the groove gaps reads hotter than the
	// skin — the tornado has a molten heart, not a hollow bore
	if (!gl_FrontFacing) heat += 0.42;
	gl_FragColor = vec4(fireRamp(clamp(heat, 0.0, 1.0)), 1.0);
}
`;

/** Fire: unlit emissive shader — erosion licks + banded temperature ramp. */
function makeFireMaterial(
	uTime: { value: number },
	uPhase: { value: number }
): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: { uTime, uPhase },
		vertexShader: FIRE_VERTEX,
		fragmentShader: FIRE_FRAGMENT,
		side: THREE.DoubleSide // discard carves through to backfaces
	});
}

/**
 * One material per element, sharing the uTime and whirl-phase uniforms
 * volume3d advances every frame.
 */
export function createVolumeMaterials(
	uTime: { value: number },
	uPhase: { value: number }
): Record<SimElement, THREE.Material> {
	const gradient = makeGradientMap();
	const materials = {} as Record<SimElement, THREE.Material>;
	for (const el of Object.keys(LOOKS) as SimElement[]) {
		if (el === 'fire') materials[el] = makeFireMaterial(uTime, uPhase);
		else if (el === 'water') materials[el] = makeWaterMaterial(LOOKS[el], gradient, uTime);
		else materials[el] = makeToonMaterial(LOOKS[el], gradient);
	}
	return materials;
}
