// Analyze the friction model
// 
// The current friction model uses:
// rollingResistance = 0.035 / stimpFactor
// effectiveFriction = rollingResistance * (0.3 + 0.7 * speedFactor)
// where speedFactor = min(1, speed / 0.15)
//
// This means at low speeds, friction is reduced to 30% of base
// This was designed to allow two-tier acceleration
//
// But maybe the base friction is too low?

const GRAVITY_FT_S2 = 32.2;
const FEET_PER_WORLD_UNIT = 12;

// Real world rolling resistance for a golf ball on a green
// Stimpmeter: ball rolled from 36" ramp travels X feet
// Stimp 12 = ball rolls 12 feet from standard release
// 
// From physics: v² = 2*g*h where h = 36" = 3ft, so v = sqrt(2*32.2*3) = 13.9 ft/s
// Ball decelerates from 13.9 ft/s to 0 over 12 feet
// Using v² = 2*a*d: a = v²/(2*d) = 193.2/(24) = 8.05 ft/s²
// 
// Rolling resistance coefficient μ = a/g = 8.05/32.2 = 0.25
// 
// Wait, that's the deceleration, not a coefficient!
// Actually for rolling: a = μ*g, so μ = 8.05/32.2 = 0.25
// That seems high but it includes all friction effects

console.log('=== FRICTION ANALYSIS ===\n');

// Stimpmeter physics
const rampHeight = 3; // feet (36 inches)
const releaseSpeed = Math.sqrt(2 * GRAVITY_FT_S2 * rampHeight);
console.log(`Stimpmeter release speed: ${releaseSpeed.toFixed(1)} ft/s`);

const stimpDistance = 12; // feet for stimp 12
const deceleration = (releaseSpeed * releaseSpeed) / (2 * stimpDistance);
console.log(`Required deceleration for stimp 12: ${deceleration.toFixed(2)} ft/s²`);

const frictionCoeff = deceleration / GRAVITY_FT_S2;
console.log(`Effective friction coefficient: ${frictionCoeff.toFixed(3)}`);

// Convert to world units
const decelWorldUnits = deceleration / FEET_PER_WORLD_UNIT;
console.log(`Deceleration in world units: ${decelWorldUnits.toFixed(4)} world units/s²`);

// What the current code uses
const currentRollingResistance = 0.035 / 1.2; // stimp 12
console.log(`\nCurrent code rolling resistance: ${currentRollingResistance.toFixed(4)}`);
console.log(`This is WAY too low! Should be ~${decelWorldUnits.toFixed(4)}`);

// The issue: current code divides by dt when applying, let's check
// In the simulation: fricAccel = rollingResistance * speedFactor
// Then: vel += fricAccel * dt
// So effective decel per second = rollingResistance (it's already in units/s²)

console.log('\n=== THE PROBLEM ===');
console.log(`Current friction: ${currentRollingResistance.toFixed(4)} world units/s²`);
console.log(`Needed friction:  ${decelWorldUnits.toFixed(4)} world units/s²`);
console.log(`Current is ${(currentRollingResistance / decelWorldUnits * 100).toFixed(1)}% of what it should be!`);

// But wait - the current simulation DOES produce correct distances on flat ground
// Let's verify
console.log('\n=== VERIFY CURRENT FLAT PUTT ===');

function simulateFlat(initialSpeedWorldUnits, friction) {
    let speed = initialSpeedWorldUnits;
    let dist = 0;
    const dt = 0.016;
    let t = 0;
    
    while (speed > 0.0003 && t < 30) {
        const speedFactor = Math.min(1, speed / 0.15);
        const effectiveFriction = friction * (0.3 + 0.7 * speedFactor);
        speed -= effectiveFriction * dt;
        if (speed < 0) speed = 0;
        dist += speed * dt;
        t += dt;
    }
    
    return dist * FEET_PER_WORLD_UNIT;
}

// For a 20ft putt, what initial speed do we use?
const dist20ft = 20;
const distYards = dist20ft / 3;
const distUnits = distYards / 4;
const distScale = 0.90 + (distUnits * 0.02);
const initSpeed = Math.sqrt(2 * currentRollingResistance * distUnits) * Math.min(distScale, 1.0);
console.log(`20ft putt initial speed: ${initSpeed.toFixed(4)} world units/s`);
console.log(`  = ${(initSpeed * FEET_PER_WORLD_UNIT).toFixed(2)} ft/s`);

