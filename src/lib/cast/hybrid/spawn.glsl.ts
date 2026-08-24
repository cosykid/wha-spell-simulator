/**
 * @file Where a parcel is born. Seven mouths, one per archetype, switched on the
 * channel's own `spawn` number rather than on a shader fork.
 *
 * This and the flow shape are the whole of what makes a column a column and a
 * whirl a whirl. Everything downstream — the pinch, the turbulence, the drag,
 * the draw program, the brush — is shared.
 */

import { PUNCH, FLOW } from './tuning.js';
import { SPAWN } from './flow.js';

function num(value: number): string {
	return Number.isInteger(value) ? `${value}.0` : String(value);
}

export const SPAWN_GLSL = /* glsl */ `
const float PUNCH_SHARE = ${num(PUNCH.share)};
const float PUNCH_LIFE = ${num(PUNCH.lifeS)};
const float PUNCH_SPREAD_LIFE = ${num(PUNCH.lifeSpreadS)};
const float PUNCH_SPREAD = ${num(PUNCH.spread)};
const vec2 PUNCH_RISE = vec2(${num(PUNCH.riseLow)}, ${num(PUNCH.riseHigh)});
const float SILHOUETTE_BASE = ${num(FLOW.silhouette)};

struct Spawn {
	vec3 pos;
	vec3 vel;
	float life;
};

/** The bearing of one drawn site, its facing where it has one and its place otherwise. */
float siteBearing(Shape s, float pick) {
	vec4 site = siteAt(s, pick);
	// R-06: a facing the reading did not trust arrives as zero, and a site with
	// no facing points the only way it can, outward from where it stands.
	vec2 heading = length(site.zw) > 1e-3 ? site.zw : site.xy;
	return atan(heading.y, heading.x);
}

/**
 * The strike's own class: born wide across the footprint, thrown at speeds a
 * factor of five apart so no front stays coherent, and burned out inside a third
 * of a second. Shared by every archetype, because R-01 gives every cast a strike.
 */
Spawn spawnPunch(Shape s, vec2 dir, float r0, float r1, float r2) {
	Spawn out0;
	float radius = s.footprint * PUNCH_SPREAD * sqrt(r0) * (0.3 + 0.9 * draw(13.0));
	float rise = max(s.speed, 0.4) * mix(PUNCH_RISE.x, PUNCH_RISE.y, draw(12.0));
	out0.pos = s.origin + vec3(dir * radius, 0.004 + 0.5 * r1 * r1);
	// The rim goes out, the axis goes up: a splash, not a piston.
	float out1 = smoothstep(0.15, 1.0, r0);
	out0.vel = vec3(dir * max(s.speed, 0.4) * (0.06 + 0.3 * out1) * r2, 0.0)
		+ s.axis * (rise * (1.0 - 0.4 * out1));
	out0.life = PUNCH_LIFE + PUNCH_SPREAD_LIFE * r1 * r1;
	return out0;
}

Spawn spawnParcel(Shape s) {
	Spawn born;
	float a = draw(1.0) * 6.2831853;
	float r0 = draw(2.0);
	float r1 = draw(3.0);
	float r2 = draw(4.0);
	vec2 dir = vec2(cos(a), sin(a));
	float speed = max(s.speed, 0.0001);
	// A minority burn far longer and start faster. They are what breaks off the
	// top as licks instead of dissolving with the rest of the mass.
	float lick = step(0.86, draw(7.0));
	float rise = speed * (0.3 + 1.5 * draw(10.0) * draw(15.0)) * (1.0 + 0.3 * lick);
	born.life = (s.life + s.lifeSpread * r1) * (1.0 + 0.85 * lick);

	// R-01's impulse, wherever the archetype puts its mouth.
	if (draw(11.0) < PUNCH_SHARE * s.punch) {
		return spawnPunch(s, dir, r0, r1, r2);
	}

	if (s.spawn == ${num(SPAWN.splash)}) {
		// The burst has no body: it is the strike and then it is over.
		Spawn hit = spawnPunch(s, dir, r0, r1, r2);
		hit.life *= 1.35;
		return hit;
	}

	if (s.spawn == ${num(SPAWN.sector)}) {
		// R-07. An arc of the seal plane running outward, hugging the paper.
		float bearing = a;
		if (s.siteCount > 0.5) {
			float pick = floor(min(draw(6.0) * s.siteCount, s.siteCount - 1.0));
			float half0 = min(3.14159265, 3.14159265 / s.siteCount * 0.85);
			bearing = siteBearing(s, pick) + (draw(9.0) * 2.0 - 1.0) * half0;
		}
		vec2 out2 = vec2(cos(bearing), sin(bearing));
		born.pos = s.origin + vec3(out2 * (s.footprint * (0.2 + 0.8 * sqrt(r0))), 0.004 + 0.09 * r1);
		born.vel = vec3(out2 * speed * (0.5 + 0.8 * r2), speed * 0.16 * r1);
		return born;
	}

	if (s.spawn == ${num(SPAWN.swirl)}) {
		// A ring at the funnel foot: tangential, climbing, hollow in the middle.
		float radius = s.footprint * (0.72 + 0.5 * r0);
		vec2 tangent = vec2(-dir.y, dir.x);
		born.pos = s.origin + vec3(dir * radius, 0.01 + 0.22 * r1 * r1);
		born.vel = vec3(tangent * abs(s.swirl) * radius * sign(s.swirl) + dir * (-0.1 * speed * r2), rise * 0.7);
		return born;
	}

	if (s.spawn == ${num(SPAWN.sink)}) {
		// The medium arriving, or leaving on a negative draw. One signed mouth.
		float outward = step(s.sink, -1e-6);
		float far = 1.55 + 0.5 * r0;
		float near = max(s.pool, 0.2) * (0.6 + 0.6 * r0);
		float radius = mix(far, near, outward);
		born.pos = s.origin + vec3(dir * radius, 0.02 + 0.3 * r1 * r1);
		vec2 tangent = vec2(-dir.y, dir.x);
		born.vel = vec3(-dir * abs(s.sink) * (0.3 + 0.4 * r2) * (1.0 - 2.0 * outward)
			+ tangent * s.swirl * 0.5, 0.02 * r1);
		return born;
	}

	if (s.spawn == ${num(SPAWN.hover)}) {
		// R-13's spring: fed off the seal disc and lifted onto the locus.
		float radius = s.footprint * sqrt(r0);
		born.pos = vec3(s.origin.xy + dir * radius * 0.6, 0.02 + 0.1 * r1);
		vec3 toward = s.origin - born.pos;
		born.vel = normalize(toward + vec3(dir * 0.15, 0.0)) * (speed * (0.5 + 0.7 * r2));
		return born;
	}

	if (s.spawn == ${num(SPAWN.medium)}) {
		// R-10's world: seeded through the domain, drawn gently onto the ring.
		float radius = 0.75 + 0.95 * sqrt(r0);
		born.pos = vec3(dir * radius, 0.02 + 0.5 * r1 * r1);
		vec2 tangent = vec2(-dir.y, dir.x);
		born.vel = vec3(-dir * (0.16 + 0.3 * r2) * max(speed, 0.2) + tangent * 0.1, 0.03 * r1);
		born.life = (s.life + s.lifeSpread * r1) * 1.4;
		return born;
	}

	// R-05's column, the default mouth: a disc at the origin, plus the drawn
	// columns that feed tongues into it.
	if (draw(5.0) < 0.22 && s.siteCount > 0.5) {
		float pick = floor(min(draw(6.0) * s.siteCount, s.siteCount - 1.0));
		vec4 site = siteAt(s, pick);
		vec2 at = site.xy * 0.9 + dir * (0.26 * sqrt(r0));
		born.pos = vec3(s.origin.xy + at, s.origin.z + 0.01 + 0.06 * r1);
		// The drawn lean is the tongue's aim: inward, and steeply along the axis.
		born.vel = vec3(site.zw * speed * (0.34 + 0.3 * r2), 0.0) + s.axis * (rise * 1.12);
		return born;
	}
	// Off-centre by a seeded wobble, so the mouth is never a clean disc.
	vec2 wobble = vec2(cos(s.lobePhase), sin(s.lobePhase)) * s.footprint * 0.22;
	float radius = s.footprint * sqrt(r0);
	born.pos = s.origin + vec3(dir * radius + wobble * (r1 - 0.5) * 2.0, 0.005 + 0.05 * r1);
	born.vel = vec3(dir * speed * 0.06 * r2, 0.0) + s.axis * rise;
	return born;
}
`;
