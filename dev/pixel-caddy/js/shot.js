// Shot simulation module - now using realistic physics engine
import { golfer, recordShot } from './golfer.js';
import { getElevationAt, getElevationChange, getSlopeAt, getTerrainAt } from './terrain.js';
import { 
    simulateFullShot, 
    generateLaunchConditions, 
    simulateTrajectory, 
    calculateLandingBehavior,
    generateShotVariability,
    applyLieToLaunch,
    clubPhysics 
} from './physics.js';
import { determineLie } from './lie.js';
import { checkTreeCollision } from './trees.js';
import { HOLE, CONVERSION } from './constants.js';

// Simple ground physics - keep it predictable
const TREE_ENERGY_ABSORPTION = 0.75;  // Trees absorb 75% of energy

export class ShotSimulator {
    constructor(ball, onComplete) {
        this.ball = ball;
        this.onComplete = onComplete;
        this.isAnimating = false;
        this.trajectoryPoints = [];
        this.currentLie = null;
    }

    getCurrentLie() {
        return this.currentLie;
    }

    updateLie(holeData) {
        const pos = this.ball.getPosition();
        const terrain = getTerrainAt(holeData, pos.x, pos.y) || 'fairway';
        const slope = getSlopeAt(holeData, pos.x, pos.y);
        this.currentLie = determineLie(terrain, slope);
        return this.currentLie;
    }

    hit(params) {
        const { club, power, shape, aimAngle, holeData, wind = { speed: 0, relativeDirection: 0 } } = params;
        const start = this.ball.getPosition();
        const terrain = getTerrainAt(holeData, start.x, start.y) || 'fairway';
        
        // Handle putting separately
        if (club.name === 'Putter') {
            this.putt(params);
            return;
        }
        
        this.ball.setRoll(0, 0, 0); // No roll for full shots
        
        if (!this.currentLie) {
            this.updateLie(holeData);
        }
        const lie = this.currentLie;
        const clubStats = this.getClubStats(golfer, club.name);
        const variability = generateShotVariability(clubStats, club.name, { lie });
        
        let launchConditions = generateLaunchConditions(club.name, power, shape, variability);
        if (!launchConditions) {
            console.error('Failed to generate launch conditions for', club.name);
            return;
        }
        
        launchConditions = applyLieToLaunch(launchConditions, lie, club.name);
        console.log(`Lie: ${lie.data.name} - Distance: ${Math.round(lie.data.effects.distanceMultiplier * 100)}%, Spin: ${Math.round(lie.data.effects.spinMultiplier * 100)}%`);
        
        // Wind relative direction is pre-calculated by getWindForShot()
        const windRelativeToFlight = (wind.relativeDirection - launchConditions.launchDirection + 360) % 360;
        const trajectoryResult = simulateTrajectory(launchConditions, wind.speed, windRelativeToFlight);
        
        console.log(`Shot: ${club.name}, Carry: ${trajectoryResult.carry.toFixed(0)}y`);
        
        // Get landing position first so we can use landing terrain (not start) for bounce/roll
        const screenCoords = this.convertToScreenCoords(start, aimAngle, trajectoryResult, {}, holeData);
        const elevChange = getElevationChange(holeData, start.x, start.y, screenCoords.land.x, screenCoords.land.y);
        const elevAdjustment = elevChange * 0.9;
        const aimRad = (aimAngle * Math.PI) / 180;
        screenCoords.land.x -= Math.sin(aimRad) * elevAdjustment * screenCoords.yardToUnit;
        screenCoords.land.y += Math.cos(aimRad) * elevAdjustment * screenCoords.yardToUnit;
        
        const landingTerrain = getTerrainAt(holeData, screenCoords.land.x, screenCoords.land.y) || 'fairway';
        let landingBehavior;
        let finalX, finalY;
        
        if (landingTerrain === 'water') {
            // Ball landed in water: no bounce, no roll
            landingBehavior = { bounceHeight: 0, rollYards: 0, rollDirection: 0, checksUp: false, spinsBack: false };
            finalX = screenCoords.land.x;
            finalY = screenCoords.land.y;
        } else {
            landingBehavior = calculateLandingBehavior(trajectoryResult, landingTerrain, lie);
            const { finalX: fx, finalY: fy } = this.calculateSimpleRoll(
                screenCoords.land.x, screenCoords.land.y, start,
                landingBehavior.rollYards * screenCoords.yardToUnit,
                landingBehavior.rollDirection, holeData
            );
            finalX = fx;
            finalY = fy;
        }
        
        const intendedYards = club.yards * (power / 100);
        const actualCarry = trajectoryResult.carry - elevAdjustment;
        const actualTotal = actualCarry + landingBehavior.rollYards;
        
        const shotData = {
            intendedYards, actualYards: actualTotal,
            distanceError: actualCarry - intendedYards,  // Use carry for dispersion, not total
            directionError: trajectoryResult.lateral,
            isMiss: variability.isMiss || variability.isDisaster,
            landedInWater: landingTerrain === 'water',
            shotStartPosition: { x: start.x, y: start.y },
            ...(landingTerrain === 'water' && { waterPosition: { x: finalX, y: finalY } }),
            lie: { type: lie.type, name: lie.data.name, effects: lie.data.effects },
            launch: {
                ballSpeed: launchConditions.ballSpeedMPH,
                launchAngle: launchConditions.launchAngle,
                spinRate: launchConditions.spinRate,
                spinAxis: launchConditions.spinAxis
            },
            flight: {
                carry: actualCarry, maxHeight: trajectoryResult.maxHeight,
                flightTime: trajectoryResult.flightTime, landingAngle: trajectoryResult.landingAngle
            },
            landing: {
                rollYards: landingBehavior.rollYards,
                checksUp: landingBehavior.checksUp,
                spinsBack: landingBehavior.spinsBack
            }
        };
        
        this.trajectoryPoints = trajectoryResult.trajectory;
        this.animatePhysicsShot(start, screenCoords.land, { x: finalX, y: finalY },
            trajectoryResult, landingBehavior, aimAngle, shotData, holeData);
    }

