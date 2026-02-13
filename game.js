import {
  LEVELS,
  gravitationalForce, integrate, checkCollision,
} from './physics.js';

// =============================================================
// Exported entry point - called after level selection
// =============================================================

export function startGame(levelId) {
  const L = LEVELS[levelId];

  const scene = new THREE.Scene();

  let aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.OrthographicCamera(
    -L.FRUSTUM_SIZE * aspect / 2, L.FRUSTUM_SIZE * aspect / 2,
    L.FRUSTUM_SIZE / 2, -L.FRUSTUM_SIZE / 2,
    0.1, 1000
  );
  camera.position.z = 100;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  let zoom = 1;

  // =========================================================
  // Starfield
  // =========================================================

  const starCount = 600;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPositions[i * 3] = (Math.random() - 0.5) * L.STAR_SPREAD;
    starPositions[i * 3 + 1] = (Math.random() - 0.5) * L.STAR_SPREAD;
    starPositions[i * 3 + 2] = -1;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2 });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // =========================================================
  // Sun
  // =========================================================

  const sunMesh = new THREE.Mesh(
    new THREE.CircleGeometry(L.SUN_RADIUS, 64),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 })
  );
  scene.add(sunMesh);

  const glowMesh = new THREE.Mesh(
    new THREE.CircleGeometry(L.SUN_RADIUS * 1.6, 64),
    new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.15 })
  );
  scene.add(glowMesh);

  // =========================================================
  // Planet orbit line
  // =========================================================

  const orbitPoints = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    orbitPoints.push(new THREE.Vector3(
      Math.cos(a) * L.PLANET_ORBITAL_RADIUS,
      Math.sin(a) * L.PLANET_ORBITAL_RADIUS,
      -0.5
    ));
  }
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitPoints),
    new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.4 })
  ));

  // =========================================================
  // Planet
  // =========================================================

  const planetMesh = new THREE.Mesh(
    new THREE.CircleGeometry(L.PLANET_RADIUS, 32),
    new THREE.MeshBasicMaterial({ color: 0x44aacc })
  );
  scene.add(planetMesh);

  const planet = {
    x: L.PLANET_ORBITAL_RADIUS, y: 0,
    vx: 0, vy: L.PLANET_INITIAL_VELOCITY,
  };

  // =========================================================
  // Rocket
  // =========================================================

  const rs = L.ROCKET_SIZE;
  const rocketShape = new THREE.Shape();
  rocketShape.moveTo(0, rs);
  rocketShape.lineTo(-rs * 0.6, -rs * 0.6);
  rocketShape.lineTo(rs * 0.6, -rs * 0.6);
  rocketShape.closePath();

  const rocketMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(rocketShape),
    new THREE.MeshBasicMaterial({ color: 0xeeeeee })
  );
  scene.add(rocketMesh);

  // Thrust flame
  const flameShape = new THREE.Shape();
  flameShape.moveTo(-rs * 0.35, -rs * 0.6);
  flameShape.lineTo(0, -rs * 1.6);
  flameShape.lineTo(rs * 0.35, -rs * 0.6);
  flameShape.closePath();

  const flameMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(flameShape),
    new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 })
  );
  flameMesh.visible = false;
  rocketMesh.add(flameMesh);

  // Red crosshair for player position when zoomed out
  const crossSize = L.ROCKET_SIZE * 2;
  const crossMat = new THREE.LineBasicMaterial({ color: 0xff3333 });

  const hLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-crossSize, 0, 0.5),
      new THREE.Vector3(crossSize, 0, 0.5),
    ]),
    crossMat
  );
  const vLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -crossSize, 0.5),
      new THREE.Vector3(0, crossSize, 0.5),
    ]),
    crossMat
  );
  const crosshair = new THREE.Group();
  crosshair.add(hLine, vLine);
  crosshair.visible = false;
  scene.add(crosshair);

  // Rocket state
  const orbitV = Math.sqrt(L.G * L.PLANET_MASS / L.ROCKET_PLANET_ORBIT_RADIUS);
  const rocket = {
    x: planet.x + L.ROCKET_PLANET_ORBIT_RADIUS,
    y: planet.y,
    vx: planet.vx,
    vy: planet.vy + orbitV,
    angle: Math.PI / 2,
    thrusting: false,
    alive: true,
  };

  // =========================================================
  // Off-screen indicators
  // =========================================================

  function createIndicator(color, label) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; pointer-events:none; z-index:10;
      display:none; align-items:center; gap:4px;
      font-family:'Courier New',monospace; font-size:12px;
      color:${color}; text-shadow:0 0 4px #000;
    `;
    const arrow = document.createElement('div');
    arrow.style.cssText = `
      width:0; height:0;
      border-left:6px solid transparent;
      border-right:6px solid transparent;
      border-bottom:10px solid ${color};
      transform-origin:center center;
    `;
    el.appendChild(arrow);
    const text = document.createElement('span');
    text.textContent = label;
    el.appendChild(text);
    document.body.appendChild(el);
    return { el, arrow };
  }

  const sunIndicator = createIndicator('#ffcc00', 'Sun');
  const planetIndicator = createIndicator('#44aacc', 'Earth');

  function updateIndicator(indicator, worldX, worldY) {
    const effectiveSize = L.FRUSTUM_SIZE / zoom;
    const halfW = effectiveSize * aspect / 2;
    const halfH = effectiveSize / 2;

    const relX = worldX - camera.position.x;
    const relY = worldY - camera.position.y;

    if (Math.abs(relX) < halfW * 0.9 && Math.abs(relY) < halfH * 0.9) {
      indicator.el.style.display = 'none';
      return;
    }

    indicator.el.style.display = 'flex';

    // Direction angle from screen center to object
    const angle = Math.atan2(relY, relX);

    // Project onto screen edge
    const edgeX = Math.cos(angle);
    const edgeY = Math.sin(angle);
    const scaleX = halfW > 0 ? Math.abs(edgeX / halfW) : 0;
    const scaleY = halfH > 0 ? Math.abs(edgeY / halfH) : 0;
    const scale = Math.max(scaleX, scaleY);
    const clampedX = scale > 0 ? edgeX / scale : 0;
    const clampedY = scale > 0 ? edgeY / scale : 0;

    const pad = 40;
    const cx = (0.5 + clampedX / (2 * halfW)) * window.innerWidth;
    const cy = (0.5 - clampedY / (2 * halfH)) * window.innerHeight;

    indicator.el.style.left = Math.max(pad, Math.min(window.innerWidth - pad, cx)) + 'px';
    indicator.el.style.top = Math.max(pad, Math.min(window.innerHeight - pad - 60, cy)) + 'px';

    indicator.arrow.style.transform = `rotate(${-(angle - Math.PI / 2)}rad)`;
  }

  // =========================================================
  // Input
  // =========================================================

  const keys = { forward: false, left: false, right: false };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = true;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.forward = false;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
  });

  window.addEventListener('wheel', (e) => {
    zoom *= e.deltaY > 0 ? 0.9 : 1.1;
    zoom = Math.max(L.MIN_ZOOM, Math.min(L.MAX_ZOOM, zoom));
  });

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

  // =========================================================
  // HUD
  // =========================================================

  const hudSpeed = document.getElementById('hud-speed');
  const hudPos = document.getElementById('hud-pos');

  // =========================================================
  // Respawn
  // =========================================================

  function respawnRocket() {
    const v = Math.sqrt(L.G * L.PLANET_MASS / L.ROCKET_PLANET_ORBIT_RADIUS);
    rocket.x = planet.x + L.ROCKET_PLANET_ORBIT_RADIUS;
    rocket.y = planet.y;
    rocket.vx = planet.vx;
    rocket.vy = planet.vy + v;
    rocket.angle = Math.PI / 2;
    rocket.thrusting = false;
    rocket.alive = true;
    rocketMesh.visible = true;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && !rocket.alive) respawnRocket();
  });

  // =========================================================
  // Game loop
  // =========================================================

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    let dt = clock.getDelta();
    if (dt > 0.05) dt = 0.05;

    // Planet physics
    const pg = gravitationalForce(L.G, 0, 0, L.SUN_MASS, planet.x, planet.y);
    integrate(planet, pg.fx, pg.fy, dt);

    // Rocket physics
    if (rocket.alive) {
      if (keys.left) rocket.angle += L.ROCKET_ROTATION_SPEED * dt;
      if (keys.right) rocket.angle -= L.ROCKET_ROTATION_SPEED * dt;

      const sg = gravitationalForce(L.G, 0, 0, L.SUN_MASS, rocket.x, rocket.y);
      const eg = gravitationalForce(L.G, planet.x, planet.y, L.PLANET_MASS, rocket.x, rocket.y);

      let ax = sg.fx + eg.fx;
      let ay = sg.fy + eg.fy;

      rocket.thrusting = keys.forward;
      if (rocket.thrusting) {
        ax += Math.cos(rocket.angle) * L.ROCKET_THRUST / L.ROCKET_MASS;
        ay += Math.sin(rocket.angle) * L.ROCKET_THRUST / L.ROCKET_MASS;
      }

      integrate(rocket, ax, ay, dt);

      if (checkCollision(rocket.x, rocket.y, L.ROCKET_SIZE * 0.5, 0, 0, L.SUN_COLLISION_RADIUS)) {
        rocket.alive = false;
        rocketMesh.visible = false;
      }
      if (checkCollision(rocket.x, rocket.y, L.ROCKET_SIZE * 0.5, planet.x, planet.y, L.PLANET_COLLISION_RADIUS)) {
        rocket.alive = false;
        rocketMesh.visible = false;
      }
    }

    // Update meshes
    planetMesh.position.set(planet.x, planet.y, 0);

    if (rocket.alive) {
      rocketMesh.position.set(rocket.x, rocket.y, 0);
      rocketMesh.rotation.z = rocket.angle - Math.PI / 2;
      flameMesh.visible = rocket.thrusting;
      if (rocket.thrusting) {
        flameMesh.scale.y = 0.8 + Math.random() * 0.5;
      }
    }

    // Red crosshair: visible when rocket mesh would be too small to see
    // (i.e. when viewport covers much more area than rocket neighborhood)
    const effectiveSize = L.FRUSTUM_SIZE / zoom;
    const rocketScreenFraction = L.ROCKET_SIZE / effectiveSize;
    if (rocket.alive && rocketScreenFraction < 0.008) {
      crosshair.visible = true;
      crosshair.position.set(rocket.x, rocket.y, 0);
      // Scale crosshair to stay a constant size on screen
      const crossScale = effectiveSize * 0.015;
      crosshair.scale.set(crossScale, crossScale, 1);
    } else {
      crosshair.visible = false;
    }

    // Camera follows rocket
    const camTarget = rocket.alive ? rocket : planet;
    camera.position.x += (camTarget.x - camera.position.x) * 0.05;
    camera.position.y += (camTarget.y - camera.position.y) * 0.05;

    camera.left = -effectiveSize * aspect / 2;
    camera.right = effectiveSize * aspect / 2;
    camera.top = effectiveSize / 2;
    camera.bottom = -effectiveSize / 2;
    camera.updateProjectionMatrix();

    // Parallax starfield
    stars.position.x = camera.position.x * 0.5;
    stars.position.y = camera.position.y * 0.5;

    // Off-screen indicators
    updateIndicator(sunIndicator, 0, 0);
    updateIndicator(planetIndicator, planet.x, planet.y);

    // HUD
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

  window.addEventListener('resize', () => {
    aspect = window.innerWidth / window.innerHeight;
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}
