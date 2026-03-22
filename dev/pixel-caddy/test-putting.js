// Putting physics test script
// Run with: node test-putting.js

// Simulate the putting physics from shot.js

function simulatePutt(distanceFeet, slope = { x: 0, y: 0 }, aimAngle = 0) {
    // Convert feet to game units (1 unit = 4 yards, 3 feet = 1 yard)
    const distanceYards = distanceFeet / 3;
    const totalUnits = distanceYards / 4;
    
    const aimRad = (aimAngle * Math.PI) / 180;
    
    // Green speed - stimp meter rating
    const greenSpeed = 12;
    const stimpFactor = greenSpeed / 10;
    
    // Rolling resistance coefficient
    const rollingResistance = 0.035 / stimpFactor;
    
    // Scale factor varies with distance to compensate for variable friction
    const distanceScale = 0.90 + (totalUnits * 0.02);
    const initialSpeed = Math.sqrt(2 * rollingResistance * totalUnits) * Math.min(distanceScale, 1.0);
    
    let velX = Math.sin(aimRad) * initialSpeed;
    let velY = -Math.cos(aimRad) * initialSpeed;
    
    const dt = 0.016;
    const maxTime = 20;
    
    let x = 0;
    let y = 0;
    
    // Split slope effect for realistic physics:
    // - Parallel effect (uphill/downhill): affects ball speed
    // - Perpendicular effect (cross-slope): affects break
    const parallelSlopeEffect = 0.016 * stimpFactor;
    const perpSlopeEffect = 0.005 * stimpFactor;
    
    let t = 0;
    let maxSpeed = initialSpeed;
    let minSpeed = initialSpeed;
    
    const speedLog = [];
    
    while (t < maxTime) {
        const speed = Math.sqrt(velX * velX + velY * velY);
        
        if (speed < 0.0003) break;
        
        maxSpeed = Math.max(maxSpeed, speed);
        minSpeed = Math.min(minSpeed, speed);
        
        // Log speed at intervals
        if (Math.floor(t * 10) % 5 === 0 && speedLog.length < 20) {
            speedLog.push({ t: t.toFixed(2), speed: speed.toFixed(4) });
        }
        
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
        
        // Rolling friction - decreases at low speeds for two-tier effect
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
    
    // Calculate actual distance in feet
    const totalDistanceUnits = Math.sqrt(x * x + y * y);
    const actualFeet = totalDistanceUnits * 4 * 3;
    
    // Calculate lateral break
    const lateralUnits = x;
    const lateralFeet = lateralUnits * 4 * 3;
    
    return {
        intendedFeet: distanceFeet,
        actualFeet: actualFeet.toFixed(1),
        lateralBreakFeet: lateralFeet.toFixed(1),
        rollTime: t.toFixed(2),
        initialSpeed: initialSpeed.toFixed(4),
        maxSpeed: maxSpeed.toFixed(4),
        accelerated: maxSpeed > initialSpeed * 1.01,
        speedLog
    };
}

console.log("=== PUTTING PHYSICS TEST ===\n");

// Test 1: Flat putts at various distances
console.log("--- FLAT SURFACE (no slope) ---");
[5, 10, 20, 30, 50, 80].forEach(dist => {
    const result = simulatePutt(dist, { x: 0, y: 0 });
    console.log(`${dist}ft putt → rolled ${result.actualFeet}ft (${result.rollTime}s)`);
});

console.log("\n--- DOWNHILL PUTTS (slope.y = +0.5, slope points uphill so ball rolls down) ---");
// Positive Y slope means uphill in +Y direction, so ball rolling in -Y (aim=0) goes downhill
[10, 20, 30].forEach(dist => {
    const result = simulatePutt(dist, { x: 0, y: 0.5 }, 0);
    console.log(`${dist}ft putt → rolled ${result.actualFeet}ft, accelerated: ${result.accelerated} (${result.rollTime}s)`);
});

console.log("\n--- STEEP DOWNHILL (slope.y = +1.0) ---");
[10, 20, 30].forEach(dist => {
    const result = simulatePutt(dist, { x: 0, y: 1.0 }, 0);
    console.log(`${dist}ft putt → rolled ${result.actualFeet}ft, accelerated: ${result.accelerated} (${result.rollTime}s)`);
});

console.log("\n--- UPHILL PUTTS (slope.y = -0.5, slope points downhill so ball rolls up) ---");
[10, 20, 30].forEach(dist => {
    const result = simulatePutt(dist, { x: 0, y: -0.5 }, 0);
    console.log(`${dist}ft putt → rolled ${result.actualFeet}ft (${result.rollTime}s)`);
});

console.log("\n--- LEFT-TO-RIGHT BREAK (slope.x = 0.3) ---");
[10, 20, 30].forEach(dist => {
    const result = simulatePutt(dist, { x: 0.3, y: 0 }, 0);
    console.log(`${dist}ft putt → rolled ${result.actualFeet}ft, broke ${result.lateralBreakFeet}ft right (${result.rollTime}s)`);
});

console.log("\n--- RIGHT-TO-LEFT BREAK (slope.x = -0.3) ---");
[10, 20, 30].forEach(dist => {
    const result = simulatePutt(dist, { x: -0.3, y: 0 }, 0);
    console.log(`${dist}ft putt → rolled ${result.actualFeet}ft, broke ${result.lateralBreakFeet}ft left (${result.rollTime}s)`);
});

console.log("\n--- SPEED CURVE (20ft flat putt) ---");
const detailed = simulatePutt(20, { x: 0, y: 0 });
console.log("Time vs Speed:");
detailed.speedLog.forEach(s => console.log(`  t=${s.t}s: speed=${s.speed}`));

console.log("\n--- SPEED CURVE (20ft downhill putt, slope=+0.5) ---");
const downhill = simulatePutt(20, { x: 0, y: 0.5 });
console.log("Time vs Speed (should maintain or increase speed):");
downhill.speedLog.forEach(s => console.log(`  t=${s.t}s: speed=${s.speed}`));

console.log("\n--- TWO-TIER GREEN SCENARIO ---");
console.log("Ball barely makes it over edge, then hits steep slope...");

// Simulate a putt that just barely crests a tier
// Start with very low speed (ball almost stopped) on a steep slope
function simulateTwoTier() {
    const greenSpeed = 12;
    const stimpFactor = greenSpeed / 10;
    const rollingResistance = 0.035 / stimpFactor;
    const parallelSlopeEffect = 0.016 * stimpFactor;
    const perpSlopeEffect = 0.005 * stimpFactor;
    
    // Ball barely moving (like it just crested a tier)
    const crawlSpeed = 0.02; // Very slow
    let velX = 0;
    let velY = -crawlSpeed; // Rolling forward slowly
    
    // Steep downhill slope (tier edge)
    const slope = { x: 0, y: 1.5 }; // Steep!
    
    const dt = 0.016;
    let x = 0, y = 0, t = 0;
    
    // Calculate effective friction at low speed
    const speedFactor = Math.min(1, crawlSpeed / 0.15);
    const effectiveFriction = rollingResistance * (0.3 + 0.7 * speedFactor);
    
    console.log(`Initial speed: ${crawlSpeed.toFixed(4)}`);
    console.log(`Slope: ${slope.y} (steep downhill)`);
    console.log(`Base friction: ${rollingResistance.toFixed(4)}`);
    console.log(`Effective friction at low speed: ${effectiveFriction.toFixed(4)}`);
    console.log(`Parallel slope effect: ${parallelSlopeEffect.toFixed(4)}`);
    console.log(`Slope accel (parallel): ${(slope.y * parallelSlopeEffect).toFixed(4)}`);
    console.log(`Net accel: ${(slope.y * parallelSlopeEffect - effectiveFriction).toFixed(4)} (positive = accelerates)`);
    
    const speeds = [];
    while (t < 5) {
        const speed = Math.sqrt(velX * velX + velY * velY);
        if (speed < 0.0003) break;
        
        if (t < 3 && Math.floor(t * 20) % 4 === 0) {
            speeds.push({ t: t.toFixed(2), speed: speed.toFixed(4) });
        }
        
        // Calculate direction of travel
        const dirX = velX / speed;
        const dirY = velY / speed;
        const perpX = -dirY;
        const perpY = dirX;
        
        // Slope vector (negative because slope points uphill)
        const slopeVecX = -slope.x;
        const slopeVecY = -slope.y;
        
        // Project slope onto parallel and perpendicular components
        const parallelComponent = slopeVecX * dirX + slopeVecY * dirY;
        const perpComponent = slopeVecX * perpX + slopeVecY * perpY;
        
        const parallelAccel = parallelComponent * parallelSlopeEffect;
        const perpAccel = perpComponent * perpSlopeEffect;
        
        const slopeAccelX = parallelAccel * dirX + perpAccel * perpX;
        const slopeAccelY = parallelAccel * dirY + perpAccel * perpY;
        
        const sf = Math.min(1, speed / 0.15);
        const ef = rollingResistance * (0.3 + 0.7 * sf);
        const fricAccelX = speed > 0 ? -(velX / speed) * ef : 0;
        const fricAccelY = speed > 0 ? -(velY / speed) * ef : 0;
        
        velX += (slopeAccelX + fricAccelX) * dt;
        velY += (slopeAccelY + fricAccelY) * dt;
        x += velX * dt;
        y += velY * dt;
        t += dt;
    }
    
    const finalDist = Math.abs(y) * 4 * 3; // to feet
    console.log(`\nSpeed over time:`);
    speeds.forEach(s => console.log(`  t=${s.t}s: speed=${s.speed}`));
    console.log(`\nFinal distance: ${finalDist.toFixed(1)}ft`);
    const didAccelerate = parseFloat(speeds[Math.min(10, speeds.length-1)]?.speed) > parseFloat(speeds[0]?.speed);
    console.log(`Ball ${didAccelerate ? 'ACCELERATED! 🏌️' : 'decelerated'}`);
}

simulateTwoTier();
