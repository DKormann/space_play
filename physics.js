// =============================================================
// physics.js - Tweakable physics constants and formulas
// =============================================================

// --- Gravitational constant ---
export const G = 500;

// --- Masses ---
export const SUN_MASS = 10000;
export const PLANET_MASS = 10;
export const ROCKET_MASS = 1;

// --- Planet orbit ---
export const PLANET_ORBITAL_RADIUS = 300;
// Correct circular orbital velocity: v = sqrt(G * M_sun / r)
export const PLANET_INITIAL_VELOCITY = Math.sqrt(G * SUN_MASS / PLANET_ORBITAL_RADIUS);

// --- Rocket ---
export const ROCKET_THRUST = 50;       // Force applied when thrusting
export const ROCKET_ROTATION_SPEED = 3; // Radians per second

// --- Collision radii (visual + physical) ---
export const SUN_RADIUS = 30;
export const PLANET_RADIUS = 10;
export const ROCKET_SIZE = 6;

// --- Sun collision kill radius ---
export const SUN_COLLISION_RADIUS = SUN_RADIUS * 0.8;
export const PLANET_COLLISION_RADIUS = PLANET_RADIUS * 0.8;

// =============================================================
// Physics functions
// =============================================================

/**
 * Calculate gravitational force vector from body A on body B.
 * Returns { fx, fy } - force components acting on body B toward A.
 */
export function gravitationalForce(ax, ay, massA, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);

  // Prevent division by zero / extreme forces at very close range
  if (dist < 1) return { fx: 0, fy: 0 };

  const forceMag = G * massA / distSq; // acceleration on B (force/massB)
  return {
    fx: forceMag * (dx / dist),
    fy: forceMag * (dy / dist),
  };
}

/**
 * Euler integration step for a body.
 * Mutates body in-place: { x, y, vx, vy }
 * ax, ay = total acceleration
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
