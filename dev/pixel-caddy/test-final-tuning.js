// Final tuning for split slope effect

function simulateSplitSlope(distFeet, slope, parallelEffect, perpEffect, stimpFactor = 1.2) {
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
        
        // Scale effects by stimp factor
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

console.log('=== FINAL TUNING ===\n');

function fullTest(parallel, perp) {
    console.log(`\n========== parallel=${parallel}, perp=${perp} ==========`);
    console.log('\n--- FLAT (baseline) ---');
    [10, 20, 30, 40].forEach(d => {
        console.log(`${d}ft: ${simulateSplitSlope(d, {x:0, y:0}, parallel, perp).forward}ft`);
    });
    
    console.log('\n--- DOWNHILL (4% grade = 0.48 slope) ---');
    console.log('Target: 20ft putt should roll 25-35ft');
    [10, 20, 30].forEach(d => {
        const r = simulateSplitSlope(d, {x:0, y:0.48}, parallel, perp);
        console.log(`${d}ft intended: ${r.forward}ft actual`);
    });
    
    console.log('\n--- STEEP DOWNHILL (8% grade = 0.96 slope) ---');
    console.log('Target: Should accelerate on steep slopes');
    [10, 20].forEach(d => {
        const r = simulateSplitSlope(d, {x:0, y:0.96}, parallel, perp);
        console.log(`${d}ft intended: ${r.forward}ft actual, accelerated: ${r.accel}`);
    });
    
    console.log('\n--- UPHILL (4% grade = -0.48 slope) ---');
    console.log('Target: 20ft putt should stop at 14-17ft');
    [10, 20, 30].forEach(d => {
        const r = simulateSplitSlope(d, {x:0, y:-0.48}, parallel, perp);
        console.log(`${d}ft intended: ${r.forward}ft actual`);
    });
    
    console.log('\n--- CROSS-SLOPE BREAK ---');
    console.log('Target: 20ft putt on 4% should break 2-4ft');
    [[0.24, '2%'], [0.48, '4%'], [0.72, '6%']].forEach(([s, label]) => {
        const r = simulateSplitSlope(20, {x:s, y:0}, parallel, perp);
        console.log(`${label} slope: ${Math.abs(parseFloat(r.lateral)).toFixed(1)}ft break`);
    });
    
    console.log('\n--- TWO-TIER GREEN TEST ---');
    console.log('Ball barely moving (5ft putt) hits 12% slope');
    const twoTier = simulateSplitSlope(5, {x:0, y:1.5}, parallel, perp);
    console.log(`Result: ${twoTier.forward}ft, accelerated: ${twoTier.accel ? '✓ YES' : '✗ NO'}`);
    
    console.log('\n--- LONGER PUTTS BREAK MORE ---');
    [10, 20, 30, 40].forEach(d => {
        const r = simulateSplitSlope(d, {x:0.48, y:0}, parallel, perp);
        console.log(`${d}ft putt on 4% cross: ${Math.abs(parseFloat(r.lateral)).toFixed(1)}ft break`);
    });
}

// Test the most promising configurations
fullTest(0.018, 0.007);
fullTest(0.020, 0.007);
fullTest(0.020, 0.0065);
