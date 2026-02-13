import {
  G, SUN_MASS, PLANET_MASS, ROCKET_MASS,
  PLANET_ORBITAL_RADIUS, PLANET_INITIAL_VELOCITY,
  ROCKET_THRUST, ROCKET_ROTATION_SPEED,
  SUN_RADIUS, PLANET_RADIUS, ROCKET_SIZE,
  SUN_COLLISION_RADIUS, PLANET_COLLISION_RADIUS,
  gravitationalForce, integrate, checkCollision,
} from './physics.js';

// =============================================================
// Three.js scene setup
// =============================================================

const scene = new THREE.Scene();

// Orthographic camera (2D top-down)
const frustumSize = 800;
let aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
  -frustumSize * aspect / 2, frustumSize * aspect / 2,
  frustumSize / 2, -frustumSize / 2,
  0.1, 1000
);
camera.position.z = 100;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Zoom level
let zoom = 1;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;

// =============================================================
// Starfield background
// =============================================================

const starCount = 400;
const starGeo = new THREE.BufferGeometry();
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  starPositions[i * 3] = (Math.random() - 0.5) * 4000;
  starPositions[i * 3 + 1] = (Math.random() - 0.5) * 4000;
  starPositions[i * 3 + 2] = -1;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2 });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

// =============================================================
// Sun
// =============================================================

const sunGeo = new THREE.CircleGeometry(SUN_RADIUS, 64);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
scene.add(sunMesh);

// Sun glow
const glowGeo = new THREE.CircleGeometry(SUN_RADIUS * 1.6, 64);
const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.15 });
const glowMesh = new THREE.Mesh(glowGeo, glowMat);
scene.add(glowMesh);

// =============================================================
// Planet orbit line
// =============================================================

const orbitSegments = 128;
const orbitPoints = [];
for (let i = 0; i <= orbitSegments; i++) {
  const angle = (i / orbitSegments) * Math.PI * 2;
  orbitPoints.push(new THREE.Vector3(
    Math.cos(angle) * PLANET_ORBITAL_RADIUS,
    Math.sin(angle) * PLANET_ORBITAL_RADIUS,
    -0.5
  ));
}
const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
const orbitMat = new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.4 });
const orbitLine = new THREE.Line(orbitGeo, orbitMat);
scene.add(orbitLine);

// =============================================================
// Planet
// =============================================================

const planetGeo = new THREE.CircleGeometry(PLANET_RADIUS, 32);
const planetMat = new THREE.MeshBasicMaterial({ color: 0x44aacc });
const planetMesh = new THREE.Mesh(planetGeo, planetMat);
scene.add(planetMesh);

// Planet state
const planet = {
  x: PLANET_ORBITAL_RADIUS,
  y: 0,
  vx: 0,
  vy: PLANET_INITIAL_VELOCITY,
};

// =============================================================
// Rocket
// =============================================================

const rocketShape = new THREE.Shape();
rocketShape.moveTo(0, ROCKET_SIZE);
rocketShape.lineTo(-ROCKET_SIZE * 0.6, -ROCKET_SIZE * 0.6);
rocketShape.lineTo(ROCKET_SIZE * 0.6, -ROCKET_SIZE * 0.6);
rocketShape.closePath();

const rocketGeo = new THREE.ShapeGeometry(rocketShape);
const rocketMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
const rocketMesh = new THREE.Mesh(rocketGeo, rocketMat);
scene.add(rocketMesh);

// Thrust flame
const flameShape = new THREE.Shape();
flameShape.moveTo(-ROCKET_SIZE * 0.35, -ROCKET_SIZE * 0.6);
flameShape.lineTo(0, -ROCKET_SIZE * 1.6);
flameShape.lineTo(ROCKET_SIZE * 0.35, -ROCKET_SIZE * 0.6);
flameShape.closePath();

const flameGeo = new THREE.ShapeGeometry(flameShape);
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 });
const flameMesh = new THREE.Mesh(flameGeo, flameMat);
flameMesh.visible = false;
rocketMesh.add(flameMesh);

// Rocket state
const rocket = {
  x: PLANET_ORBITAL_RADIUS + 40,
  y: 0,
  vx: 0,
  vy: PLANET_INITIAL_VELOCITY,
  angle: Math.PI / 2, // facing "up"
  thrusting: false,
  alive: true,
};

// =============================================================
// Input handling
// =============================================================

const keys = { forward: false, left: false, right: false };

function onKeyDown(e) {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = true;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
}