    /**
     * Putting simulation - ball rolls on ground with slope influence
     * Distance is specified in feet (how far ball would roll on flat green)
     */
    putt(params) {
        const { putterDistance, aimAngle, holeData } = params;
        const start = this.ball.getPosition();
        
        // Convert feet to yards (3 feet = 1 yard)
        const distanceFeet = putterDistance || 30;
        const distanceYards = distanceFeet / 3;
        
        // World units: 1 unit = 4 yards
        const yardToUnit = 1 / 4;
        const totalUnits = distanceYards * yardToUnit;
        
        // Calculate putt path with slope influence
        const puttResult = this.simulatePutt(start, aimAngle, totalUnits, holeData);
        
        // Create shot data for putting
        const shotData = {
            isPutt: true,
            intendedFeet: distanceFeet,
            actualFeet: puttResult.actualDistanceFeet,
            distanceError: puttResult.actualDistanceFeet - distanceFeet,
            directionError: 0,
            isMiss: false,
            holed: puttResult.holed || false
        };
        
        console.log(`Putt: ${distanceFeet} ft intended, rolling...${puttResult.holed ? ' (tracking toward hole)' : ''}`);
        
        // Animate the putt
        this.animatePutt(start, puttResult.path, puttResult.duration, shotData, holeData);
    }

