/**
 * @file The ambient medium (GROUND_TRUTH §7 ruling), ported from the
 * theorycrafting sim: every element exists as a thin cloud of motes seeded
 * through the domain. Advected by u_amb only — never by the own-magic field —
 * and never absorbed. Motes that pool in the grasp cushion charge the
 * capacitor; the pull field throttles by the remaining fraction and dies at
 * capacity. The demo's pour spawner is omitted — no app glyph produces an orb
 * vessel yet, so there is nothing to pour into.
 *
 * Rendering: a pull-only seal manifests nothing of its own (§7), so this
 * medium IS its whole visible output. Moving motes draw as velocity streaks
 * and brighten with the pull's activity; pooled motes glow at full element
 * color and are skinned by the element volume as the collected mass. The
 * QUIET medium never draws: motes below AMBIENT_VIS_V render nowhere (the
 * physics still tracks them), so the spell shows only the matter it moves —
 * no idle speckle over the stage.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { sampleAmbientVelocity } from '../core/field.js';
import { mulberry32, setV3, v3 } from '../core/math2.js';
import { PopulationMechanics, vesselClamp, vesselPass } from '../core/mechanics.js';
import type { Nozzle } from '../core/nozzle.js';
import { vortexCoreR, vortexHeight, vortexOmega } from '../core/vortex.js';
import type { EffectDrive } from './particles3d.js';
import { softDotTexture } from './softDot.js';
import { swayX, swayZ } from './whirlSway.js';

const tmpVel = v3();
const tmpPos = v3();

/** Stable per-mote jitter, the same hash the deposit passes use. */
function hash01(i: number): number {
	return Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
}

// Mote brightness as a fraction of the element color: quiet medium → gripped
// medium → pooled matter. Normal blending, so the colors read on parchment.
const MOTE_DIM = 0.62;
const MOTE_ACTIVE = 1.0;
const MOTE_POOLED = 1.0;
const STREAK_TAIL_DIM = 0.12;
// Render-only life: per-mote twinkle phase spread and the white-hot lift a
// gripped mote gets (embers heat up while the pull drags them).
const TWINKLE_BASE = 0.84;
const TWINKLE_AMP = 0.26;
const GRIP_HEAT = 0.35;
const POOL_SHIMMER = 0.12;

export class AmbientMedium3D {
	readonly points: THREE.Points;
	/** Velocity streaks: moving motes stretch into inflow/outflow strands. */
	readonly streaks: THREE.LineSegments;
	private readonly max = CONFIG.AMBIENT_COUNT;
	private readonly pos: Float32Array;
	/** Render-side dot positions: quiet motes park at -999 (drawn nowhere). */
	private readonly dotPos: Float32Array;
	private readonly vel: Float32Array;
	private readonly alive: Uint8Array;
	private grasped = 0; // capacitor charge: latched pool + shell-contained
	private readonly held: Uint8Array;
	private nozzle: Nozzle | null = null;
	private readonly mechanics: PopulationMechanics;
	private readonly col: Float32Array;
	private readonly geo: THREE.BufferGeometry;
	private readonly mat: THREE.PointsMaterial;
	private readonly streakPos: Float32Array;
	private readonly streakCol: Float32Array;
	private readonly streakGeo: THREE.BufferGeometry;
	private readonly streakMat: THREE.LineBasicMaterial;
	private readonly color = new THREE.Color(0xffffff);
	private rand: () => number = mulberry32(7);
	private clock = 0;
	private activity = 0; // pull grip this frame: throttle × emission
	private churnRate = 0; // pooled-mass spin, signed rad/s (Γ_p sense + element vortex)
	private vortex = 0; // element buoyancy: > 0 ⇒ the pool rides a rising whirl
	private breeze = 0; // bodiless circulation: the gathered heap keeps swirling (wind)
	private breezeRate = 0; // breeze × emission this frame
	private heldStreaks = false; // held motes keep velocity streaks (no volume skin to scratch)
	private poolH = 0; // vortex crown height this frame (0 = the pool lies flat)
	private vigor = 0; // emission × drive speed: how hard the whirl runs
	private spinPhase = 0; // accumulated whirl rotation — the helix turns rigidly
	private twistH = 0; // twist-vortex crown height this frame (the Γ_p tornado)

