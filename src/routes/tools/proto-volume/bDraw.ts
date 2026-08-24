/**
 * @file Style B's visible marks: one instanced ROUND-CAPPED capsule stamp per
 * parcel, billboarded along its own screen velocity. No pointed quads exist in
 * this style — the fragment program is a soft distance field to a segment, so
 * every mark is a thick blunt dab or a round-ended stroke, and the metaball
 * post pass then merges them into one mass.
 */

import * as THREE from 'three';
import { B_SIM_SIZE } from './bSim.js';
import { INKS, rampGlsl, SUBSTRATE, type ProtoElement } from './elements.js';

const VERTEX = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uSize;
uniform float uStretch;
uniform float uReach;
uniform float uElement;
uniform float uPoolFloor;

attribute vec2 aParcel;

varying vec2 vP;
varying float vSeg;
varying float vAge;
varying float vMote;
varying float vSeed;
varying float vPool;
varying float vHeightN;
varying float vSpeedN;

void main() {
	vec4 p = texture2D(uPos, aParcel);
	vec4 v = texture2D(uVel, aParcel);
	float life = abs(v.w);
	float age = clamp(p.w / max(life, 1e-4), 0.0, 1.0);
	float alive = step(p.w, life) * step(1e-4, life);

	vAge = age;
	vMote = step(v.w, -1e-4);
	vSeed = fract(dot(aParcel, vec2(97.31, 41.17)));
	float speed = length(v.xyz);
	vSpeedN = clamp(speed / 3.5, 0.0, 1.0);
	vHeightN = clamp(p.z / uReach, 0.0, 1.2);
	// Pooled: low and slow, water only. Mirrors the sim's own test.
	vPool = uElement > 0.5 && uElement < 1.5
		? (1.0 - smoothstep(uPoolFloor, uPoolFloor * 4.0, p.z)) * (1.0 - smoothstep(0.06, 0.3, abs(v.z)))
		: 0.0;

	vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
	vec3 mvVel = (modelViewMatrix * vec4(v.xyz, 0.0)).xyz;
	float screenSpeed = length(mvVel.xy);
	vec2 along = screenSpeed > 1e-4 ? mvVel.xy / screenSpeed : vec2(0.0, 1.0);
	vec2 across = vec2(-along.y, along.x);

	float grow = mix(0.7, 1.5, smoothstep(0.0, 0.85, age));
	// Fire's foot is built from wide overlapping washes, not floating specks.
	float baseSwell = uElement < 0.5 ? 1.0 + 0.9 * (1.0 - smoothstep(0.0, 0.35, p.z)) : 1.0;
	float radius = uSize * (0.8 + 0.4 * vSeed) * grow * baseSwell * (1.0 + 1.3 * vPool) * alive;
	// Round-capped stroke: the along half-length can only ADD to a full round
	// cap, so a fast mark is a longer stroke, never a sharper one.
	float halfLen = radius * (1.0 + uStretch * min(screenSpeed, 3.4) * (1.0 - 0.85 * vPool));
	float k = halfLen / max(radius, 1e-5);
	vP = vec2(position.x * 2.0, position.y * 2.0 * k);
	vSeg = k - 1.0;

	mv.xy += along * (position.y * halfLen * 2.0) + across * (position.x * radius * 2.0);
	gl_Position = projectionMatrix * mv;
}
`;

function fragment(element: ProtoElement): string {
	const ink = INKS[element];
	return /* glsl */ `
uniform float uOpacity;
uniform float uElement;
uniform vec2 uFadeOut;

varying vec2 vP;
varying float vSeg;
varying float vAge;
varying float vMote;
varying float vSeed;
varying float vPool;
varying float vHeightN;
varying float vSpeedN;

${rampGlsl(element)}

