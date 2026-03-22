// Test putt physics on cross-slopes
// Run with: node test-putt-physics.js

// Mock the imports since we're testing standalone
const HOLE = {
    RADIUS_WORLD: 0.059 / 4,
    MAX_CAPTURE_SPEED: 0.015
};

/**
 * Simulate a putt with configurable slope
 * @param {number} distanceFeet - Putt distance
 * @param {Object} slope - Constant slope {x, y} in feet per world unit
 * @param {number} aimAngle - Aim angle in degrees (0 = straight at hole)
 */
function simulatePuttWithSlope(distanceFeet, slope, aimAngle = 0) {
    const aimRad = (aimAngle * Math.PI) / 180;
    
    // Convert feet to world units
    const distanceYards = distanceFeet / 3;
    const totalUnits = distanceYards / 4;
    
    // Green speed settings
    const greenSpeed = 12;
    const stimpFactor = greenSpeed / 10;
    const rollingResistance = 0.035 / stimpFactor;
    
    // Initial speed
    const distanceScale = 0.90 + (totalUnits * 0.02);
    const initialSpeed = Math.sqrt(2 * rollingResistance * totalUnits) * Math.min(distanceScale, 1.0);
    
    let velX = Math.sin(aimRad) * initialSpeed;
    let velY = -Math.cos(aimRad) * initialSpeed;
    
    const dt = 0.016;
    const maxTime = 20;
    
    // NEW tuned slope effect (was 0.025 * stimpFactor = 0.03)
    const slopeEffect = 0.009 * stimpFactor; // = 0.0108
    
    let x = 0;
    let y = 0;
    let t = 0;
    
    const startX = x;
    const startY = y;
    
    while (t < maxTime) {
        const speed = Math.sqrt(velX * velX + velY * velY);
        if (speed < 0.0003) break;
        
        // Slope acceleration
        const slopeAccelX = -slope.x * slopeEffect;
        const slopeAccelY = -slope.y * slopeEffect;
        
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
        
        t += dt;
    }
    
    // Calculate results
    const forwardDist = -y; // negative Y is forward
    const lateralDist = x;  // positive X is right
    const forwardFeet = forwardDist * 4 * 3;
    const lateralFeet = lateralDist * 4 * 3;
    
    return {
        forwardFeet: forwardFeet.toFixed(1),
        lateralFeet: lateralFeet.toFixed(1),
        time: t.toFixed(2),
        totalUnits,
        initialSpeed: initialSpeed.toFixed(4)
    };
}

// Test scenarios
console.log('=== PUTT PHYSICS TEST ===\n');
console.log('Testing cross-slope putts with NEW slopeEffect = 0.009 * stimpFactor\n');

// Test 1: Flat green (baseline)
console.log('--- Test 1: Flat green (no slope) ---');
[10, 20, 30, 40].forEach(dist => {
    const result = simulatePuttWithSlope(dist, { x: 0, y: 0 });
    console.log(`${dist}ft putt: forward=${result.forwardFeet}ft, lateral=${result.lateralFeet}ft, time=${result.time}s`);
});

// Test 2: Mild cross-slope (2% grade = 0.24 feet per world unit)
console.log('\n--- Test 2: Mild cross-slope (2% grade, slope.x = 0.24) ---');
console.log('Ball should break RIGHT (positive lateral)');
[10, 20, 30, 40].forEach(dist => {
    const result = simulatePuttWithSlope(dist, { x: 0.24, y: 0 });
    console.log(`${dist}ft putt: forward=${result.forwardFeet}ft, lateral=${result.lateralFeet}ft`);
});

// Test 3: Moderate cross-slope (4% grade = 0.48 feet per world unit)
console.log('\n--- Test 3: Moderate cross-slope (4% grade, slope.x = 0.48) ---');
[10, 20, 30, 40].forEach(dist => {
    const result = simulatePuttWithSlope(dist, { x: 0.48, y: 0 });
    console.log(`${dist}ft putt: forward=${result.forwardFeet}ft, lateral=${result.lateralFeet}ft`);
});

// Test 4: Steep cross-slope (6% grade = 0.72 feet per world unit)
console.log('\n--- Test 4: Steep cross-slope (6% grade, slope.x = 0.72) ---');
[10, 20, 30, 40].forEach(dist => {
    const result = simulatePuttWithSlope(dist, { x: 0.72, y: 0 });
    console.log(`${dist}ft putt: forward=${result.forwardFeet}ft, lateral=${result.lateralFeet}ft`);
});

// Test 5: Compare OLD vs NEW slope effect
console.log('\n--- Test 5: OLD (0.03) vs NEW (0.0108) slope effect ---');
console.log('20ft putt on 4% cross-slope:\n');

function simulateWithSlopeEffect(distanceFeet, slope, slopeEffectValue) {
    const aimRad = 0;
    const distanceYards = distanceFeet / 3;
    const totalUnits = distanceYards / 4;
    const greenSpeed = 12;
    const stimpFactor = greenSpeed / 10;
    const rollingResistance = 0.035 / stimpFactor;
    const distanceScale = 0.90 + (totalUnits * 0.02);
    const initialSpeed = Math.sqrt(2 * rollingResistance * totalUnits) * Math.min(distanceScale, 1.0);
    
    let velX = Math.sin(aimRad) * initialSpeed;
    let velY = -Math.cos(aimRad) * initialSpeed;
    const dt = 0.016;
    let x = 0, y = 0, t = 0;
    
    while (t < 20) {
        const speed = Math.sqrt(velX * velX + velY * velY);
        if (speed < 0.0003) break;
        const slopeAccelX = -slope.x * slopeEffectValue;
        const slopeAccelY = -slope.y * slopeEffectValue;
        const speedFactor = Math.min(1, speed / 0.15);
        const effectiveFriction = rollingResistance * (0.3 + 0.7 * speedFactor);
        const fricAccelX = -(velX / speed) * effectiveFriction;
        const fricAccelY = -(velY / speed) * effectiveFriction;
        velX += (slopeAccelX + fricAccelX) * dt;
        velY += (slopeAccelY + fricAccelY) * dt;
        x += velX * dt;
        y += velY * dt;
        t += dt;
    }
    
    return { lateralFeet: (x * 4 * 3).toFixed(1), forwardFeet: (-y * 4 * 3).toFixed(1) };
}

const oldResult = simulateWithSlopeEffect(20, { x: 0.48, y: 0 }, 0.03);
const newResult = simulateWithSlopeEffect(20, { x: 0.48, y: 0 }, 0.0108);
console.log(`OLD (0.030): lateral=${oldResult.lateralFeet}ft, forward=${oldResult.forwardFeet}ft`);
console.log(`NEW (0.0108): lateral=${newResult.lateralFeet}ft, forward=${newResult.forwardFeet}ft`);

console.log('\n=== EXPECTED REAL-WORLD BREAK ===');
console.log('On a 4% slope (moderate break), a 20ft putt typically breaks:');
console.log('- Fast greens (stimp 12): ~2-4 feet of break');
console.log('- The NEW value should be closer to this range');
