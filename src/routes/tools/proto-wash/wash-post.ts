/**
 * @file The stylization chain. The proxies draw a density field; everything that
 * makes this read as paint happens here, in three screen-space passes:
 *
 * 1. **wash** — the density becomes a saturating wash value, and the whole field
 *    is sampled through a low-frequency warp so the silhouette is hand-wobbled
 *    rather than mathematically smooth.
 * 2. **paint** — an anisotropic Kuwahara: the 4 quadrants are rotated into the
 *    local gradient frame and stretched along the iso-line, so the flattening
 *    follows the form the way a loaded brush does.
 * 3. **pigment** — palette quantization into mixed-pigment steps with the step
 *    edge wobbled by the paper, watercolour edge darkening (pigment pools and
 *    goes opaque where the wash gradient is steep), paper tooth biting the thin
 *    parts, and the premultiplied composite onto the page.
 *
 * Nothing here is additive, which is the point: pigment on a lit page darkens the
 * page. Additive light on black is the look this bake-off is replacing.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { NOISE_GLSL, PIGMENT_GLSL } from './wash-glsl.js';

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WASH_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uInk;
uniform float uBleed;
uniform float uSmooth;
varying vec2 vUv;

${NOISE_GLSL}

// The impostors leave a lumpy field. One gaussian pass fuses them, which is what
// stops the wash from showing paper through the middle of its own body.
vec4 fused(vec2 uv) {
	vec4 sum = vec4(0.0);
	float total = 0.0;
	for (int j = -2; j <= 2; j++) {
		for (int i = -2; i <= 2; i++) {
			float weight = exp(-0.5 * float(i * i + j * j) / 1.7);
			sum += texture2D(tDiffuse, uv + vec2(float(i), float(j)) * uTexel * uSmooth) * weight;
			total += weight;
		}
	}
	return sum / total;
}

void main() {
	vec2 warp = vec2(
		washFbm2(vUv * 3.3 + 4.1) - 0.5,
		washFbm2(vUv * 3.3 + 27.9) - 0.5
	) * uBleed;
	vec4 field = fused(vUv + warp);
	float density = max(field.a, 0.0);
	float wash = 1.0 - exp(-density * uInk);
	float heat = clamp(field.g / max(field.r, 1e-4), 0.0, 1.0);
	float soot = clamp(field.b / max(field.r, 1e-4), 0.0, 1.0);
	gl_FragColor = vec4(wash, heat, soot, wash);
}
`;

const PAINT_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uAniso;
varying vec2 vUv;

#define KUWAHARA_R 3

float washOf(vec2 uv) {
	return texture2D(tDiffuse, uv).r;
}

void main() {
	// Structure tensor, cheap: a 3x3 Sobel on the wash channel.
	float tl = washOf(vUv + uTexel * vec2(-1.0, -1.0));
	float tc = washOf(vUv + uTexel * vec2(0.0, -1.0));
	float tr = washOf(vUv + uTexel * vec2(1.0, -1.0));
	float ml = washOf(vUv + uTexel * vec2(-1.0, 0.0));
	float mr = washOf(vUv + uTexel * vec2(1.0, 0.0));
	float bl = washOf(vUv + uTexel * vec2(-1.0, 1.0));
	float bc = washOf(vUv + uTexel * vec2(0.0, 1.0));
	float br = washOf(vUv + uTexel * vec2(1.0, 1.0));
	vec2 gradient = vec2(
		(tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl),
		(bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr)
	);
	float strength = length(gradient);
	vec2 across = strength > 1e-4 ? gradient / strength : vec2(1.0, 0.0);
	vec2 along = vec2(-across.y, across.x);

	float steps = float(KUWAHARA_R);
	vec2 stepAlong = along * uTexel * (uRadius * (1.0 + uAniso) / steps);
	vec2 stepAcross = across * uTexel * (uRadius / ((1.0 + 0.7 * uAniso) * steps));

	// Generalized Kuwahara: the four sector means are blended by how flat each
	// sector is, rather than hard-selected. A hard min-select erodes thin licks
	// and punches flat holes near an edge, which on paper reads as spatter.
	vec4 blended = vec4(0.0);
	float blendWeight = 0.0;

	for (int quadrant = 0; quadrant < 4; quadrant++) {
		float signAlong = (quadrant == 0 || quadrant == 1) ? 1.0 : -1.0;
		float signAcross = (quadrant == 0 || quadrant == 2) ? 1.0 : -1.0;
		vec4 sum = vec4(0.0);
		float sumSquared = 0.0;
		float count = 0.0;
		for (int i = 0; i <= KUWAHARA_R; i++) {
			for (int j = 0; j <= KUWAHARA_R; j++) {
				vec2 offset = stepAlong * (signAlong * float(i)) + stepAcross * (signAcross * float(j));
				vec4 tap = texture2D(tDiffuse, vUv + offset);
				sum += tap;
				sumSquared += tap.r * tap.r;
				count += 1.0;
			}
		}
		vec4 mean = sum / count;
		float variance = max(sumSquared / count - mean.r * mean.r, 0.0);
		float weight = 1.0 / (1.0 + pow(variance * 34.0, 3.2));
		blended += mean * weight;
		blendWeight += weight;
	}

	gl_FragColor = blended / max(blendWeight, 1e-5);
}
`;

const PIGMENT_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uLevels;
uniform float uDither;
uniform float uEdge;
uniform float uGrain;
uniform float uPaperScale;
varying vec2 vUv;

${NOISE_GLSL}
${PIGMENT_GLSL}

float washOf(vec2 uv) {
	return texture2D(tDiffuse, uv).r;
}

void main() {
	vec4 field = texture2D(tDiffuse, vUv);
	float wash = clamp(field.r, 0.0, 1.0);
	float heat = clamp(field.g, 0.0, 1.0);
	float soot = clamp(field.b, 0.0, 1.0);

	// The sheet: a broad tooth plus a stretched fibre, both static.
	vec2 paperUv = vUv * uPaperScale;
	float fibre = washFbm2(paperUv) * 0.6 + washFbm2(vec2(paperUv.x * 0.3, paperUv.y * 3.2) + 19.0) * 0.4;

	// Mixed pigment reads as steps, and the step edge follows the paper, not a ring.
	float quantized = clamp(floor(wash * uLevels + 0.5 + (fibre - 0.5) * uDither) / uLevels, 0.0, 1.0);

	// Real washes pool where they stop: darker and more opaque at a steep gradient.
	float dx = washOf(vUv + vec2(uTexel.x, 0.0)) - washOf(vUv - vec2(uTexel.x, 0.0));
	float dy = washOf(vUv + vec2(0.0, uTexel.y)) - washOf(vUv - vec2(0.0, uTexel.y));
	float slope = length(vec2(dx, dy)) * 0.5;
	float rim = smoothstep(0.006, 0.060, slope) * (1.0 - smoothstep(0.80, 0.97, quantized));

	vec3 pigment = washPigment(quantized, heat);
	// Soot is milled into the wash, not painted over it, and a thin veil of it is
	// burnt umber before it is grey.
	vec3 smokePigment = mix(WASH_UMBER * 0.9, WASH_SOOT * 1.45, smoothstep(0.35, 0.95, soot));
	pigment = mix(pigment, smokePigment, soot * 0.66 * (1.0 - smoothstep(0.46, 0.90, quantized)));
	pigment *= mix(1.0, 0.44, rim * uEdge);
	pigment = mix(pigment, WASH_UMBER * 0.72, rim * uEdge * 0.42);

	// Ink over the wash: a contour on the silhouette and a fainter one inside it,
	// both wandering with the paper so neither reads as a machined isoline.
	float wobble = (fibre - 0.5) * 0.055;
	float outline = 1.0 - smoothstep(0.0, 0.046, abs(wash - (0.125 + wobble)));
	float inner = 1.0 - smoothstep(0.0, 0.030, abs(wash - (0.545 + wobble * 1.6)));
	// Smoke has no drawn edge, so the contour is held back wherever soot leads.
	float ink = clamp(outline * 0.9 + inner * 0.24, 0.0, 1.0) * uEdge * (1.0 - 0.78 * soot);
	pigment = mix(pigment, WASH_SOOT * 0.85, ink * 0.85);

	// A wash is translucent in proportion to how much pigment is in it, so alpha
	// tracks the wash value nearly linearly. A steep threshold is what turns a
	// dilute veil into an opaque cut-out.
	float coverage = clamp((wash - 0.020) * 2.7, 0.0, 1.0);
	coverage = clamp(coverage + rim * uEdge * 0.30 + ink * 0.55, 0.0, 1.0);
	// The tooth of the sheet only bites the thin outskirts; through the body of a
	// wash the pigment has already filled the grain.
	float tooth = mix(1.0, 0.40 + 1.0 * fibre, uGrain * (1.0 - smoothstep(0.08, 0.24, wash)));
	coverage = clamp(coverage * tooth, 0.0, 1.0);

	gl_FragColor = vec4(pigment * coverage, coverage);
}
`;

function shaderPass(fragmentShader: string, uniforms: Record<string, { value: unknown }>) {
	const pass = new ShaderPass({ uniforms, vertexShader: FULLSCREEN_VERTEX, fragmentShader });
	pass.material.transparent = true;
	pass.material.depthTest = false;
	pass.material.depthWrite = false;
	pass.material.blending = THREE.NoBlending;
	return pass;
}

/** Knobs the page exposes so the chain can be judged against the style bar. */
export interface WashPostSettings {
	ink: number;
	bleed: number;
	smooth: number;
	paintRadius: number;
	aniso: number;
	levels: number;
	dither: number;
	edge: number;
	grain: number;
}