	constructor(scene: THREE.Scene) {
		this.pos = new Float32Array(this.max * 3);
		this.dotPos = new Float32Array(this.max * 3);
		this.vel = new Float32Array(this.max * 3);
		this.col = new Float32Array(this.max * 3);
		this.held = new Uint8Array(this.max);
		this.alive = new Uint8Array(this.max);
		this.mechanics = new PopulationMechanics(this.max);
		this.pos.fill(-999);
		this.dotPos.fill(-999);
		this.geo = new THREE.BufferGeometry();
		this.geo.setAttribute('position', new THREE.BufferAttribute(this.dotPos, 3));
		this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
		this.mat = new THREE.PointsMaterial({
			size: CONFIG.POINT_SIZE * 0.9,
			map: softDotTexture(),
			vertexColors: true,
			transparent: true,
			opacity: 0.5,
			depthWrite: false
		});
		this.points = new THREE.Points(this.geo, this.mat);
		this.points.frustumCulled = false;
		scene.add(this.points);

		this.streakPos = new Float32Array(this.max * 2 * 3);
		this.streakCol = new Float32Array(this.max * 2 * 3);
		this.streakPos.fill(-999);
		this.streakGeo = new THREE.BufferGeometry();
		this.streakGeo.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
		this.streakGeo.setAttribute('color', new THREE.BufferAttribute(this.streakCol, 3));
		this.streakMat = new THREE.LineBasicMaterial({
			vertexColors: true,
			transparent: true,
			opacity: 0.8,
			depthWrite: false
		});
		this.streaks = new THREE.LineSegments(this.streakGeo, this.streakMat);
		this.streaks.frustumCulled = false;
		scene.add(this.streaks);
	}

	/** Capacitor state: 1 = empty (full pull), 0 = charged (pull dead). */
	throttle(): number {
		const cap = this.nozzle?.pull?.cap ?? 0;
		if (cap <= 0) return 1;
		return Math.max(0, 1 - this.grasped / cap);
	}

	/**
	 * Pooled (grasped) motes: the collected mass the element volume skins.
	 * Velocity rides along so deposits smear with the whirl; heat is 1 at the
	 * vortex foot fading to 0 at the crown (flat pools are all heat).
	 */
	forEachPooled(
		callback: (
			x: number,
			y: number,
			z: number,
			vx: number,
			vy: number,
			vz: number,
			heat: number
		) => void
	): void {
		if (!this.points.visible) return;
		for (let i = 0; i < this.max; i++) {
			if (this.alive[i] && this.held[i]) {
				const y = this.pos[i * 3 + 1];
				const heat = this.poolH > 0.05 ? Math.max(0, 1 - y / this.poolH) : 1;
				callback(
					this.pos[i * 3],
					y,
					this.pos[i * 3 + 2],
					this.vel[i * 3],
					this.vel[i * 3 + 1],
					this.vel[i * 3 + 2],
					heat
				);
			}
		}
	}

	/** Vortex crown height this frame; 0 while the pool lies flat. */
	poolHeight(): number {
		return this.poolH;
	}

	/**
	 * Twist-tornado funnel this frame, or null while no Γ_p column stands.
	 * Radii follow the physics core taper so skinned cords sit on the motes.
	 */
	twistFunnel(): { h: number; r0: number; r1: number } | null {
		const n = this.nozzle;
		if (this.twistH < 0.15 || !n) return null;
		return {
			h: this.twistH,
			r0: vortexCoreR(0, this.twistH, n.focus),
			r1: vortexCoreR(this.twistH, this.twistH, n.focus)
		};
	}

	/** Whirl rotation phase — deposit passes wind their helices off it. */
	poolPhase(): number {
		return this.spinPhase;
	}

