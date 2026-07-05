import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from './config';
import { ELEMENT_COLOR } from './model';
import { sampleAmbientVelocity, sampleVelocity } from './field';
import { compileSeal, maskAt, spawnWeight, type Nozzle } from './nozzle';
import { AmbientMedium } from './render/ambient';
import { Particles } from './render/particles';
import { ElementVolume } from './render/elementVolume';
import { buildMaskOverlay } from './render/maskOverlay';
import { buildSealGroup } from './render/seal';
import { SPELLS } from './spells';
import { len, v2 } from './math2';

// ---------------------------------------------------------------- scene

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101014);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(2.4, 1.9, 2.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.55, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.55;

window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});

// lights only affect the toon volume — seal/mask/particles are unlit materials
scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x2a2a33, 0.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(2.5, 4.0, 1.5);
scene.add(keyLight);

const particles = new Particles(scene);
const ambient = new AmbientMedium(scene);
const volume = new ElementVolume(scene);

// ---------------------------------------------------------------- state

let sealGroup: THREE.Group | null = null;
let maskMesh: THREE.Mesh | null = null;
let nozzle: Nozzle | null = null;

const select = document.getElementById('spell') as HTMLSelectElement;
const maskChk = document.getElementById('mask') as HTMLInputElement;
const effectChk = document.getElementById('effect') as HTMLInputElement;
const descEl = document.getElementById('desc')!;
const readoutEl = document.getElementById('readout')!;

for (let i = 0; i < SPELLS.length; i++) {
	const opt = document.createElement('option');
	opt.value = String(i);
	opt.textContent = SPELLS[i].name;
	select.appendChild(opt);
}

function readout(n: Nozzle): string {
	const p = len(n.P);
	const lines = [
		`S   ${n.S.toFixed(2)}   budget`,
		`|P| ${p.toFixed(2)}   lateral drive`,
		`C   ${n.C.toFixed(2)}   convergence`,
		`Γ   ${n.gamma.toFixed(2)}   swirl`
	];
	if (n.gates.length > 0)
		lines.push(`gates ${n.gates.length} class(es) · reach ×${n.reach.toFixed(2)}`);
	if (n.Q > 0.01) lines.push(`Q   ${n.Q.toFixed(2)}   lens · focus ×${n.focus.toFixed(2)}`);
	if (p > 0.01 || n.C > 0.01) {
		const elev = (Math.atan2(Math.max(n.C, 0), p) * 180) / Math.PI;
		lines.push(`jet elevation ${elev.toFixed(0)}°`);
	}
	if (n.lev) {
		lines.push(`L   ${n.lev.L.toFixed(2)}   levitation budget`);
		lines.push(`C⊕  ${n.lev.C.toFixed(2)}   grip (hold channel)`);
		if (n.lev.grip) {
			const shift = len(n.lev.x0);
			lines.push(
				`hold: ball at h₀ ${n.lev.h0.toFixed(2)}${shift > 0.01 ? ` · shifted ${shift.toFixed(2)}` : ''}`
			);
		} else {
			// streaming medium: the substrate reaction is the honest interim readout
			const tx = n.lev.P.x;
			const ty = -Math.max(n.lev.C, 0);
			const tz = n.lev.P.y;
			lines.push(`thrust (${tx.toFixed(2)}, ${ty.toFixed(2)}, ${tz.toFixed(2)}) [east, up, north]`);
		}
	}
	if (n.pull) {
		lines.push(`K   ${n.pull.K.toFixed(2)}   pull budget (ambient)`);
		lines.push(
			`C_p ${n.pull.C.toFixed(2)}   ${n.pull.C > 0.01 ? 'sink' : n.pull.C < -0.01 ? 'push' : '—'} · Γ_p ${n.pull.gamma.toFixed(2)} twist`
		);
		if (n.pull.cap > 0)
			lines.push(
				`grasp ${ambient.grasped}/${Math.round(n.pull.cap)} · throttle ${ambient.throttle().toFixed(2)}`
			);
		else lines.push(`grasp — (gathers nothing, never self-limits)`);
	}
	if (n.orb) {
		const shift = len(n.orb.x);
		lines.push(`O   ${n.orb.O.toFixed(2)}   vessel budget`);
		lines.push(
			`vessel r ${n.orb.radius.toFixed(2)} · center h ${n.orb.h.toFixed(2)}` +
				(shift > 0.01 ? ` · shifted ${shift.toFixed(2)}` : '') +
				(Math.abs(n.orb.stir) > 0.01 ? ` · stir ${n.orb.stir.toFixed(2)}` : '')
		);
		lines.push(`contained ${ambient.contained}`);
	}
	return lines.join('\n');
}

function switchSpell(i: number): void {
	const seal = SPELLS[i];
	if (sealGroup) scene.remove(sealGroup);
	if (maskMesh) scene.remove(maskMesh);

	nozzle = compileSeal(seal);
	sealGroup = buildSealGroup(seal);
	scene.add(sealGroup);
	maskMesh = buildMaskOverlay(nozzle);
	maskMesh.visible = maskChk.checked;
	scene.add(maskMesh);

	particles.setSeal(nozzle, ELEMENT_COLOR[seal.element]);
	ambient.setSeal(nozzle, ELEMENT_COLOR[seal.element], 7, !!seal.pour);
	volume.setElement(seal.element);
	descEl.textContent = seal.desc;
	readoutEl.textContent = readout(nozzle);

	// debug hook for probing the model from the console
	(window as unknown as Record<string, unknown>).__wha = {
		nozzle,
		maskAt,
		spawnWeight,
		v2,
		CONFIG, // volume/render knobs are re-read per frame — tweak live
		SPELLS, // mutable: override seal.element and re-select to view any preset in another element

		sampleU: (x: number, y: number, z: number) => {
			const out = new THREE.Vector3();
			sampleVelocity(nozzle!, new THREE.Vector3(x, y, z), out);
			return [Number(out.x.toFixed(3)), Number(out.y.toFixed(3)), Number(out.z.toFixed(3))];
		},
		sampleUAmb: (x: number, y: number, z: number) => {
			const out = new THREE.Vector3();
			sampleAmbientVelocity(nozzle!, new THREE.Vector3(x, y, z), out, ambient.throttle());
			return [Number(out.x.toFixed(3)), Number(out.y.toFixed(3)), Number(out.z.toFixed(3))];
		},
		ambient
	};
}

select.addEventListener('change', () => switchSpell(Number(select.value)));
maskChk.addEventListener('change', () => {
	if (maskMesh) maskMesh.visible = maskChk.checked;
});
effectChk.addEventListener('change', () => {
	volume.mesh.visible = effectChk.checked;
	particles.setStandalone(!effectChk.checked);
});

switchSpell(0);
select.value = '0';
volume.mesh.visible = effectChk.checked;
particles.setStandalone(!effectChk.checked);

// ---------------------------------------------------------------- loop

const clock = new THREE.Clock();
let readoutTick = 0;
renderer.setAnimationLoop(() => {
	const dt = Math.min(clock.getDelta(), 0.033);
	particles.update(dt);
	ambient.update(dt);
	volume.update(particles);
	// grasp charge and vessel fill are live state — refresh a few times a second
	if ((nozzle?.pull || nozzle?.orb) && ++readoutTick % 20 === 0)
		readoutEl.textContent = readout(nozzle);
	controls.update();
	renderer.render(scene, camera);
});
