// Simple split slope - find the right balance

function simulate(distFeet, slope, parallelEffect, perpEffect, stimpFactor = 1.2) {
    const friction = 0.035 / stimpFactor;
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
        
        const dirX = velX / speed;
        const dirY = velY / speed;
        const perpX = -dirY;
        const perpY = dirX;
        
        const slopeVecX = -slope.x;
        const slopeVecY = -slope.y;
        
        const parallelComponent = slopeVecX * dirX + slopeVecY * dirY;
        const perpComponent = slopeVecX * perpX + slopeVecY * perpY;
        
        const parallelAccel = parallelComponent * parallelEffect * stimpFactor;
        const perpAccel = perpComponent * perpEffect * stimpFactor;
        
        const slopeAccelX = parallelAccel * dirX + perpAccel * perpX;
        const slopeAccelY = parallelAccel * dirY + perpAccel * perpY;
        
        const sf = Math.min(1, speed / 0.15);
        const ef = friction * (0.3 + 0.7 * sf);
        const fricAccelX = -dirX * ef;
        const fricAccelY = -dirY * ef;
        
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

console.log('=== FINDING OPTIMAL VALUES ===\n');
console.log('Real world targets:');
console.log('- 20ft putt, 4% downhill: rolls 25-35ft');
console.log('- 20ft putt, 4% uphill: stops at 14-17ft');
console.log('- 20ft putt, 2% cross: 1-2ft break');
console.log('- 20ft putt, 4% cross: 2-4ft break');
console.log('- 20ft putt, 6% cross: 4-6ft break');
console.log('- Two-tier (slow ball on steep slope): accelerates\n');

function test(par, perp) {
    const flat = simulate(20, {x:0, y:0}, par, perp).forward;
    const down4 = simulate(20, {x:0, y:0.48}, par, perp).forward;
    const up4 = simulate(20, {x:0, y:-0.48}, par, perp).forward;
    const cross2 = Math.abs(parseFloat(simulate(20, {x:0.24, y:0}, par, perp).lateral));
    const cross4 = Math.abs(parseFloat(simulate(20, {x:0.48, y:0}, par, perp).lateral));
    const cross6 = Math.abs(parseFloat(simulate(20, {x:0.72, y:0}, par, perp).lateral));
    const twoTier = simulate(5, {x:0, y:1.5}, par, perp).accel;
    
    console.log(`par=${par.toFixed(3)}, perp=${perp.toFixed(4)}: ` +
        `down=${down4}ft, up=${up4}ft, ` +
        `cross2=${cross2.toFixed(1)}ft, cross4=${cross4.toFixed(1)}ft, cross6=${cross6.toFixed(1)}ft, ` +
        `tier=${twoTier ? '✓' : '✗'}`);
}

// Grid search
console.log('--- Grid search ---');
[0.016, 0.018, 0.020, 0.022].forEach(par => {
    [0.004, 0.005, 0.006, 0.007].forEach(perp => {
        test(par, perp);
    });
    console.log('');
});

console.log('\n--- Best candidates detailed ---');

function detailed(par, perp) {
    console.log(`\n=== parallel=${par}, perp=${perp} ===`);
    console.log('Downhill:');
    [10, 20, 30].forEach(d => {
        console.log(`  ${d}ft → ${simulate(d, {x:0, y:0.48}, par, perp).forward}ft`);
    });
    console.log('Uphill:');
    [10, 20, 30].forEach(d => {
        console.log(`  ${d}ft → ${simulate(d, {x:0, y:-0.48}, par, perp).forward}ft`);
    });
    console.log('Cross-slope break (20ft putt):');
    [[0.24,'2%'], [0.36,'3%'], [0.48,'4%'], [0.60,'5%'], [0.72,'6%']].forEach(([s,l]) => {
        console.log(`  ${l}: ${Math.abs(parseFloat(simulate(20, {x:s, y:0}, par, perp).lateral)).toFixed(1)}ft`);
    });
    console.log('Break by distance (4% cross):');
    [10, 20, 30, 40].forEach(d => {
        console.log(`  ${d}ft putt: ${Math.abs(parseFloat(simulate(d, {x:0.48, y:0}, par, perp).lateral)).toFixed(1)}ft break`);
    });
    console.log('Two-tier: ' + (simulate(5, {x:0, y:1.5}, par, perp).accel ? 'ACCELERATES ✓' : 'no accel ✗'));
}

detailed(0.018, 0.005);
detailed(0.020, 0.005);
detailed(0.020, 0.006);
