/**
 * Element "volume": a marching-cubes metaball skin wrapped around the tracer
 * cloud, so the manifestation reads as a contiguous body of fire/water/…
 * rather than individual dots. Each alive tracer deposits a metaball into a
 * scalar field; the isosurface is polygonized every frame and shaded with a
 * banded (toon) material per element. Purely cosmetic — the tracers still
 * follow field.ts unchanged; this only *watches* them.
 */
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { CONFIG } from '../config';
import type { Element } from '../model';
import type { Particles } from './particles';

// grid footprint: x,z ∈ [-2.2, 2.2], y ∈ [-0.1, 4.3] (matches the PNG panels)
const SPAN = 4.4;
const Y0 = -0.1;

/** 3-step cel ramp shared by every element material. */
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

interface VolumeLook {
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
}

const LOOKS: Record<Element, VolumeLook> = {
	fire: {
		color: 0xff7043,
		emissive: 0xd83a12,
		emissiveIntensity: 0.25,
		opacity: 1,
		isoScale: 1,
		smearScale: 1,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0
	},
	// water flows: one merged rounded body, lone tracers pinch off as droplets
	water: {
		color: 0x4fc3f7,
		emissive: 0x0b3d5c,
		emissiveIntensity: 0.35,
		opacity: 0.8,
		isoScale: 0.5,
		smearScale: 1.5,
		smooth: 0.85,
		smoothPasses: 2,
		cohesion: 1
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
		cohesion: 0
	},
	wind: {
		color: 0xb2fff2,
		emissive: 0x9adfd4,
		emissiveIntensity: 0.25,
		opacity: 0.32,
		isoScale: 1,
		smearScale: 1,
		smooth: 0,
		smoothPasses: 0,
		cohesion: 0
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
		cohesion: 0
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
		cohesion: 0
	}
};

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
 * base color. uTime is advanced by ElementVolume.update.
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

// cohesion neighbour grid: cell edge ≥ radius so 27 cells cover it (≤ 40/axis)
const GRID_MAX = 40;

export class ElementVolume {
	readonly mesh: MarchingCubes;
	private readonly materials: Record<Element, THREE.MeshToonMaterial>;
	private readonly uTime = { value: 0 };
	private readonly fieldCopy = new Float32Array(CONFIG.VOLUME_RES ** 3);
	// scratch for the cohesion pass (grid-normalized deposit candidates)
	private readonly candPos = new Float32Array(CONFIG.MAX_PARTICLES * 3);
	private readonly candIdx = new Int32Array(CONFIG.MAX_PARTICLES);
	private readonly gridHead = new Int32Array(GRID_MAX ** 3);
	private readonly gridNext = new Int32Array(CONFIG.MAX_PARTICLES);
	private element: Element = 'fire';

	constructor(scene: THREE.Scene) {
		const gradient = makeGradientMap();
		this.materials = {} as Record<Element, THREE.MeshToonMaterial>;
		for (const el of Object.keys(LOOKS) as Element[]) {
			this.materials[el] =
				el === 'water'
					? makeWaterMaterial(LOOKS[el], gradient, this.uTime)
					: makeToonMaterial(LOOKS[el], gradient);
		}
		this.mesh = new MarchingCubes(CONFIG.VOLUME_RES, this.materials.fire, false, false, 100000);
		this.mesh.scale.setScalar(SPAN / 2);
		this.mesh.position.set(0, Y0 + SPAN / 2, 0);
		this.mesh.frustumCulled = false;
		scene.add(this.mesh);
	}

	setElement(element: Element): void {
		this.element = element;
		this.mesh.material = this.materials[element];
	}

	/**
	 * Face-neighbor diffusion of the metaball field (preallocated buffer —
	 * the addon's blur() slices a 1 MB copy per call). Bridges blobs that are
	 * a cell or two apart, which is what fuses a stream into one surface.
	 */
	private smoothField(intensity: number): void {
		const f = this.mesh.field as Float32Array;
		const n = CONFIG.VOLUME_RES;
		const n2 = n * n;
		const c = this.fieldCopy;
		c.set(f);
		for (let z = 1; z < n - 1; z++) {
			for (let y = 1; y < n - 1; y++) {
				let i = n2 * z + n * y + 1;
				for (let x = 1; x < n - 1; x++, i++) {
					const nb = c[i - 1] + c[i + 1] + c[i - n] + c[i + n] + c[i - n2] + c[i + n2];
					f[i] = c[i] + intensity * (nb / 6 - c[i]);
				}
			}
		}
	}

	/** Deposit a smeared metaball pair at a (grid-normalized) position. */
	private deposit(
		p: Particles,
		i: number,
		bx: number,
		by: number,
		bz: number,
		w: number,
		smear: number
	): void {
		// fade-scaled strength: balls swell in on spawn and shrink out on death
		const s = CONFIG.VOLUME_STRENGTH * 0.6 * (0.35 + 0.65 * p.fade[i]) * w;
		// smear along the local velocity: fast tracers become bead-pairs that
		// fuse into streams along the flow, slow pools stay compact blobs
		const sx = p.vel[i * 3] * smear;
		const sy = p.vel[i * 3 + 1] * smear;
		const sz = p.vel[i * 3 + 2] * smear;
		this.mesh.addBall(bx, by, bz, s, CONFIG.VOLUME_SUBTRACT);
		this.mesh.addBall(bx - sx, by - sy, bz - sz, s, CONFIG.VOLUME_SUBTRACT);
	}

