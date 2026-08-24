/**
 * @file The visible mass: one instanced quad per simulated parcel, hung under
 * the seal root so it thinks in seal units, and drawn with the premultiplied
 * blend that lets the body composite while only its core adds.
 */

import * as THREE from 'three';
import { PARCEL_FRAGMENT, PARCEL_VERTEX } from './parcel.glsl.js';
import { createParcelStamp } from './parcelStamp.js';
import { MASS_CEILING, rampTexels, RAMP_TEXELS, type Palette } from './palette.js';
import { DRAW, PUNCH, SIM_SIZE } from './tuning.js';
import type { MaterialInk } from './pigments.js';
import type { ParcelField } from './parcelField.js';

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

/** The heat ramp as a 1D texture, so one program serves every look row. */
function rampTexture(): THREE.DataTexture {
	const texture = new THREE.DataTexture(
		new Float32Array(RAMP_TEXELS * 4),
		RAMP_TEXELS,
		1,
		THREE.RGBAFormat,
		THREE.FloatType
	);
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.wrapS = THREE.ClampToEdgeWrapping;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}

export class ParcelDraw {
	readonly mesh: THREE.Mesh;
	readonly #material: THREE.ShaderMaterial;
	readonly #stamp: THREE.DataTexture;
	readonly #ramp: THREE.DataTexture;

	constructor(field: ParcelField) {
		const sources = field.textures;
		this.#stamp = createParcelStamp();
		this.#ramp = rampTexture();
		this.#material = new THREE.ShaderMaterial({
			uniforms: {
				uPos: { value: sources.position },
				uVel: { value: sources.velocity },
				uRow: { value: sources.rows },
				uSprite: { value: this.#stamp },
				uRamp: { value: this.#ramp },
				uSize: { value: DRAW.size },
				uMaterialSize: { value: 1 },
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
				uCeiling: { value: MASS_CEILING },
				uCoreLift: { value: 1 },
				uPunchMax: { value: PUNCH.lifeMax },
				uPunchSwell: { value: DRAW.punchSwell },
				uPunchPlateKill: { value: DRAW.punchPlateKill }
			},
			vertexShader: PARCEL_VERTEX,
			fragmentShader: PARCEL_FRAGMENT,
			transparent: true,
			depthTest: false,
			depthWrite: false,
			// The seal root is left-handed, so every triangle under it winds the other
			// way and a culled quad would show its back.
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
		this.mesh.name = 'hybrid-parcels';
		this.mesh.renderOrder = 0;
	}

	/**
	 * Repaints the ramp and re-reads the material multipliers for one cast. A row
	 * is a stop list rather than a shader fork, so a look change costs one texture
	 * upload and five uniform writes.
	 */
	setPalette(palette: Palette, ink: MaterialInk): void {
		(this.#ramp.image.data as Float32Array).set(rampTexels(palette.stops));
		this.#ramp.needsUpdate = true;
		const uniforms = this.#material.uniforms;
		uniforms.uMaterialSize.value = ink.size;
		uniforms.uOpacity.value = DRAW.opacity * ink.opacity;
		uniforms.uCeiling.value = ink.ceiling;
		uniforms.uCoreLift.value = ink.coreLift;
	}

	/** The field swaps its targets every step, so the mesh is re-pointed each frame. */
	setSources(position: THREE.Texture, velocity: THREE.Texture): void {
		this.#material.uniforms.uPos.value = position;
		this.#material.uniforms.uVel.value = velocity;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.#material.dispose();
		this.#stamp.dispose();
		this.#ramp.dispose();
	}
}
