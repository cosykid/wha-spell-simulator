import { activePortalPlane, boltBurst, scaledParticleCount } from './effectUtils.js';
import type { ElementFlow, Particle, Portal, RenderSpellIR } from './effectUtils.js';
import type { AppConfig, RingInfo } from '../../types.js';

/**
 * Base class for element particle effects. draw() runs the frame skeleton
 * shared by every element — advance the frame, build the flow config, top the
 * particle population up to the bolt-modulated target, render, prune — while
 * subclasses supply element-specific behavior through the protected hooks.
 */
export abstract class ElementEffect<
	P extends Particle = Particle,
	F extends ElementFlow = ElementFlow
> {
	protected frame = 0;
	protected particles: P[] = [];

	get hasParticles(): boolean {
		return this.particles.length > 0;
	}

	draw(
		ctx: CanvasRenderingContext2D,
		spellIR: RenderSpellIR,
		ring: RingInfo,
		dt: number,
		config: AppConfig
	): void {
		this.frame += dt;
		const portal = activePortalPlane(ctx.canvas, ring);
		const flow = this.createFlow(spellIR, ring, portal, this.frame);
		const targetCount = Math.round(
			scaledParticleCount(this.baseParticleCount(spellIR, flow, config), spellIR, config) *
				boltBurst(this.frame, flow.mod.bolt)
		);

		while (this.particles.length < targetCount) {
			this.particles.push(this.spawnParticle(spellIR, ring, portal, flow));
		}

		this.renderParticles(ctx, spellIR, flow, dt);
		this.particles = this.particles.filter((particle) => particle.age < particle.life);
	}

	reset(): void {
		this.frame = 0;
		this.particles = [];
	}

	/** Single-pass update-then-draw loop; effects with layered compositing override this. */
	protected renderParticles(
		ctx: CanvasRenderingContext2D,
		spellIR: RenderSpellIR,
		flow: F,
		dt: number
	): void {
		for (const particle of this.particles) {
			this.updateParticle(particle, flow, dt);
			this.drawParticle(ctx, particle, flow, spellIR);
		}
	}

	/** Translate the SpellIR into this element's per-frame flow parameters. */
	protected abstract createFlow(
		spellIR: RenderSpellIR,
		ring: RingInfo,
		portal: Portal,
		frame: number
	): F;

	/** Target particle population before the global cap and bolt modulation. */
	protected abstract baseParticleCount(spellIR: RenderSpellIR, flow: F, config: AppConfig): number;

	protected abstract spawnParticle(
		spellIR: RenderSpellIR,
		ring: RingInfo,
		portal: Portal,
		flow: F
	): P;

	protected abstract updateParticle(particle: P, flow: F, dt: number): void;

	protected abstract drawParticle(
		ctx: CanvasRenderingContext2D,
		particle: P,
		flow: F,
		spellIR: RenderSpellIR
	): void;
}
