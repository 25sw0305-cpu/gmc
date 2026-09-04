import * as THREE from 'three';
import { BLOCKS, HOTBAR, type BlockId } from './game/blocks';
import { Player } from './game/player';
import { VoxelWorld } from './game/world';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const cover = document.querySelector<HTMLElement>('#cover')!, hud = document.querySelector<HTMLElement>('#hud')!;
const hotbar = document.querySelector<HTMLElement>('#hotbar')!, coords = document.querySelector<HTMLElement>('#coords')!, clock = document.querySelector<HTMLElement>('#clock')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25)); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = false;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xa9d5e8, 18, 72); scene.background = new THREE.Color(0xa9d5e8);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 120);
const seed = Number(localStorage.getItem('meadow-voxels-seed')) || Math.floor(Math.random() * 1e9);
const world = new VoxelWorld(seed); scene.add(world.group);
const ambient = new THREE.HemisphereLight(0xaedfff, 0x435a36, 1.45); scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff1c9, 1.5); scene.add(sun); sun.position.set(25, 35, 15);
const player = new Player(camera, world); player.position.set(0, 35, 0);
let selected = 0, elapsed = .22, active = false;

function drawHotbar() { hotbar.innerHTML = HOTBAR.map((id, i) => `<button class="slot ${i === selected ? 'selected' : ''}" data-slot="${i}"><i style="background:#${BLOCKS[id].color.toString(16).padStart(6,'0')}"></i><b>${i + 1}</b><span>${BLOCKS[id].name}</span></button>`).join(''); }
drawHotbar(); hotbar.addEventListener('click', e => { const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.slot'); if (button) { selected = Number(button.dataset.slot); drawHotbar(); } });
document.querySelector('#play')!.addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('pointerlockchange', () => { active = document.pointerLockElement === canvas; cover.hidden = active; hud.hidden = !active; });
document.addEventListener('mousemove', e => { if (active) player.look(e.movementX, e.movementY); });
document.addEventListener('keydown', e => { const n = Number(e.key); if (n >= 1 && n <= HOTBAR.length) { selected = n - 1; drawHotbar(); } if (e.code === 'KeyR' && active && confirm('저장된 변경 사항을 지우고 새 세계를 만들까요?')) { localStorage.removeItem('meadow-voxels-edits'); localStorage.removeItem('meadow-voxels-seed'); location.reload(); } });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => { if (!active) return; const direction = new THREE.Vector3(); camera.getWorldDirection(direction); const hit = world.raycast(camera.position, direction); if (!hit) return; if (e.button === 0) world.set(hit.x, hit.y, hit.z, 0); if (e.button === 2) { const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz; const p = player.position; if (!(x + 1 > p.x -.3 && x < p.x + .3 && y + 1 > p.y && y < p.y + 1.75 && z + 1 > p.z -.3 && z < p.z + .3)) world.set(x, y, z, HOTBAR[selected] as BlockId); } });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
let last = performance.now();
function frame(now: number) { requestAnimationFrame(frame); const dt = Math.min((now - last) / 1000, .05); last = now; if (active) { player.update(dt); world.update(player.position.x, player.position.z); elapsed = (elapsed + dt / 150) % 1; const angle = elapsed * Math.PI * 2; sun.position.set(Math.cos(angle) * 38, Math.sin(angle) * 42, 18); const daylight = THREE.MathUtils.clamp((sun.position.y + 4) / 18, .12, 1); sun.intensity = daylight * 1.5; ambient.intensity = .3 + daylight; const sky = new THREE.Color().setHSL(.57, .52, .16 + daylight * .56); scene.background = sky; scene.fog!.color.copy(sky); coords.textContent = `${Math.floor(player.position.x)}, ${Math.floor(player.position.y)}, ${Math.floor(player.position.z)}`; clock.textContent = sun.position.y > 0 ? '☀ 낮' : '☾ 밤'; } renderer.render(scene, camera); }
requestAnimationFrame(frame);
