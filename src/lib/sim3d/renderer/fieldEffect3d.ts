/**
 * @file Orchestrates the three.js spell effect on the root canvas: compiles
 * the SpellIR's physical seal into a nozzle, advances the tracer and ambient
 * populations, skins them with the toon element volume, and renders through
 * the portal-aligned camera. Owns the WebGL canvas layered over the drawing
 * surface; the 2D renderer keeps ring glow, failure flicker, and the legacy
 * sigil-only effects.
 */
import * as THREE from 'three';
import { activePortalPlane, portalScaledRing } from '../../renderer/effects/effectUtils.js';
import { spellEmission } from '../../renderer/spellEffectRenderer.js';
import { clamp } from '../../utils/geometry.js';
import type { RingInfo, SpellIR } from '../../types.js';
import { compileSeal, type Nozzle } from '../core/nozzle.js';
import { ELEMENT_BREEZE, ELEMENT_COLOR, ELEMENT_VORTEX } from '../core/model.js';
import { LOOKS } from './volumeLooks.js';
import { AmbientMedium3D } from './ambient3d.js';
import { createPortalCamera, updatePortalCamera } from './portalCamera.js';
import { Particles3D, type EffectDrive } from './particles3d.js';
import { ElementVolume3D } from './volume3d.js';

const MAX_STEP_S = 0.033;

// Canon quality laws the sim presets never carried (GROUND_TRUTH §1, §12.7):
// drawing quality multiplies output power, sigil size scales effect strength.
const DRIVE_TUNING = {
	powerBase: 0.55,
	powerQuality: 0.45,
	powerStrength: 0.6,
	speedBase: 0.7,
	speedQuality: 0.45,
	speedStrength: 0.45,
	speedMin: 0.35,
	speedMax: 1.7
};

function effectDrive(spellIR: SpellIR, emission: number): EffectDrive {
	const quality = clamp(spellIR.quality);
	const strength = clamp(spellIR.strength);
	return {
		emission,
		power:
			(DRIVE_TUNING.powerBase + DRIVE_TUNING.powerQuality * quality) *
			(1 + DRIVE_TUNING.powerStrength * (strength - 0.5)),
		speed: clamp(
			(DRIVE_TUNING.speedBase + DRIVE_TUNING.speedQuality * quality) *
				(1 + DRIVE_TUNING.speedStrength * (strength - 0.5)),
			DRIVE_TUNING.speedMin,
			DRIVE_TUNING.speedMax
		)
	};
}

export class FieldEffect3D {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene: THREE.Scene;
	private readonly camera: THREE.OrthographicCamera;
	private readonly particles: Particles3D;
	private readonly ambient: AmbientMedium3D;
	private readonly volume: ElementVolume3D;
	private readonly portalTiltMs: number;
	private nozzle: Nozzle | null = null;
	private lastSignature: string | null = null;
	private lastTime: number | null = null;
	private drewLastFrame = false;

	constructor(canvas: HTMLCanvasElement, portalTiltMs: number) {
		this.portalTiltMs = portalTiltMs;
		// preserveDrawingBuffer keeps the last frame readable (toDataURL/readPixels)
		// for tests and screenshots of the one-shot spell window.
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			alpha: true,
			antialias: true,
			preserveDrawingBuffer: true
		});
		this.renderer.setClearColor(0x000000, 0);
		this.scene = new THREE.Scene();
		this.camera = createPortalCamera();

		// lights only affect the toon volume — particles are unlit
		this.scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x2a2a33, 0.5));
		const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
		keyLight.position.set(2.5, 4.0, 1.5);
		this.scene.add(keyLight);

		this.particles = new Particles3D(this.scene);
		this.ambient = new AmbientMedium3D(this.scene);
		this.volume = new ElementVolume3D(this.scene);
	}

	/**
	 * Advances and draws the effect. Returns true while this layer owns the
	 * spell's visuals, so the 2D renderer can skip its field fallback.
	 */
	render(
		spellIR: SpellIR | null | undefined,
		ring: RingInfo | null | undefined,
		timestamp: number,
		portalFit: number = 1
	): boolean {
		const seal = spellIR?.seal ?? null;
		const usable = Boolean(seal && spellIR?.valid && spellIR.active && ring?.found);
		if (!usable || !spellIR || !ring) {
			this.clearIfNeeded();
			this.lastTime = null;
			return false;
		}

		if (this.lastSignature !== spellIR.signature) {
			this.lastSignature = spellIR.signature;
			this.nozzle = compileSeal(seal!);
			const element = seal!.element;
			const color = ELEMENT_COLOR[element];
			this.particles.setSeal(this.nozzle, color);
			this.ambient.setSeal(
				this.nozzle,
				color,
				ELEMENT_VORTEX[element],
				7,
				ELEMENT_BREEZE[element],
				// bodiless heaps never skin, so their circulating streaks stay on
				LOOKS[element].pool === 0
			);
			this.volume.setElement(element);
		}

		const dt = Math.min(
			MAX_STEP_S,
			this.lastTime === null ? 1 / 60 : Math.max(0, (timestamp - this.lastTime) / 1000)
		);
		this.lastTime = timestamp;

		const emission = spellEmission(spellIR, timestamp, this.portalTiltMs);
		if (emission <= 0 && !this.particles.hasAlive()) {
			// portal still opening, or the effect already faded out fully
			this.clearIfNeeded();
			return true;
		}

		const drive = effectDrive(spellIR, emission);
		this.particles.update(dt, drive);
		this.ambient.update(dt, drive);
		this.volume.update(this.particles, this.ambient);

		const canvas = this.renderer.domElement;
		this.renderer.setSize(canvas.width, canvas.height, false);
		const portal = activePortalPlane(canvas, portalScaledRing(ring, canvas, portalFit), portalFit);
		updatePortalCamera(this.camera, portal, canvas.width, canvas.height);

		this.renderer.render(this.scene, this.camera);
		this.drewLastFrame = true;
		return true;
	}

	private clearIfNeeded(): void {
		if (!this.drewLastFrame) {
			return;
		}
		this.renderer.clear(true, true, true);
		this.drewLastFrame = false;
		this.lastSignature = null;
	}

	dispose(): void {
		this.renderer.dispose();
	}
}
