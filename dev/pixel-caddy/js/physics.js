// Golf ball physics engine - TrackMan/Toptracer style simulation
// Implements realistic aerodynamics with Magnus effect, drag, and spin decay

import { PHYSICS, CONVERSION } from './constants.js';
import { getClubLieDifficulty, gaussianRandom } from './utils.js';

// Destructure physics constants for convenience
const { GRAVITY, AIR_DENSITY, BALL_MASS, BALL_RADIUS, BALL_AREA, KINEMATIC_VISCOSITY } = PHYSICS;

// Destructure conversion factors for convenience
const { MPH_TO_MS, MS_TO_MPH, YARDS_TO_METERS, METERS_TO_YARDS, RPM_TO_RADS } = CONVERSION;

// Club data with realistic launch parameters for a scratch golfer
// Ball speeds calibrated to produce yardage book distances (carry)
// Target carries: Driver 280, 3W 250, 5W 230, 4i 210, 5i 195, 6i 180, 7i 165, 8i 150, 9i 135, PW 120, GW 105, SW 90, LW 70
// Launch angles tuned for ~28-32 yard apex (PGA Tour average)
export const clubPhysics = {
    'Driver':   { loft: 10.5, launchAngle: 10.9, spinRate: 2686, ballSpeed: 139, smashFactor: 1.48, spinLoftFactor: 0.85 },
    '3 Wood':   { loft: 15,   launchAngle: 11.5, spinRate: 3655, ballSpeed: 119, smashFactor: 1.46, spinLoftFactor: 0.88 },
    '5 Wood':   { loft: 18,   launchAngle: 13.0, spinRate: 4350, ballSpeed: 110, smashFactor: 1.44, spinLoftFactor: 0.90 },
    '4 Iron':   { loft: 21,   launchAngle: 14.5, spinRate: 4836, ballSpeed: 104, smashFactor: 1.42, spinLoftFactor: 0.92 },
    '5 Iron':   { loft: 24,   launchAngle: 15.5, spinRate: 5361, ballSpeed: 100, smashFactor: 1.40, spinLoftFactor: 0.93 },
    '6 Iron':   { loft: 27,   launchAngle: 17.0, spinRate: 6231, ballSpeed: 96,  smashFactor: 1.38, spinLoftFactor: 0.94 },
    '7 Iron':   { loft: 31,   launchAngle: 18.5, spinRate: 7097, ballSpeed: 92,  smashFactor: 1.36, spinLoftFactor: 0.95 },
    '8 Iron':   { loft: 35,   launchAngle: 20.0, spinRate: 7998, ballSpeed: 88,  smashFactor: 1.34, spinLoftFactor: 0.96 },
    '9 Iron':   { loft: 39,   launchAngle: 22.0, spinRate: 8647, ballSpeed: 84,  smashFactor: 1.32, spinLoftFactor: 0.97 },
    'PW':       { loft: 44,   launchAngle: 25.0, spinRate: 9304, ballSpeed: 79,  smashFactor: 1.30, spinLoftFactor: 0.98 },
    'GW':       { loft: 50,   launchAngle: 28.0, spinRate: 9800, ballSpeed: 74,  smashFactor: 1.27, spinLoftFactor: 0.99 },
    'SW':       { loft: 54,   launchAngle: 31.0, spinRate: 10200, ballSpeed: 70, smashFactor: 1.24, spinLoftFactor: 1.00 },
    'LW':       { loft: 58,   launchAngle: 34.0, spinRate: 10500, ballSpeed: 64, smashFactor: 1.20, spinLoftFactor: 1.00 }
};

/**
 * Calculate Reynolds number for the golf ball
 * Re = V * D / ν
 */
function calcReynolds(velocity) {
    return (velocity * BALL_RADIUS * 2) / KINEMATIC_VISCOSITY;
}

/**
 * Calculate non-dimensional spin factor
 * S = ω * r / V
 */
function calcSpinFactor(spinRateRPM, velocity) {
    const omega = spinRateRPM * RPM_TO_RADS;
    return (omega * BALL_RADIUS) / Math.max(velocity, 1);
}

/**
 * Calculate drag coefficient based on Reynolds number
 * From aerodynamics research on dimpled golf balls
 */
