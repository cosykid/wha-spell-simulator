/**
 * @file The GPU simulation, as two fragment programs over the same particle
 * texture. One texel is one parcel: `uPos` holds `xyz` position in seal space
 * with `w` its age in seconds, `uVel` holds `xyz` velocity with `w` its lifespan
 * (negative marks a charge-beat mote rather than fire).
 *
 * Both passes recompute the *same* spawn from the same salt, so a parcel that
 * respawns in the velocity pass respawns at the matching place in the position
 * pass without either reading the other.
 *
 * The force block here is mirrored on the CPU by `flowField.ts`, which is what
 * lets the brush marks ride this exact field. Change one and change the other.
 */

/** Hash, value noise, curl, and the shared spawn. Prepended to both passes. */
export const SIM_COMMON = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uDt;
uniform float uBurn;
uniform float uTime;
uniform float uSalt;
uniform float uEmission;
uniform float uMotes;
uniform float uPunch;
uniform float uSpeed;
uniform float uFootprint;
uniform float uReach;
uniform float uConverge;
uniform vec4 uSites[4];
uniform float uSiteCount;
uniform float uBuoyancy;
uniform float uDrag;
uniform float uNarrow;
uniform float uWander;
uniform float uTurbulence;
uniform float uNoiseScale;
uniform float uNoiseRise;
uniform float uSwirl;
uniform float uLife;
uniform float uLifeSpread;
uniform float uPunchShare;
uniform float uPunchLife;
uniform float uPunchLifeSpread;
uniform float uPunchSpread;
uniform vec2 uPunchRise;

varying vec2 vUv;

float hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}

// One draw from this parcel's stream. Same uv and salt give the same number in
// both passes, which is what keeps the two spawns in agreement.
float draw(float k) {
	return hash13(vec3(vUv * 313.0, uSalt * 7.13 + k * 19.77));
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float n000 = hash13(i);
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	float x00 = mix(n000, n100, u.x);
	float x10 = mix(n010, n110, u.x);
	float x01 = mix(n001, n101, u.x);
	float x11 = mix(n011, n111, u.x);
	return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) * 2.0 - 1.0;
}

vec3 potential(vec3 p) {
	return vec3(vnoise(p), vnoise(p + 41.7), vnoise(p - 27.3));
}

// Curl of a noise potential: divergence free, so the flow folds instead of
// spraying. Forward differences, four potential samples rather than six.
vec3 curlNoise(vec3 p) {
	const float e = 0.34;
	vec3 p0 = potential(p);
	vec3 px = potential(p + vec3(e, 0.0, 0.0));
	vec3 py = potential(p + vec3(0.0, e, 0.0));
	vec3 pz = potential(p + vec3(0.0, 0.0, e));
	return vec3(
		(py.z - p0.z) - (pz.y - p0.y),
		(pz.x - p0.x) - (px.z - p0.z),
		(px.y - p0.y) - (py.x - p0.x)
	);
}

// The radius the column is pinched to at this height, wander included. It is the
// mass's own edge, and flowField.ts computes the same number for the brush.
float boundaryRadius(vec2 at, float z, float hn) {
	float base = uFootprint * (1.0 - uNarrow * smoothstep(0.0, 0.95, hn)) + 0.04;
	return base * (1.0 + uWander * vnoise(vec3(at * 1.5, uTime * 0.6 + z * 1.3)));
}

struct Spawn {
	vec3 pos;
	vec3 vel;
	float life;
};

