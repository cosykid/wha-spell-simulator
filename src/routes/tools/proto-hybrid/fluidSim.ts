/**
 * @file The ping-pong GPU simulation. Two float targets per field, two fragment
 * passes per step, and one shared uniform block so the velocity and position
 * programs always agree about who respawned.
 *
 * @example
 * const sim = new FluidSim(renderer, spell);
 * sim.step(tMs); // one fixed STEP_S of flow
 */

import * as THREE from 'three';
import { QUAD_VERTEX, SIM_COMMON, SIM_POSITION, SIM_VELOCITY } from './sim.glsl.js';
import { FLOW, PUNCH, SIM_SIZE, STEP_S } from './tuning.js';
import { burnAt, driveAt, emberDriftAt, emissionAt, punchAt } from './arc.js';
import type { HybridSpell } from './hybridSpell.js';

interface Pair {
	read: THREE.WebGLRenderTarget;
	write: THREE.WebGLRenderTarget;
}

function makeTarget(type: THREE.TextureDataType): THREE.WebGLRenderTarget {
	return new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, {
		type,
		format: THREE.RGBAFormat,
		minFilter: THREE.NearestFilter,
		magFilter: THREE.NearestFilter,
		depthBuffer: false,
		stencilBuffer: false,
		generateMipmaps: false
	});
}

export class FluidSim {
	readonly #renderer: THREE.WebGLRenderer;
	readonly #spell: HybridSpell;
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

	constructor(renderer: THREE.WebGLRenderer, spell: HybridSpell) {
		this.#renderer = renderer;
		this.#spell = spell;
		// Float targets keep the age clock exact; half float is the honest fallback.
		const gl = renderer.getContext();
		const type = gl.getExtension('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
		this.#position = { read: makeTarget(type), write: makeTarget(type) };
		this.#velocity = { read: makeTarget(type), write: makeTarget(type) };

		const sites = new Array(4).fill(null).map(() => new THREE.Vector4());
		spell.sites.slice(0, 4).forEach((site, index) => {
			sites[index].set(site.at.x, site.at.y, site.facing.x, site.facing.y);
		});

		this.#uniforms = {
			uPos: { value: this.#position.read.texture },
			uVel: { value: this.#velocity.read.texture },
			uDt: { value: STEP_S },
			uBurn: { value: 1 },
			uTime: { value: 0 },
			uSalt: { value: 0 },
			uEmission: { value: 0 },
			uMotes: { value: 0 },
			uPunch: { value: 0 },
			uSpeed: { value: spell.speed },
			uFootprint: { value: spell.footprint },
			uReach: { value: spell.reach * FLOW.reachScale },
			uConverge: { value: spell.converge },
			uSites: { value: sites },
			uSiteCount: { value: Math.min(4, spell.sites.length) },
			uBuoyancy: { value: FLOW.buoyancy },
			uDrag: { value: FLOW.drag },
			uNarrow: { value: FLOW.narrow },
			uWander: { value: FLOW.boundaryWander },
			uTurbulence: { value: FLOW.turbulence },
			uNoiseScale: { value: FLOW.noiseScale },
			uNoiseRise: { value: FLOW.noiseRise },
			uSwirl: { value: FLOW.swirl },
			uLife: { value: FLOW.lifeS },
			uLifeSpread: { value: FLOW.lifeSpreadS },
			uPunchShare: { value: PUNCH.share },
			uPunchLife: { value: PUNCH.lifeS },
			uPunchLifeSpread: { value: PUNCH.lifeSpreadS },
			uPunchSpread: { value: PUNCH.spread },
			uPunchRise: { value: new THREE.Vector2(PUNCH.riseLow, PUNCH.riseHigh) }
		};

		this.#velocityMaterial = new THREE.ShaderMaterial({
			uniforms: this.#uniforms,
			vertexShader: QUAD_VERTEX,
			fragmentShader: SIM_COMMON + SIM_VELOCITY,
			depthTest: false,
			depthWrite: false
		});
		this.#positionMaterial = new THREE.ShaderMaterial({
			uniforms: this.#uniforms,
			vertexShader: QUAD_VERTEX,
			fragmentShader: SIM_COMMON + SIM_POSITION,
			depthTest: false,
			depthWrite: false
		});

		this.#blit = new THREE.ShaderMaterial({
			uniforms: { uSource: { value: null } },
			vertexShader: QUAD_VERTEX,
			fragmentShader: `
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
		this.#seed();
	}

	/** The two textures the parcel program samples. */
	get textures(): { position: THREE.Texture; velocity: THREE.Texture } {
		return { position: this.#position.read.texture, velocity: this.#velocity.read.texture };
	}

	/** How many parcels the simulation carries. */
	get count(): number {
		return SIM_SIZE * SIM_SIZE;
	}

	/** Advances one fixed step, with the envelopes the spell has at `tMs`. */
	step(tMs: number) {
		this.#salt = (this.#salt + 0.6180339887) % 512;
		this.#uniforms.uTime.value = tMs / 1000;
		this.#uniforms.uBurn.value = burnAt(this.#spell, tMs);
		this.#uniforms.uSalt.value = this.#salt;
		// `uEmission` is the live fraction of the population, straight from the arc.
		this.#uniforms.uEmission.value = Math.min(0.94, Math.max(0, emissionAt(this.#spell, tMs)));
		this.#uniforms.uMotes.value = emberDriftAt(this.#spell, tMs) * 0.018;
		this.#uniforms.uPunch.value = punchAt(this.#spell, tMs);
		this.#uniforms.uSpeed.value = this.#spell.speed * driveAt(this.#spell, tMs);

		this.#run(this.#velocityMaterial, this.#velocity);
		this.#run(this.#positionMaterial, this.#position);
	}

	dispose() {
		this.#quad.geometry.dispose();
		this.#velocityMaterial.dispose();
		this.#positionMaterial.dispose();
		this.#blit.dispose();
		for (const pair of [this.#position, this.#velocity]) {
			pair.read.dispose();
			pair.write.dispose();
		}
	}

	#run(material: THREE.ShaderMaterial, pair: Pair) {
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

	/** Everything starts dead, so nothing exists until the score asks for it. */
	#seed() {
		const size = SIM_SIZE * SIM_SIZE;
		const positions = new Float32Array(size * 4);
		const velocities = new Float32Array(size * 4);
		for (let index = 0; index < size; index += 1) {
			positions[index * 4 + 3] = 99;
			velocities[index * 4 + 3] = 1;
		}
		this.#upload(positions, this.#position.read);
		this.#upload(velocities, this.#velocity.read);
	}

	#upload(data: Float32Array, target: THREE.WebGLRenderTarget) {
		const texture = new THREE.DataTexture(
			data,
			SIM_SIZE,
			SIM_SIZE,
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
