// Result State Tracker Module
// Tracks shot outcomes and calculates trend indicators for the caddy system
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5

/**
 * Shot outcome categories
 * Validates: Requirement 5.2
 * @enum {string}
 */
export const ShotOutcome = {
    Perfect: 'Perfect',
    Good: 'Good',
    Acceptable: 'Acceptable',
    MissDistanceShort: 'MissDistanceShort',
    MissDistanceLong: 'MissDistanceLong',
    MissDirectionLeft: 'MissDirectionLeft',
    MissDirectionRight: 'MissDirectionRight',
    HazardBunker: 'HazardBunker',
    HazardWater: 'HazardWater',
    BadLuck: 'BadLuck',
    Disaster: 'Disaster'
};

/**
 * Trend indicators
 * Validates: Requirement 5.3
 * @enum {string}
 */
export const Trend = {
    Hot: 'Hot',      // 3+ good shots in last 5
    Steady: 'Steady', // mixed results
    Cold: 'Cold'     // 3+ poor shots in last 5
};

// Outcomes considered "good" for trend calculation
const GOOD_OUTCOMES = [
    ShotOutcome.Perfect,
    ShotOutcome.Good,
    ShotOutcome.Acceptable
];

// Outcomes considered "bad" for trend calculation
const BAD_OUTCOMES = [
    ShotOutcome.MissDistanceShort,
    ShotOutcome.MissDistanceLong,
    ShotOutcome.MissDirectionLeft,
    ShotOutcome.MissDirectionRight,
    ShotOutcome.HazardBunker,
    ShotOutcome.HazardWater,
    ShotOutcome.BadLuck,
    ShotOutcome.Disaster
];

// Maximum number of shots to track for trend calculation
const MAX_RECENT_SHOTS = 5;

// Threshold for determining Hot/Cold trend
const TREND_THRESHOLD = 3;

// Internal state
let resultState = {
    previousHoleScore: 0,      // relative to par
    previousShotOutcome: null, // most recent shot outcome
    recentShots: []            // last 5 shots for trend calculation
};

/**
 * Record a shot result and update the result state
 * Validates: Requirement 5.1
 * @param {string} outcome - A ShotOutcome value
 */
export function recordShotResult(outcome) {
    if (!Object.values(ShotOutcome).includes(outcome)) {
        console.warn(`Unknown shot outcome: ${outcome}`);
        return;
    }
    
    resultState.previousShotOutcome = outcome;
    resultState.recentShots.push(outcome);
    
    // Keep only the last MAX_RECENT_SHOTS shots
    if (resultState.recentShots.length > MAX_RECENT_SHOTS) {
        resultState.recentShots.shift();
    }
}

/**
 * Record hole completion result
 * Validates: Requirement 5.1
 * @param {number} scoreRelativeToPar - Score relative to par (e.g., -1 for birdie, +1 for bogey)
 */
export function recordHoleResult(scoreRelativeToPar) {
    resultState.previousHoleScore = scoreRelativeToPar;
}

/**
 * Get the current trend based on recent shot history
 * Hot: 3+ good shots in last 5
 * Cold: 3+ bad shots in last 5
 * Steady: mixed results
 * Validates: Requirement 5.3
 * @returns {string} - A Trend value
 */
export function getTrend() {
    const recentShots = resultState.recentShots;
    
    if (recentShots.length === 0) {
        return Trend.Steady;
    }
    
    const goodCount = recentShots.filter(shot => GOOD_OUTCOMES.includes(shot)).length;
    const badCount = recentShots.filter(shot => BAD_OUTCOMES.includes(shot)).length;
    
    if (goodCount >= TREND_THRESHOLD) {
        return Trend.Hot;
    } else if (badCount >= TREND_THRESHOLD) {
        return Trend.Cold;
    }
    
    return Trend.Steady;
}


/**
 * Calculate effect scaling based on result state and trend
 * Used to scale dialogue option effects based on golfer's current form
 * Validates: Requirements 5.4, 5.5
 * @param {string} effectType - Type of effect ('encouragement', 'calming', 'positive', 'negative')
 * @param {string} [trend] - Optional trend override, defaults to current trend
 * @returns {number} - Scaling multiplier (1.0 = no scaling)
 */
export function getEffectScaling(effectType, trend) {
    const currentTrend = trend || getTrend();
    
    switch (effectType) {
        case 'encouragement':
        case 'positive':
            // Encouragement is more effective when struggling (Cold trend)
            // Validates: Requirement 5.5
            if (currentTrend === Trend.Cold) {
                return 1.25; // 25% more effective
            } else if (currentTrend === Trend.Hot) {
                return 1.0; // Normal effectiveness
            }
            return 1.0;
            
        case 'calming':
            // Calming advice is more effective under pressure
            // Validates: Requirement 5.5
            if (currentTrend === Trend.Cold) {
                return 1.25; // More receptive when struggling
            }
            return 1.0;
            
        case 'momentum':
            // Momentum effects scale up when hot, down when cold
            if (currentTrend === Trend.Hot) {
                return 1.5; // 50% more effective
            } else if (currentTrend === Trend.Cold) {
                return 0.5; // 50% less effective
            }
            return 1.0;
            
        default:
            return 1.0;
    }
}

/**
 * Get the previous shot outcome
 * @returns {string|null} - The previous ShotOutcome or null if no shots recorded
 */
export function getPreviousShotOutcome() {
    return resultState.previousShotOutcome;
}

/**
 * Get the previous hole score relative to par
 * @returns {number} - Score relative to par
 */
export function getPreviousHoleScore() {
    return resultState.previousHoleScore;
}

/**
 * Get the recent shots array (for testing/debugging)
 * @returns {string[]} - Copy of recent shots array
 */
export function getRecentShots() {
    return [...resultState.recentShots];
}

/**
 * Get the full result state (for testing/debugging)
 * @returns {Object} - Copy of the result state
 */
export function getResultState() {
    return {
        previousHoleScore: resultState.previousHoleScore,
        previousShotOutcome: resultState.previousShotOutcome,
        recentShots: [...resultState.recentShots],
        trend: getTrend()
    };
}

/**
 * Reset the result state (for testing or new round)
 */
export function resetResultState() {
    resultState = {
        previousHoleScore: 0,
        previousShotOutcome: null,
        recentShots: []
    };
}

/**
 * Check if an outcome is considered "good"
 * @param {string} outcome - A ShotOutcome value
 * @returns {boolean} - True if the outcome is good
 */
export function isGoodOutcome(outcome) {
    return GOOD_OUTCOMES.includes(outcome);
}

/**
 * Check if an outcome is considered "bad"
 * @param {string} outcome - A ShotOutcome value
 * @returns {boolean} - True if the outcome is bad
 */
export function isBadOutcome(outcome) {
    return BAD_OUTCOMES.includes(outcome);
}