	/**
	 * The inflow river: fast motes in the floor-hugging approach lane close to
	 * the seal, which the element volume can skin as ribbons. Weight ramps with
	 * speed and the pull's grip; the far ember rain and the quiet medium stay
	 * dots and never congeal.
	 */
	forEachStreaming(
		callback: (
			x: number,
			y: number,
			z: number,
			vx: number,
			vy: number,
			vz: number,
			w: number
		) => void
	): void {
		if (!this.points.visible || this.activity <= 0) return;
		const ramp = CONFIG.STREAM_FULL - CONFIG.STREAM_VMIN;
		const F = this.nozzle?.focus ?? 1;
		for (let i = 0; i < this.max; i++) {
			if (!this.alive[i] || this.held[i]) continue;
			const x = this.pos[i * 3];
			const y = this.pos[i * 3 + 1];
			const z = this.pos[i * 3 + 2];
			const rho = Math.hypot(x, z);
			// two lanes may skin: the floor-hugging approach river, and — while a
			// twist tornado stands — the funnel wall the whole way up the column
			const inFloor = y <= CONFIG.STREAM_H && rho <= CONFIG.STREAM_RHO;
			const inFunnel =
				this.twistH > 0.15 &&
				y <= this.twistH * 1.05 &&
				rho <= vortexCoreR(y, this.twistH, F) * 1.6;
			if (!inFloor && !inFunnel) continue;
			const vx = this.vel[i * 3];
			const vy = this.vel[i * 3 + 1];
			const vz = this.vel[i * 3 + 2];
			const speed = Math.hypot(vx, vy, vz);
			if (speed < CONFIG.STREAM_VMIN) continue;
			const ride = Math.min(1, (speed - CONFIG.STREAM_VMIN) / ramp);
			callback(x, y, z, vx, vy, vz, ride * ride * this.activity);
		}
	}

	private seedOne(i: number): void {
		// uniform in a cylinder over the seal, hugging nothing: the medium is thin
		const r = CONFIG.AMBIENT_R * Math.sqrt(this.rand());
		const th = this.rand() * 2 * Math.PI;
		this.pos[i * 3] = r * Math.cos(th);
		this.pos[i * 3 + 1] = 0.05 + this.rand() * CONFIG.AMBIENT_H;
		this.pos[i * 3 + 2] = r * Math.sin(th);
	}

	setSeal(
		nozzle: Nozzle | null,
		colorHex: number,
		vortex = 0,
		seed = 7,
		breeze = 0,
		heldStreaks = false
	): void {
		this.nozzle = nozzle;
		this.rand = mulberry32(seed);
		this.vortex = vortex;
		this.breeze = breeze;
		this.heldStreaks = heldStreaks;
		this.poolH = 0;
		this.twistH = 0;
		this.churnRate = 0;
		this.grasped = 0;
		this.held.fill(0);
		this.alive.fill(0);
		this.pos.fill(-999);
		this.dotPos.fill(-999);
		this.streakPos.fill(-999);
		this.color.setHex(colorHex);
		// the medium only shows for seals that address it — a pull-less seal
		// keeps the stage clear
		this.points.visible = !!nozzle && (!!nozzle.pull || !!nozzle.orb);
		this.streaks.visible = this.points.visible;
		if (!this.points.visible) {
			this.geo.attributes.position.needsUpdate = true;
			this.streakGeo.attributes.position.needsUpdate = true;
			return;
		}
		for (let i = 0; i < this.max; i++) {
			this.seedOne(i);
			this.alive[i] = 1;
			this.col[i * 3] = this.color.r * MOTE_DIM;
			this.col[i * 3 + 1] = this.color.g * MOTE_DIM;
			this.col[i * 3 + 2] = this.color.b * MOTE_DIM;
		}
		this.geo.attributes.position.needsUpdate = true;
		this.geo.attributes.color.needsUpdate = true;
	}

