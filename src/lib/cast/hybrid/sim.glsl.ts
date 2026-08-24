/**
 * @file The GPU simulation, as two fragment programs over the same parcel
 * texture. One texel is one parcel: `uPos` holds `xyz` in seal space with `w`
 * its age in seconds, `uVel` holds `xyz` velocity with `w` its lifespan.
 *
 * Both passes recompute the *same* spawn from the same salt, so a parcel that
 * respawns in the velocity pass respawns at the matching place in the position
 * pass without either reading the other.
 */

import { FLOW_COMMON, FLOW_FORCE } from './flow.glsl.js';
import { SPAWN_GLSL } from './spawn.glsl.js';

/** Fullscreen quad vertex program, shared by every pass in the substrate. */
export const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Density is a standing rank, not a dice. Every parcel holds a fixed place in
 * `[0,1)` and only revives while its channel is asking for at least that much
 * mass, so `emission` reads directly as the fraction of the population alive and
 * a channel thins by starving its own tail rather than by flickering.
 */
const RANK = /* glsl */ `
float rank() {
	return hash13(vec3(vUv * 191.0, 3.7));
}
`;

const COMMON = FLOW_COMMON + FLOW_FORCE + SPAWN_GLSL + RANK;

/** Forces. Drive, the pinch, swirl, the sink, containment, two curl octaves, drag. */
export const SIM_VELOCITY =
	COMMON +
	/* glsl */ `
void main() {
	Shape s = shapeHere();
	vec4 p = texture2D(uPos, vUv);
	vec4 v = texture2D(uVel, vUv);
	float life = v.w;
	bool dead = p.w >= life || life < 1e-4;

	if (dead) {
		if (rank() < s.emission) {
			Spawn born = spawnParcel(s);
			gl_FragColor = vec4(born.vel, born.life);
			return;
		}
		gl_FragColor = vec4(0.0, 0.0, 0.0, v.w);
		return;
	}

	float t01 = clamp(p.w / life, 0.0, 1.0);
	vec3 vel = v.xyz + flowAccel(s, p.xyz, t01) * uDt;
	vel *= exp(-(s.drag + 2.4 * t01) * uDt);
	gl_FragColor = vec4(vel, life);
}
`;

/** Integration and ageing. Reads the velocity the pass above just wrote. */
export const SIM_POSITION =
	COMMON +
	/* glsl */ `
void main() {
	Shape s = shapeHere();
	vec4 p = texture2D(uPos, vUv);
	vec4 v = texture2D(uVel, vUv);
	float life = v.w;
	bool dead = p.w >= life || life < 1e-4;

	if (dead) {
		if (rank() < s.emission) {
			Spawn born = spawnParcel(s);
			// Stagger the punch's ages so the strike is not one flat tone.
			gl_FragColor = vec4(born.pos, draw(8.0) * 0.5 * born.life * s.punch);
			return;
		}
		gl_FragColor = vec4(p.xyz, life + 1.0);
		return;
	}

	vec3 pos = p.xyz + v.xyz * uDt;
	pos.z = max(pos.z, 0.0);

	// R-20's other half: the grip sustains what it holds, so a parcel inside the
	// shell stops burning and the ball can reach capacity on a long cast.
	float inside = s.gather > 0.0 ? 1.0 - step(s.holdRadius, distance(pos, s.origin)) : 0.0;
	float age = p.w + uDt * s.burn * mix(1.0, 0.08, inside);

	// Anything that has left the domain is spent, whatever its clock says.
	float along = dot(pos - s.origin, s.axis);
	if (along > s.reach * 1.9 || length(pos.xy) > 2.6) {
		age = life;
	}
	gl_FragColor = vec4(pos, age);
}
`;