export const WASH_POST_DEFAULTS: WashPostSettings = {
	ink: 1.7,
	bleed: 0.011,
	smooth: 2.8,
	paintRadius: 3.2,
	aniso: 2.1,
	levels: 6,
	dither: 0.55,
	edge: 1,
	grain: 0.22
};

/** The composer plus the handful of uniforms worth turning. */
export class WashPost {
	readonly #composer: EffectComposer;
	readonly #wash: ShaderPass;
	readonly #paint: ShaderPass;
	readonly #pigment: ShaderPass;

	constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
		this.#composer = new EffectComposer(renderer);
		this.#composer.addPass(new RenderPass(scene, camera));

		this.#wash = shaderPass(WASH_FRAGMENT, {
			tDiffuse: { value: null },
			uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
			uInk: { value: WASH_POST_DEFAULTS.ink },
			uBleed: { value: WASH_POST_DEFAULTS.bleed },
			uSmooth: { value: WASH_POST_DEFAULTS.smooth }
		});
		this.#paint = shaderPass(PAINT_FRAGMENT, {
			tDiffuse: { value: null },
			uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
			uRadius: { value: WASH_POST_DEFAULTS.paintRadius },
			uAniso: { value: WASH_POST_DEFAULTS.aniso }
		});
		this.#pigment = shaderPass(PIGMENT_FRAGMENT, {
			tDiffuse: { value: null },
			uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
			uLevels: { value: WASH_POST_DEFAULTS.levels },
			uDither: { value: WASH_POST_DEFAULTS.dither },
			uEdge: { value: WASH_POST_DEFAULTS.edge },
			uGrain: { value: WASH_POST_DEFAULTS.grain },
			uPaperScale: { value: 520 }
		});
		this.#pigment.renderToScreen = true;

		this.#composer.addPass(this.#wash);
		this.#composer.addPass(this.#paint);
		this.#composer.addPass(this.#pigment);
	}

	setSize(width: number, height: number): void {
		this.#composer.setSize(width, height);
		const texel = new THREE.Vector2(1 / Math.max(width, 1), 1 / Math.max(height, 1));
		this.#wash.uniforms.uTexel.value = texel.clone();
		this.#paint.uniforms.uTexel.value = texel.clone();
		this.#pigment.uniforms.uTexel.value = texel.clone();
		this.#pigment.uniforms.uPaperScale.value = Math.max(width, height) * 0.52;
	}

	apply(settings: WashPostSettings): void {
		this.#wash.uniforms.uInk.value = settings.ink;
		this.#wash.uniforms.uBleed.value = settings.bleed;
		this.#wash.uniforms.uSmooth.value = settings.smooth;
		this.#paint.uniforms.uRadius.value = settings.paintRadius;
		this.#paint.uniforms.uAniso.value = settings.aniso;
		this.#pigment.uniforms.uLevels.value = settings.levels;
		this.#pigment.uniforms.uDither.value = settings.dither;
		this.#pigment.uniforms.uEdge.value = settings.edge;
		this.#pigment.uniforms.uGrain.value = settings.grain;
	}

	render(): void {
		this.#composer.render();
	}

	dispose(): void {
		this.#composer.dispose();
	}
}
