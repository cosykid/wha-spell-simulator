/**
 * @file Style B's ping-pong GPU simulation runner: two float targets per
 * field, two fragment passes per fixed step, uniforms filled from the element
 * behavior matrix once and from the arc every step. Copied in shape from
 * proto-hybrid's FluidSim.
 */

import * as THREE from 'three';
import { B_COMMON, B_POSITION, B_QUAD_VERTEX, B_VELOCITY } from './bSim.glsl.js';
import { MOTION, type ProtoElement } from './elements.js';
import { ambientAt, burnAt, drainAt, driveAt, emissionAt, punchAt } from './arc.js';
import { STEP_S } from './tracers.js';
import type { ProtoSpell } from './spell.js';

/** Square edge of the simulation texture. 192 -> 36,864 parcels. */
export const B_SIM_SIZE = 192;

const ELEMENT_INDEX: Record<ProtoElement, number> = { fire: 0, water: 1, wind: 2 };

interface Pair {
	read: THREE.WebGLRenderTarget;
	write: THREE.WebGLRenderTarget;
}

function makeTarget(type: THREE.TextureDataType): THREE.WebGLRenderTarget {
	return new THREE.WebGLRenderTarget(B_SIM_SIZE, B_SIM_SIZE, {
		type,
		format: THREE.RGBAFormat,
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
		depthBuffer: false,
		stencilBuffer: false,
		generateMipmaps: false
	});
}

export class BSim {
	readonly #renderer: THREE.WebGLRenderer;
	readonly #spell: ProtoSpell;
	readonly #popScale: number;
	readonly #scene = new THREE.Scene();
	readonly #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
	readonly #quad: THREE.Mesh;
	readonly #blit: THREE.ShaderMaterial;
	readonly #uniforms: Record<string, THREE.IUniform>;
	readonly #velocityMaterial: THREE.ShaderMaterial;
	readonly #positionMaterial: THREE.ShaderMaterial;
	readonly #position: Pair;
	readonly #velocity: Pair;
	#salt = 0;

	constructor(renderer: THREE.WebGLRenderer, spell: ProtoSpell, element: ProtoElement) {
		this.#renderer = renderer;
		this.#spell = spell;
		const spec = MOTION[element];
		this.#popScale = spec.popScale;
		const gl = renderer.getContext();
		const type = gl.getExtension('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
		this.#position = { read: makeTarget(type), write: makeTarget(type) };
		this.#velocity = { read: makeTarget(type), write: makeTarget(type) };

		this.#uniforms = {
			uPos: { value: this.#position.read.texture },
			uVel: { value: this.#velocity.read.texture },
			uDt: { value: STEP_S },
			uTime: { value: 0 },
			uSalt: { value: 0 },
			uBurn: { value: 1 },
			uEmission: { value: 0 },
			uMotes: { value: 0 },
			uPunch: { value: 0 },
			uDrain: { value: 0 },
			uSpeed: { value: spell.speed },
			uFootprint: { value: spell.footprint },
			uReach: { value: spell.reach },
			uElement: { value: ELEMENT_INDEX[element] },
			uMouth: { value: spec.mouth },
			uRise: { value: new THREE.Vector2(spec.riseLo, spec.riseHi) },
			uRadial: { value: new THREE.Vector2(spec.radialLo, spec.radialHi) },
			uJets: { value: spec.jets },
			uJetSpin: { value: spec.jetSpinRadS },
			uBuoyancy: { value: spec.buoyancy },
			uGravity: { value: spec.gravity },
			uDrag: { value: spec.drag },
			uTurb: { value: spec.turbulence },
			uTurbScale: { value: spec.turbScale },
			uGust: { value: spec.gust },
			uSwirl: { value: spec.swirl },
			uPinch: { value: spec.pinch },
			uLife: { value: new THREE.Vector2(spec.lifeLo, spec.lifeHi - spec.lifeLo) },
			uHeightCap: { value: spec.heightCap },
			uTearFrom: { value: spec.tearFrom },
			uTearRate: { value: spec.tearRate },
			uPool: {
				value: new THREE.Vector4(
					spec.pool?.floorZ ?? 0.02,
					spec.pool?.bounce ?? 0,
					spec.pool?.spread ?? 0,
					spec.pool?.dragXY ?? 0
				)
			},
			uPoolAge: {
				value: new THREE.Vector2(spec.pool?.ageRate ?? 1, spec.pool?.drainAgeRate ?? 0)
			}
		};

		const pass = (fragment: string) =>
			new THREE.ShaderMaterial({
				uniforms: this.#uniforms,
				vertexShader: B_QUAD_VERTEX,
				fragmentShader: B_COMMON + fragment,
				depthTest: false,
				depthWrite: false
			});
		this.#velocityMaterial = pass(B_VELOCITY);
		this.#positionMaterial = pass(B_POSITION);

		this.#blit = new THREE.ShaderMaterial({
			uniforms: { uSource: { value: null } },
			vertexShader: B_QUAD_VERTEX,
			fragmentShader: /* glsl */ `
				uniform sampler2D uSource;
				varying vec2 vUv;
				void main() { gl_FragColor = texture2D(uSource, vUv); }
			`,
			depthTest: false,
			depthWrite: false
		});

		this.#quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.#velocityMaterial);
		this.#quad.frustumCulled = false;
		this.#scene.add(this.#quad);
		this.seed();
	}

