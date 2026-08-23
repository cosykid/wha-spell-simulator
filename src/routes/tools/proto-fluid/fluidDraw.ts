/**
 * @file The visible mass: one instanced quad per simulated parcel, hung under
 * the seal root so it thinks in seal units, and drawn with the premultiplied
 * blend that lets the body composite while only the core adds.
 */

import * as THREE from 'three';
import { PARCEL_FRAGMENT, PARCEL_VERTEX } from './draw.glsl.js';
import { createParcelStamp } from './parcelStamp.js';
import { DRAW, PIGMENT, SIM_SIZE } from './tuning.js';

function pigment(triple: readonly number[]): THREE.Color {
	return new THREE.Color(triple[0], triple[1], triple[2]);
}

/** The instanced geometry: a unit quad, plus the texel each instance reads. */
function parcelGeometry(): THREE.InstancedBufferGeometry {
	const quad = new THREE.PlaneGeometry(1, 1);
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.index = quad.index;
	geometry.setAttribute('position', quad.getAttribute('position'));
	geometry.setAttribute('uv', quad.getAttribute('uv'));

	const count = SIM_SIZE * SIM_SIZE;
	const texels = new Float32Array(count * 2);
	for (let index = 0; index < count; index += 1) {
		texels[index * 2] = ((index % SIM_SIZE) + 0.5) / SIM_SIZE;
		texels[index * 2 + 1] = (Math.floor(index / SIM_SIZE) + 0.5) / SIM_SIZE;
	}
	geometry.setAttribute('aParcel', new THREE.InstancedBufferAttribute(texels, 2));
	geometry.instanceCount = count;
	quad.dispose();
	return geometry;
}

export class FluidDraw {
	readonly mesh: THREE.Mesh;
	readonly #material: THREE.ShaderMaterial;
	readonly #stamp: THREE.DataTexture;

	constructor(position: THREE.Texture, velocity: THREE.Texture) {
		this.#stamp = createParcelStamp();
		this.#material = new THREE.ShaderMaterial({
			uniforms: {
				uPos: { value: position },
				uVel: { value: velocity },
				uSprite: { value: this.#stamp },
				uSize: { value: DRAW.size },
				uGrowth: { value: DRAW.growth },
				uStretch: { value: DRAW.stretch },
				uOpacity: { value: DRAW.opacity },
				uCoreAge: { value: DRAW.coreAge },
				uCore: { value: pigment(PIGMENT.core) },
				uAmber: { value: pigment(PIGMENT.amber) },
				uOrange: { value: pigment(PIGMENT.orange) },
				uVermilion: { value: pigment(PIGMENT.vermilion) },
				uEmber: { value: pigment(PIGMENT.ember) },
				uSoot: { value: pigment(PIGMENT.soot) },
				uMote: { value: pigment(PIGMENT.mote) }
			},
			vertexShader: PARCEL_VERTEX,
			fragmentShader: PARCEL_FRAGMENT,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			side: THREE.DoubleSide,
			// Premultiplied over-blend. A parcel that gives up its alpha turns the
			// same equation into a pure add, which is the whole core/body split.
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor
		});

		this.mesh = new THREE.Mesh(parcelGeometry(), this.#material);
		this.mesh.frustumCulled = false;
		this.mesh.name = 'fluid-parcels';
	}

	/** The sim swaps its targets every step, so the mesh is re-pointed each frame. */
	setSources(position: THREE.Texture, velocity: THREE.Texture) {
		this.#material.uniforms.uPos.value = position;
		this.#material.uniforms.uVel.value = velocity;
	}

	/** Opacity multiplier for the whole mass, so the arc can also thin it out. */
	setOpacity(scale: number) {
		this.#material.uniforms.uOpacity.value = DRAW.opacity * scale;
	}

	dispose() {
		this.mesh.geometry.dispose();
		this.#material.dispose();
		this.#stamp.dispose();
	}
}
