// =============================================================
// physics.js - Tweakable physics constants and formulas
// =============================================================

// --- Gravitational constant ---
export const G = 500;

// --- Masses ---
// Real ratio Sun:Earth ~ 333000:1, we use ~10000:1 for gameplay
export const SUN_MASS = 100000;
export const PLANET_MASS = 10;
export const ROCKET_MASS = 0.001;

// --- Planet orbit ---
export const PLANET_ORBITAL_RADIUS = 3000;
// Correct circular orbital velocity: v = sqrt(G * M_sun / r)
export const PLANET_INITIAL_VELOCITY = Math.sqrt(G * SUN_MASS / PLANET_ORBITAL_RADIUS);

// --- Rocket ---
export const ROCKET_THRUST = 0.15;
export const ROCKET_ROTATION_SPEED = 3;

// --- Visual radii (proportional: Sun ~109x Earth in reality, we use ~12x) ---
export const SUN_RADIUS = 100;
export const PLANET_RADIUS = 8;
export const ROCKET_SIZE = 3;

// --- Collision radii ---
export const SUN_COLLISION_RADIUS = SUN_RADIUS * 0.9;
export const PLANET_COLLISION_RADIUS = PLANET_RADIUS * 0.9;

// --- Rocket orbit around planet ---
// Stable orbit velocity around planet at distance r: v = sqrt(G * PLANET_MASS / r)
// At r=30 from planet: v = sqrt(500 * 10 / 30) ≈ 12.9
export const ROCKET_PLANET_ORBIT_RADIUS = 30;

// =============================================================
// Physics functions
// =============================================================

/**
 * Calculate gravitational force vector from body A on body B.
 * Returns { fx, fy } - acceleration components acting on body B toward A.
 */
export function gravitationalForce(ax, ay, massA, bx, by) {
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
 * Euler integration step for a body.
 * Mutates body in-place: { x, y, vx, vy }
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