	update(dt: number, drive: EffectDrive): void {
		const n = this.nozzle;
		if (!n || (!n.pull && !n.orb) || !this.points.visible) return;
		const orb = n.orb;

		// the medium exists before and after the spell; only the pull's grip on
		// it follows the emission window
		this.mat.opacity = 0.5 * Math.max(drive.emission, 0.25) + 0.35 * drive.emission;
		this.streakMat.opacity = 0.8 * drive.emission;

		this.clock += dt;
		const cap = n.pull?.cap ?? 0;
		const thr = this.throttle();
		const sink = (n.pull?.C ?? 0) > 0;
		// the twist and conveyor stir on after the grasp charges (§12 stirred-cup),
		// so mote styling and stream skinning stay live while anything still moves;
		// a sink-only seal keeps fading with its capacitor as before
		const stirring =
			Math.abs(n.pull?.gamma ?? 0) > 0.05 || Math.hypot(n.pull?.P.x ?? 0, n.pull?.P.y ?? 0) > 0.05;
		this.activity = (stirring ? 1 : thr) * drive.emission;
		this.vigor = drive.emission * drive.speed;
		let latched = 0;
		for (let i = 0; i < this.max; i++) if (this.held[i]) latched++;

		// grasped matter keeps stirring at the arrows' turn (Γ_p sense): the
		// collected pool spins instead of freezing, and dies with the emission
		const gammaC = Math.max(
			-CONFIG.GRASP_CHURN_MAX,
			Math.min(CONFIG.GRASP_CHURN_MAX, n.pull?.gamma ?? 0)
		);
		const churn = CONFIG.GRASP_CHURN * gammaC * drive.emission;
		// a buoyant element feeds its own whirl: spin and crown height grow with
		// the pool's charge, so the gathered mass ignites into a rising vortex.
		// Γ_p only sets the sense (and adds its churn); fire whirls without it.
		// Below PLUME_MIN_N there is no vortex — a trace catch stays embers.
		const charge = Math.max(0, latched - CONFIG.PLUME_MIN_N);
		const ramp = Math.pow(
			Math.min(1, charge / (CONFIG.PLUME_FULL_N - CONFIG.PLUME_MIN_N)),
			CONFIG.PLUME_RAMP
		);
		let spin = churn;
		if (this.vortex > 0) {
			const sense = Math.abs(gammaC) > 0.15 ? Math.sign(gammaC) : 1;
			spin += sense * this.vortex * CONFIG.VORTEX_OMEGA * (0.35 + 0.65 * ramp) * this.vigor;
			// the crown sinks back into the pool as the emission fades
			this.poolH = CONFIG.PLUME_H * ramp * (0.3 + 0.7 * drive.emission);
		} else {
			this.poolH = 0;
		}
		// the Γ_p tornado: the twist channel raises a funnel of transported
		// ambient matter (§7 helical inflow — storage-free, so no charge gate).
		// The whirl phase turns at the wall's solid-body rate so the skinned
		// cords and the fire shader's spiral bands ride the same rotation.
		const twistGamma = n.pull?.gamma ?? 0;
		const rawTwistH = vortexHeight(twistGamma);
		this.twistH = rawTwistH * (0.25 + 0.75 * drive.emission);
		spin +=
			vortexOmega(twistGamma, n.focus, CONFIG.U_PULL * CONFIG.PULL_TWIST_GAIN) *
			drive.speed *
			drive.emission;
		this.churnRate = spin;
		this.breezeRate = this.breeze * drive.emission;
		// unwrapped on purpose: the sway waves sample phase at non-integer
		// frequencies, so a 2π wrap would make the centerline jump
		this.spinPhase += spin * dt;

		// ---- velocity pass ------------------------------------------------------
		// throttle gates only the sink channel inside the sampler; the emission
		// window winds the WHOLE ambient response down here as the spell ends
		const wind = drive.speed * drive.emission;
		for (let i = 0; i < this.max; i++) {
			if (!this.alive[i] || this.held[i]) continue;
			setV3(tmpPos, this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
			sampleAmbientVelocity(n, tmpPos, tmpVel, thr);
			this.vel[i * 3] = tmpVel.x * wind;
			this.vel[i * 3 + 1] = tmpVel.y * wind;
			this.vel[i * 3 + 2] = tmpVel.z * wind;
		}

		// ---- population pass (§9): under a vessel the medium occupies volume ----
		if (orb) this.mechanics.apply(this.pos, this.vel, this.alive, this.max, n.Q, dt);

		// ---- vessel + integrate + walls + latches -------------------------------
		let contained = 0;
		for (let i = 0; i < this.max; i++) {
			if (!this.alive[i]) continue;
			// held motes are the grasp: sustained (never released) — riding the
			// element's vortex when it burns, else settling into the heap
			if (this.held[i]) {
				if (this.poolH > 0.05) {
					this.rideVortex(i, dt);
				} else {
					this.settlePool(i, dt, churn, latched);
				}
				continue;
			}
			const inside = orb ? vesselPass(orb, this.pos, this.vel, i) : false;
			setV3(
				tmpPos,
				this.pos[i * 3] + this.vel[i * 3] * dt,
				this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt,
				this.pos[i * 3 + 2] + this.vel[i * 3 + 2] * dt
			);
			if (inside) {
				vesselClamp(orb!, tmpPos);
				contained++;
			}

			// disk wall: pooled matter sits ON the seal, not in it
			const rho = Math.hypot(tmpPos.x, tmpPos.z);
			if (rho < 1 && tmpPos.y < 0.015) tmpPos.y = 0.015;

			// grasp latch: a mote that stalls in the cushion is CAUGHT — state,
			// not a per-frame test. The speed gate keeps transiting matter from
			// charging the grasp; a full grasp accepts nothing more. A mote the
			// disk wall has stopped only churns horizontally, so its dead
			// vertical speed must not keep it reading as transit.
			const pressed = rho < 1 && tmpPos.y <= 0.016;
			const latchSpeed = pressed
				? Math.hypot(this.vel[i * 3], this.vel[i * 3 + 2])
				: Math.hypot(this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2]);
			if (
				!inside &&
				sink &&
				latched < cap &&
				rho < 1.02 &&
				tmpPos.y < CONFIG.GRASP_H &&
				latchSpeed < CONFIG.GRASP_V
			) {
				this.held[i] = 1;
				latched++;
			}

			// the medium is infinite: motes blown out of the domain (push mode)
			// are replaced by fresh ones elsewhere, never destroyed
			if (
				!inside &&
				(Math.hypot(tmpPos.x, tmpPos.z) > CONFIG.AMBIENT_R * 1.25 ||
					tmpPos.y > CONFIG.AMBIENT_H * 1.35)
			) {
				this.seedOne(i);
				continue;
			}
			this.pos[i * 3] = tmpPos.x;
			this.pos[i * 3 + 1] = tmpPos.y;
			this.pos[i * 3 + 2] = tmpPos.z;
		}
		// §9 ruling: the shell is a raised grasp — contained matter counts
		// against G_max, so a filling canteen throttles its own intake
		this.grasped = latched + (orb && n.pull ? contained : 0);
		this.restyle(this.activity);
		this.geo.attributes.position.needsUpdate = true;
	}

