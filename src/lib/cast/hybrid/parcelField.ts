/**
 * @file The ping-pong GPU simulation. Two float targets per field, two fragment
 * passes per step, and one shared uniform block so the velocity and position
 * programs always agree about who respawned.
 *
 * Every channel of the cast is in the same texture, in its own band of rows, and
 * finds its own shape through the row map rather than through a branch. That is
 * the whole of what makes the pool shared.
 *
 * @example
 * const field = new ParcelField(renderer);
 * field.setSubstrate(substrate);
 * field.step(1 / 120, tMs / 1000, steps);
 */

import * as THREE from 'three';
import { QUAD_VERTEX, SIM_POSITION, SIM_VELOCITY } from './sim.glsl.js';
import { MAX_CHANNELS, PARAM_TEXELS } from './params.js';
import { SIM_SIZE, TURBULENCE_STRIDE } from './tuning.js';
import type { Substrate } from './substrate.js';

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

function dataTexture(data: Float32Array, width: number, height: number): THREE.DataTexture {
	const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

export class ParcelField {
	readonly #renderer: THREE.WebGLRenderer;
	#substrate: Substrate | null = null;
	readonly #scene = new THREE.Scene();
	readonly #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
	readonly #quad: THREE.Mesh;
	readonly #blit: THREE.ShaderMaterial;
	readonly #uniforms: Record<string, THREE.IUniform>;
	readonly #velocityMaterial: THREE.ShaderMaterial;
	readonly #positionMaterial: THREE.ShaderMaterial;
	readonly #position: Pair;
	readonly #velocity: Pair;
	readonly #params: THREE.DataTexture;
	readonly #rows: THREE.DataTexture;
	#salt = 0;

	constructor(renderer: THREE.WebGLRenderer) {
		this.#renderer = renderer;
		// Float targets keep the age clock exact; half float is the honest fallback.
		const gl = renderer.getContext();
		const type = gl.getExtension('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
		this.#position = { read: makeTarget(type), write: makeTarget(type) };
		this.#velocity = { read: makeTarget(type), write: makeTarget(type) };

		// Both start blank, so a stage with no cast on it compiles and paints
		// nothing rather than waiting for a score to exist.
		this.#params = dataTexture(
			new Float32Array(MAX_CHANNELS * PARAM_TEXELS * 4),
			PARAM_TEXELS,
			MAX_CHANNELS
		);
		this.#rows = dataTexture(new Float32Array(SIM_SIZE * 4), 1, SIM_SIZE);

		this.#uniforms = {
			uPos: { value: this.#position.read.texture },
			uVel: { value: this.#velocity.read.texture },
			uParams: { value: this.#params },
			uRow: { value: this.#rows },
			uDt: { value: 1 / 120 },
			uTime: { value: 0 },
			uSalt: { value: 0 },
			uTurb: { value: 0 }
		};

		const pass = (fragmentShader: string) =>
			new THREE.ShaderMaterial({
				uniforms: this.#uniforms,
				vertexShader: QUAD_VERTEX,
				fragmentShader,
				depthTest: false,
				depthWrite: false
			});
		this.#velocityMaterial = pass(SIM_VELOCITY);
		this.#positionMaterial = pass(SIM_POSITION);

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
		this.seed();
	}

	/** The two textures the parcel program samples. */
	get textures(): {
		position: THREE.Texture;
		velocity: THREE.Texture;
		params: THREE.Texture;
		rows: THREE.Texture;
	} {
		return {
			position: this.#position.read.texture,
			velocity: this.#velocity.read.texture,
			params: this.#params,
			rows: this.#rows
		};
	}

	/**
	 * Points the field at one cast's channels. The row map is fixed for the life
	 * of that cast, so it is uploaded here and never again.
	 */
	setSubstrate(substrate: Substrate | null): void {
		this.#substrate = substrate;
		const rows = this.#rows.image.data as Float32Array;
		rows.fill(0);
		if (substrate) {
			for (let row = 0; row < SIM_SIZE; row += 1) {
				rows[row * 4] = substrate.rowMap[row];
			}
		}
		this.#rows.needsUpdate = true;
		this.seed();
	}

	/**
	 * Refreshes the three numbers the draw program reads off a row: this channel's
	 * heat, veil and grain. They ride in the row map's spare lanes so a parcel
	 * costs one vertex fetch instead of four, which is the difference between a
	 * frame and a stall on a software rasterizer.
	 */
	#packRowInk(): void {
		const rows = this.#rows.image.data as Float32Array;
		if (!this.#substrate) {
			return;
		}
		for (const channel of this.#substrate.channels) {
			const { shape, slice } = channel;
			for (let row = slice.rowStart; row < slice.rowStart + slice.rowCount; row += 1) {
				rows[row * 4 + 1] = shape.heat;
				rows[row * 4 + 2] = shape.veil;
				rows[row * 4 + 3] = shape.grain;
			}
		}
		this.#rows.needsUpdate = true;
	}

	/** Advances one fixed step, with whatever shapes the cells wrote this frame. */
	step(dtS: number, tSec: number, steps: number): void {
		const params = this.#params.image.data as Float32Array;
		if (this.#substrate) {
			this.#substrate.pack();
			params.set(this.#substrate.params);
		} else {
			params.fill(0);
		}
		this.#params.needsUpdate = true;
		this.#packRowInk();
		this.#salt = (this.#salt + 0.6180339887) % 512;
		this.#uniforms.uDt.value = dtS;
		this.#uniforms.uTime.value = tSec;
		this.#uniforms.uSalt.value = this.#salt;
		// The turbulence impulse lands on one step in three, at three times the
		// gain. Keyed on the step count rather than on a counter of its own, so a
		// replay to the same step always gets the same field.
		this.#uniforms.uTurb.value = steps % TURBULENCE_STRIDE === 0 ? TURBULENCE_STRIDE : 0;
		this.#run(this.#velocityMaterial, this.#velocity);
		this.#run(this.#positionMaterial, this.#position);
	}

	/** Everything starts dead, so nothing exists until a channel asks for it. */
	seed(): void {
		const size = SIM_SIZE * SIM_SIZE;
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
		this.#params.dispose();
		this.#rows.dispose();
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
		const texture = dataTexture(data, SIM_SIZE, SIM_SIZE);
		this.#blit.uniforms.uSource.value = texture;
		this.#quad.material = this.#blit;
		this.#renderer.setRenderTarget(target);
		this.#renderer.render(this.#scene, this.#camera);
		this.#renderer.setRenderTarget(null);
		this.#blit.uniforms.uSource.value = null;
		texture.dispose();
	}
}
