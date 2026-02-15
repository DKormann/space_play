import {
  LEVELS,
  gravitationalForce, integrate, checkCollision,
} from './physics.js?v=2';

// =============================================================
// Exported entry point - called after level selection
// =============================================================

export function startGame(levelId) {
  const L = LEVELS[levelId];
  if (!L) throw new Error(`Unknown levelId "${levelId}"`);

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
  let logZoom = Math.log(zoom);
  const clampZoom = () => {
    const minLog = Math.log(L.MIN_ZOOM);
    const maxLog = Math.log(L.MAX_ZOOM);
    logZoom = Math.max(minLog, Math.min(maxLog, logZoom));
    zoom = Math.exp(logZoom);
  };

  // Mobile pinch-to-zoom on the canvas (logarithmic scale).
  const pinch = { active: false, startDist: 0, startLogZoom: 0 };
  const touchDist = (t0, t1) => Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  renderer.domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinch.active = true;
      pinch.startDist = touchDist(e.touches[0], e.touches[1]) || 1;
      pinch.startLogZoom = logZoom;
      e.preventDefault();
    }
  }, { passive: false });
  renderer.domElement.addEventListener('touchmove', (e) => {
    if (!pinch.active) return;
    if (e.touches.length !== 2) return;
    const dist = touchDist(e.touches[0], e.touches[1]);
    if (!(dist > 0)) return;
    // Natural mapping: doubling finger distance doubles zoom (in log space).
    logZoom = pinch.startLogZoom + Math.log(dist / pinch.startDist);
    clampZoom();
    e.preventDefault();
  }, { passive: false });
  renderer.domElement.addEventListener('touchend', () => { pinch.active = false; }, { passive: true });
  renderer.domElement.addEventListener('touchcancel', () => { pinch.active = false; }, { passive: true });

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
  // Planet(s)
  // =========================================================

  function createWorldLabel(color, text) {
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; pointer-events:none; z-index:11;
      display:none;
      font-family:'Courier New',monospace; font-size:12px;
      color:${color}; text-shadow:0 0 4px #000;
      transform:translate(-50%,-50%);
      white-space:nowrap;
    `;
    el.textContent = text;
    document.body.appendChild(el);
    return el;
  }

  function makeOrbitLine(radius) {
    const pts = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, -0.5));
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.35 })
    );
  }

  // Defensive: allow older single-planet levels (or stale cached modules) that
  // don't have L.PLANETS yet.
  const planetSpecs = Array.isArray(L.PLANETS) ? L.PLANETS : [{
    name: 'Earth',
    color: 0x44aacc,
    mass: L.PLANET_MASS ?? 10,
    radius: L.PLANET_RADIUS ?? 10,
    orbitalRadius: L.PLANET_ORBITAL_RADIUS ?? 300,
    initialVelocity: L.PLANET_INITIAL_VELOCITY,
    collisionRadius: L.PLANET_COLLISION_RADIUS,
  }];

  const planets = planetSpecs.map((p, idx) => {
    scene.add(makeOrbitLine(p.orbitalRadius));
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(p.radius, 32),
      new THREE.MeshBasicMaterial({ color: p.color })
    );
    scene.add(mesh);
    const labelEl = createWorldLabel(
      '#' + ((p.color ?? 0xffffff) >>> 0).toString(16).padStart(6, '0'),
      p.name ?? `Planet ${idx + 1}`
    );
    // Start on +X axis, counterclockwise orbit.
    const state = {
      idx,
      name: p.name,
      color: p.color,
      mass: p.mass,
      radius: p.radius,
      collisionRadius: p.collisionRadius ?? p.radius,
      x: p.orbitalRadius,
      y: 0,
      vx: 0,
      vy: p.initialVelocity ?? Math.sqrt(L.G * L.SUN_MASS / p.orbitalRadius),
      mesh,
      labelEl,
    };
    return state;
  });
  const homePlanet = planets[0];

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

  // Player indicator when zoomed out: crosshair + facing direction + velocity
  const crossSize = 1; // unit size, scaled at runtime
  const crossMat = new THREE.LineBasicMaterial({ color: 0xff3333 });

  // Crosshair lines
  const hLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-crossSize, 0, 0), new THREE.Vector3(crossSize, 0, 0),
    ]), crossMat
  );
  const vLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -crossSize, 0), new THREE.Vector3(0, crossSize, 0),
    ]), crossMat
  );

  // Facing direction triangle (points in +Y, rotated at runtime)
  const dirShape = new THREE.Shape();
  dirShape.moveTo(0, 2.5);
  dirShape.lineTo(-0.6, 1.3);
  dirShape.lineTo(0.6, 1.3);
  dirShape.closePath();
  const dirMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(dirShape),
    new THREE.MeshBasicMaterial({ color: 0xff3333 })
  );

  // Velocity line (drawn from origin toward velocity direction, length set at runtime)
  const velGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0),
  ]);
  const velLine = new THREE.Line(velGeo, new THREE.LineBasicMaterial({ color: 0x33ccff }));

  const playerIndicator = new THREE.Group();
  playerIndicator.add(hLine, vLine, dirMesh, velLine);
  playerIndicator.visible = false;
  playerIndicator.position.z = 0.5;
  scene.add(playerIndicator);

  // Rocket state
  const orbitV = Math.sqrt(L.G * homePlanet.mass / L.ROCKET_PLANET_ORBIT_RADIUS);
  const rocket = {
    x: homePlanet.x + L.ROCKET_PLANET_ORBIT_RADIUS,
    y: homePlanet.y,
    vx: homePlanet.vx,
    vy: homePlanet.vy + orbitV,
    angle: Math.PI / 2,
    thrusting: false,
    alive: true,
    landed: false,
    landedAngle: 0, // angle on planet surface where landed
    landedPlanetIdx: 0,
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
  const planetIndicators = planets.map((p) => createIndicator(
    '#' + (p.color >>> 0).toString(16).padStart(6, '0'),
    p.name
  ));

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
    // Logarithmic scaling: wheel deltas apply in log space, then exponentiate.
    // This makes zoom feel consistent over huge ranges.
    const ZOOM_SENS = 0.0015;
    logZoom += -e.deltaY * ZOOM_SENS;
    clampZoom();
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
    const v = Math.sqrt(L.G * homePlanet.mass / L.ROCKET_PLANET_ORBIT_RADIUS);
    rocket.x = homePlanet.x + L.ROCKET_PLANET_ORBIT_RADIUS;
    rocket.y = homePlanet.y;
    rocket.vx = homePlanet.vx;
    rocket.vy = homePlanet.vy + v;
    rocket.angle = Math.PI / 2;
    rocket.thrusting = false;
    rocket.alive = true;
    rocket.landed = false;
    rocketMesh.visible = true;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && !rocket.alive) respawnRocket();
  });

  // =========================================================
  // Time scale
  // =========================================================

  const timeScales = [0,0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16];
  let timeScaleIndex = 3; // starts at 1x
  let timeScale = 1;
  const hudTime = document.getElementById('hud-time');

  function setTimeScale(idx) {
    timeScaleIndex = Math.max(0, Math.min(timeScales.length - 1, idx));
    timeScale = timeScales[timeScaleIndex];
    if (hudTime) hudTime.textContent = timeScale === 0 ? 'Time: PAUSED' : `Time: ${timeScale}x`;
  }

  const stepSlower = () => setTimeScale(timeScaleIndex - 1);
  const stepFaster = () => setTimeScale(timeScaleIndex + 1);

  // Press-and-hold stepping for mouse + touch.
  function bindRepeat(el, stepFn) {
    if (!el) return;
    let timer = null;
    let interval = null;
    const stop = () => {
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      timer = null;
      interval = null;
    };
    const start = (e) => {
      e?.preventDefault?.();
      stepFn(); // immediate
      stop();
      const firstDelayMs = 250;
      const repeatMs = 120;
      timer = setTimeout(() => {
        interval = setInterval(stepFn, repeatMs);
      }, firstDelayMs);
    };
    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('mouseup', stop);
    window.addEventListener('mouseleave', stop);
    el.addEventListener('touchend', stop);
    el.addEventListener('touchcancel', stop);
  }

  bindRepeat(document.getElementById('ts-slower'), stepSlower);
  bindRepeat(document.getElementById('ts-faster'), stepFaster);

  document.getElementById('ts-pause')?.addEventListener('click', () => {
    if (timeScale === 0) setTimeScale(3); // unpause to 1x
    else setTimeScale(0);
  });

  // Keyboard: allow single-step and hold-to-repeat stepping.
  const tsHold = { slower: false, faster: false };
  let tsHoldTime = 0;
  let tsRepeatAccum = 0;
  const TS_FIRST_DELAY = 0.25; // seconds
  const TS_REPEAT_INTERVAL = 0.12; // seconds per step after delay

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Comma' || e.code === 'BracketLeft') {
      tsHold.slower = true;
      if (!e.repeat) stepSlower();
      e.preventDefault();
    }
    if (e.code === 'Period' || e.code === 'BracketRight' ) {
      tsHold.faster = true;
      if (!e.repeat) stepFaster();
      e.preventDefault();
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (timeScale === 0) setTimeScale(3);
      else setTimeScale(0);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Comma' || e.code === 'BracketLeft') tsHold.slower = false;
    if (e.code === 'Period' || e.code === 'BracketRight') tsHold.faster = false;
    if (!tsHold.slower && !tsHold.faster) {
      tsHoldTime = 0;
      tsRepeatAccum = 0;
    }
  });

  // =========================================================
  // Game loop
  // =========================================================

  const clock = new THREE.Clock();
  // Fixed-step simulation reduces visible jitter at high zoom by avoiding
  // variable-sized Euler steps when frame time fluctuates.
  const FIXED_DT = 1 / 120;
  const MAX_STEPS_PER_FRAME = 10;
  let simAccum = 0;
  // Previous-step state for render interpolation (all planets + rocket).
  const planetPrevX = planets.map(p => p.x);
  const planetPrevY = planets.map(p => p.y);
  let rocketPrevX = rocket.x, rocketPrevY = rocket.y, rocketPrevAngle = rocket.angle;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpAngle(a, b, t) {
    // Shortest-path interpolation for angles (avoids wrap-around jumps).
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function animate() {
    requestAnimationFrame(animate);

    // Real frame delta (unscaled) for rendering/camera.
    let frameDt = clock.getDelta();
    if (frameDt > 0.05) frameDt = 0.05;

    // Rotation steering is in real-time, not simulation-time (not affected by timeScale).
    if (rocket.alive) {
      if (keys.left) rocket.angle += L.ROCKET_ROTATION_SPEED * frameDt;
      if (keys.right) rocket.angle -= L.ROCKET_ROTATION_SPEED * frameDt;
    }

    // Time-scale stepping while keys are held.
    if (tsHold.slower || tsHold.faster) {
      tsHoldTime += frameDt;
      if (tsHoldTime >= TS_FIRST_DELAY) {
        tsRepeatAccum += frameDt;
        while (tsRepeatAccum >= TS_REPEAT_INTERVAL) {
          tsRepeatAccum -= TS_REPEAT_INTERVAL;
          if (tsHold.slower) stepSlower();
          if (tsHold.faster) stepFaster();
        }
      }
    } else {
      tsHoldTime = 0;
      tsRepeatAccum = 0;
    }

    // Simulation delta respects timeScale and runs in fixed increments.
    const simDt = frameDt * timeScale;
    simAccum += simDt;

    // Physics step(s)
    let steps = 0;
    while (simAccum >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      steps++;
      simAccum -= FIXED_DT;

      // Capture previous state for interpolation (before mutating this step).
      for (let i = 0; i < planets.length; i++) {
        planetPrevX[i] = planets[i].x;
        planetPrevY[i] = planets[i].y;
      }
      rocketPrevX = rocket.x; rocketPrevY = rocket.y; rocketPrevAngle = rocket.angle;

      // Planet physics (each planet orbits sun; no planet-planet gravity for simplicity)
      for (const pl of planets) {
        const pg = gravitationalForce(L.G, 0, 0, L.SUN_MASS, pl.x, pl.y);
        integrate(pl, pg.fx, pg.fy, FIXED_DT);
      }

      // Rocket physics
      if (rocket.alive && rocket.landed) {
        const landedOn = planets[rocket.landedPlanetIdx] ?? homePlanet;
        // Stick to planet surface
        rocket.x = landedOn.x + Math.cos(rocket.landedAngle) * (landedOn.radius + L.ROCKET_SIZE * 0.5);
        rocket.y = landedOn.y + Math.sin(rocket.landedAngle) * (landedOn.radius + L.ROCKET_SIZE * 0.5);
        rocket.vx = landedOn.vx;
        rocket.vy = landedOn.vy;

        // Thrust to take off
        rocket.thrusting = keys.forward;
        if (rocket.thrusting) {
          rocket.landed = false;
          rocket.vx += Math.cos(rocket.angle) * L.ROCKET_THRUST / L.ROCKET_MASS * FIXED_DT;
          rocket.vy += Math.sin(rocket.angle) * L.ROCKET_THRUST / L.ROCKET_MASS * FIXED_DT;
        }
      } else if (rocket.alive) {
        const sg = gravitationalForce(L.G, 0, 0, L.SUN_MASS, rocket.x, rocket.y);
        let ax = sg.fx;
        let ay = sg.fy;
        for (const pl of planets) {
          const pg = gravitationalForce(L.G, pl.x, pl.y, pl.mass, rocket.x, rocket.y);
          ax += pg.fx;
          ay += pg.fy;
        }

        rocket.thrusting = keys.forward;
        if (rocket.thrusting) {
          ax += Math.cos(rocket.angle) * L.ROCKET_THRUST / L.ROCKET_MASS;
          ay += Math.sin(rocket.angle) * L.ROCKET_THRUST / L.ROCKET_MASS;
        }

        integrate(rocket, ax, ay, FIXED_DT);

        // Sun collision: always fatal
        if (checkCollision(rocket.x, rocket.y, L.ROCKET_SIZE * 0.5, 0, 0, L.SUN_COLLISION_RADIUS)) {
          rocket.alive = false;
          rocketMesh.visible = false;
        }

        // Planet collision: land or crash depending on relative speed
        for (const pl of planets) {
          if (!rocket.alive) break;
          if (!checkCollision(rocket.x, rocket.y, L.ROCKET_SIZE * 0.5, pl.x, pl.y, pl.collisionRadius)) continue;

          const relVx = rocket.vx - pl.vx;
          const relVy = rocket.vy - pl.vy;
          const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);

          if (relSpeed < L.LANDING_SPEED) {
            // Safe landing
            rocket.landed = true;
            rocket.landedPlanetIdx = pl.idx;
            rocket.landedAngle = Math.atan2(rocket.y - pl.y, rocket.x - pl.x);
            rocket.vx = pl.vx;
            rocket.vy = pl.vy;
          } else {
            // Crash
            rocket.alive = false;
            rocketMesh.visible = false;
          }
        }
      }
    }
    // Prevent unbounded catch-up (e.g., after tab was hidden); drop backlog.
    if (steps === MAX_STEPS_PER_FRAME) simAccum = 0;

    // Render interpolation factor between previous and current step.
    const alpha = FIXED_DT > 0 ? (simAccum / FIXED_DT) : 0;
    // Interpolate all planet positions to eliminate jitter.
    const planetRXs = planets.map((p, i) => lerp(planetPrevX[i], p.x, alpha));
    const planetRYs = planets.map((p, i) => lerp(planetPrevY[i], p.y, alpha));
    const rocketRX = lerp(rocketPrevX, rocket.x, alpha);
    const rocketRY = lerp(rocketPrevY, rocket.y, alpha);
    const rocketRAngle = lerpAngle(rocketPrevAngle, rocket.angle, alpha);

    // Update meshes with interpolated positions for all planets.
    for (let i = 0; i < planets.length; i++) {
      planets[i].mesh.position.set(planetRXs[i], planetRYs[i], 0);
    }

    if (rocket.alive) {
      rocketMesh.position.set(rocketRX, rocketRY, 0);
      rocketMesh.rotation.z = rocketRAngle - Math.PI / 2;
      flameMesh.visible = rocket.thrusting;
      if (rocket.thrusting) {
        flameMesh.scale.y = 0.8 + Math.random() * 0.5;
      }
    }

    // Player indicator: visible when rocket is too small to see
    const effectiveSize = L.FRUSTUM_SIZE / zoom;
    const rocketScreenFraction = L.ROCKET_SIZE / effectiveSize;
    if (rocket.alive && rocketScreenFraction < 0.008) {
      playerIndicator.visible = true;
      playerIndicator.position.x = rocketRX;
      playerIndicator.position.y = rocketRY;

      const s = effectiveSize * 0.015;
      playerIndicator.scale.set(s, s, 1);

      // Facing direction: rotate the triangle
      dirMesh.rotation.z = rocketRAngle - Math.PI / 2;

      // Velocity line: point in velocity direction, length proportional to speed
      const speed = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
      const velAngle = Math.atan2(rocket.vy, rocket.vx);
      velLine.rotation.z = velAngle - Math.PI / 2;
      // Scale length: map speed to 0-5 units in indicator space
      const velLen = Math.min(speed / (L.PLANET_INITIAL_VELOCITY * 0.5) * 3, 8);
      const velPositions = velLine.geometry.attributes.position.array;
      velPositions[4] = velLen; // endpoint Y
      velLine.geometry.attributes.position.needsUpdate = true;
    } else {
      playerIndicator.visible = false;
    }

    // Camera follows rocket
    const camTarget = rocket.alive
      ? { x: rocketRX, y: rocketRY }
      : { x: planetRXs[0], y: planetRYs[0] };
    // Frame-rate independent smoothing: time constant in seconds.
    const follow = 1 - Math.exp(-12 * frameDt);
    camera.position.x += (camTarget.x - camera.position.x) * follow;
    camera.position.y += (camTarget.y - camera.position.y) * follow;

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
    for (let i = 0; i < planets.length; i++) {
      const ind = planetIndicators[i];
      if (!ind) continue;
      updateIndicator(ind, planetRXs[i], planetRYs[i]);
    }

    // In-world labels (so you can actually tell there are multiple planets).
    for (let i = 0; i < planets.length; i++) {
      const pl = planets[i];
      const v = new THREE.Vector3(planetRXs[i], planetRYs[i], 0).project(camera);
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
      const onScreen = (sx >= 0 && sx <= window.innerWidth && sy >= 0 && sy <= window.innerHeight && v.z < 1);
      pl.labelEl.style.display = onScreen ? 'block' : 'none';
      if (onScreen) {
        pl.labelEl.style.left = sx + 'px';
        pl.labelEl.style.top = (sy - 18) + 'px';
      }
    }

    // HUD
    if (hudSpeed) {
      const speed = Math.sqrt(rocket.vx * rocket.vx + rocket.vy * rocket.vy);
      hudSpeed.textContent = `Speed: ${speed.toFixed(1)}`;
    }
    if (hudPos) {
      if (!rocket.alive) {
        hudPos.textContent = 'DESTROYED - Press R to respawn';
      } else if (rocket.landed) {
        const landedOn = planets[rocket.landedPlanetIdx] ?? homePlanet;
        hudPos.textContent = `LANDED on ${landedOn.name} - Thrust to take off`;
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
