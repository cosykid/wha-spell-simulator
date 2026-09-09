/** @file R-23: authored elemental currents. These are creative extensions, not canon rulings. */
import type { FlowWeaveMaterial, WeaveCurrentParams } from '../../../types.js';

interface CurrentStyle {
	width: number;
	current: WeaveCurrentParams;
}

export const WEAVE_CURRENTS: Record<FlowWeaveMaterial, CurrentStyle> = {
	water: {
		width: 0.4,
		current: {
			path: 'arch',
			height: 1.7,
			span: 1.2,
			waves: 2,
			wave: 0.2,
			speed: 2.8,
			taper: 0.15,
			pulse: 0.2,
			releaseWeight: 1.2,
			releaseTurbulence: 0.3,
			releaseFade: 0.2
		}
	},
	fire: {
		width: 0.52,
		current: {
			path: 'stream',
			height: 3,
			span: 0.25,
			waves: 2,
			wave: 0.28,
			speed: 5.8,
			taper: 0.94,
			pulse: 0.4,
			releaseWeight: 1.5,
			releaseTurbulence: 1.2,
			releaseFade: 0.8
		}
	},
	wind: {
		width: 0.24,
		current: {
			path: 'orbit',
			height: 1.1,
			span: 1.05,
			waves: 2,
			wave: 0.15,
			speed: 3.2,
			taper: 0.25,
			pulse: 0.1,
			releaseWeight: 0.7,
			releaseTurbulence: 1.8,
			releaseFade: 0.6
		}
	},
	aeroform: {
		width: 0.65,
		current: {
			path: 'orbit',
			height: 1.5,
			span: 1,
			waves: 1,
			wave: 0.18,
			speed: 1.4,
			taper: 0.1,
			pulse: 0.15,
			releaseWeight: 0.45,
			releaseTurbulence: 0.6,
			releaseFade: 0.5
		}
	},
	light: {
		width: 0.12,
		current: {
			path: 'loop',
			height: 2.8,
			span: 0.78,
			waves: 1,
			wave: 0.04,
			speed: 3.8,
			taper: 0,
			pulse: 0.9,
			releaseWeight: 0,
			releaseTurbulence: 0,
			releaseFade: 1
		}
	}
};