const actualDist = simulateFlat(initSpeed, currentRollingResistance);
console.log(`Simulated distance: ${actualDist.toFixed(1)} ft (target: 20ft)`);

// The simulation works because initial speed is calibrated to the friction!
// sqrt(2 * friction * distance) gives the right speed for that friction

console.log('\n=== THE REAL ISSUE ===');
console.log('The friction value is arbitrary - it just needs to be consistent');
console.log('with the initial speed calculation.');
console.log('');
console.log('The SLOPE effect needs to be scaled relative to the friction,');
console.log('not to real-world gravity!');
console.log('');
console.log('On a slope where gravity component equals friction, ball maintains speed.');
console.log(`Current friction: ${currentRollingResistance.toFixed(4)} world units/s²`);
console.log('');
console.log('For a 4% grade to just barely overcome friction:');
console.log(`slopeEffect * 0.48 = ${currentRollingResistance.toFixed(4)}`);
console.log(`slopeEffect = ${(currentRollingResistance / 0.48).toFixed(4)}`);
console.log('');
console.log('But we want 4% to be a moderate slope, not equilibrium.');
console.log('Real greens: 2-3% is gentle, 4-5% is moderate, 6%+ is severe');
console.log('');
console.log('Let\'s say on a 6% slope (0.72), ball should accelerate noticeably');
console.log('but on 2% (0.24), it should just roll a bit further.');

// Find the right balance
console.log('\n=== FINDING THE RIGHT SLOPE EFFECT ===');

function testSlopeEffect(slopeEffect) {
    const friction = 0.035 / 1.2;
    
    function simulate(distFeet, slope) {
        const distYards = distFeet / 3;
        const distUnits = distYards / 4;
        const distScale = 0.90 + (distUnits * 0.02);
        const initSpeed = Math.sqrt(2 * friction * distUnits) * Math.min(distScale, 1.0);
        
        let velX = 0, velY = -initSpeed;
        let x = 0, y = 0, t = 0;
        const dt = 0.016;
        let maxSpeed = initSpeed;
        
        while (t < 30) {
            const speed = Math.sqrt(velX*velX + velY*velY);
            if (speed < 0.0003) break;
            maxSpeed = Math.max(maxSpeed, speed);
            
            const slopeAccelX = -slope.x * slopeEffect;
            const slopeAccelY = -slope.y * slopeEffect;
            
            const sf = Math.min(1, speed / 0.15);
            const ef = friction * (0.3 + 0.7 * sf);
            const fricAccelX = -(velX/speed) * ef;
            const fricAccelY = -(velY/speed) * ef;
            
            velX += (slopeAccelX + fricAccelX) * dt;
            velY += (slopeAccelY + fricAccelY) * dt;
            x += velX * dt;
            y += velY * dt;
            t += dt;
        }
        
        return {
            forward: (-y * 12).toFixed(1),
            lateral: (x * 12).toFixed(1),
            accel: maxSpeed > initSpeed * 1.01
        };
    }
    
    console.log(`\nslopeEffect = ${slopeEffect.toFixed(4)}:`);
    console.log('  Downhill 4%: ' + simulate(20, {x:0, y:0.48}).forward + 'ft (want ~25-30ft)');
    console.log('  Downhill 8%: ' + simulate(20, {x:0, y:0.96}).forward + 'ft, accel: ' + simulate(20, {x:0, y:0.96}).accel);
    console.log('  Uphill 4%:   ' + simulate(20, {x:0, y:-0.48}).forward + 'ft (want ~14-16ft)');
    console.log('  Cross 4%:    ' + simulate(20, {x:0.48, y:0}).lateral + 'ft break (want ~2-4ft)');
    console.log('  Two-tier:    ' + (simulate(5, {x:0, y:1.5}).accel ? 'accelerates ✓' : 'no accel'));
}

// Test different values
[0.015, 0.02, 0.025, 0.03, 0.035, 0.04].forEach(testSlopeEffect);
