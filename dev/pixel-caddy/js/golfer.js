// Golfer stats and variability
import { shotClubs, rollMissType } from './clubs.js';
import { gaussianRandom } from './utils.js';

export const golfer = {
    name: 'Player',
    
    // Base tendencies (used for generating initial history and misses)
    distance: {
        spread: 0.06,
        bias: 0
    },
    direction: {
        spread: 2.5,
        bias: 0.5
    },
    shape: {
        curveSpread: 0.3,
        straightMissBias: 0.15,
        missRate: 0.12
    },
    missPattern: {
        pushFade: 0.35,
        pullDraw: 0.25,
        push: 0.15,
        pull: 0.10,
        block: 0.10,
        hook: 0.05
    },
    
    // Mental state
    mental: {
        confidence: 70,
        pressure: 30,
        focus: 75,
        trust: 50
    },
    
    // Shot history per club - each shot is { x: yards off target (+ = right), y: yards off target (+ = long), thisRound: bool }
    shotHistory: {},
    
    // Recent shots this round (for form tracking)
    recentShots: []
};

// Initialize shot history with generated data
export function initializeGolferHistory(golferData) {
    shotClubs.forEach(club => {
        golferData.shotHistory[club.name] = generateInitialShots(club, golferData, 20);
    });
}

function generateInitialShots(club, g, count) {
    const shots = [];
    
    // Scratch golfer dispersion - scales with club length
    const spreadFactor = club.yards / 280; // 1.0 for driver, ~0.25 for LW
    
    // Normal shots: within ~10y for driver, ~3y for wedges
    const normalDistSpread = 4 * spreadFactor + 1.5;
    const normalDirSpread = 4 * spreadFactor + 1.5;
    
    // Miss shots go further out
    const missDistSpread = 8 * spreadFactor + 4;
    const missDirSpread = 10 * spreadFactor + 5;
    
    // Right bias - scratch golfers often fade slightly
    const rightBias = 1.5 + spreadFactor * 2; // ~3.5y right for driver, ~2y for wedges
    
    for (let i = 0; i < count; i++) {
        const isMiss = Math.random() < g.shape.missRate;
        
        if (isMiss) {
            const missType = rollMissType(g.missPattern);
            const missPos = getMissPositionYards(missType, missDistSpread, missDirSpread);
            // Misses also biased right
            shots.push({ x: missPos.x + rightBias * 0.5, y: missPos.y, thisRound: false, miss: true });
        } else {
            // Add variety - some short, some long, some more right
            const distError = gaussianRandom() * normalDistSpread;
            const dirError = gaussianRandom() * normalDirSpread + rightBias;
            
            // Occasionally push a shot further right
            const extraRight = Math.random() < 0.2 ? (2 + Math.random() * 3) : 0;
            
            shots.push({ x: dirError + extraRight, y: distError, thisRound: false, miss: false });
        }
    }
    
    return shots;
}

function getMissPositionYards(missType, distSpread, dirSpread) {
    // Miss multipliers - how far outside normal dispersion
    const missOffsets = {
        pushFade: { x: 1.5, y: -0.8 },   // Right and short
        pullDraw: { x: -1.5, y: 0.6 },   // Left and long
        push: { x: 1.8, y: 0 },          // Right
        pull: { x: -1.8, y: 0 },         // Left
        block: { x: 2.2, y: -1.0 },      // Way right, short
        hook: { x: -2.0, y: 0.5 }        // Hard left, slightly long
    };
    const offset = missOffsets[missType] || { x: 0, y: 0 };
    
    // Add some randomness to miss position
    const randX = (0.5 + Math.random() * 0.5);
    const randY = (0.5 + Math.random() * 0.5);
    
    return { 
        x: dirSpread * offset.x * randX, 
        y: distSpread * offset.y * randY 
    };
}

// Record a shot result (called after sim completes)
export function recordShot(golferData, clubName, shotData) {
    if (!golferData.shotHistory[clubName]) {
        golferData.shotHistory[clubName] = [];
    }
    
    // Shot data contains: distanceError (yards long/short), directionError (yards left/right)
    golferData.shotHistory[clubName].push({
        x: shotData.directionError,  // positive = right
        y: shotData.distanceError,   // positive = long
        thisRound: true,
        miss: shotData.isMiss
    });
    
    // Keep last 30 shots max
    if (golferData.shotHistory[clubName].length > 30) {
        golferData.shotHistory[clubName].shift();
    }
}

// Calculate stats from shot history for a specific club
function getClubStats(golferData, clubName) {
    const shots = golferData.shotHistory[clubName] || [];
    
    if (shots.length === 0) {
        // Fallback to base tendencies if no history
        return { distAvg: 0, dirAvg: 0, distStd: 5, dirStd: 5, missRate: 0.12 };
    }
    
    const normalShots = shots.filter(s => !s.miss);
    const missShots = shots.filter(s => s.miss);
    
    const missRate = shots.length > 0 ? missShots.length / shots.length : 0.12;
    
    if (normalShots.length === 0) {
        return { distAvg: 0, dirAvg: 0, distStd: 5, dirStd: 5, missRate };
    }
    
    // Calculate averages (bias)
    const distAvg = normalShots.reduce((sum, s) => sum + s.y, 0) / normalShots.length;
    const dirAvg = normalShots.reduce((sum, s) => sum + s.x, 0) / normalShots.length;
    
    // Calculate standard deviations (spread)
    const distVariance = normalShots.reduce((sum, s) => sum + Math.pow(s.y - distAvg, 2), 0) / normalShots.length;
    const dirVariance = normalShots.reduce((sum, s) => sum + Math.pow(s.x - dirAvg, 2), 0) / normalShots.length;
    
    const distStd = Math.sqrt(distVariance) || 3;
    const dirStd = Math.sqrt(dirVariance) || 3;
    
    // Calculate miss stats if we have miss shots
    let missDistAvg = 0, missDirAvg = 0;
    if (missShots.length > 0) {
        missDistAvg = missShots.reduce((sum, s) => sum + s.y, 0) / missShots.length;
        missDirAvg = missShots.reduce((sum, s) => sum + s.x, 0) / missShots.length;
    }
    
    return { distAvg, dirAvg, distStd, dirStd, missRate, missDistAvg, missDirAvg };
}

