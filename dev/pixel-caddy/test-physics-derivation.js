// Proper physics derivation for putting
// 
// Real world:
// - Gravity: g = 9.81 m/s² = 32.2 ft/s²
// - On a slope of angle θ, acceleration along slope = g * sin(θ)
// - For small angles: sin(θ) ≈ tan(θ) = rise/run = grade
// - So for a 4% grade: a = 32.2 * 0.04 = 1.29 ft/s²
//
// Our game units:
// - 1 world unit = 4 yards = 12 feet
// - Slope from getSlopeAt() = feet elevation change per world unit
// - So slope of 0.48 = 0.48 ft per 12 ft = 4% grade
// - Grade = slope / 12
//
// Converting acceleration to world units:
// - 1.29 ft/s² = 1.29/12 = 0.1075 world units/s²
// - Per frame (dt=0.016): 0.1075 * 0.016 = 0.00172 world units/frame
//
// So for slope value S (in feet per world unit):
// - Grade = S / 12
// - Acceleration = g * grade = 32.2 * (S/12) ft/s² = 2.68 * S ft/s²
// - In world units: 2.68 * S / 12 = 0.224 * S world units/s²
// - Per frame: 0.224 * S * 0.016 = 0.00358 * S
//
// So slopeEffect should be approximately 0.00358 per frame
// But we also multiply by dt in the code, so:
// slopeEffect = 0.224 (acceleration in world units/s² per unit of slope)

const GRAVITY_FT_S2 = 32.2;
const FEET_PER_WORLD_UNIT = 12;

// Proper physics-based slope effect
// slope is in feet per world unit
// We want acceleration in world units per second²
// grade = slope / 12 (convert to dimensionless ratio)
// accel_ft = g * grade = 32.2 * (slope/12) = 2.68 * slope ft/s²
// accel_world = accel_ft / 12 = 0.224 * slope world units/s²
const SLOPE_ACCEL_FACTOR = GRAVITY_FT_S2 / (FEET_PER_WORLD_UNIT * FEET_PER_WORLD_UNIT);
// = 32.2 / 144 = 0.224

console.log('=== PHYSICS DERIVATION ===\n');
console.log(`Gravity: ${GRAVITY_FT_S2} ft/s²`);
console.log(`Feet per world unit: ${FEET_PER_WORLD_UNIT}`);
console.log(`Slope acceleration factor: ${SLOPE_ACCEL_FACTOR.toFixed(4)} world units/s² per (feet/world unit of slope)`);

// Test with a 4% grade (slope = 0.48 feet per world unit)
const testSlope = 0.48;
const grade = testSlope / FEET_PER_WORLD_UNIT;
const accelFtS2 = GRAVITY_FT_S2 * grade;
const accelWorldS2 = SLOPE_ACCEL_FACTOR * testSlope;

console.log(`\nFor 4% grade (slope = ${testSlope}):`);
console.log(`  Grade ratio: ${(grade * 100).toFixed(1)}%`);
console.log(`  Acceleration: ${accelFtS2.toFixed(2)} ft/s² = ${accelWorldS2.toFixed(4)} world units/s²`);

// Now simulate with proper physics
function simulatePuttProperPhysics(distanceFeet, slope, stimpFactor = 1.2) {
    const distanceYards = distanceFeet / 3;
    const totalUnits = distanceYards / 4;
    
    const rollingResistance = 0.035 / stimpFactor;
    const distanceScale = 0.90 + (totalUnits * 0.02);
    const initialSpeed = Math.sqrt(2 * rollingResistance * totalUnits) * Math.min(distanceScale, 1.0);
    
    let velX = 0;
    let velY = -initialSpeed;
    const dt = 0.016;
    let x = 0, y = 0, t = 0;
    
    // PROPER PHYSICS: acceleration = g * sin(angle) ≈ g * (slope/12) for small angles
    // In world units/s²: g_world = 32.2 / 12 = 2.68 ft/s² per 1% grade
    // But slope is in ft/world_unit, so grade = slope/12
    // accel = 2.68 * (slope/12) = 0.224 * slope world units/s²
    const slopeAccelFactor = SLOPE_ACCEL_FACTOR * stimpFactor; // Faster greens = more effect
    
    let maxSpeed = initialSpeed;
    
    while (t < 30) {
        const speed = Math.sqrt(velX * velX + velY * velY);
        if (speed < 0.0003) break;
        
        maxSpeed = Math.max(maxSpeed, speed);
        
        // Slope acceleration (proper physics)
        const slopeAccelX = -slope.x * slopeAccelFactor;
        const slopeAccelY = -slope.y * slopeAccelFactor;
        
        // Rolling friction
        const speedFactor = Math.min(1, speed / 0.15);
        const effectiveFriction = rollingResistance * (0.3 + 0.7 * speedFactor);
        const fricAccelX = speed > 0 ? -(velX / speed) * effectiveFriction : 0;
        const fricAccelY = speed > 0 ? -(velY / speed) * effectiveFriction : 0;
        
        velX += (slopeAccelX + fricAccelX) * dt;
        velY += (slopeAccelY + fricAccelY) * dt;
        x += velX * dt;
        y += velY * dt;
        t += dt;
    }
    
    const forwardFeet = -y * FEET_PER_WORLD_UNIT;
    const lateralFeet = x * FEET_PER_WORLD_UNIT;
    
    return {
        forwardFeet: forwardFeet.toFixed(1),
        lateralFeet: lateralFeet.toFixed(1),
        accelerated: maxSpeed > initialSpeed * 1.01,
        time: t.toFixed(1)
    };
}

