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
    PLANET_MASS: 10,
    ROCKET_MASS: 1,
    PLANET_ORBITAL_RADIUS: 300,
    ROCKET_THRUST: 50,
    ROCKET_ROTATION_SPEED: 3,
    SUN_RADIUS: 30,
    PLANET_RADIUS: 10,
    ROCKET_SIZE: 6,
    ROCKET_PLANET_ORBIT_RADIUS: 40,
    FRUSTUM_SIZE: 800,
    MIN_ZOOM: 0.15,
    MAX_ZOOM: 3,
    STAR_SPREAD: 4000,
  },
  realistic: {
    name: 'Realistic',
    description: 'Proportional sun & earth, vast distances',
    G: 500,
    SUN_MASS: 100000,
    PLANET_MASS: 10,
    ROCKET_MASS: 0.001,
    PLANET_ORBITAL_RADIUS: 3000,
    ROCKET_THRUST: 0.15,
    ROCKET_ROTATION_SPEED: 3,
    SUN_RADIUS: 100,
    PLANET_RADIUS: 8,
    ROCKET_SIZE: 3,
    ROCKET_PLANET_ORBIT_RADIUS: 30,
    FRUSTUM_SIZE: 200,
    MIN_ZOOM: 0.02,
    MAX_ZOOM: 5,
    STAR_SPREAD: 20000,
  },
};

// Derived values added to each level
for (const lvl of Object.values(LEVELS)) {
  lvl.PLANET_INITIAL_VELOCITY = Math.sqrt(lvl.G * lvl.SUN_MASS / lvl.PLANET_ORBITAL_RADIUS);
  lvl.SUN_COLLISION_RADIUS = lvl.SUN_RADIUS * 0.9;
  lvl.PLANET_COLLISION_RADIUS = lvl.PLANET_RADIUS * 0.9;
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
