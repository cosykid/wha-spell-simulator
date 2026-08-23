/**
 * @file The proxies: one instanced quad system whose blobs melt into a single
 * column of mass. Nothing here is meant to be looked at directly — it exists to
 * be stylized, so its shading is a flat gaussian and its whole output is three
 * scalars the post chain reads back.
 *
 * The blobs are metaball-style impostors accumulated additively into a density
 * field, which is the reason the result cannot read as countable elements: at the
 * coverage threshold the post pass picks, the individual blobs have already
 * fused. Five roles share the one draw call, and they are the five things this
 * cast puts on the page: the medium drawing in over the charge, the strike's
 * shock ring, the column, the near-white root it stands on, and the smoke that
 * comes off its tip.
 *
 * Channels written: `r` density, `g` density * heat, `b` density * soot,
 * `a` density. The post chain divides `g` and `b` back out.
 */

import * as THREE from 'three';
import { NOISE_GLSL } from './wash-glsl.js';
import type { WashCast, WashCue } from './wash-spell.js';

/** How many impostors each role gets. Enough overlap that nothing is countable. */
const POPULATION = { column: 1700, burst: 900, haze: 1500, core: 190, smoke: 560 } as const;

const ROLE = { column: 0, burst: 1, haze: 2, core: 3, smoke: 4 } as const;

const VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec4 aSeed;
attribute float aRole;

uniform float uTime;
uniform float uFlow;
uniform float uSmokeFlow;
uniform float uHeight;
uniform float uFootprint;
uniform float uBlob;
uniform float uTurb;
uniform float uDrive;
uniform float uSquash;
uniform float uSwirl;
uniform float uSway;
uniform float uMassColumn;
uniform float uMassBurst;
uniform float uMassHaze;
uniform float uMassCore;
uniform float uMassSmoke;
uniform float uCharge;
uniform float uBurstRadius;
uniform float uCoreRadius;
uniform float uCoreHeight;
uniform vec2 uFeet[3];

varying vec2 vQuad;
varying float vDensity;
varying float vHeat;
varying float vSoot;

${NOISE_GLSL}

const float TAU = 6.28318530718;

// How wide the beam stands at height u: fed at the foot, necked, then spent.
float columnProfile(float u) {
	return (0.55 + 0.85 * u * (1.0 - 0.55 * u)) * (1.0 - smoothstep(0.72, 1.06, u));
}

// The whole beam wanders, so the silhouette is never twice the same.
vec2 columnSway(float u, float time, float amount) {
	return vec2(
		sin(time * 0.85 + u * 2.1) * 0.55 + sin(time * 1.9 - u * 3.4) * 0.22,
		cos(time * 0.7 + u * 1.7) * 0.4
	) * amount * (0.25 + u);
}