function calcDragCoefficient(Re) {
    if (Re < 1e5) {
        return 1.29e-10 * Re * Re - 2.59e-5 * Re + 1.50;
    } else {
        return 1.91e-11 * Re * Re - 5.40e-6 * Re + 0.56;
    }
}

/**
 * Calculate lift coefficient based on spin factor
 * CL = -3.25 * S² + 1.99 * S (from research)
 */
function calcLiftCoefficient(spinFactor) {
    const S = Math.min(spinFactor, 0.3); // Cap to prevent unrealistic values
    return -3.25 * S * S + 1.99 * S;
}


/**
 * Calculate spin decay over time
 * Spin decreases due to air resistance - roughly 1-2% per second
 */
function decaySpin(spinRPM, dt) {
    const decayRate = 0.015; // 1.5% per second
    return spinRPM * Math.pow(1 - decayRate, dt);
}

/**
 * Generate launch conditions from club and swing parameters
 * This is the "impact" data like TrackMan captures
 */
export function generateLaunchConditions(clubName, power, shape, variability = {}) {
    const club = clubPhysics[clubName];
    if (!club) return null;
    
    // Power scaling: designed to produce linear distance scaling
    // The aerodynamic simulation naturally loses more distance at lower speeds
    // So we need to give MORE ball speed at lower powers to compensate
    let powerFactor;
    if (power >= 80) {
        // High power: nearly linear (small adjustment)
        // 80% power → 0.88 ball speed, 100% power → 1.0 ball speed
        powerFactor = 0.88 + (power - 80) * 0.006;
    } else if (power >= 50) {
        // Mid power: steeper compensation
        // 50% power → 0.70 ball speed, 80% power → 0.88 ball speed
        powerFactor = 0.70 + (power - 50) * 0.006;
    } else {
        // Low power: even steeper
        powerFactor = 0.50 + (power) * 0.004;
    }
    const baseBallSpeed = club.ballSpeed * powerFactor; // mph
    
    // Apply variability to ball speed (strike quality)
    const speedVariance = variability.speedVariance || 0;
    const ballSpeedMPH = baseBallSpeed * (1 + speedVariance);
    const ballSpeed = ballSpeedMPH * MPH_TO_MS;
    
    // Launch angle with variability
    const launchAngleVariance = variability.launchAngleVariance || 0;
    const launchAngle = club.launchAngle + launchAngleVariance;
    
    // Spin rate scales with power and has variability
    const spinVariance = variability.spinVariance || 0;
    const baseSpinRate = club.spinRate * Math.pow(powerFactor, 0.7); // Spin doesn't scale linearly
    const spinRate = baseSpinRate * (1 + spinVariance);
    
    // Spin axis determines draw/fade curve
    // 0° = pure backspin, positive = fade/slice, negative = draw/hook
    let spinAxis = variability.spinAxisOffset || 0;
    
    // Shape affects spin axis
    switch (shape) {
        case 'Draw':
            spinAxis -= 8 + Math.random() * 4; // -8 to -12 degrees
            break;
        case 'Fade':
            spinAxis += 8 + Math.random() * 4; // +8 to +12 degrees
            break;
        case 'Straight':
            spinAxis += (Math.random() - 0.5) * 4; // Small random variance
            break;
    }
    
    // Launch direction (horizontal) - affected by face angle and path
    const launchDirection = variability.launchDirection || 0;
    
    return {
        ballSpeed,           // m/s
        ballSpeedMPH,        // mph (for display)
        launchAngle,         // degrees
        launchDirection,     // degrees (+ = right)
        spinRate,            // RPM
        spinAxis,            // degrees (+ = fade axis)
        clubName,
        power
    };
}

/**
 * Decompose total spin into backspin and sidespin components
 */
function decomposeSpinComponents(totalSpinRPM, spinAxisDegrees) {
    const axisRad = spinAxisDegrees * Math.PI / 180;
    return {
        backspin: totalSpinRPM * Math.cos(axisRad),
        sidespin: totalSpinRPM * Math.sin(axisRad)
    };
}