// Where a parcel is born. Four mouths: the strike's own short-lived punch, the
// seal disc that carries the body, the drawn column sites that feed tongues into
// it, and the charge beat's motes drifting in from outside the ring.
Spawn spawnParcel(bool mote) {
	Spawn s;
	float a = draw(1.0) * 6.2831853;
	float r0 = draw(2.0);
	float r1 = draw(3.0);
	float r2 = draw(4.0);
	vec2 dir = vec2(cos(a), sin(a));

	if (mote) {
		float radius = 0.95 + 0.55 * r0;
		s.pos = vec3(dir * radius, 0.02 + 0.42 * r1 * r1);
		s.vel = vec3(-dir * (0.28 + 0.34 * r2), 0.06 * r1);
		s.life = -(0.34 + 0.4 * r1);
		return s;
	}

	// The punch. Its whole job is to be over: born wide across the seal, thrown
	// at speeds a factor of five apart so no front stays coherent, and burned out
	// inside a third of a second. What rises afterwards is the body, not this.
	if (draw(11.0) < uPunchShare * uPunch) {
		float radius = uFootprint * uPunchSpread * sqrt(r0) * (0.3 + 0.9 * draw(13.0));
		float rise = uSpeed * mix(uPunchRise.x, uPunchRise.y, draw(12.0));
		s.pos = vec3(dir * radius, 0.004 + 0.5 * r1 * r1);
		// The rim of the punch goes out, the axis goes up: a splash, not a piston.
		float out0 = smoothstep(0.15, 1.0, r0);
		s.vel = vec3(dir * uSpeed * (0.06 + 0.3 * out0) * r2, rise * (1.0 - 0.4 * out0));
		s.life = uPunchLife + uPunchLifeSpread * r1 * r1;
		return s;
	}

	float feeder = draw(5.0);
	float speed = uSpeed;
	// A minority of parcels burn far longer and start faster. They are what breaks
	// off the top as licks instead of dissolving with the rest of the mass.
	float lick = step(0.86, draw(7.0));
	// A wide spread on the rise, so the column is fed as a ragged wave rather than
	// as a series of level slabs.
	float rise = speed * (0.3 + 1.5 * draw(10.0) * draw(15.0)) * (1.0 + 0.3 * lick);
	if (feeder < 0.22 && uSiteCount > 0.5) {
		float pick = floor(min(draw(6.0) * uSiteCount, uSiteCount - 1.0));
		// ESSL 1.00 only indexes a uniform array by a loop counter, so the pick is
		// a scan rather than a subscript.
		vec4 site = uSites[0];
		for (int i = 0; i < 4; i++) {
			if (float(i) == pick) {
				site = uSites[i];
			}
		}
		vec2 at = site.xy * 0.9 + dir * (0.26 * sqrt(r0));
		s.pos = vec3(at, 0.01 + 0.06 * r1);
		// The drawn lean is the tongue's aim: inward, and steeply up.
		s.vel = vec3(site.zw * speed * (0.34 + 0.3 * r2), rise * 1.12);
	} else {
		float radius = uFootprint * sqrt(r0);
		s.pos = vec3(dir * radius, 0.005 + 0.05 * r1);
		s.vel = vec3(dir * speed * 0.06 * r2, rise);
	}
	s.life = (uLife + uLifeSpread * r1) * (1.0 + 0.85 * lick);
	return s;
}

// Density is a standing rank, not a dice. Every parcel holds a fixed place in
// [0,1) and only revives while the score is asking for at least that much mass,
// so uEmission reads directly as the fraction of the population alive and the
// column thins by starving its own tail rather than by flickering.
float rank() {
	return hash13(vec3(vUv * 191.0, 3.7));
}

bool rollFire(float gate) {
	return gate < uEmission;
}