void main() {
	// Soft distance to the centerline segment: a capsule, so caps are round.
	float d = length(vec2(vP.x, max(abs(vP.y) - vSeg, 0.0)));
	float body = 1.0 - smoothstep(0.25, 1.0, d);
	if (body < 0.004) {
		discard;
	}

	float fadeIn = smoothstep(0.0, 0.05, vAge);
	float fadeOut = 1.0 - smoothstep(uFadeOut.x, uFadeOut.y, vAge);
	float alpha = uOpacity * body * fadeIn * fadeOut;
	alpha *= mix(1.0, 0.05, vMote);
	alpha *= mix(1.0, 0.55, vPool);
	if (alpha < 0.002) {
		discard;
	}

	float heat;
	if (uElement < 0.5) {
		// Fire: young is hot, neighbours spread on the ramp so no flat wash.
		heat = clamp((1.0 - vAge) * (0.62 + 0.5 * vSeed) + 0.12 * vHeightN, 0.0, 0.96);
	} else if (uElement < 1.5) {
		// Water: deep in the pool and the body, foam on crests and fast spray.
		heat = clamp(0.3 + 0.34 * vHeightN + 0.3 * vSpeedN - 0.28 * vPool + 0.12 * vSeed, 0.0, 1.0);
	} else {
		// Wind: pale throughout, faintly varied.
		heat = 0.5 + 0.4 * vSeed;
	}
	vec3 col = pigment(heat);
	col = mix(col, vec3(${ink.map((c) => c.toFixed(3)).join(', ')}), vMote * 0.85);

	gl_FragColor = vec4(col * alpha, alpha);
}
`;
}

/** The instanced geometry: a unit quad plus the texel each instance reads. */
function stampGeometry(): THREE.InstancedBufferGeometry {
	const quad = new THREE.PlaneGeometry(1, 1);
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.index = quad.index;
	geometry.setAttribute('position', quad.getAttribute('position'));
	geometry.setAttribute('uv', quad.getAttribute('uv'));
	const count = B_SIM_SIZE * B_SIM_SIZE;
	const texels = new Float32Array(count * 2);
	for (let index = 0; index < count; index += 1) {
		texels[index * 2] = ((index % B_SIM_SIZE) + 0.5) / B_SIM_SIZE;
		texels[index * 2 + 1] = (Math.floor(index / B_SIM_SIZE) + 0.5) / B_SIM_SIZE;
	}
	geometry.setAttribute('aParcel', new THREE.InstancedBufferAttribute(texels, 2));
	geometry.instanceCount = count;
	quad.dispose();
	return geometry;
}

export class BDraw {
	readonly mesh: THREE.Mesh;
	readonly #material: THREE.ShaderMaterial;

	constructor(
		element: ProtoElement,
		reach: number,
		position: THREE.Texture,
		velocity: THREE.Texture
	) {
		const row = SUBSTRATE[element];
		this.#material = new THREE.ShaderMaterial({
			uniforms: {
				uPos: { value: position },
				uVel: { value: velocity },
				uSize: { value: row.stampSize },
				uStretch: { value: row.stretch },
				uOpacity: { value: row.opacity },
				uFadeOut: { value: new THREE.Vector2(row.fadeOut[0], row.fadeOut[1]) },
				uReach: { value: reach },
				uElement: { value: element === 'fire' ? 0 : element === 'water' ? 1 : 2 },
				uPoolFloor: { value: 0.02 }
			},
			vertexShader: VERTEX,
			fragmentShader: fragment(element),
			transparent: true,
			depthTest: false,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor
		});
		this.mesh = new THREE.Mesh(stampGeometry(), this.#material);
		this.mesh.frustumCulled = false;
		this.mesh.name = 'b-stamps';
	}

	/** The sim swaps its targets every step, so the mesh is re-pointed. */
	setSources(position: THREE.Texture, velocity: THREE.Texture): void {
		this.#material.uniforms.uPos.value = position;
		this.#material.uniforms.uVel.value = velocity;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.#material.dispose();
	}
}