/**
 * Main trajectory simulation using numerical integration (Euler method)
 * Returns array of positions for the entire flight
 * 
 * Wind interaction with spin:
 * - Draw (negative sidespin) curves ball LEFT
 * - Fade (positive sidespin) curves ball RIGHT
 * - Wind FROM right (90°) pushes ball LEFT
 * - Wind FROM left (270°) pushes ball RIGHT
 * 
 * So: Draw + wind from right = both push left = MORE curve
 *     Draw + wind from left = cancel out = LESS curve (ball flies straighter)
 */
export function simulateTrajectory(launchConditions, windSpeed = 0, windDirection = 0) {
    const { ballSpeed, launchAngle, launchDirection, spinRate, spinAxis } = launchConditions;
    
    // Convert angles to radians
    const launchAngleRad = launchAngle * Math.PI / 180;
    const launchDirRad = launchDirection * Math.PI / 180;
    
    // Initial velocity components (3D: x = lateral, y = vertical, z = forward)
    let vx = ballSpeed * Math.sin(launchDirRad) * Math.cos(launchAngleRad);
    let vy = ballSpeed * Math.sin(launchAngleRad);
    let vz = ballSpeed * Math.cos(launchDirRad) * Math.cos(launchAngleRad);
    
    // Position (meters)
    let x = 0;  // lateral (+ = right)
    let y = 0.01;  // height - start slightly above ground
    let z = 0;  // forward distance
    
    // Current spin
    let currentSpinRPM = spinRate;
    const { backspin: initialBackspin, sidespin: initialSidespin } = decomposeSpinComponents(spinRate, spinAxis);
    let backspin = initialBackspin;
    let sidespin = initialSidespin;
    
    // Wind components - windDirection is where wind is coming FROM relative to shot direction
    // 0° = headwind (from front), 90° = from right, 180° = tailwind, 270° = from left
    // Wind pushes ball in OPPOSITE direction it comes from
    const windRad = (windDirection + 180) * Math.PI / 180;
    const windX = windSpeed * MPH_TO_MS * Math.sin(windRad);  // Positive = pushes right
    const windZ = windSpeed * MPH_TO_MS * Math.cos(windRad);  // Positive = pushes forward
    
    // Calculate crosswind component for spin interaction
    // Crosswind from right (90°) gives negative crosswind (pushes left)
    // Crosswind from left (270°) gives positive crosswind (pushes right)
    const crosswindComponent = -windSpeed * Math.sin(windDirection * Math.PI / 180); // mph, + = from left
    
    // Simulation parameters
    const dt = 0.001; // 1ms time step for accuracy
    const maxTime = 15; // Max 15 seconds of flight
    
    // Store trajectory points (sample every 10ms for smooth animation)
    const trajectory = [];
    let sampleCounter = 0;
    const sampleInterval = 10; // Store every 10th point
    
    let t = 0;
    let maxHeight = 0;
    let apexTime = 0;
    
    // Always add starting point
    trajectory.push({
        x: 0,
        y: 0,
        z: 0,
        t: 0,
        spinRPM: currentSpinRPM,
        speed: ballSpeed * MS_TO_MPH
    });
    
    while (y > 0 && t < maxTime) {
        // Store sampled points
        sampleCounter++;
        if (sampleCounter % sampleInterval === 0) {
            trajectory.push({
                x: x * METERS_TO_YARDS,
                y: y * METERS_TO_YARDS,
                z: z * METERS_TO_YARDS,
                t: t,
                spinRPM: currentSpinRPM,
                speed: Math.sqrt(vx*vx + vy*vy + vz*vz) * MS_TO_MPH
            });
        }
        
        // Track apex
        if (y > maxHeight) {
            maxHeight = y;
            apexTime = t;
        }
        
        // Relative velocity (accounting for wind)
        const vrx = vx - windX;
        const vry = vy;
        const vrz = vz - windZ;
        const vrel = Math.sqrt(vrx*vrx + vry*vry + vrz*vrz);
        
        if (vrel < 0.1) break; // Ball essentially stopped
        
        // Calculate aerodynamic coefficients
        const Re = calcReynolds(vrel);
        const spinFactor = calcSpinFactor(currentSpinRPM, vrel);
        const Cd = calcDragCoefficient(Re);
        const Cl = calcLiftCoefficient(spinFactor);
        
        // Drag force (opposes relative velocity - this naturally includes wind effect)
        const dragMag = 0.5 * AIR_DENSITY * vrel * vrel * BALL_AREA * Cd;
        const dragX = -dragMag * (vrx / vrel) / BALL_MASS;
        const dragY = -dragMag * (vry / vrel) / BALL_MASS;
        const dragZ = -dragMag * (vrz / vrel) / BALL_MASS;
        
        // Lift force from backspin (Magnus effect)
        const liftMag = 0.5 * AIR_DENSITY * vrel * vrel * BALL_AREA * Cl;
        const horizontalSpeed = Math.sqrt(vrx*vrx + vrz*vrz);
        
        let liftY = 0;
        let liftX = 0;
        let liftZ = 0;
        
        if (horizontalSpeed > 0.1) {
            // Backspin lift (vertical)
            const backspinLift = liftMag * (backspin / Math.max(currentSpinRPM, 1));
            liftY = backspinLift / BALL_MASS;
            
            // Sidespin curve force
            // Negative sidespin (draw) = curves LEFT (negative X)
            // Positive sidespin (fade) = curves RIGHT (positive X)
            const baseSidespinForce = liftMag * (sidespin / Math.max(currentSpinRPM, 1)) * 0.7;
            
            // Wind-spin interaction:
            // When crosswind opposes spin direction, they partially cancel
            // When crosswind aids spin direction, effect is amplified
            // sidespin: negative = draw (curves left), positive = fade (curves right)
            // crosswindComponent: positive = from left (pushes right), negative = from right (pushes left)
            
            // Calculate how much wind and spin are aligned
            // Same sign = opposing (draw left vs wind from left pushing right)
            // Opposite sign = aiding (draw left + wind from right pushing left)
            let windSpinInteraction = 1.0;
            if (Math.abs(crosswindComponent) > 1 && Math.abs(sidespin) > 100) {
                // Normalize both to -1 to 1 range for comparison
                const spinDir = sidespin > 0 ? 1 : -1;  // +1 = fade/right, -1 = draw/left
                const windDir = crosswindComponent > 0 ? 1 : -1;  // +1 = from left (pushes right), -1 = from right (pushes left)
                
                // If spin and wind push same direction (opposite signs), amplify
                // If spin and wind oppose (same signs), reduce
                const windStrength = Math.min(Math.abs(crosswindComponent) / 15, 1); // Normalize to 0-1 for ~15mph max effect
                
                if (spinDir === windDir) {
                    // Opposing: draw (left) vs wind from left (pushes right) - cancel out
                    windSpinInteraction = 1.0 - windStrength * 0.6;
                } else {
                    // Aiding: draw (left) + wind from right (pushes left) - amplify
                    windSpinInteraction = 1.0 + windStrength * 0.4;
                }
            }
            
            const sidespinForce = baseSidespinForce * windSpinInteraction;
            liftX = sidespinForce * (vrz / horizontalSpeed) / BALL_MASS;
            liftZ = -sidespinForce * (vrx / horizontalSpeed) / BALL_MASS;
        }
        
        // Total acceleration
        const ax = dragX + liftX;
        const ay = dragY + liftY - GRAVITY;
        const az = dragZ + liftZ;
        
        // Update velocity (Euler integration)
        vx += ax * dt;
        vy += ay * dt;
        vz += az * dt;
        
        // Update position
        x += vx * dt;
        y += vy * dt;
        z += vz * dt;
        
        // Decay spin
        currentSpinRPM = decaySpin(currentSpinRPM, dt);
        backspin = decaySpin(backspin, dt);
        sidespin = decaySpin(sidespin, dt);
        
        t += dt;
    }
    
    // Add final landing point
    trajectory.push({
        x: x * METERS_TO_YARDS,
        y: 0,
        z: z * METERS_TO_YARDS,
        t: t,
        spinRPM: currentSpinRPM,
        speed: Math.sqrt(vx*vx + vy*vy + vz*vz) * MS_TO_MPH
    });
    
    return {
        trajectory,
        carry: z * METERS_TO_YARDS,
        lateral: x * METERS_TO_YARDS,
        maxHeight: maxHeight * METERS_TO_YARDS,
        apexTime,
        flightTime: t,
        landingAngle: Math.atan2(-vy, Math.sqrt(vx*vx + vz*vz)) * 180 / Math.PI,
        landingSpinRPM: currentSpinRPM,
        landingSpeed: Math.sqrt(vx*vx + vy*vy + vz*vz) * MS_TO_MPH
    };
}