bool rollMote(float gate) {
	return gate >= 1.0 - uMotes;
}
`;

/** Fullscreen quad vertex program, shared by every pass in this route. */
export const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Forces. Buoyancy, the pinch, two curl octaves, swirl, and age-rising drag. */
export const SIM_VELOCITY = /* glsl */ `
void main() {
	vec4 p = texture2D(uPos, vUv);
	vec4 v = texture2D(uVel, vUv);
	float life = abs(v.w);
	bool dead = p.w >= life || life < 1e-4;

	if (dead) {
		float gate = rank();
		if (rollFire(gate)) {
			Spawn s = spawnParcel(false);
			gl_FragColor = vec4(s.vel, s.life);
			return;
		}
		if (rollMote(gate)) {
			Spawn s = spawnParcel(true);
			gl_FragColor = vec4(s.vel, s.life);
			return;
		}
		gl_FragColor = vec4(0.0, 0.0, 0.0, v.w);
		return;
	}

	vec3 pos = p.xyz;
	vec3 vel = v.xyz;
	float t01 = clamp(p.w / life, 0.0, 1.0);
	float heat = 1.0 - t01;
	float hn = clamp(pos.z / uReach, 0.0, 1.6);
	float radius = length(pos.xy);
	vec2 inward = radius > 1e-4 ? -pos.xy / radius : vec2(0.0);

	if (v.w < 0.0) {
		// A charge-beat mote: no fire in it. It drifts in and settles on the paper.
		vec3 swirl = vec3(-inward.y, inward.x, 0.0) * 0.22;
		vel += (swirl + vec3(inward * 0.55, -0.05)) * uDt;
		vel += curlNoise(pos * 0.8 + vec3(0.0, 0.0, uTime * 0.2)) * 0.35 * uDt;
		vel *= exp(-1.4 * uDt);
		gl_FragColor = vec4(vel, v.w);
		return;
	}

	// Buoyancy: strongest while hot and low, dying back where the column breaks up.
	float lift = uBuoyancy * pow(heat, 1.15) * (1.0 - 0.22 * smoothstep(0.7, 1.3, hn));
	vel.z += lift * uDt;

	// The pinch. The column narrows with height and the boundary itself wanders,
	// which is what keeps the silhouette off a clean cylinder wall — and it is the
	// surface the brush licks are laid on.
	float target = boundaryRadius(pos.xy, pos.z, hn);
	vel.xy += inward * (uConverge * 9.0) * max(radius - target, 0.0) * uDt;
	vel.xy += inward * uConverge * 0.7 * heat * uDt;
	vel.xy += vec2(-inward.y, inward.x) * uSwirl * radius * uDt;

	// Turbulence: two curl octaves, finer and stronger the higher the parcel is.
	vec3 q = pos * uNoiseScale + vec3(0.0, 0.0, -uTime * uNoiseRise);
	vec3 turb = curlNoise(q) + curlNoise(q * 2.9 + 13.7) * 0.52;
	float gain = uTurbulence * (0.48 + 1.4 * smoothstep(0.0, 0.55, hn) + 0.55 * uPunch) * (0.5 + 0.7 * t01);
	vel += turb * gain * uDt;

	vel *= exp(-(uDrag + 2.4 * t01) * uDt);
	gl_FragColor = vec4(vel, v.w);
}
`;

/** Integration and ageing. Reads the velocity the pass above just wrote. */
export const SIM_POSITION = /* glsl */ `
void main() {
	vec4 p = texture2D(uPos, vUv);
	vec4 v = texture2D(uVel, vUv);
	float life = abs(v.w);
	bool dead = p.w >= life || life < 1e-4;

	if (dead) {
		float gate = rank();
		if (rollFire(gate)) {
			Spawn s = spawnParcel(false);
			// Stagger the punch's ages so it is not one flat tone.
			gl_FragColor = vec4(s.pos, draw(8.0) * 0.5 * s.life * uPunch);
			return;
		}
		if (rollMote(gate)) {
			gl_FragColor = vec4(spawnParcel(true).pos, 0.0);
			return;
		}
		gl_FragColor = vec4(p.xyz, life + 1.0);
		return;
	}

	vec3 pos = p.xyz + v.xyz * uDt;
	pos.z = max(pos.z, 0.0);
	float age = p.w + uDt * uBurn;
	// Anything that has left the column is spent, whatever its clock says.
	if (pos.z > uReach * 1.32 || length(pos.xy) > 1.4) {
		age = life;
	}
	gl_FragColor = vec4(pos, age);
}
`;
