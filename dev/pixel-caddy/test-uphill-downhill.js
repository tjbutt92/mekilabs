// Compare uphill/downhill effects with different slopeEffect values

function simulatePutt(distanceFeet, slope, slopeEffectValue) {
    const distanceYards = distanceFeet / 3;
    const totalUnits = distanceYards / 4;
    const greenSpeed = 12;
    const stimpFactor = greenSpeed / 10;
    const rollingResistance = 0.035 / stimpFactor;
    const distanceScale = 0.90 + (totalUnits * 0.02);
    const initialSpeed = Math.sqrt(2 * rollingResistance * totalUnits) * Math.min(distanceScale, 1.0);
    
    let velX = 0;
    let velY = -initialSpeed; // Rolling forward (negative Y)
    const dt = 0.016;
    let x = 0, y = 0, t = 0;
    
    while (t < 25) {
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
    
    const distFeet = Math.sqrt(x*x + y*y) * 4 * 3;
    return distFeet.toFixed(1);
}

console.log('=== UPHILL/DOWNHILL COMPARISON ===\n');
console.log('Slope values: +0.5 = downhill (ball rolls further), -0.5 = uphill (ball stops shorter)\n');

const oldEffect = 0.03;  // 0.025 * 1.2
const newEffect = 0.0108; // 0.009 * 1.2

console.log('20ft putt intended distance:\n');
console.log('Slope      | OLD (0.030) | NEW (0.0108) | Real expectation');
console.log('-----------|-------------|--------------|------------------');

const scenarios = [
    { slope: { x: 0, y: 0 }, name: 'Flat      ' },
    { slope: { x: 0, y: 0.3 }, name: 'Mild down ' },
    { slope: { x: 0, y: 0.5 }, name: 'Med down  ' },
    { slope: { x: 0, y: 1.0 }, name: 'Steep down' },
    { slope: { x: 0, y: -0.3 }, name: 'Mild up   ' },
    { slope: { x: 0, y: -0.5 }, name: 'Med up    ' },
    { slope: { x: 0, y: -1.0 }, name: 'Steep up  ' },
];

scenarios.forEach(s => {
    const oldDist = simulatePutt(20, s.slope, oldEffect);
    const newDist = simulatePutt(20, s.slope, newEffect);
    console.log(`${s.name} | ${oldDist.padStart(8)}ft | ${newDist.padStart(9)}ft |`);
});

console.log('\n=== REAL WORLD EXPECTATIONS ===');
console.log('On a stimp 12 green:');
console.log('- Mild downhill (2%): ball rolls ~20-30% further');
console.log('- Steep downhill (8%): ball rolls ~50-100% further');
console.log('- Mild uphill (2%): ball stops ~15-25% shorter');
console.log('- Steep uphill (8%): ball stops ~40-60% shorter');
console.log('\nThe NEW values seem too weak for uphill/downhill.');
console.log('The OLD values were too strong for cross-slope but maybe OK for up/down?');
