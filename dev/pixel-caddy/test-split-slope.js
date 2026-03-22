// Test splitting slope effect into parallel and perpendicular components
//
// The insight: cross-slope break feels exaggerated because the ball
// is deflecting sideways the entire putt, accumulating lateral movement.
// But uphill/downhill directly affects speed which feels more natural.
//
// Solution: Use different multipliers for:
// - Parallel component (along ball's direction of travel) - affects speed
// - Perpendicular component (across ball's path) - affects break

function simulateSplitSlope(distFeet, slope, parallelEffect, perpEffect) {
    const friction = 0.035 / 1.2;
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
        
        // Direction of travel (unit vector)
        const dirX = velX / speed;
        const dirY = velY / speed;
        
        // Perpendicular direction (90° rotated)
        const perpX = -dirY;
        const perpY = dirX;
        
        // Slope vector
        const slopeVecX = -slope.x;
        const slopeVecY = -slope.y;
        
        // Project slope onto parallel and perpendicular directions
        const parallelComponent = slopeVecX * dirX + slopeVecY * dirY;
        const perpComponent = slopeVecX * perpX + slopeVecY * perpY;
        
        // Apply different effects
        const parallelAccel = parallelComponent * parallelEffect;
        const perpAccel = perpComponent * perpEffect;
        
        // Convert back to X/Y accelerations
        const slopeAccelX = parallelAccel * dirX + perpAccel * perpX;
        const slopeAccelY = parallelAccel * dirY + perpAccel * perpY;
        
        // Friction (always opposes motion)
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

console.log('=== SPLIT SLOPE EFFECT TEST ===\n');
console.log('parallelEffect: affects uphill/downhill speed');
console.log('perpEffect: affects cross-slope break\n');

function testConfig(parallel, perp) {
    console.log(`\n--- parallel=${parallel}, perp=${perp} ---`);
    console.log('Flat 20ft:      ' + simulateSplitSlope(20, {x:0, y:0}, parallel, perp).forward + 'ft');
    console.log('Downhill 4%:    ' + simulateSplitSlope(20, {x:0, y:0.48}, parallel, perp).forward + 'ft (want 25-30)');
    console.log('Downhill 8%:    ' + simulateSplitSlope(20, {x:0, y:0.96}, parallel, perp).forward + 'ft, accel: ' + simulateSplitSlope(20, {x:0, y:0.96}, parallel, perp).accel);
    console.log('Uphill 4%:      ' + simulateSplitSlope(20, {x:0, y:-0.48}, parallel, perp).forward + 'ft (want 14-16)');
    console.log('Uphill 8%:      ' + simulateSplitSlope(20, {x:0, y:-0.96}, parallel, perp).forward + 'ft');
    console.log('Cross 2%:       ' + simulateSplitSlope(20, {x:0.24, y:0}, parallel, perp).lateral + 'ft break (want 1-2)');
    console.log('Cross 4%:       ' + simulateSplitSlope(20, {x:0.48, y:0}, parallel, perp).lateral + 'ft break (want 2-4)');
    console.log('Cross 6%:       ' + simulateSplitSlope(20, {x:0.72, y:0}, parallel, perp).lateral + 'ft break (want 4-6)');
    console.log('Two-tier test:  ' + (simulateSplitSlope(5, {x:0, y:1.5}, parallel, perp).accel ? 'accelerates ✓' : 'no accel ✗'));
    
    // Diagonal slope test (downhill AND breaking right)
    console.log('Diagonal 4%:    fwd=' + simulateSplitSlope(20, {x:0.34, y:0.34}, parallel, perp).forward + 
                'ft, lat=' + simulateSplitSlope(20, {x:0.34, y:0.34}, parallel, perp).lateral + 'ft');
}

// Test configurations
testConfig(0.020, 0.008);  // Strong parallel, weak perp
testConfig(0.020, 0.010);  // Strong parallel, moderate perp
testConfig(0.018, 0.009);  // Balanced
testConfig(0.022, 0.009);  // Stronger parallel
testConfig(0.025, 0.010);  // Even stronger for two-tier