/**
 * Calculate ball behavior on landing based on spin and landing conditions
 * This determines bounce, check, and roll
 * @param {object} trajectoryResult - Flight trajectory data
 * @param {string} terrain - Landing terrain type
 * @param {object} lie - Optional lie data that affected the shot
 */
export function calculateLandingBehavior(trajectoryResult, terrain = 'fairway', lie = null) {
    const { landingAngle, landingSpinRPM, landingSpeed, carry } = trajectoryResult;
    
    // Terrain friction coefficients (higher = more friction/stopping power)
    const terrainFriction = {
        'green': 0.95,
        'fairway': 0.7,
        'rough': 0.85,
        'bunker': 0.98,
        'tee': 0.7
    };
    
    // Terrain softness (affects how much spin "grabs")
    const terrainSoftness = {
        'green': 0.9,
        'fairway': 0.6,
        'rough': 0.4,
        'bunker': 0.95,
        'tee': 0.6
    };
    
    const friction = terrainFriction[terrain] || 0.7;
    const softness = terrainSoftness[terrain] || 0.6;
    
    // Landing angle affects bounce height
    // Steeper = less forward bounce, more vertical
    const bounceAngleFactor = Math.sin(landingAngle * Math.PI / 180);
    
    // Energy factor based on landing speed - scales bounce and roll with power
    // Full power driver lands ~50-60 mph, half power ~30-35 mph
    // Normalize to 55 mph as "full power" reference
    const energyFactor = Math.pow(landingSpeed / 55, 2); // Kinetic energy scales with v²
    const speedFactor = landingSpeed / 55; // Linear speed factor for some calculations
    
    // First bounce height scales with energy
    const bounceHeight = landingSpeed * 0.3 * bounceAngleFactor * (1 - friction * 0.5);
    
    // Spin effect on landing
    // High backspin + soft terrain = ball checks or spins back
    // Low backspin = ball releases forward
    const spinEffect = (landingSpinRPM / 10000) * softness;
    
    // Calculate roll distance - now scales with energy/speed
    let rollYards;
    let rollDirection = 0; // 0 = forward, negative = backward (spin back)
    
    if (spinEffect > 0.6 && landingAngle > 40) {
        // High spin, steep landing = ball checks hard or spins back
        // Spin back distance scales with speed (more speed = more spin back potential)
        rollYards = (-2 - Math.random() * 4) * speedFactor;
        rollDirection = -1;
    } else if (spinEffect > 0.4 && landingAngle > 30) {
        // Medium-high spin = ball checks, minimal roll
        rollYards = (1 + Math.random() * 3) * speedFactor;
    } else if (spinEffect > 0.2) {
        // Medium spin = some roll, scales with energy
        rollYards = (3 + Math.random() * 5) * energyFactor;
    } else {
        // Low spin = ball releases, scales with energy
        // Driver typically rolls 20-30 yards on fairway at full power
        const baseRoll = 15 + Math.random() * 15;
        const spinReduction = spinEffect * 0.5;
        rollYards = baseRoll * (1 - spinReduction) * energyFactor;
    }
    
    // Adjust for terrain
    if (terrain === 'rough') {
        rollYards *= 0.3; // Rough kills roll
    } else if (terrain === 'bunker') {
        rollYards = 0; // Ball plugs or stops
    } else if (terrain === 'green') {
        // Greens are fast but spin grabs
        if (rollDirection < 0) {
            rollYards *= 1.2; // Spin back more on greens
        } else {
            rollYards *= 0.7; // But forward roll is reduced
        }
    }
    
    return {
        bounceHeight,
        rollYards,
        rollDirection,
        spinEffect,
        checksUp: spinEffect > 0.4 && landingAngle > 30,
        spinsBack: rollDirection < 0
    };
}