	/**
	 * Cohesion: contract each deposit toward the centroid of the tracers within
	 * VOLUME_COHESION_R, and let deposit strength grow with neighbour count.
	 * Gaps in the cloud close into one connected surface; stragglers thin out
	 * and pinch off as small droplets instead of full-size bubbles. Deposit-side
	 * only — tracer motion is untouched.
	 */
	private cohereAndDeposit(p: Particles, count: number, coh: number, smear: number): void {
		const rN = CONFIG.VOLUME_COHESION_R / SPAN;
		const gn = Math.min(GRID_MAX, Math.max(1, Math.floor(1 / rN)));
		const cand = this.candPos;
		const head = this.gridHead.fill(-1, 0, gn * gn * gn);
		const next = this.gridNext;
		const cellOf = (j: number) => {
			const cx = Math.min(gn - 1, (cand[j * 3] * gn) | 0);
			const cy = Math.min(gn - 1, (cand[j * 3 + 1] * gn) | 0);
			const cz = Math.min(gn - 1, (cand[j * 3 + 2] * gn) | 0);
			return (cz * gn + cy) * gn + cx;
		};
		for (let j = 0; j < count; j++) {
			const c = cellOf(j);
			next[j] = head[c];
			head[c] = j;
		}
		const r2 = rN * rN;
		for (let j = 0; j < count; j++) {
			const x = cand[j * 3],
				y = cand[j * 3 + 1],
				z = cand[j * 3 + 2];
			const cx = Math.min(gn - 1, (x * gn) | 0);
			const cy = Math.min(gn - 1, (y * gn) | 0);
			const cz = Math.min(gn - 1, (z * gn) | 0);
			let k = 0,
				mx = 0,
				my = 0,
				mz = 0;
			for (let dz = -1; dz <= 1; dz++) {
				const zc = cz + dz;
				if (zc < 0 || zc >= gn) continue;
				for (let dy = -1; dy <= 1; dy++) {
					const yc = cy + dy;
					if (yc < 0 || yc >= gn) continue;
					for (let dx = -1; dx <= 1; dx++) {
						const xc = cx + dx;
						if (xc < 0 || xc >= gn) continue;
						for (let o = head[(zc * gn + yc) * gn + xc]; o !== -1; o = next[o]) {
							const ex = cand[o * 3] - x,
								ey = cand[o * 3 + 1] - y,
								ez = cand[o * 3 + 2] - z;
							if (ex * ex + ey * ey + ez * ez > r2) continue;
							k++;
							mx += cand[o * 3];
							my += cand[o * 3 + 1];
							mz += cand[o * 3 + 2];
						}
					}
				}
			}
			// k ≥ 1 (self); loners keep their spot at floor strength
			const t = Math.min(1, (k - 1) / Math.max(1, CONFIG.VOLUME_COHESION_K - 1));
			const w = CONFIG.VOLUME_LONER + (1 - CONFIG.VOLUME_LONER) * t;
			const pull = coh * t; // stragglers aren't yanked toward a far-off body
			this.deposit(
				p,
				this.candIdx[j],
				x + (mx / k - x) * pull,
				y + (my / k - y) * pull,
				z + (mz / k - z) * pull,
				w,
				smear
			);
		}
	}

	/** Re-deposit every alive tracer as a metaball and re-polygonize. */
	update(p: Particles): void {
		const m = this.mesh;
		const look = LOOKS[this.element];
		// re-read CONFIG every frame so live tuning via __wha applies
		m.isolation = CONFIG.VOLUME_ISOLATION * look.isoScale;
		m.reset();
		const coh = CONFIG.VOLUME_COHESION * look.cohesion;
		const smear = (CONFIG.VOLUME_SMEAR * 1.5 * look.smearScale) / SPAN;
		let balls = 0;
		for (let i = 0; i < CONFIG.MAX_PARTICLES && balls < CONFIG.VOLUME_MAX_BALLS; i++) {
			if (!p.alive[i]) continue;
			const bx = (p.pos[i * 3] + SPAN / 2) / SPAN;
			const by = (p.pos[i * 3 + 1] - Y0) / SPAN;
			const bz = (p.pos[i * 3 + 2] + SPAN / 2) / SPAN;
			if (bx < 0 || bx > 1 || by < 0 || by > 1 || bz < 0 || bz > 1) continue;
			if (coh > 0) {
				// cohesive elements defer: deposits need the whole cloud first
				this.candPos[balls * 3] = bx;
				this.candPos[balls * 3 + 1] = by;
				this.candPos[balls * 3 + 2] = bz;
				this.candIdx[balls] = i;
			} else {
				this.deposit(p, i, bx, by, bz, 1, smear);
			}
			balls++;
		}
		if (coh > 0) this.cohereAndDeposit(p, balls, coh, smear);
		for (let k = 0; k < look.smoothPasses; k++) this.smoothField(look.smooth);
		m.update();
		this.uTime.value = performance.now() / 1000;
	}
}