// Apply golfer variability to shot parameters - uses actual shot history stats
export function applyVariability(params, golferStats) {
    const { club, power, shape, aimAngle } = params;
    
    // Get stats from actual shot history for this club
    const clubStats = getClubStats(golferStats, club.name);
    
    // Roll for shot quality
    const roll = Math.random();
    const isDisaster = roll < 0.01; // 1% chance of a really bad shot
    const isMiss = roll < clubStats.missRate;
    
    let distanceErrorYards = 0;
    let directionErrorYards = 0;
    let actualShape = shape;
    let curveMultiplier = 1;
    
    if (isDisaster) {
        // Disaster shot - big miss in a random direction
        const disasterType = Math.random();
        if (disasterType < 0.35) {
            // Big slice/push right
            directionErrorYards = 25 + Math.random() * 20;
            distanceErrorYards = -10 - Math.random() * 15;
            actualShape = 'Fade';
            curveMultiplier = 2.5;
        } else if (disasterType < 0.65) {
            // Big hook/pull left
            directionErrorYards = -25 - Math.random() * 20;
            distanceErrorYards = Math.random() * 10;
            actualShape = 'Draw';
            curveMultiplier = 2.5;
        } else if (disasterType < 0.85) {
            // Topped/thin - way short
            distanceErrorYards = -30 - Math.random() * 30;
            directionErrorYards = (Math.random() - 0.5) * 20;
            curveMultiplier = 0.3;
        } else {
            // Fat/chunk - very short
            distanceErrorYards = -40 - Math.random() * 20;
            directionErrorYards = (Math.random() - 0.5) * 15;
            curveMultiplier = 0.2;
        }
    } else if (isMiss) {
        // Regular miss shot - use miss pattern from history or generate based on tendencies
        if (clubStats.missDistAvg !== undefined && clubStats.missDirAvg !== undefined) {
            // Use actual miss tendencies with some randomness
            distanceErrorYards = clubStats.missDistAvg + gaussianRandom() * 8;
            directionErrorYards = clubStats.missDirAvg + gaussianRandom() * 8;
        } else {
            // Fallback to miss pattern
            const missType = rollMissType(golferStats.missPattern);
            const missResult = applyMiss(missType, aimAngle, shape);
            actualShape = missResult.shape;
            curveMultiplier = missResult.curveMultiplier;
            distanceErrorYards = gaussianRandom() * 10;
            directionErrorYards = gaussianRandom() * 12;
        }
    } else {
        // Normal shot - sample from the club's actual distribution
        distanceErrorYards = clubStats.distAvg + gaussianRandom() * clubStats.distStd;
        directionErrorYards = clubStats.dirAvg + gaussianRandom() * clubStats.dirStd;
        
        // Shape curve spread
        curveMultiplier = 1 + gaussianRandom() * golferStats.shape.curveSpread;
        
        // Straight shot bias - occasional unintended shape
        if (shape === 'Straight' && Math.abs(gaussianRandom()) > 1.5) {
            actualShape = golferStats.shape.straightMissBias > 0 ? 'Fade' : 'Draw';
            curveMultiplier = 0.5;
        }
    }
    
    // Convert distance error to power adjustment
    const intendedYards = club.yards * (power / 100);
    const actualYards = intendedYards + distanceErrorYards;
    const actualPower = Math.max(0, Math.min(100, (actualYards / club.yards) * 100));
    
    // Convert direction error to angle adjustment
    const anglePerYard = 180 / (Math.PI * intendedYards);
    const angleError = directionErrorYards * anglePerYard;
    const actualAngle = aimAngle + angleError;
    
    return {
        ...params,
        power: actualPower,
        aimAngle: actualAngle,
        shape: actualShape,
        curveMultiplier,
        isMiss: isMiss || isDisaster,
        distanceErrorYards,
        directionErrorYards
    };
}

const missAngles = {
    pushFade: { angle: 3, shape: 'Fade', curveMultiplier: 1.5 },
    pullDraw: { angle: -3, shape: 'Draw', curveMultiplier: 1.5 },
    push: { angle: 4, shape: 'Straight', curveMultiplier: 0 },
    pull: { angle: -4, shape: 'Straight', curveMultiplier: 0 },
    block: { angle: 8, shape: 'Fade', curveMultiplier: 0.8 },
    hook: { angle: -6, shape: 'Draw', curveMultiplier: 2.5 }
};

function applyMiss(missType, aimAngle, intendedShape) {
    const miss = missAngles[missType];
    if (!miss) return { angle: aimAngle, shape: intendedShape, curveMultiplier: 1 };
    return { angle: aimAngle + miss.angle, shape: miss.shape, curveMultiplier: miss.curveMultiplier };
}