/**
 * Generate variability based on golfer skill and conditions
 * This creates the "human element" in the simulation
 * Tightened for scratch golfer - realistic PGA Tour dispersion
 * @param {object} golferStats - Golfer statistics
 * @param {string} clubName - Club being used
 * @param {object} conditions - Additional conditions including lie
 */
export function generateShotVariability(golferStats, clubName, conditions = {}) {
    const { missRate = 0.10, distStd = 3, dirStd = 3 } = golferStats;
    const { lie = null } = conditions;
    const mental = golferStats.mental || { confidence: 70, pressure: 30, focus: 75 };

    // Get additional miss chance from lie
    let lieMissIncrease = 0;
    if (lie && lie.data && lie.data.effects) {
        lieMissIncrease = lie.data.effects.missChanceIncrease || 0;

        // Club difficulty affects lie penalty
        const clubDifficulty = getClubLieDifficulty(clubName);
        lieMissIncrease *= (1 + clubDifficulty * 0.5);
    }

    // Base miss rate
    let adjustedMissRate = missRate;

    // Confidence affects miss rate (Requirement 1.1)
    if (mental.confidence < 40) {
        adjustedMissRate *= 1.15;  // +15% miss rate for low confidence
    } else if (mental.confidence > 80) {
        adjustedMissRate *= 0.90;  // -10% miss rate for high confidence
    }

    // Apply lie penalty after confidence modifier
    adjustedMissRate = Math.min(0.5, adjustedMissRate + lieMissIncrease);

    // Pressure affects direction spread (Requirement 1.2)
    let directionMultiplier = 1.0;
    if (mental.pressure > 70) {
        directionMultiplier = 1.20;  // +20% direction spread
    }

    // Focus affects distance spread (Requirement 1.3)
    let distanceMultiplier = 1.0;
    if (mental.focus < 50) {
        distanceMultiplier = 1.10;  // +10% distance spread for low focus
    } else if (mental.focus > 80) {
        // -5% all spreads for high focus
        directionMultiplier *= 0.95;
        distanceMultiplier *= 0.95;
    }

    // Roll for shot quality (lie affects miss chance)
    const qualityRoll = Math.random();
    const isDisaster = qualityRoll < 0.008 + (lieMissIncrease * 0.3); // Reduced from 1% to 0.8%
    const isMiss = qualityRoll < adjustedMissRate;

    let variability = {
        speedVariance: 0,
        launchAngleVariance: 0,
        spinVariance: 0,
        spinAxisOffset: 0,
        launchDirection: 0,
        isMiss: false,
        isDisaster: false
    };

    if (isDisaster) {
        // Disaster shot - big miss (but toned down)
        variability.isDisaster = true;
        variability.isMiss = true;
        const disasterType = Math.random();

        if (disasterType < 0.3) {
            // Topped - low launch, low spin, short
            variability.speedVariance = (-0.20 - Math.random() * 0.15) * distanceMultiplier;
            variability.launchAngleVariance = -6 - Math.random() * 4;
            variability.spinVariance = -0.4;
        } else if (disasterType < 0.5) {
            // Fat/chunk - very short
            variability.speedVariance = (-0.25 - Math.random() * 0.20) * distanceMultiplier;
            variability.launchAngleVariance = 3 + Math.random() * 4;
            variability.spinVariance = 0.2;
        } else if (disasterType < 0.75) {
            // Big slice - apply direction multiplier
            variability.spinAxisOffset = (18 + Math.random() * 10) * directionMultiplier;
            variability.launchDirection = (3 + Math.random() * 3) * directionMultiplier;
            variability.speedVariance = -0.08 * distanceMultiplier;
        } else {
            // Big hook - apply direction multiplier
            variability.spinAxisOffset = (-18 - Math.random() * 10) * directionMultiplier;
            variability.launchDirection = (-3 - Math.random() * 3) * directionMultiplier;
            variability.speedVariance = -0.04 * distanceMultiplier;
        }
    } else if (isMiss) {
        // Regular miss - moderate deviation, mostly short
        variability.isMiss = true;
        // Speed variance skewed negative (mishits lose distance) - apply distance multiplier
        variability.speedVariance = (-Math.abs(gaussianRandom() * 0.025) - 0.015) * distanceMultiplier;
        variability.launchAngleVariance = gaussianRandom() * 1.2;
        variability.spinVariance = gaussianRandom() * 0.06;
        // Apply direction multiplier to directional variance
        variability.spinAxisOffset = gaussianRandom() * 4 * directionMultiplier;
        variability.launchDirection = gaussianRandom() * 1.8 * directionMultiplier;
    } else {
        // Good shot - tight variance for scratch golfer
        // PGA Tour level: ~1-2% speed variance, minimal direction error
        const speedRoll = gaussianRandom() * 0.008;
        variability.speedVariance = (Math.min(speedRoll, 0.012) - 0.003) * distanceMultiplier;
        variability.launchAngleVariance = gaussianRandom() * 0.4;
        variability.spinVariance = gaussianRandom() * 0.025;
        // Apply direction multiplier to directional variance
        variability.spinAxisOffset = gaussianRandom() * 1 * directionMultiplier;
        variability.launchDirection = gaussianRandom() * 0.5 * directionMultiplier;
    }

    return variability;
}