	/**
	 * One latched mote's frame in the settled heap (every gripped element whose
	 * pool doesn't whirl). The grasp gathers its catch into a filled dome at
	 * the seal's heart that swells with charge — one coherent body of matter,
	 * not a freeze-frame of wherever each mote happened to land. Each mote
	 * keeps a hashed spot in the heap (stable target, no per-frame shimmer);
	 * Γ_p keeps stirring the heap at the arrows' turn (§12 stirred-cup) and
	 * without arrows it rests still. The element volume look flavors the same
	 * shape into a water mound, rock heap, or radiant knoll.
	 */
	private settlePool(i: number, dt: number, churn: number, latched: number): void {
		if (dt <= 0) return;
		const j1 = hash01(i);
		const j3 = hash01(i + 104729);
		// below POOL_MIN_N the catch is a trace, not a body: motes settle flat
		const fill = Math.min(
			1,
			Math.max(0, latched - CONFIG.POOL_MIN_N) / (CONFIG.POOL_FULL_N - CONFIG.POOL_MIN_N)
		);
		const R = CONFIG.POOL_R_BASE + (CONFIG.POOL_R_MAX - CONFIG.POOL_R_BASE) * Math.sqrt(fill);
		const H = CONFIG.POOL_H_MAX * Math.pow(fill, 0.7);
		// uniform disk fill; the dome profile drops toward the rim
		const rT = R * Math.sqrt(j1);
		const yT = Math.max(0.02, H * (1 - (rT / R) * (rT / R)) * (0.55 + 0.45 * j3));
		const x = this.pos[i * 3];
		const y = this.pos[i * 3 + 1];
		const z = this.pos[i * 3 + 2];
		const r = Math.hypot(x, z);
		const th = (r > 1e-4 ? Math.atan2(z, x) : j3 * 2 * Math.PI) + (churn + this.breezeRate) * dt;
		const ease = 1 - Math.exp(-CONFIG.POOL_SETTLE * dt);
		const rN = r + (rT - r) * ease;
		const yN = y + (yT - y) * ease;
		const nx = rN * Math.cos(th);
		const nz = rN * Math.sin(th);
		this.vel[i * 3] = (nx - x) / dt;
		this.vel[i * 3 + 1] = (yN - y) / dt;
		this.vel[i * 3 + 2] = (nz - z) / dt;
		this.pos[i * 3] = nx;
		this.pos[i * 3 + 1] = yN;
		this.pos[i * 3 + 2] = nz;
	}