	get textures(): { position: THREE.Texture; velocity: THREE.Texture } {
		return { position: this.#position.read.texture, velocity: this.#velocity.read.texture };
	}

	get count(): number {
		return B_SIM_SIZE * B_SIM_SIZE;
	}

	/** Advances one fixed step with the envelopes the spell has at `tMs`. */
	step(tMs: number): void {
		this.#salt = (this.#salt + 0.6180339887) % 512;
		const u = this.#uniforms;
		u.uTime.value = tMs / 1000;
		u.uSalt.value = this.#salt;
		u.uBurn.value = burnAt(this.#spell, tMs);
		u.uEmission.value = Math.min(0.94, emissionAt(this.#spell, tMs) * this.#popScale);
		u.uMotes.value = ambientAt(this.#spell, tMs) * 0.014;
		u.uPunch.value = punchAt(this.#spell, tMs);
		u.uDrain.value = drainAt(this.#spell, tMs);
		u.uSpeed.value = this.#spell.speed * driveAt(this.#spell, tMs);

		this.#run(this.#velocityMaterial, this.#velocity);
		this.#run(this.#positionMaterial, this.#position);
	}

	/** Everything starts dead: a reset re-uploads the parked population. */
	seed(): void {
		const size = B_SIM_SIZE * B_SIM_SIZE;
		const positions = new Float32Array(size * 4);
		const velocities = new Float32Array(size * 4);
		for (let index = 0; index < size; index += 1) {
			positions[index * 4 + 3] = 99;
			velocities[index * 4 + 3] = 1;
		}
		this.#salt = 0;
		this.#upload(positions, this.#position.read);
		this.#upload(velocities, this.#velocity.read);
	}

	dispose(): void {
		this.#quad.geometry.dispose();
		this.#velocityMaterial.dispose();
		this.#positionMaterial.dispose();
		this.#blit.dispose();
		for (const pair of [this.#position, this.#velocity]) {
			pair.read.dispose();
			pair.write.dispose();
		}
	}

	#run(material: THREE.ShaderMaterial, pair: Pair): void {
		this.#uniforms.uPos.value = this.#position.read.texture;
		this.#uniforms.uVel.value = this.#velocity.read.texture;
		this.#quad.material = material;
		this.#renderer.setRenderTarget(pair.write);
		this.#renderer.render(this.#scene, this.#camera);
		this.#renderer.setRenderTarget(null);
		const swap = pair.read;
		pair.read = pair.write;
		pair.write = swap;
	}

	#upload(data: Float32Array, target: THREE.WebGLRenderTarget): void {
		const texture = new THREE.DataTexture(
			data,
			B_SIM_SIZE,
			B_SIM_SIZE,
			THREE.RGBAFormat,
			THREE.FloatType
		);
		texture.needsUpdate = true;
		this.#blit.uniforms.uSource.value = texture;
		this.#quad.material = this.#blit;
		this.#renderer.setRenderTarget(target);
		this.#renderer.render(this.#scene, this.#camera);
		this.#renderer.setRenderTarget(null);
		this.#blit.uniforms.uSource.value = null;
		texture.dispose();
	}
}
