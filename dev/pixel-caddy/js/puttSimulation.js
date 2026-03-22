// Putt Simulation Module
// Runs multiple putt simulations with dispersion based on golfer pressure and putter bias

import { golfer } from './golfer.js';
import { getSlopeAt } from './terrain.js';
import { HOLE } from './constants.js';

/**
 * Putter dispersion configuration
 * bias: positive = tends to miss right, negative = tends to miss left
 * spread: base angle spread in degrees
 */
export const putterStats = {
    bias: 0.3,      // Slight right bias (common for right-handed golfers)
    spread: 1.5     // Base spread in degrees
};

/**
 * Calculate dispersion angles based on golfer pressure and putter stats
 * Higher pressure = wider spread, bias skews the distribution
 * @returns {number[]} Array of angle offsets in degrees
 */
export function calculateDispersionAngles() {
    const pressure = golfer.mental.pressure;
    
    // Pressure multiplier: 1.0 at 0 pressure, up to 2.0 at 100 pressure
    const pressureMultiplier = 1 + (pressure / 100);
    const totalSpread = putterStats.spread * pressureMultiplier;
    
    // Generate 5 angles: center, ±half spread, ±full spread
    // Apply bias to shift the distribution
    const biasOffset = putterStats.bias * totalSpread * 0.5;
    
    return [
        0 + biasOffset,                          // Center (slightly biased)
        -totalSpread * 0.5 + biasOffset,         // Slight left
        totalSpread * 0.5 + biasOffset,          // Slight right
        -totalSpread + biasOffset,               // Full left
        totalSpread + biasOffset                 // Full right
    ];
}

/**
 * Simulate a single putt with given parameters
 * Reuses the physics from shot.js simulatePutt logic
 * @param {Object} start - Starting position {x, y}
 * @param {number} aimAngle - Aim angle in degrees
 * @param {number} distanceFeet - Putt distance in feet
 * @param {Object} holeData - Hole data for slope lookup
 * @returns {Object} Simulation result with path and duration
 */
