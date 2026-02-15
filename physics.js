// =============================================================
// physics.js - Tweakable physics constants and formulas
// =============================================================

// --- Level presets ---
export const LEVELS = {
  tutorial: {
    name: 'Tutorial',
    description: 'Small system, easy orbits',
    G: 500,
    SUN_MASS: 10000,
    ROCKET_MASS: 1,
    // Thrust acceleration (ROCKET_THRUST / ROCKET_MASS) is tuned to be only a
    // little stronger than surface gravity so escaping takes sustained thrust.
    ROCKET_THRUST: 60,
    ROCKET_ROTATION_SPEED: 3,
    SUN_RADIUS: 30,
    // Keep the rocket visually/physically small relative to the planet.
    ROCKET_SIZE: 0.6,
    ROCKET_PLANET_ORBIT_RADIUS: 20,
    FRUSTUM_SIZE: 800,
    // Smaller MIN_ZOOM => can zoom further out. Larger MAX_ZOOM => can zoom further in.
    MIN_ZOOM: 0.03,
    MAX_ZOOM: 60,
    STAR_SPREAD: 4000,
    // Max relative speed for safe landing (more forgiving).
    LANDING_SPEED: 30,

    // Planets orbiting the sun at (0,0). The first planet is the "home" planet
    // the rocket starts near.
    PLANETS: [
      { name: 'Earth', color: 0x44aacc, mass: 10, radius: 10, orbitalRadius: 300 },
      { name: 'Mars', color: 0xcc6644, mass: 6, radius: 7, orbitalRadius: 480 },
    ],
  },
  realistic: {
    name: 'Realistic',
    description: 'Proportional sun & earth, vast distances',
    G: 500,
    SUN_MASS: 100000,
    // Tune for "barely able to leave Earth".
    ROCKET_MASS: 1,
    ROCKET_THRUST: 95,
    ROCKET_ROTATION_SPEED: 3,
    SUN_RADIUS: 100,
    ROCKET_SIZE: 0.12,
    ROCKET_PLANET_ORBIT_RADIUS: 16,
    FRUSTUM_SIZE: 60,
    MIN_ZOOM: 0.001,
    MAX_ZOOM: 120,
    STAR_SPREAD: 20000,
    LANDING_SPEED: 12,

    PLANETS: [
      { name: 'Earth', color: 0x44aacc, mass: 10, radius: 8, orbitalRadius: 3000 },
      { name: 'Venus', color: 0xd6c26a, mass: 9, radius: 7, orbitalRadius: 2200 },
      { name: 'Mars', color: 0xcc6644, mass: 6, radius: 6, orbitalRadius: 4200 },
    ],
  },
};

// Derived values added to each level
for (const lvl of Object.values(LEVELS)) {
  // Back-compat: if older single-planet fields exist, synthesize PLANETS.
  if (!lvl.PLANETS) {
    lvl.PLANETS = [{
      name: 'Earth',
      color: 0x44aacc,
      mass: lvl.PLANET_MASS,
      radius: lvl.PLANET_RADIUS,
      orbitalRadius: lvl.PLANET_ORBITAL_RADIUS,
    }];
  }

  // Keep these for any callers that still reference them.
  const home = lvl.PLANETS[0];
  lvl.PLANET_MASS = home.mass;
  lvl.PLANET_RADIUS = home.radius;
  lvl.PLANET_ORBITAL_RADIUS = home.orbitalRadius;
  lvl.PLANET_INITIAL_VELOCITY = Math.sqrt(lvl.G * lvl.SUN_MASS / home.orbitalRadius);

  // Collision radii match the visible circles (inner radius == outer radius).
  lvl.SUN_COLLISION_RADIUS = lvl.SUN_RADIUS;
  lvl.PLANET_COLLISION_RADIUS = lvl.PLANET_RADIUS;

  // Derived per-planet values.
  for (const p of lvl.PLANETS) {
    p.initialVelocity = Math.sqrt(lvl.G * lvl.SUN_MASS / p.orbitalRadius);
    p.collisionRadius = p.radius;
  }
}

// =============================================================
// Physics functions
// =============================================================

/**
 * Calculate gravitational acceleration on body B toward body A.
 * Returns { fx, fy } - acceleration components.
 */
export function gravitationalForce(G, ax, ay, massA, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);

  if (dist < 1) return { fx: 0, fy: 0 };

  const forceMag = G * massA / distSq;
  return {
    fx: forceMag * (dx / dist),
    fy: forceMag * (dy / dist),
  };
}

/**
 * Euler integration step. Mutates body in-place: { x, y, vx, vy }
 */
export function integrate(body, ax, ay, dt) {
  body.vx += ax * dt;
  body.vy += ay * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
}

/**
 * Check if two positions are within collision distance.
 */
export function checkCollision(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy) < (r1 + r2);
}