console.log('\n=== TEST WITH PROPER PHYSICS ===\n');
console.log(`slopeAccelFactor = ${(SLOPE_ACCEL_FACTOR * 1.2).toFixed(4)} (with stimp 1.2)\n`);

console.log('--- FLAT ---');
console.log(`20ft: ${simulatePuttProperPhysics(20, {x:0, y:0}).forwardFeet}ft`);

console.log('\n--- DOWNHILL (slope.y positive = uphill direction, ball rolls down) ---');
[0.24, 0.48, 0.72, 1.0].forEach(s => {
    const grade = (s / 12 * 100).toFixed(1);
    const r = simulatePuttProperPhysics(20, {x:0, y:s});
    console.log(`${grade}% grade: 20ft putt → ${r.forwardFeet}ft, accel: ${r.accelerated}`);
});

console.log('\n--- UPHILL (slope.y negative) ---');
[-0.24, -0.48, -0.72, -1.0].forEach(s => {
    const grade = (Math.abs(s) / 12 * 100).toFixed(1);
    const r = simulatePuttProperPhysics(20, {x:0, y:s});
    console.log(`${grade}% grade: 20ft putt → ${r.forwardFeet}ft`);
});

console.log('\n--- CROSS-SLOPE (slope.x positive = breaks right) ---');
[0.24, 0.48, 0.72].forEach(s => {
    const grade = (s / 12 * 100).toFixed(1);
    const r = simulatePuttProperPhysics(20, {x:s, y:0});
    console.log(`${grade}% grade: 20ft putt → lateral ${r.lateralFeet}ft`);
});

console.log('\n--- TWO-TIER TEST: Ball barely moving hits steep slope ---');
function twoTierTest() {
    const stimpFactor = 1.2;
    const rollingResistance = 0.035 / stimpFactor;
    const slopeAccelFactor = SLOPE_ACCEL_FACTOR * stimpFactor;
    
    // Ball crawling at very low speed
    let speed = 0.015;
    let velY = -speed;
    const slope = { x: 0, y: 1.5 }; // Very steep downhill
    const dt = 0.016;
    
    console.log(`Initial speed: ${speed.toFixed(4)} world units/s`);
    console.log(`Slope: ${slope.y} ft/world unit (${(slope.y/12*100).toFixed(1)}% grade)`);
    console.log(`Slope accel: ${(slopeAccelFactor * slope.y).toFixed(4)} world units/s²`);
    
    const speedFactor = Math.min(1, speed / 0.15);
    const effectiveFriction = rollingResistance * (0.3 + 0.7 * speedFactor);
    console.log(`Friction decel: ${effectiveFriction.toFixed(4)} world units/s²`);
    console.log(`Net accel: ${(slopeAccelFactor * slope.y - effectiveFriction).toFixed(4)} (positive = speeds up)`);
    
    let t = 0, y = 0;
    const speeds = [];
    while (t < 5 && speed > 0.0003) {
        if (speeds.length < 10 || t > 2) {
            speeds.push({ t: t.toFixed(2), speed: speed.toFixed(4) });
        }
        
        const slopeAccelY = -slope.y * slopeAccelFactor;
        const sf = Math.min(1, speed / 0.15);
        const ef = rollingResistance * (0.3 + 0.7 * sf);
        const fricAccelY = -(velY / speed) * ef;
        
        velY += (slopeAccelY + fricAccelY) * dt;
        y += velY * dt;
        speed = Math.abs(velY);
        t += dt;
    }
    
    console.log('\nSpeed over time:');
    speeds.slice(0, 5).forEach(s => console.log(`  t=${s.t}: ${s.speed}`));
    console.log('  ...');
    speeds.slice(-3).forEach(s => console.log(`  t=${s.t}: ${s.speed}`));
    console.log(`\nBall ${parseFloat(speeds[speeds.length-1].speed) > parseFloat(speeds[0].speed) ? 'ACCELERATED ✓' : 'decelerated'}`);
}
twoTierTest();

console.log('\n=== COMPARISON: OLD vs NEW vs PROPER ===\n');
console.log('20ft putt on 4% cross-slope:');
const oldEffect = 0.03;
const newEffect = 0.0108;
const properEffect = SLOPE_ACCEL_FACTOR * 1.2;
console.log(`OLD (0.030):    ~11.6ft break (way too much)`);
console.log(`NEW (0.0108):   ~2.7ft break (realistic cross-slope)`);
console.log(`PROPER (${properEffect.toFixed(4)}): ${simulatePuttProperPhysics(20, {x:0.48, y:0}).lateralFeet}ft break`);