void main() {
	float role = aRole;
	vec3 centre = vec3(0.0);
	vec3 flow = vec3(0.0, 0.0, 1.0);
	float size = 0.0;
	float density = 0.0;
	float heat = 0.0;
	float soot = 1.0;
	float stretch = 0.0;

	if (role < 0.5) {
		// The column. Each blob is a packet climbing the beam on a looping age, so
		// the mass is continuously fed rather than spawned once.
		float age = fract(uFlow - aSeed.x);
		float u = pow(age, 1.22);
		float alive = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.42, 1.0, age));

		// R-05 read as form: three drawn feet braid onto the one axis they cancel to.
		int footIndex = int(floor(aSeed.w * 2.999));
		vec2 foot = uFeet[footIndex];
		vec2 base = foot * (1.0 - smoothstep(0.0, 0.30, u)) * 0.45;

		float profile = columnProfile(u);
		// Tight at the very foot, so the beam stands in a pool rather than in a
		// scatter of separate droplets around the ring.
		float profileFoot = mix(0.5, 1.0, smoothstep(0.0, 0.16, u));
		float radius = uFootprint * profile * profileFoot * (0.12 + 0.88 * pow(aSeed.z, 0.92));
		float angle = aSeed.y * TAU + uSwirl * u * 2.6 + uTime * 0.45;
		vec2 offset = vec2(cos(angle), sin(angle)) * radius;

		centre = vec3(base + offset + columnSway(u, uTime, uSway), u * uHeight);

		vec3 field = vec3(centre.xy * 1.45, centre.z * 0.95 - uTime * 1.55);
		float nx = washFbm3(field) - 0.5;
		float ny = washFbm3(field.yzx * 1.63 + 11.7) - 0.5;
		float nz = washFbm3(field.zxy * 0.87 + 31.1) - 0.5;
		float turbulence = uTurb * (0.16 + 1.35 * u * u);
		centre += vec3(nx, ny, nz * 0.8) * turbulence * 2.4;

		flow = vec3(nx * 1.6, ny * 1.6, 1.35 + uDrive * 1.5);
		stretch = uSquash * (0.22 + 1.05 * u) * (0.65 + 0.7 * uDrive);
		float flicker = 0.72 + 0.42 * sin(uTime * 11.5 + aSeed.y * 41.0 + u * 9.0);
		// Fattest low, spent at the tip: a chopped-off trunk is what reads as CG.
		float taper = (0.55 + 1.05 * u) * (1.0 - smoothstep(0.30, 1.0, u) * 0.72);
		size = uBlob * taper * (0.45 + 1.0 * aSeed.z) * flicker * alive;
		density = uMassColumn * alive * (0.45 + 0.95 * aSeed.z);
		float onAxis = 1.0 - smoothstep(0.10, 0.98, radius / max(uFootprint * max(profile, 0.05), 0.001));
		heat = (0.16 + 0.84 * onAxis) * (1.0 - 0.60 * smoothstep(0.22, 1.0, u));
		// Smoky at the rim and at the tip, clean on the axis: that contrast is what
		// keeps a flat orange slab from happening.
		soot = clamp(0.04 + 0.16 * (1.0 - onAxis) + 0.85 * smoothstep(0.50, 1.0, u), 0.0, 1.0);
	} else if (role < 1.5) {
		// The strike ring, thrown flat across the paper and drying as it goes.
		float angle = aSeed.y * TAU;
		float wobble = washFbm2(vec2(angle * 2.6, uTime * 0.5)) - 0.5;
		float radius = uBurstRadius * (0.80 + 0.26 * aSeed.z + wobble * 0.34);
		centre = vec3(cos(angle) * radius, sin(angle) * radius, 0.02 + uBurstRadius * 0.16 * aSeed.z);
		flow = vec3(cos(angle), sin(angle), 0.5);
		stretch = 0.4 + 0.45 * uSquash;
		size = uBlob * (0.35 + 0.5 * aSeed.z) * (0.55 + 0.5 * min(uBurstRadius, 1.8));
		density = uMassBurst * (0.4 + 0.85 * aSeed.x);
		heat = 1.0 - smoothstep(0.15, 1.05, uBurstRadius);
		soot = 0.30 + 0.68 * smoothstep(0.35, 1.5, uBurstRadius);
	} else if (role < 2.5) {
		// R-10's medium, drawn inward over the charge beat: the quiet buildup.
		float draw = smoothstep(0.0, 1.0, uCharge);
		float outer = 1.25 + 0.85 * aSeed.z;
		float radius = mix(outer, 0.22 + 0.58 * aSeed.z, draw);
		float angle = aSeed.y * TAU + draw * 1.4 + uTime * 0.18;
		centre = vec3(cos(angle) * radius, sin(angle) * radius, 0.03 + 0.55 * aSeed.w * (1.0 - 0.5 * draw));
		vec3 field = vec3(centre.xy * 1.1, uTime * 0.4);
		centre.xy += vec2(washFbm3(field) - 0.5, washFbm3(field.yzx + 5.1) - 0.5) * 0.7;
		flow = vec3(-cos(angle), -sin(angle), 0.3);
		stretch = 0.7;
		size = uBlob * (0.55 + 0.7 * aSeed.z);
		density = uMassHaze * (0.3 + 0.7 * aSeed.x);
		// A touch of heat keeps the gathering medium warm umber rather than a cold
		// grey smudge on a cream page.
		heat = 0.14;
		soot = 0.88;
	} else if (role < 3.5) {
		// The root: the only place the palette is allowed to reach near-white.
		float angle = aSeed.y * TAU + uTime * 0.9;
		float radius = uCoreRadius * (0.08 + 0.62 * aSeed.z * aSeed.z);
		centre = vec3(cos(angle) * radius, sin(angle) * radius, aSeed.x * aSeed.x * uCoreHeight);
		vec3 field = vec3(centre.xy * 2.6, centre.z * 1.5 - uTime * 2.2);
		centre.xy += vec2(washFbm3(field) - 0.5, washFbm3(field.yzx + 17.3) - 0.5) * 0.22;
		flow = vec3(0.0, 0.0, 1.0);
		stretch = 0.35 * uSquash;
		size = uBlob * (0.55 + 0.5 * aSeed.z) * (0.82 + 0.3 * sin(uTime * 17.0 + aSeed.y * 23.0));
		density = uMassCore * (0.6 + 0.7 * aSeed.z);
		heat = 1.0;
		soot = 0.0;
	} else {
		// Smoke off the tip: soot, slow, and the only thing that outlives the flame.
		float age = fract(uSmokeFlow - aSeed.x);
		float u = pow(age, 0.9);
		float alive = smoothstep(0.0, 0.10, age) * (1.0 - smoothstep(0.35, 1.0, age));
		float radius = uFootprint * (0.5 + 2.4 * u) * (0.15 + 0.85 * aSeed.z);
		float angle = aSeed.y * TAU + u * 1.9 + uTime * 0.2;
		centre = vec3(cos(angle) * radius, sin(angle) * radius, uHeight * 0.58 + u * 2.3);
		centre.xy += columnSway(1.0, uTime, uSway) + vec2(aSeed.w - 0.5, aSeed.x - 0.5) * u * 1.5;
		vec3 field = vec3(centre.xy * 0.85, centre.z * 0.5 - uTime * 0.55);
		centre.xy += vec2(washFbm3(field) - 0.5, washFbm3(field.yzx + 41.0) - 0.5) * 1.1;
		flow = vec3(0.25, 0.0, 1.0);
		stretch = 0.3;
		size = uBlob * (1.7 + 3.2 * u) * (0.55 + 0.8 * aSeed.z) * alive;
		density = uMassSmoke * alive * (0.35 + 0.7 * aSeed.z) * (1.0 - 0.7 * u);
		heat = 0.0;
		soot = 1.0;
	}

	vec4 viewCentre = modelViewMatrix * vec4(centre, 1.0);
	vec3 viewFlow = (modelViewMatrix * vec4(flow, 0.0)).xyz;
	vec2 along = normalize(viewFlow.xy + vec2(1e-5, 1e-5));
	vec2 across = vec2(-along.y, along.x);
	float longSide = size * (1.0 + stretch);
	float wideSide = size / (1.0 + 0.28 * stretch);
	viewCentre.xy += along * (position.y * longSide) + across * (position.x * wideSide);

	vQuad = position.xy * 2.0;
	vDensity = max(density, 0.0);
	vHeat = clamp(heat, 0.0, 1.0);
	vSoot = clamp(soot, 0.0, 1.0);
	gl_Position = projectionMatrix * viewCentre;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vQuad;