/**
 * Full shot simulation combining all physics
 * Returns complete shot data including trajectory and landing
 */
export function simulateFullShot(clubName, power, shape, golferStats, terrain = 'fairway', wind = { speed: 0, direction: 0 }) {
    // Generate variability based on golfer
    const variability = generateShotVariability(golferStats, clubName);
    
    // Generate launch conditions
    const launchConditions = generateLaunchConditions(clubName, power, shape, variability);
    if (!launchConditions) return null;
    
    // Simulate trajectory
    const trajectoryResult = simulateTrajectory(launchConditions, wind.speed, wind.direction);
    
    // Calculate landing behavior
    const landingBehavior = calculateLandingBehavior(trajectoryResult, terrain);
    
    // Calculate final position
    const totalDistance = trajectoryResult.carry + landingBehavior.rollYards;
    const lateralDeviation = trajectoryResult.lateral;
    
    return {
        launch: launchConditions,
        flight: trajectoryResult,
        landing: landingBehavior,
        result: {
            carryYards: trajectoryResult.carry,
            totalYards: totalDistance,
            lateralYards: lateralDeviation,
            maxHeightYards: trajectoryResult.maxHeight,
            flightTime: trajectoryResult.flightTime,
            landingAngle: trajectoryResult.landingAngle
        },
        variability
    };
}

