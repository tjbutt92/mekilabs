/**
 * Unified Wind System
 * Single source of truth for wind state across all game systems.
 * 
 * Validates: Requirements 12.8
 */

// Wind state - single instance
const windState = {
    speed: 0,           // mph
    direction: 0,       // degrees (0 = from north)
    lastChange: Date.now()
};

/**
 * Initialize wind for a hole.
 * Generates random wind speed and direction.
 * 
 * Speed distribution:
 * - 30% chance: 0-5 mph (light)
 * - 40% chance: 5-10 mph (moderate)
 * - 30% chance: 10-20 mph (strong)
 * 
 * @returns {Object} Current wind state {speed, direction}
 */
export function initializeWind() {
    const speedRoll = Math.random();
    if (speedRoll < 0.3) {
        windState.speed = Math.random() * 5;
    } else if (speedRoll < 0.7) {
        windState.speed = 5 + Math.random() * 5;
    } else {
        windState.speed = 10 + Math.random() * 10;
    }
    
    windState.direction = Math.round(Math.random() * 360);
    windState.lastChange = Date.now();
    return getWind();
}

/**
 * Get current wind (may randomly change).
 * After 60 seconds, there's a 30% chance of a small random adjustment
 * to wind direction (±30°) and speed (±4 mph).
 * 
 * @returns {Object} Current wind state {speed, direction}
 */
export function getWind() {
    // Check for random wind change
    const now = Date.now();
    if (now - windState.lastChange > 60000 && Math.random() < 0.3) {
        // Small random adjustment
        windState.direction = (windState.direction + Math.floor(Math.random() * 60) - 30 + 360) % 360;
        windState.speed = Math.max(0, Math.min(25, windState.speed + Math.floor(Math.random() * 8) - 4));
        windState.lastChange = now;
    }
    return { speed: windState.speed, direction: windState.direction };
}

/**
 * Get wind for physics simulation.
 * Returns wind speed and direction relative to the aim angle.
 * 
 * @param {number} aimAngle - The current aim angle in degrees
 * @returns {Object} Wind data for shot physics {speed, relativeDirection}
 */
export function getWindForShot(aimAngle) {
    const wind = getWind();
    return {
        speed: wind.speed,
        relativeDirection: (wind.direction - aimAngle + 360) % 360
    };
}

/**
 * Get wind for visual effects (trees, clouds, flag).
 * Returns the same wind state used by all other systems.
 * 
 * @returns {Object} Current wind state {speed, direction}
 */
export function getWindForVisuals() {
    return getWind();
}