varying float vDensity;
varying float vHeat;
varying float vSoot;

void main() {
	float falloff = exp(-3.4 * dot(vQuad, vQuad)) - 0.031;
	if (falloff <= 0.0 || vDensity <= 0.0) {
		discard;
	}
	float density = falloff * vDensity;
	gl_FragColor = vec4(density, density * vHeat, density * vSoot, density);
}
`;

function quadGeometry(total: number): THREE.InstancedBufferGeometry {
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)
	);
	geometry.setIndex([0, 1, 2, 0, 2, 3]);

	const seeds = new Float32Array(total * 4);
	const roles = new Float32Array(total);
	let index = 0;
	const fill = (count: number, role: number) => {
		for (let n = 0; n < count; n += 1) {
			// A prototype has no replay contract, so plain Math.random is fine here.
			seeds[index * 4] = Math.random();
			seeds[index * 4 + 1] = Math.random();
			seeds[index * 4 + 2] = Math.random();
			seeds[index * 4 + 3] = Math.random();
			roles[index] = role;
			index += 1;
		}
	};
	fill(POPULATION.column, ROLE.column);
	fill(POPULATION.burst, ROLE.burst);
	fill(POPULATION.haze, ROLE.haze);
	fill(POPULATION.core, ROLE.core);
	fill(POPULATION.smoke, ROLE.smoke);

	geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
	geometry.setAttribute('aRole', new THREE.InstancedBufferAttribute(roles, 1));
	geometry.instanceCount = total;
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 16);
	return geometry;
}

/** The proxy column: one mesh, five roles, and the two flows it integrates. */
export class WashColumn {
	readonly mesh: THREE.Mesh;
	readonly #material: THREE.ShaderMaterial;

	constructor(cast: WashCast) {
		const total =
			POPULATION.column + POPULATION.burst + POPULATION.haze + POPULATION.core + POPULATION.smoke;
		const feet = [0, 1, 2].map((n) => {
			const site = cast.feet[n % Math.max(cast.feet.length, 1)];
			return new THREE.Vector2(site?.x ?? 0, site?.y ?? 0);
		});

		this.#material = new THREE.ShaderMaterial({
			vertexShader: VERTEX_SHADER,
			fragmentShader: FRAGMENT_SHADER,
			uniforms: {
				uTime: { value: 0 },
				uFlow: { value: 0 },
				uSmokeFlow: { value: 0 },
				uHeight: { value: 0 },
				uFootprint: { value: cast.footprint * 2.05 },
				uBlob: { value: 0.14 },
				uTurb: { value: 0 },
				uDrive: { value: 0 },
				uSquash: { value: 0 },
				uSwirl: { value: 0.6 },
				uSway: { value: 0.1 },
				uMassColumn: { value: 0 },
				uMassBurst: { value: 0 },
				uMassHaze: { value: 0 },
				uMassCore: { value: 0 },
				uMassSmoke: { value: 0 },
				uCharge: { value: 0 },
				uBurstRadius: { value: 0 },
				uCoreRadius: { value: 0.4 },
				uCoreHeight: { value: 0.5 },
				uFeet: { value: feet }
			},
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthTest: false,
			depthWrite: false,
			side: THREE.DoubleSide
		});

		this.mesh = new THREE.Mesh(quadGeometry(total), this.#material);
		this.mesh.frustumCulled = false;
		this.mesh.name = 'wash-column';
	}

	/** Both flows are integrated rises, so packets keep climbing when drive dips. */
	update(cue: WashCue, flow: number, smokeFlow: number): void {
		const uniforms = this.#material.uniforms;
		uniforms.uTime.value = cue.tMs / 1000;
		uniforms.uFlow.value = flow;
		uniforms.uSmokeFlow.value = smokeFlow;
		uniforms.uHeight.value = 0.35 + 3.25 * cue.reach;
		uniforms.uBlob.value = 0.125 + 0.06 * cue.mass;
		uniforms.uTurb.value = 0.2 + 0.34 * cue.drive + 0.2 * cue.strike;
		uniforms.uDrive.value = cue.drive;
		uniforms.uSquash.value = 0.35 + 1.15 * cue.strike + 0.5 * cue.drive;
		uniforms.uSway.value = 0.09 + 0.16 * cue.drive;
		uniforms.uMassColumn.value = 0.36 * cue.burn;
		uniforms.uMassBurst.value = 0.2 * cue.burstFade;
		uniforms.uMassHaze.value = (0.028 * cue.charge + 0.016 * cue.medium) * (1 - 0.9 * cue.reach);
		uniforms.uMassCore.value = 0.3 * (0.46 * cue.burn + cue.strike * cue.life);
		// Smoke outlives the flame, so it fades on its own slower curve.
		uniforms.uMassSmoke.value =
			0.018 * Math.min(1, cue.reach * 1.6 + 0.35 * cue.scorch) * Math.pow(cue.life, 0.55);
		uniforms.uCharge.value = cue.charge;
		uniforms.uBurstRadius.value = cue.burstRadius;
		uniforms.uCoreRadius.value = 0.24 + 0.42 * cue.strike + 0.12 * cue.drive;
		uniforms.uCoreHeight.value = 0.28 + 1.1 * cue.strike + 0.42 * cue.drive;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.#material.dispose();
	}
}