	/**
	 * One latched mote's frame on the fire whirl. The mass is bound onto two
	 * helical ARMS wound around a SNAKING centerline (whirlSway): each mote's
	 * azimuth eases toward arm base + winding·height + whirl phase, so the
	 * column reads as a turning corkscrew whose axis lashes about. Motes rise
	 * with a surging updraft, die at the crown and re-ignite in the foot; hash
	 * jitter spreads rise speed, wall radius and crown height, and the wall
	 * breathes over time, so the ribbon stays ragged flame, not a lathed screw.
	 * The capacitor never discharges — the mass only dances.
	 */
	private rideVortex(i: number, dt: number): void {
		if (dt <= 0) return;
		const x = this.pos[i * 3];
		const y = this.pos[i * 3 + 1];
		const z = this.pos[i * 3 + 2];
		const j1 = hash01(i);
		const j2 = hash01(i + 7919);
		const strands = CONFIG.VORTEX_STRANDS;
		const arm = (Math.min(strands - 1, Math.floor(j1 * strands)) * 2 * Math.PI) / strands;
		const armJ = (j1 * strands) % 1; // uniform within the arm, independent of which arm
		const H = this.poolH;
		// surge: the updraft pulses per mote — flare-ups race up the column
		const surge = 0.75 + 0.45 * Math.sin(this.clock * 1.7 + j1 * 6.28) ** 2;
		const rise =
			CONFIG.VORTEX_RISE * (0.55 + 0.9 * j2) * surge * this.vigor * Math.max(this.vortex, 0);
		let ny = y + rise * dt;
		// crown death: re-ignite low; zero velocity so the teleport doesn't
		// smear a false streak. Most motes ride near the crown before dying —
		// a low death band leaves the top too sparse to skin
		const reborn = ny > H * (0.78 + 0.22 * armJ);
		if (reborn) ny = 0.02 + 0.04 * j2;
		const t = Math.min(1, Math.max(0, ny / H));
		// moderate wobble: motes spread around their rope but stay crowded enough
		// that their deposits keep feeding the neighbour gate
		const target = arm + (j2 - 0.5) * 1.25 + ny * CONFIG.VORTEX_PITCH + this.spinPhase;
		// the wall breathes on two beats: lumps crawl along the column and motes
		// drift across the bands instead of lathing perfect helical paths
		const breathe =
			1 +
			0.13 * Math.sin(this.clock * (2.6 + 2 * j2) + i) +
			0.07 * Math.sin(this.clock * 0.9 + j1 * 6.28);
		// tight radial band straddling the rope radius (0.85 of the funnel wall)
		let wall =
			(CONFIG.VORTEX_R_BASE + (CONFIG.VORTEX_R_TOP - CONFIG.VORTEX_R_BASE) * t) *
			(0.78 + 0.2 * armJ) *
			breathe;
		// crown shred: the very tip flings motes outward past the deposit gate —
		// they stop skinning and fly loose as ember sparks, so the top dissolves
		// instead of ending in a machined rim. Kept to the last stretch: a wide
		// shred band turns the whole upper column into floating debris
		if (t > 0.88) wall *= 1 + (t - 0.88) * 2.2 * j2;
		// orbit relative to the lashing centerline, not the seal axis
		const cx = swayX(ny, this.spinPhase);
		const cz = swayZ(ny, this.spinPhase);
		const ox = x - cx;
		const oz = z - cz;
		const r = Math.hypot(ox, oz);
		let th: number;
		if (reborn || r < 1e-4) {
			th = target;
		} else {
			// every mote whirls (foot faster than crown — visible shear), and a
			// WEAK pull toward its arm shapes that full-round mass into a helical
			// density wave: spiral ridges on a connected trunk
			th = Math.atan2(oz, ox) + this.churnRate * (1.25 - 0.5 * t) * dt;
			let d = target - th;
			d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
			th += d * (1 - Math.exp(-CONFIG.VORTEX_BIND * dt));
		}
		const ease = 1 - Math.exp(-CONFIG.VORTEX_GATHER * dt);
		const rNew = reborn ? wall : r + (wall - r) * ease;
		const nx = cx + rNew * Math.cos(th);
		const nz = cz + rNew * Math.sin(th);
		if (reborn) {
			this.vel[i * 3] = 0;
			this.vel[i * 3 + 1] = 0;
			this.vel[i * 3 + 2] = 0;
		} else {
			this.vel[i * 3] = (nx - x) / dt;
			this.vel[i * 3 + 1] = (ny - y) / dt;
			this.vel[i * 3 + 2] = (nz - z) / dt;
		}
		this.pos[i * 3] = nx;
		this.pos[i * 3 + 1] = ny;
		this.pos[i * 3 + 2] = nz;
	}