function onKeyUp(e) {
  if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = false;
  if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
  if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

// Mouse wheel zoom
window.addEventListener('wheel', (e) => {
  zoom *= e.deltaY > 0 ? 0.9 : 1.1;
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
});

// Touch button handling
function setupTouchButton(id, key) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const start = () => { keys[key] = true; };
  const end = () => { keys[key] = false; };
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', end);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); end(); });
  btn.addEventListener('touchcancel', (e) => { e.preventDefault(); end(); });
}

setupTouchButton('btn-left', 'left');
setupTouchButton('btn-thrust', 'forward');
setupTouchButton('btn-right', 'right');

// =============================================================
// HUD
// =============================================================

const hudSpeed = document.getElementById('hud-speed');
const hudPos = document.getElementById('hud-pos');

// =============================================================
// Respawn
// =============================================================

function respawnRocket() {
  rocket.x = PLANET_ORBITAL_RADIUS + 40;
  rocket.y = 0;
  rocket.vx = 0;
  rocket.vy = PLANET_INITIAL_VELOCITY;
  rocket.angle = Math.PI / 2;
  rocket.thrusting = false;
  rocket.alive = true;
  rocketMesh.visible = true;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && !rocket.alive) respawnRocket();
});

// =============================================================
// Game loop
// =============================================================

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  let dt = clock.getDelta();
  // Clamp dt to avoid spiral of death
  if (dt > 0.05) dt = 0.05;

  // --- Planet physics ---
  const planetGrav = gravitationalForce(0, 0, SUN_MASS, planet.x, planet.y);
  integrate(planet, planetGrav.fx, planetGrav.fy, dt);

  // --- Rocket physics ---
  if (rocket.alive) {
    // Rotation
    if (keys.left) rocket.angle += ROCKET_ROTATION_SPEED * dt;
    if (keys.right) rocket.angle -= ROCKET_ROTATION_SPEED * dt;

    // Gravity from sun
    const rocketSunGrav = gravitationalForce(0, 0, SUN_MASS, rocket.x, rocket.y);
    // Gravity from planet
    const rocketPlanetGrav = gravitationalForce(planet.x, planet.y, PLANET_MASS, rocket.x, rocket.y);

    let ax = rocketSunGrav.fx + rocketPlanetGrav.fx;
    let ay = rocketSunGrav.fy + rocketPlanetGrav.fy;

    // Thrust
    rocket.thrusting = keys.forward;
    if (rocket.thrusting) {
      ax += Math.cos(rocket.angle) * ROCKET_THRUST / ROCKET_MASS;
      ay += Math.sin(rocket.angle) * ROCKET_THRUST / ROCKET_MASS;
    }

    integrate(rocket, ax, ay, dt);

    // Collision detection
    if (checkCollision(rocket.x, rocket.y, ROCKET_SIZE * 0.5, 0, 0, SUN_COLLISION_RADIUS)) {
      rocket.alive = false;
      rocketMesh.visible = false;
    }
    if (checkCollision(rocket.x, rocket.y, ROCKET_SIZE * 0.5, planet.x, planet.y, PLANET_COLLISION_RADIUS)) {
      rocket.alive = false;
      rocketMesh.visible = false;
    }
  }

  // --- Update meshes ---
  planetMesh.position.set(planet.x, planet.y, 0);

  if (rocket.alive) {
    rocketMesh.position.set(rocket.x, rocket.y, 0);
    rocketMesh.rotation.z = rocket.angle - Math.PI / 2; // offset because triangle points up
    flameMesh.visible = rocket.thrusting;
    // Flicker the flame
    if (rocket.thrusting) {
      flameMesh.scale.y = 0.8 + Math.random() * 0.5;
    }
  }

  // --- Camera follows rocket ---
  const camTarget = rocket.alive ? rocket : planet;
  camera.position.x += (camTarget.x - camera.position.x) * 0.05;
  camera.position.y += (camTarget.y - camera.position.y) * 0.05;

  // Apply zoom
  const effectiveSize = frustumSize / zoom;
  camera.left = -effectiveSize * aspect / 2;
  camera.right = effectiveSize * aspect / 2;
  camera.top = effectiveSize / 2;
  camera.bottom = -effectiveSize / 2;
  camera.updateProjectionMatrix();

  // Parallax starfield
  stars.position.x = camera.position.x * 0.5;
  stars.position.y = camera.position.y * 0.5;

  // --- HUD ---
  if (hudSpeed) {
    const speed = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
    hudSpeed.textContent = `Speed: ${speed.toFixed(1)}`;
  }
  if (hudPos) {
    if (!rocket.alive) {
      hudPos.textContent = 'DESTROYED - Press R to respawn';
    } else {
      hudPos.textContent = `Pos: (${rocket.x.toFixed(0)}, ${rocket.y.toFixed(0)})`;
    }
  }

  renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
  aspect = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