    /**
     * Simulate putt path with slope breaking and hole capture
     * Returns path points and final position
     * 
     * Physics model for fast tournament greens (stimp 11-13):
     * - Ball glides with very low friction
     * - Gravity pulls ball downhill, can accelerate on downslopes
     * - Deceleration is gradual and smooth
     * - Break increases as ball slows
     * - Ball can fall into hole if slow enough and close enough
     */
    simulatePutt(start, aimAngle, totalUnits, holeData) {
        const path = [{ x: start.x, y: start.y }];
        const aimRad = (aimAngle * Math.PI) / 180;
        
        // Hole position from holeData
        const holePos = holeData.hole;
        const holeRadiusWorld = HOLE.RADIUS_WORLD;
        
        // Green speed - stimp meter rating
        // 11-13 = PGA Tour speed (very fast)
        const greenSpeed = 12;
        const stimpFactor = greenSpeed / 10;
        
        // Rolling resistance coefficient for fast greens
        // Lower = faster/slicker greens
        const rollingResistance = 0.035 / stimpFactor;
        
        // Initial speed for desired distance
        // Scale factor varies slightly with distance to compensate for variable friction
        const distanceScale = 0.90 + (totalUnits * 0.02); // Longer putts need slightly more speed
        const initialSpeed = Math.sqrt(2 * rollingResistance * totalUnits) * Math.min(distanceScale, 1.0);
        
        let velX = Math.sin(aimRad) * initialSpeed;
        let velY = -Math.cos(aimRad) * initialSpeed;
        
        const dt = 0.016; // ~60fps
        const maxTime = 20; // Long putts can roll a while
        
        let x = start.x;
        let y = start.y;
        
        // Split slope effect for realistic physics:
        // - Parallel effect (uphill/downhill): affects ball speed, needs to be strong
        //   for two-tier greens where slow ball accelerates down steep slope
        // - Perpendicular effect (cross-slope): affects break, needs to be weaker
        //   to avoid excessive lateral movement
        // Both scale with stimp factor (faster greens = more effect)
        const parallelSlopeEffect = 0.016 * stimpFactor;
        const perpSlopeEffect = 0.005 * stimpFactor;
        
        let t = 0;
        let stepCount = 0;
        let holed = false;
        
        while (t < maxTime) {
            const speed = Math.sqrt(velX * velX + velY * velY);
            
            // Check if ball is over the hole BEFORE checking if stopped
            // This ensures a ball that stops on the hole still drops in
            const distToHole = Math.sqrt((x - holePos.x) ** 2 + (y - holePos.y) ** 2);
            
            // Ball capture physics:
            // - Ball must be within hole radius (or close to edge)
            // - Ball must be moving slow enough to drop in
            // - Fast balls can lip out or roll over
            if (distToHole < holeRadiusWorld * HOLE.EDGE_TOLERANCE) {
                // Ball is near/over the hole
                if (distToHole < holeRadiusWorld) {
                    // Ball is directly over the hole
                    if (speed < HOLE.MAX_CAPTURE_SPEED) {
                        // Slow enough - ball drops in!
                        holed = true;
                        x = holePos.x;
                        y = holePos.y;
                        path.push({ x, y, speed: 0, holed: true });
                        console.log('Ball dropped in the hole!');
                        break;
                    } else if (speed < HOLE.MAX_CAPTURE_SPEED * 2) {
                        // Medium speed - might lip out
                        const lipOutRoll = Math.random();
                        if (lipOutRoll > HOLE.LIP_OUT_CHANCE) {
                            // Ball catches the lip and drops!
                            holed = true;
                            x = holePos.x;
                            y = holePos.y;
                            path.push({ x, y, speed: 0, holed: true });
                            console.log('Ball caught the lip and dropped in!');
                            break;
                        } else {
                            // Lip out - ball deflects away from hole
                            console.log('Lip out!');
                            const deflectAngle = Math.atan2(y - holePos.y, x - holePos.x);
                            const deflectSpeed = speed * 0.6;
                            velX = Math.cos(deflectAngle) * deflectSpeed;
                            velY = Math.sin(deflectAngle) * deflectSpeed;
                        }
                    }
                    // else: ball is too fast, rolls right over
                }
            }
            
            // Stop when ball is essentially stopped (after hole check)
            if (speed < 0.0003) break;
            
            // Get slope at current position
            const slope = getSlopeAt(holeData, x, y);
            
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
            
            // Rolling friction - decreases at low speeds
            // This allows gravity to accelerate a slow ball on steep slopes
            // At high speed: full friction. At low speed: reduced friction
            const speedFactor = Math.min(1, speed / 0.15); // Ramps from 0 to 1
            const effectiveFriction = rollingResistance * (0.3 + 0.7 * speedFactor);
            const fricAccelX = -(velX / speed) * effectiveFriction;
            const fricAccelY = -(velY / speed) * effectiveFriction;
            
            // Update velocity
            velX += (slopeAccelX + fricAccelX) * dt;
            velY += (slopeAccelY + fricAccelY) * dt;
            
            // Update position
            x += velX * dt;
            y += velY * dt;
            
            // Store path points for animation
            stepCount++;
            if (stepCount % 2 === 0) {
                path.push({ x, y, speed });
            }
            
            t += dt;
        }
        
        // Final check: if ball stopped on or very near the hole, it drops in
        // This catches cases where the ball came to rest exactly on the hole
        if (!holed) {
            const finalDistToHole = Math.sqrt((x - holePos.x) ** 2 + (y - holePos.y) ** 2);
            if (finalDistToHole < holeRadiusWorld) {
                holed = true;
                x = holePos.x;
                y = holePos.y;
                // Update the last path point to show ball in hole
                if (path.length > 0) {
                    path[path.length - 1] = { x, y, speed: 0, holed: true };
                }
                console.log('Ball stopped in the hole!');
            }
        }
        
        // Add final position (only if not already holed)
        if (!holed) {
            path.push({ x, y, speed: 0 });
        }
        
        // Calculate actual distance rolled
        let totalDistance = 0;
        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i-1].x;
            const dy = path[i].y - path[i-1].y;
            totalDistance += Math.sqrt(dx * dx + dy * dy);
        }
        
        // Duration - fast greens mean the ball rolls longer
        const duration = Math.max(1000, Math.min(5000, t * 450));
        
        return {
            path,
            finalPosition: path[path.length - 1],
            actualDistanceFeet: (totalDistance * 4) * 3, // units to yards to feet
            duration,
            holed
        };
    }

    /**
     * Animate the putt rolling along the calculated path
     */
    animatePutt(start, path, duration, shotData, holeData) {
        this.isAnimating = true;
        
        console.log(`animatePutt: path has ${path.length} points, duration ${duration}ms`);
        
        // Reset roll at start of putt
        this.ball.setRoll(0, 0, 0);
        
        // Safety check - ensure path has at least 2 points
        if (!path || path.length < 2) {
            console.log('animatePutt: path too short, skipping animation');
            const finalPos = path && path.length > 0 ? path[0] : start;
            this.ball.setPosition(finalPos.x, finalPos.y, 0);
            this.isAnimating = false;
            if (this.onComplete) this.onComplete(finalPos, shotData);
            return;
        }
        
        const self = this;
        let startTime = null;
        const ballRadiusWorld = CONVERSION.BALL_RADIUS_WORLD;
        
        // Precompute cumulative path distances for roll angle
        const pathDistances = [0];
        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i - 1].x;
            const dy = path[i].y - path[i - 1].y;
            pathDistances[i] = pathDistances[i - 1] + Math.sqrt(dx * dx + dy * dy);
        }
        
        // Check if the putt ends in the hole
        const finalPoint = path[path.length - 1];
        const isHoled = finalPoint.holed || shotData.holed;
        const holePos = holeData.hole;
        const holeRadius = HOLE.RADIUS_WORLD;
        let hasDropped = false;
        let dropStartTime = null;
        const dropDuration = 150; // ms for drop animation
        
        const animate = (currentTime) => {
            // Initialize start time on first frame
            if (startTime === null) {
                startTime = currentTime;
            }
            
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / duration, 1);
            
            // Ease out - ball decelerates
            const easeT = 1 - Math.pow(1 - t, 2);
            
            // Find position along path
            const pathIndex = Math.min(Math.floor(easeT * (path.length - 1)), path.length - 1);
            const nextIndex = Math.min(pathIndex + 1, path.length - 1);
            const localT = (easeT * (path.length - 1)) - pathIndex;
            
            const point = path[pathIndex];
            const nextPoint = path[nextIndex];
            
            if (!point || !nextPoint) {
                const finalPos = path[path.length - 1];
                const height = isHoled ? -0.15 : 0;
                self.ball.setPosition(finalPos.x, finalPos.y, height);
                self.isAnimating = false;
                if (self.onComplete) self.onComplete(finalPos, shotData);
                return;
            }
            
            const x = point.x + (nextPoint.x - point.x) * localT;
            const y = point.y + (nextPoint.y - point.y) * localT;
            
            // Roll: distance along path / ball radius gives roll angle; direction from segment for axis
            const pathDistance = pathDistances[pathIndex] + localT * (pathDistances[nextIndex] - pathDistances[pathIndex]);
            const rollAngle = ballRadiusWorld > 0 ? pathDistance / ballRadiusWorld : 0;
            const dirX = nextPoint.x - point.x;
            const dirY = nextPoint.y - point.y;
            self.ball.setRoll(rollAngle, dirX, dirY);
            
            // Check if ball has entered the hole
            let height = 0;
            if (isHoled) {
                const distToHole = Math.sqrt((x - holePos.x) ** 2 + (y - holePos.y) ** 2);
                
                if (!hasDropped && distToHole < holeRadius) {
                    // Ball just entered the hole - start drop
                    hasDropped = true;
                    dropStartTime = currentTime;
                }
                
                if (hasDropped) {
                    // Animate the drop
                    const dropElapsed = currentTime - dropStartTime;
                    const dropProgress = Math.min(dropElapsed / dropDuration, 1);
                    // Ease out for smooth drop
                    const easedDrop = 1 - Math.pow(1 - dropProgress, 2);
                    height = -0.15 * easedDrop;
                }
            }
            
            self.ball.setPosition(x, y, height);
            
            if (t < 1 || (hasDropped && (currentTime - dropStartTime) < dropDuration)) {
                requestAnimationFrame(animate);
            } else {
                const finalPos = path[path.length - 1];
                const finalHeight = isHoled ? -0.15 : 0;
                self.ball.setPosition(finalPos.x, finalPos.y, finalHeight);
                self.isAnimating = false;
                if (self.onComplete) self.onComplete(finalPos, shotData);
            }
        };
        
        requestAnimationFrame(animate);
    }

    convertToScreenCoords(start, aimAngle, trajectoryResult, landingBehavior, holeData) {
        // Fixed ratio: 1 world unit = 4 yards (WORLD_TO_YARDS = 4)
        const yardToUnit = 1 / 4; // 0.25 world units per yard
        const aimRad = (aimAngle * Math.PI) / 180;
        const carryUnits = trajectoryResult.carry * yardToUnit;
        const lateralUnits = trajectoryResult.lateral * yardToUnit;
        const landX = start.x + Math.sin(aimRad) * carryUnits + Math.cos(aimRad) * lateralUnits;
        const landY = start.y - Math.cos(aimRad) * carryUnits + Math.sin(aimRad) * lateralUnits;
        return { land: { x: landX, y: landY }, yardToUnit };
    }

    getClubStats(golferData, clubName) {
        const shots = golferData.shotHistory[clubName] || [];
        if (shots.length === 0) return { missRate: 0.12, distStd: 5, dirStd: 5 };
        
        const normalShots = shots.filter(s => !s.miss);
        const missShots = shots.filter(s => s.miss);
        const missRate = shots.length > 0 ? missShots.length / shots.length : 0.12;
        if (normalShots.length === 0) return { missRate, distStd: 5, dirStd: 5 };
        
        const distAvg = normalShots.reduce((sum, s) => sum + s.y, 0) / normalShots.length;
        const dirAvg = normalShots.reduce((sum, s) => sum + s.x, 0) / normalShots.length;
        const distVariance = normalShots.reduce((sum, s) => sum + Math.pow(s.y - distAvg, 2), 0) / normalShots.length;
        const dirVariance = normalShots.reduce((sum, s) => sum + Math.pow(s.x - dirAvg, 2), 0) / normalShots.length;
        
        return { missRate, distStd: Math.sqrt(distVariance) || 3, dirStd: Math.sqrt(dirVariance) || 3, distAvg, dirAvg };
    }

    /**
     * Roll calculation with slope curve
     * Ball curves toward downhill as it slows - like a putt breaking
     */
    calculateSimpleRoll(landX, landY, start, rollUnits, rollDirection, holeData) {
        // Get shot direction
        const shotDirX = landX - start.x;
        const shotDirY = landY - start.y;
        const shotDist = Math.sqrt(shotDirX * shotDirX + shotDirY * shotDirY) || 1;
        
        // Normalize shot direction
        let rollDirX = shotDirX / shotDist;
        let rollDirY = shotDirY / shotDist;
        
        // Spin back reverses direction
        if (rollDirection < 0) {
            rollDirX = -rollDirX;
            rollDirY = -rollDirY;
        }
        
        // Get slope at landing spot (slope points UPHILL, so negate for downhill)
        const slope = getSlopeAt(holeData, landX, landY);
        const rollDist = Math.abs(rollUnits);
        
        // Ball curves toward downhill during roll (negate slope to get downhill direction)
        const slopeCurve = 0.3;
        
        // Calculate end position: start direction + curve toward downhill
        const finalX = landX + rollDirX * rollDist - slope.x * rollDist * slopeCurve;
        const finalY = landY + rollDirY * rollDist - slope.y * rollDist * slopeCurve;
        
        return { finalX, finalY };
    }

    animatePhysicsShot(start, land, final, trajectoryResult, landingBehavior, aimAngle, shotData, holeData) {
        this.isAnimating = true;
        
        const screenTrajectory = this.convertTrajectoryToScreen(start, aimAngle, trajectoryResult.trajectory, holeData);
        
        if (!screenTrajectory || screenTrajectory.length < 2) {
            this.ball.setPosition(final.x, final.y, 0);
            this.isAnimating = false;
            if (this.onComplete) this.onComplete(final, shotData);
            return;
        }
        
        const treeCollision = this.checkTrajectoryTreeCollision(screenTrajectory, holeData);
        const flightDuration = Math.max(1500, Math.min(trajectoryResult.flightTime * 800, 2500));
        const rollDuration = 500;
        
        const maxHeightYards = trajectoryResult.maxHeight;
        const carryYards = trajectoryResult.carry;
        const heightRatio = maxHeightYards / Math.max(carryYards, 1);
        const visualHeightMultiplier = Math.max(2, 1.5 + heightRatio * 3);
        
        const self = this;
        let animStartTime = null;
        
        function animateFlight(currentTime) {
            if (animStartTime === null) animStartTime = currentTime;
            
            const elapsed = currentTime - animStartTime;
            const t = Math.min(elapsed / flightDuration, 1);
            const maxIndex = screenTrajectory.length - 1;
            const trajIndex = Math.min(Math.floor(t * maxIndex), maxIndex);
            const nextIndex = Math.min(trajIndex + 1, maxIndex);
            const localT = maxIndex > 0 ? (t * maxIndex) - trajIndex : 0;
            
            const point = screenTrajectory[trajIndex];
            const nextPoint = screenTrajectory[nextIndex] || point;
            
            if (!point) {
                self.ball.setPosition(land.x, land.y, 0);
                self.isAnimating = false;
                if (self.onComplete) self.onComplete(final, shotData);
                return;
            }
            
            const x = point.x + (nextPoint.x - point.x) * localT;
            const y = point.y + (nextPoint.y - point.y) * localT;
            const heightYards = point.height + (nextPoint.height - point.height) * localT;
            const heightPixels = heightYards * visualHeightMultiplier;
            
            self.ball.setPosition(x, y, heightPixels);
            
            if (treeCollision && trajIndex >= treeCollision.index) {
                self.handleTreeCollision(treeCollision, shotData, holeData);
                return;
            }
            
            if (t < 1) {
                requestAnimationFrame(animateFlight);
            } else {
                self.ball.setPosition(land.x, land.y, 0);
                // Landed in water: no bounce or roll
                if (shotData.landedInWater) {
                    self.isAnimating = false;
                    if (self.onComplete) self.onComplete(final, shotData);
                    return;
                }
                // Bounce then roll, or just roll - both with slope influence
                if (landingBehavior.bounceHeight > 0.5) {
                    self.animateSimpleBounce(land, final, landingBehavior, rollDuration, shotData, holeData);
                } else {
                    self.animateCurvingRoll(land, final, rollDuration, shotData, holeData);
                }
            }
        }
        
        requestAnimationFrame(animateFlight);
    }

    checkTrajectoryTreeCollision(screenTrajectory, holeData) {
        if (!holeData.trees || holeData.trees.length === 0) return null;
        
        for (let i = 0; i < screenTrajectory.length; i++) {
            const point = screenTrajectory[i];
            const collision = checkTreeCollision(holeData, point.x, point.y, point.height);
            if (collision) {
                return { index: i, point, tree: collision.tree, deflection: collision.deflection };
            }
        }
        return null;
    }

    handleTreeCollision(collision, shotData, holeData) {
        const hitType = collision.hitType || 'foliage';
        console.log(`Ball hit tree ${hitType}!`, collision.tree.type);
        
        shotData.hitTree = true;
        shotData.treeType = collision.tree.type;
        shotData.treeHitType = hitType;
        
        // Speed drops to 20% immediately on tree contact
        // Foliage: 10% speed (ball barely moves), Trunk: 20% speed (slight bounce)
        const speedRetained = hitType === 'trunk' ? 0.20 : 0.10;
        
        // Calculate simple drop from hit point with reduced momentum
        const hitX = collision.point.x;
        const hitY = collision.point.y;
        const hitHeight = collision.point.height;
        
        // Deflection direction (away from tree center for trunk, slight for foliage)
        const deflectX = collision.deflection.x * speedRetained;
        const deflectY = collision.deflection.y * speedRetained;
        
        // Final position: hit point + small deflection based on remaining speed
        // Ball drops mostly straight down with slight movement
        const finalX = Math.max(0, Math.min(100, hitX + deflectX));
        const finalY = Math.max(0, Math.min(100, hitY + deflectY));
        
        this.animateTreeDrop(collision.point, { x: finalX, y: finalY }, shotData, holeData);
    }

    animateTreeDrop(hitPoint, dropPoint, shotData, holeData) {
        const startTime = performance.now();
        const dropDuration = 700;
        const startHeight = hitPoint.height;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / dropDuration, 1);
            const easeT = t * t; // Simple gravity
            
            const x = hitPoint.x + (dropPoint.x - hitPoint.x) * easeT;
            const y = hitPoint.y + (dropPoint.y - hitPoint.y) * easeT;
            const height = startHeight * (1 - easeT);
            
            this.ball.setPosition(x, y, height);
            
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.ball.setPosition(dropPoint.x, dropPoint.y, 0);
                this.isAnimating = false;
                if (this.onComplete) this.onComplete(dropPoint, shotData);
            }
        };
        
        requestAnimationFrame(animate);
    }

    convertTrajectoryToScreen(start, aimAngle, trajectory, holeData) {
        // Fixed ratio: 1 world unit = 4 yards (WORLD_TO_YARDS = 4)
        const yardToUnit = 1 / 4; // 0.25 world units per yard
        const aimRad = (aimAngle * Math.PI) / 180;
        
        return trajectory.map(point => ({
            x: start.x + Math.sin(aimRad) * point.z * yardToUnit + Math.cos(aimRad) * point.x * yardToUnit,
            y: start.y - Math.cos(aimRad) * point.z * yardToUnit + Math.sin(aimRad) * point.x * yardToUnit,
            height: point.y,
            t: point.t
        }));
    }

    /**
     * Bounce with slope reflection
     * Ball bounces in direction influenced by ground angle - like bouncing off a tilted surface
     */
    animateSimpleBounce(land, final, landingBehavior, totalDuration, shotData, holeData) {
        const bounceDuration = totalDuration * 0.3;
        const rollDuration = totalDuration * 0.7;
        const startTime = performance.now();
        
        // Get slope at landing point (slope points UPHILL, negate for downhill)
        const slope = getSlopeAt(holeData, land.x, land.y);
        
        // Calculate bounce direction - ball deflects based on slope
        const inDirX = final.x - land.x;
        const inDirY = final.y - land.y;
        const inDist = Math.sqrt(inDirX * inDirX + inDirY * inDirY) || 1;
        
        // Bounce deflects toward downhill - subtle effect (negate slope)
        const slopeStrength = Math.sqrt(slope.x * slope.x + slope.y * slope.y);
        const bounceDeflect = Math.min(slopeStrength * 0.15, 0.1);
        
        // Bounce end point: mostly forward, slight deflection toward downhill
        const bounceProgress = 0.25;
        const bounceEndX = land.x + (inDirX / inDist) * inDist * bounceProgress - slope.x * inDist * bounceDeflect;
        const bounceEndY = land.y + (inDirY / inDist) * inDist * bounceProgress - slope.y * inDist * bounceDeflect;
        
        const bounceHeight = Math.min(landingBehavior.bounceHeight * 0.3, 8);
        
        const animateBounce = (currentTime) => {
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / bounceDuration, 1);
            
            const x = land.x + (bounceEndX - land.x) * t;
            const y = land.y + (bounceEndY - land.y) * t;
            const height = bounceHeight * 4 * t * (1 - t);
            
            this.ball.setPosition(x, y, height);
            
            if (t < 1) {
                requestAnimationFrame(animateBounce);
            } else {
                this.animateCurvingRoll({ x: bounceEndX, y: bounceEndY }, final, rollDuration, shotData, holeData);
            }
        };
        
        requestAnimationFrame(animateBounce);
    }

    /**
     * Roll with physics-based simulation similar to putting
     * Ball reacts to slope, friction varies by terrain, and can roll into hole
     */
    animateCurvingRoll(start, end, duration, shotData, holeData) {
        // Calculate initial velocity from intended roll distance and direction
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const intendedDist = Math.sqrt(dx * dx + dy * dy);
        
        if (intendedDist < 0.01) {
            // No roll needed
            this.ball.setPosition(start.x, start.y, 0);
            this.isAnimating = false;
            if (this.onComplete) this.onComplete(start, shotData);
            return;
        }
        
        // Get terrain at landing spot for friction
        const terrain = getTerrainAt(holeData, start.x, start.y) || 'fairway';
        
        // Terrain friction - greens are fast, rough is slow
        const terrainFriction = {
            'green': 0.035,
            'fairway': 0.06,
            'rough': 0.15,
            'bunker': 0.25,
            'tee': 0.06
        };
        const baseFriction = terrainFriction[terrain] || 0.06;
        
        // Simulate the roll physics to get the path
        const rollPath = this.simulateGroundRoll(start, dx / intendedDist, dy / intendedDist, intendedDist, baseFriction, holeData);
        
        if (rollPath.inWater && rollPath.lastDryPoint) {
            shotData.rolledIntoWater = true;
            shotData.waterLastDryPoint = rollPath.lastDryPoint;
            const lastPt = rollPath.path[rollPath.path.length - 1];
            if (lastPt) shotData.waterPosition = { x: lastPt.x, y: lastPt.y };
        }
        
        // Animate along the simulated path
        const self = this;
        const animDuration = Math.max(500, Math.min(2000, rollPath.duration));
        let startTime = null;
        
        const holePos = holeData.hole;
        const holeRadius = HOLE.RADIUS_WORLD;
        let hasDropped = false;
        let dropStartTime = null;
        const dropDuration = 150;
        
        const animate = (currentTime) => {
            if (startTime === null) startTime = currentTime;
            
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / animDuration, 1);
            
            // Ease out for deceleration feel
            const easeT = 1 - Math.pow(1 - t, 2);
            
            // Find position along path
            const pathIndex = Math.min(Math.floor(easeT * (rollPath.path.length - 1)), rollPath.path.length - 1);
            const nextIndex = Math.min(pathIndex + 1, rollPath.path.length - 1);
            const localT = (easeT * (rollPath.path.length - 1)) - pathIndex;
            
            const point = rollPath.path[pathIndex];
            const nextPoint = rollPath.path[nextIndex];
            
            if (!point || !nextPoint) {
                const finalPos = rollPath.path[rollPath.path.length - 1];
                self.ball.setPosition(finalPos.x, finalPos.y, rollPath.holed ? -0.15 : 0);
                self.isAnimating = false;
                if (rollPath.holed) shotData.holed = true;
                if (self.onComplete) self.onComplete(finalPos, shotData);
                return;
            }
            
            const x = point.x + (nextPoint.x - point.x) * localT;
            const y = point.y + (nextPoint.y - point.y) * localT;
            
            // Handle hole drop animation
            let height = 0;
            if (rollPath.holed) {
                const distToHole = Math.sqrt((x - holePos.x) ** 2 + (y - holePos.y) ** 2);
                if (!hasDropped && distToHole < holeRadius) {
                    hasDropped = true;
                    dropStartTime = currentTime;
                }
                if (hasDropped) {
                    const dropElapsed = currentTime - dropStartTime;
                    const dropProgress = Math.min(dropElapsed / dropDuration, 1);
                    height = -0.15 * (1 - Math.pow(1 - dropProgress, 2));
                }
            }
            
            self.ball.setPosition(x, y, height);
            
            if (t < 1 || (hasDropped && (currentTime - dropStartTime) < dropDuration)) {
                requestAnimationFrame(animate);
            } else {
                const finalPos = rollPath.path[rollPath.path.length - 1];
                self.ball.setPosition(finalPos.x, finalPos.y, rollPath.holed ? -0.15 : 0);
                self.isAnimating = false;
                if (rollPath.holed) shotData.holed = true;
                if (self.onComplete) self.onComplete(finalPos, shotData);
            }
        };
        
        requestAnimationFrame(animate);
    }

    /**
     * Simulate ground roll with physics similar to putting
     * Returns path points for animation
     */
    simulateGroundRoll(start, dirX, dirY, intendedDist, baseFriction, holeData) {
        const path = [{ x: start.x, y: start.y }];
        
        // Hole position for capture detection
        const holePos = holeData.hole;
        const holeRadius = HOLE.RADIUS_WORLD;
        
        // Initial speed based on intended distance
        // Using similar formula to putt simulation
        const initialSpeed = Math.sqrt(2 * baseFriction * intendedDist) * 1.1;
        
        let velX = dirX * initialSpeed;
        let velY = dirY * initialSpeed;
        let x = start.x;
        let y = start.y;
        
        const dt = 0.016; // ~60fps
        const maxTime = 10;
        
        // Slope effects - similar to putt but slightly reduced for faster moving ball
        const parallelSlopeEffect = 0.012;
        const perpSlopeEffect = 0.004;
        
        let t = 0;
        let stepCount = 0;
        let holed = false;
        let inWater = false;
        let lastDryPoint = null;
        
        while (t < maxTime) {
            const speed = Math.sqrt(velX * velX + velY * velY);
            
            // Check for hole capture
            const distToHole = Math.sqrt((x - holePos.x) ** 2 + (y - holePos.y) ** 2);
            if (distToHole < holeRadius * 1.2) {
                if (distToHole < holeRadius && speed < HOLE.MAX_CAPTURE_SPEED) {
                    holed = true;
                    x = holePos.x;
                    y = holePos.y;
                    path.push({ x, y, speed: 0, holed: true });
                    break;
                } else if (distToHole < holeRadius && speed < HOLE.MAX_CAPTURE_SPEED * 2) {
                    // Lip out chance
                    if (Math.random() > HOLE.LIP_OUT_CHANCE) {
                        holed = true;
                        x = holePos.x;
                        y = holePos.y;
                        path.push({ x, y, speed: 0, holed: true });
                        break;
                    }
                }
            }
            
            // Stop when ball is essentially stopped
            if (speed < 0.0003) break;
            
            const prevX = x;
            const prevY = y;
            
            // Get slope at current position
            const slope = getSlopeAt(holeData, x, y);
            
            // Calculate direction of travel
            const travelDirX = velX / speed;
            const travelDirY = velY / speed;
            const perpX = -travelDirY;
            const perpY = travelDirX;
            
            // Slope vector (negative for downhill pull)
            const slopeVecX = -slope.x;
            const slopeVecY = -slope.y;
            
            // Project slope onto parallel and perpendicular components
            const parallelComponent = slopeVecX * travelDirX + slopeVecY * travelDirY;
            const perpComponent = slopeVecX * perpX + slopeVecY * perpY;
            
            // Apply slope effects
            const parallelAccel = parallelComponent * parallelSlopeEffect;
            const perpAccel = perpComponent * perpSlopeEffect;
            
            const slopeAccelX = parallelAccel * travelDirX + perpAccel * perpX;
            const slopeAccelY = parallelAccel * travelDirY + perpAccel * perpY;
            
            // Rolling friction - decreases at low speeds
            const speedFactor = Math.min(1, speed / 0.15);
            const effectiveFriction = baseFriction * (0.3 + 0.7 * speedFactor);
            const fricAccelX = -(velX / speed) * effectiveFriction;
            const fricAccelY = -(velY / speed) * effectiveFriction;
            
            // Update velocity and position
            velX += (slopeAccelX + fricAccelX) * dt;
            velY += (slopeAccelY + fricAccelY) * dt;
            x += velX * dt;
            y += velY * dt;
            
            // Stop if ball has rolled into water
            const rollTerrain = getTerrainAt(holeData, x, y);
            if (rollTerrain === 'water') {
                inWater = true;
                lastDryPoint = { x: prevX, y: prevY };
                path.push({ x, y, speed: 0, inWater: true });
                break;
            }
            
            // Store path points
            stepCount++;
            if (stepCount % 3 === 0) {
                path.push({ x, y, speed });
            }
            
            t += dt;
        }
        
        // Final hole check
        if (!holed) {
            const finalDistToHole = Math.sqrt((x - holePos.x) ** 2 + (y - holePos.y) ** 2);
            if (finalDistToHole < holeRadius) {
                holed = true;
                x = holePos.x;
                y = holePos.y;
            }
        }
        
        if (!holed) {
            path.push({ x, y, speed: 0 });
        }
        
        return {
            path,
            holed,
            inWater,
            lastDryPoint,
            duration: Math.max(500, Math.min(2500, t * 400))
        };
    }

    getCurveOffset(shape, distance) {
        const curveFactor = distance * 0.08;
        switch (shape) {
            case 'Draw': return -curveFactor;
            case 'Fade': return curveFactor;
            default: return 0;
        }
    }
}