	/**
	 * Per-frame look pass: every mote twinkles on its own phase, gripped motes
	 * brighten and heat toward white with pull activity and grow a velocity-
	 * streak tail; pooled motes glow at full element color with a soft shimmer.
	 * Free motes only exist visually where the spell moves them: below
	 * AMBIENT_VIS_V they draw nowhere, and brightness ramps in above it — the
	 * inflow spiral and the funnel show, the idle far medium never does.
	 */
	private restyle(activity: number): void {
		const c = this.color;
		// streak length: seconds of travel behind each mote. A fixed span keeps
		// the flow readable — the old 4·dt cap shrank streaks to a third of this
		// at 60fps and made their length depend on frame rate.
		const tail = CONFIG.AMBIENT_STREAK_S;
		const visV = CONFIG.AMBIENT_VIS_V;
		const visR = CONFIG.AMBIENT_VIS_R;
		const visRSoft = CONFIG.AMBIENT_VIS_R_SOFT;
		for (let i = 0; i < this.max; i++) {
			const px = this.pos[i * 3];
			const py = this.pos[i * 3 + 1];
			const pz = this.pos[i * 3 + 2];
			const pooled = this.alive[i] && this.held[i];
			const speed = Math.hypot(this.vel[i * 3], this.vel[i * 3 + 1], this.vel[i * 3 + 2]);
			// visibility = fast enough to matter AND on the spell's stage: the slow
			// whole-domain drift and the far-flung strays draw nowhere
			const rho = Math.hypot(px, pz);
			const rFade = 1 - Math.min(1, Math.max(0, (rho - visR) / visRSoft));
			const vis = pooled ? 1 : Math.min(1, Math.max(0, (speed - visV) / visV)) * rFade;
			const grip = Math.min(1, speed * 2) * activity;
			const tw =
				TWINKLE_BASE + TWINKLE_AMP * Math.sin(this.clock * (2.2 + (i % 7) * 0.6) + i * 1.71);
			const glow = (pooled ? MOTE_POOLED : (MOTE_DIM + (MOTE_ACTIVE - MOTE_DIM) * grip) * vis) * tw;
			// gripped embers heat up: lift every channel toward white
			const heat = pooled ? POOL_SHIMMER * tw : GRIP_HEAT * grip * vis;
			this.col[i * 3] = c.r * glow + heat;
			this.col[i * 3 + 1] = c.g * glow + heat;
			this.col[i * 3 + 2] = c.b * glow + heat;
			const d = i * 3;
			if (this.alive[i] && vis > 0) {
				this.dotPos[d] = px;
				this.dotPos[d + 1] = py;
				this.dotPos[d + 2] = pz;
			} else {
				this.dotPos[d] = this.dotPos[d + 1] = this.dotPos[d + 2] = -999;
			}

			const s = i * 6;
			// held motes ride inside the volume skin: a streak there draws dark
			// scratches over the bright flame body, so they stay dots — except
			// for bodiless elements (wind), whose circulating streaks ARE the
			// visible gathered mass
			if (!this.alive[i] || (this.held[i] && !this.heldStreaks) || speed < 0.05 || vis <= 0) {
				this.streakPos[s] = this.streakPos[s + 3] = -999;
				this.streakPos[s + 1] = this.streakPos[s + 4] = -999;
				this.streakPos[s + 2] = this.streakPos[s + 5] = -999;
				continue;
			}
			this.streakPos[s] = px;
			this.streakPos[s + 1] = py;
			this.streakPos[s + 2] = pz;
			this.streakPos[s + 3] = px - this.vel[i * 3] * tail;
			this.streakPos[s + 4] = py - this.vel[i * 3 + 1] * tail;
			this.streakPos[s + 5] = pz - this.vel[i * 3 + 2] * tail;
			this.streakCol[s] = c.r * glow + heat;
			this.streakCol[s + 1] = c.g * glow + heat;
			this.streakCol[s + 2] = c.b * glow + heat;
			this.streakCol[s + 3] = (c.r * glow + heat) * STREAK_TAIL_DIM;
			this.streakCol[s + 4] = (c.g * glow + heat) * STREAK_TAIL_DIM;
			this.streakCol[s + 5] = (c.b * glow + heat) * STREAK_TAIL_DIM;
		}
		this.geo.attributes.color.needsUpdate = true;
		this.streakGeo.attributes.position.needsUpdate = true;
		this.streakGeo.attributes.color.needsUpdate = true;
	}
}
