// Test with dampened cross-slope effect for steep slopes
// The idea: as slope gets steeper, the perpendicular effect doesn't scale linearly
// This models the fact that on very steep cross-slopes, the ball tends to 
// turn and go more downhill rather than continuing to break sideways

function simulateDampedSlope(distFeet, slope, parallelEffect, perpEffect, stimpFactor = 1.2) {
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
        let perpComponent = slopeVecX * perpX + slopeVecY * perpY;
        
        // Dampen perpendicular effect for steep slopes
        // Use sqrt to reduce the effect of steep cross-slopes
        const perpMagnitude = Math.abs(perpComponent);
        if (perpMagnitude > 0.3) {
            // For slopes > ~2.5%, apply sqrt dampening
            const dampedMag = 0.3 + Math.sqrt((perpMagnitude - 0.3) * 0.5);
            perpComponent = Math.sign(perpComponent) * dampedMag;
        }
        
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

console.log('=== DAMPED CROSS-SLOPE TEST ===\n');

function fullTest(parallel, perp) {
    console.log(`\n========== parallel=${parallel}, perp=${perp} (with dampening) ==========`);
    
    console.log('\n--- FLAT (baseline) ---');
    console.log(`20ft: ${simulateDampedSlope(20, {x:0, y:0}, parallel, perp).forward}ft`);
    
    console.log('\n--- DOWNHILL ---');
    console.log(`4% (0.48): 20ft → ${simulateDampedSlope(20, {x:0, y:0.48}, parallel, perp).forward}ft (want 25-35)`);
    console.log(`8% (0.96): 20ft → ${simulateDampedSlope(20, {x:0, y:0.96}, parallel, perp).forward}ft`);
    
    console.log('\n--- UPHILL ---');
    console.log(`4% (-0.48): 20ft → ${simulateDampedSlope(20, {x:0, y:-0.48}, parallel, perp).forward}ft (want 14-17)`);
    console.log(`8% (-0.96): 20ft → ${simulateDampedSlope(20, {x:0, y:-0.96}, parallel, perp).forward}ft`);
    
    console.log('\n--- CROSS-SLOPE (20ft putt) ---');
    [[0.24, '2%'], [0.36, '3%'], [0.48, '4%'], [0.60, '5%'], [0.72, '6%'], [0.96, '8%']].forEach(([s, label]) => {
        const r = simulateDampedSlope(20, {x:s, y:0}, parallel, perp);
        console.log(`${label}: ${Math.abs(parseFloat(r.lateral)).toFixed(1)}ft break`);
    });
    
    console.log('\n--- TWO-TIER TEST ---');
    const twoTier = simulateDampedSlope(5, {x:0, y:1.5}, parallel, perp);
    console.log(`5ft putt on 12% slope: ${twoTier.forward}ft, accel: ${twoTier.accel ? '✓' : '✗'}`);
    
    console.log('\n--- BREAK BY DISTANCE (4% cross) ---');
    [10, 20, 30, 40].forEach(d => {
        const r = simulateDampedSlope(d, {x:0.48, y:0}, parallel, perp);
        console.log(`${d}ft: ${Math.abs(parseFloat(r.lateral)).toFixed(1)}ft break`);
    });
}

fullTest(0.018, 0.012);
fullTest(0.020, 0.012);
fullTest(0.020, 0.010);