// Export for use in other modules
export { YARDS_TO_METERS, METERS_TO_YARDS };


/**
 * Apply lie effects to launch conditions
 * @param {object} launchConditions - Original launch conditions
 * @param {object} lie - The lie object { type, data }
 * @param {string} clubName - Club being used
 * @returns {object} - Modified launch conditions
 */
export function applyLieToLaunch(launchConditions, lie, clubName) {
    if (!lie || !lie.data || !lie.data.effects) {
        return launchConditions;
    }
    
    const effects = lie.data.effects;
    const modified = { ...launchConditions };
    
    // Club difficulty affects how much the lie hurts
    const clubDiff = getClubLieDifficulty(clubName);
    
    // Distance: lie multiplier, worse with longer clubs
    const distEffect = effects.distanceMultiplier;
    const distPenalty = (1 - distEffect) * (1 + clubDiff * 0.3);
    modified.ballSpeed *= (1 - distPenalty);
    modified.ballSpeedMPH *= (1 - distPenalty);
    
    // Spin: lie multiplier
    modified.spinRate *= effects.spinMultiplier;
    
    // Launch angle adjustment
    modified.launchAngle += effects.launchAngleAdjust || 0;
    
    // Curve adjustment (spin axis)
    if (effects.curveAdjust) {
        modified.spinAxis += effects.curveAdjust;
    }
    
    // Random curve for mud ball
    if (effects.randomCurve) {
        modified.spinAxis += (Math.random() - 0.5) * 20;
        modified.launchDirection += (Math.random() - 0.5) * 8;
    }
    
    // Accuracy penalty affects launch direction
    if (effects.accuracyPenalty > 0) {
        const accuracyNoise = gaussianRandom() * (effects.accuracyPenalty * 0.3);
        modified.launchDirection += accuracyNoise;
    }
    
    return modified;
}
