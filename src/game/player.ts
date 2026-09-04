import * as THREE from 'three';
import { VoxelWorld } from './world';

export class Player {
  readonly position = new THREE.Vector3(0, 30, 0);
  readonly velocity = new THREE.Vector3();
  yaw = 0; pitch = 0; grounded = false;
  private keys = new Set<string>();
  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly world: VoxelWorld) {
    addEventListener('keydown', e => this.keys.add(e.code));
    addEventListener('keyup', e => this.keys.delete(e.code));
  }
  look(dx: number, dy: number) { this.yaw -= dx * .0022; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * .0022, -1.48, 1.48); }
  update(dt: number) {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x); const wish = new THREE.Vector3();
    if (this.keys.has('KeyW')) wish.sub(forward); if (this.keys.has('KeyS')) wish.add(forward);
    if (this.keys.has('KeyA')) wish.sub(right); if (this.keys.has('KeyD')) wish.add(right);
    if (wish.lengthSq()) wish.normalize();
    const speed = this.keys.has('ShiftLeft') ? 7.2 : 4.6;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, wish.x * speed, 13, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, wish.z * speed, 13, dt);
    if (this.keys.has('Space') && this.grounded) { this.velocity.y = 7; this.grounded = false; }
    this.velocity.y -= 20 * dt;
    this.moveAxis('x', this.velocity.x * dt); this.moveAxis('z', this.velocity.z * dt);
    this.grounded = false; this.moveAxis('y', this.velocity.y * dt);
    this.camera.position.copy(this.position).add(new THREE.Vector3(0, 1.55, 0));
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
  private moveAxis(axis: 'x' | 'y' | 'z', amount: number) {
    this.position[axis] += amount;
    const minX = Math.floor(this.position.x - .3), maxX = Math.floor(this.position.x + .3);
    const minY = Math.floor(this.position.y), maxY = Math.floor(this.position.y + 1.75);
    const minZ = Math.floor(this.position.z - .3), maxZ = Math.floor(this.position.z + .3);
    let collided = false;
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) if (this.world.get(x,y,z)) collided = true;
    if (!collided) return;
    this.position[axis] -= amount;
    if (axis === 'y') { if (amount < 0) this.grounded = true; this.velocity.y = 0; } else this.velocity[axis] = 0;
  }
}