export function simulateSinglePutt(start, aimAngle, distanceFeet, holeData) {
    const path = [{ x: start.x, y: start.y }];
    const aimRad = (aimAngle * Math.PI) / 180;
    
    // Hole position for capture detection
    const holePos = holeData.hole;
    const holeRadiusWorld = HOLE.RADIUS_WORLD;
    
    // Convert feet to world units (3 feet = 1 yard, 4 yards = 1 world unit)
    const distanceYards = distanceFeet / 3;
    const yardToUnit = 1 / 4;
    const totalUnits = distanceYards * yardToUnit;
    
    // Green speed - stimp meter rating (matching shot.js)
    const greenSpeed = 12;
    const stimpFactor = greenSpeed / 10;
    const rollingResistance = 0.035 / stimpFactor;
    
    // Initial speed calculation
    const distanceScale = 0.90 + (totalUnits * 0.02);
    const initialSpeed = Math.sqrt(2 * rollingResistance * totalUnits) * Math.min(distanceScale, 1.0);
    
    let velX = Math.sin(aimRad) * initialSpeed;
    let velY = -Math.cos(aimRad) * initialSpeed;
    
    const dt = 0.016; // ~60fps
    const maxTime = 20;
    
    // Split slope effect for realistic physics:
    // - Parallel effect (uphill/downhill): affects ball speed, needs to be strong
    //   for two-tier greens where slow ball accelerates down steep slope
    // - Perpendicular effect (cross-slope): affects break, needs to be weaker
    //   to avoid excessive lateral movement
    // Both scale with stimp factor (faster greens = more effect)
    const parallelSlopeEffect = 0.016 * stimpFactor;
    const perpSlopeEffect = 0.005 * stimpFactor;
    
    let x = start.x;
    let y = start.y;
    let t = 0;
    let stepCount = 0;
    let holed = false;
    
    while (t < maxTime) {
        const speed = Math.sqrt(velX * velX + velY * velY);
        
        // Check for hole capture BEFORE checking if stopped
        // This ensures a ball that stops on the hole still drops in
        const distToHole = Math.sqrt((x - holePos.x) ** 2 + (y - holePos.y) ** 2);
        if (distToHole < holeRadiusWorld && speed < HOLE.MAX_CAPTURE_SPEED) {
            holed = true;
            x = holePos.x;
            y = holePos.y;
            path.push({ x, y, speed: 0, t, holed: true });
            break;
        }
        
        // Stop when ball is essentially stopped (after hole check)
        if (speed < 0.0003) break;
        
        const slope = getSlopeAt(holeData, x, y);
        
        // Calculate direction of travel and perpendicular
        const dirX = velX / speed;
        const dirY = velY / speed;
        const perpX = -dirY;
        const perpY = dirX;
        
        // Slope vector (negative because slope points uphill, gravity pulls downhill)
        const slopeVecX = -slope.x;
        const slopeVecY = -slope.y;
        
        // Project slope onto parallel (speed) and perpendicular (break) components
        const parallelComponent = slopeVecX * dirX + slopeVecY * dirY;
        const perpComponent = slopeVecX * perpX + slopeVecY * perpY;
        
        // Apply different effects to each component
        const parallelAccel = parallelComponent * parallelSlopeEffect;
        const perpAccel = perpComponent * perpSlopeEffect;
        
        // Convert back to X/Y accelerations
        const slopeAccelX = parallelAccel * dirX + perpAccel * perpX;
        const slopeAccelY = parallelAccel * dirY + perpAccel * perpY;
        
        // Rolling friction
        const speedFactor = Math.min(1, speed / 0.15);
        const effectiveFriction = rollingResistance * (0.3 + 0.7 * speedFactor);
        const fricAccelX = -(velX / speed) * effectiveFriction;
        const fricAccelY = -(velY / speed) * effectiveFriction;
        
        // Update velocity and position
        velX += (slopeAccelX + fricAccelX) * dt;
        velY += (slopeAccelY + fricAccelY) * dt;
        x += velX * dt;
        y += velY * dt;
        
        // Store path points
        stepCount++;
        if (stepCount % 2 === 0) {
            path.push({ x, y, speed, t });
        }
        
        t += dt;
    }
    
    // Final check: if ball stopped on or very near the hole, it drops in
    if (!holed) {
        const finalDistToHole = Math.sqrt((x - holePos.x) ** 2 + (y - holePos.y) ** 2);
        if (finalDistToHole < holeRadiusWorld) {
            holed = true;
            x = holePos.x;
            y = holePos.y;
            if (path.length > 0) {
                path[path.length - 1] = { x, y, speed: 0, t, holed: true };
            }
        }
    }
    
    // Add final position if not holed
    if (!holed) {
        path.push({ x, y, speed: 0, t });
    }
    
    // Duration based on actual simulation time
    const duration = Math.max(800, Math.min(5000, t * 450));
    
    return { path, duration, finalPosition: { x, y }, holed };
}

/**
 * Run multiple putt simulations with dispersion
 * @param {Object} start - Starting position {x, y}
 * @param {number} baseAimAngle - Base aim angle in degrees
 * @param {number} distanceFeet - Putt distance in feet
 * @param {Object} holeData - Hole data for slope lookup
 * @returns {Object[]} Array of simulation results
 */
export function runPuttSimulations(start, baseAimAngle, distanceFeet, holeData) {
    const angleOffsets = calculateDispersionAngles();
    const simulations = [];
    
    for (const offset of angleOffsets) {
        const adjustedAngle = baseAimAngle + offset;
        const result = simulateSinglePutt(start, adjustedAngle, distanceFeet, holeData);
        result.angleOffset = offset;
        result.isCenter = Math.abs(offset - angleOffsets[0]) < 0.01; // First one is center
        simulations.push(result);
    }
    
    return simulations;
}
