/**
 * @file The visible body: one instanced quad per simulated parcel, hung under
 * the seal root so it thinks in seal units, and drawn with the premultiplied
 * blend that lets the mass composite while only the core adds.
 */

import * as THREE from 'three';
import { PARCEL_FRAGMENT, PARCEL_VERTEX } from './draw.glsl.js';
import { createParcelStamp } from './parcelStamp.js';
import { MOTE } from './palette.js';
import { DRAW, PUNCH, SIM_SIZE } from './tuning.js';

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
				uBaseWashZ: { value: DRAW.baseWashZ },
				uBaseSwell: { value: DRAW.baseSwell },
				uBaseOpacity: { value: DRAW.baseOpacity },
				uCoreRadius: { value: DRAW.coreRadius },
				uCoreFloorZ: { value: DRAW.coreFloorZ },
				uCoreTopZ: { value: DRAW.coreTopZ },
				uPunchMax: { value: PUNCH.lifeMax },
				uPunchSwell: { value: DRAW.punchSwell },
				uMoteInk: { value: new THREE.Color(MOTE[0], MOTE[1], MOTE[2]) }
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
		this.mesh.renderOrder = 0;
	}

	/** The sim swaps its targets every step, so the mesh is re-pointed each frame. */
	setSources(position: THREE.Texture, velocity: THREE.Texture) {
		this.#material.uniforms.uPos.value = position;
		this.#material.uniforms.uVel.value = velocity;
	}

	dispose() {
		this.mesh.geometry.dispose();
		this.#material.dispose();
		this.#stamp.dispose();
	}
}
