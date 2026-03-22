// Golfer Initiation Module
// Handles triggers for golfer-initiated conversation
// Validates: Requirement 10.1

import { Trend, ShotOutcome } from './resultState.js';

/**
 * Trigger types for golfer-initiated conversation
 * Validates: Requirement 10.1
 * @enum {string}
 */
export const GolferTrigger = {
    // Mental state triggers
    HIGH_PRESSURE: 'HIGH_PRESSURE',
    LOW_CONFIDENCE: 'LOW_CONFIDENCE',
    LOW_TRUST: 'LOW_TRUST',
    
    // Shot outcome triggers
    PERFECT_SHOT: 'PERFECT_SHOT',
    HIT_GREEN: 'HIT_GREEN',
    HIT_FAIRWAY: 'HIT_FAIRWAY',
    WATER_HAZARD: 'WATER_HAZARD',
    IN_BUNKER: 'IN_BUNKER',
    IN_ROUGH: 'IN_ROUGH',
    HIT_TREE: 'HIT_TREE',
    CONSECUTIVE_BAD_SHOTS: 'CONSECUTIVE_BAD_SHOTS',
    
    // Situational triggers
    FIRST_TEE: 'FIRST_TEE',
    DIFFICULT_HOLE: 'DIFFICULT_HOLE',
    LONG_PUTT_MADE: 'LONG_PUTT_MADE',
    MISSED_SHORT_PUTT: 'MISSED_SHORT_PUTT',
    GREAT_RECOVERY: 'GREAT_RECOVERY',
    CLOSE_TO_PIN: 'CLOSE_TO_PIN'
};

/**
 * Messages for each trigger type
 * These are what the golfer says when initiating conversation
 * Written to sound natural for a golfer talking to their caddy
 */
const GOLFER_MESSAGES = {
    [GolferTrigger.HIGH_PRESSURE]: [
        "Big moment here...",
        "Lot riding on this one.",
        "Can't afford to mess this up.",
        "Feeling tight over this.",
        "This is where it counts."
    ],
    [GolferTrigger.LOW_CONFIDENCE]: [
        "Not feeling it today.",
        "I've got nothing right now.",
        "Everything feels off.",
        "Can't find my swing.",
        "Just not my day."
    ],
    [GolferTrigger.LOW_TRUST]: [
        "You sure about that club?",
        "I don't know about that line.",
        "That doesn't look right to me.",
        "I'm thinking something different.",
        "Let me think about this one."
    ],
    [GolferTrigger.PERFECT_SHOT]: [
        "That's the one!",
        "Pure!",
        "Flushed it!",
        "That's what I'm looking for!",
        "Right out of the middle!",
        "Couldn't hit it better!"
    ],
    [GolferTrigger.HIT_GREEN]: [
        "On the dance floor!",
        "Found the green.",
        "That'll play.",
        "Green in reg, let's go.",
        "Now let's make this putt."
    ],
    [GolferTrigger.HIT_FAIRWAY]: [
        "Good start.",
        "In the short stuff.",
        "That's in play.",
        "Right where we want it.",
        "Set up nicely."
    ],
    [GolferTrigger.WATER_HAZARD]: [
        "Wet.",
        "In the drink.",
        "That's in the water.",
        "Gone.",
        "Splash.",
        "Can't believe I did that."
    ],
    [GolferTrigger.IN_BUNKER]: [
        "Beach time.",
        "Sandy.",
        "In the trap.",
        "Bunker. Great.",
        "Found the sand."
    ],
    [GolferTrigger.IN_ROUGH]: [
        "That's in the thick stuff.",
        "Deep rough.",
        "Gonna be a tough lie.",
        "In the cabbage.",
        "That's buried."
    ],
    [GolferTrigger.HIT_TREE]: [
        "Hit a tree. Of course.",
        "Timber.",
        "Got a branch.",
        "Kicked off a tree.",
        "Unlucky bounce there."
    ],
    [GolferTrigger.CONSECUTIVE_BAD_SHOTS]: [
        "Can't buy a good shot.",
        "Nothing's working.",
        "What is going on?",
        "I'm all over the place.",
        "This is rough."
    ],
    [GolferTrigger.FIRST_TEE]: [
        "Alright, let's do this.",
        "Here we go.",
        "Ready when you are.",
        "Let's get after it.",
        "Time to play."
    ],
    [GolferTrigger.DIFFICULT_HOLE]: [
        "This one's a beast.",
        "Tough hole coming up.",
        "Gotta be smart here.",
        "No room for error.",
        "Need a good game plan."
    ],
    [GolferTrigger.LONG_PUTT_MADE]: [
        "Get in! Yes!",
        "Drained it!",
        "From downtown!",
        "Never a doubt!",
        "Read it perfectly!"
    ],
    [GolferTrigger.MISSED_SHORT_PUTT]: [
        "How did that miss?",
        "Should've made that.",
        "Lipped out. Unreal.",
        "I had that.",
        "Ugh. Gave that one away."
    ],
    [GolferTrigger.GREAT_RECOVERY]: [
        "Saved it!",
        "Got away with one there.",
        "Nice escape.",
        "Made something out of nothing.",
        "That could've been worse."
    ],
    [GolferTrigger.CLOSE_TO_PIN]: [
        "That's tight!",
        "Stuck it!",
        "Pin high!",
        "Birdie look!",
        "That's a kick-in."
    ]
};

/**
 * Thresholds for trigger conditions
 */
const THRESHOLDS = {
    HIGH_PRESSURE: 80,
    LOW_CONFIDENCE: 30,
    LOW_TRUST: 25,
    CONSECUTIVE_BAD_SHOTS: 2
};

/**
 * Check all golfer initiation triggers
 * Returns an array of all active triggers
 * Validates: Requirement 10.1
 * @param {Object} state - The current result state (from resultState.js)
 * @param {Object} mental - The golfer's mental stats
 * @param {Object} gameContext - Game context (holeNumber, holePar, holeFeatures, etc.)
 * @returns {Array<string>} - Array of active GolferTrigger values
 */
export function checkGolferInitiationTriggers(state, mental, gameContext = {}) {
    const activeTriggers = [];
    
    // Check for first tee of the round
    if (gameContext.holeNumber === 1 && gameContext.isStartOfHole && gameContext.strokesOnHole === 0) {
        activeTriggers.push(GolferTrigger.FIRST_TEE);
    }
    
    // Check for consecutive bad shots
    if (state && state.recentShots) {
        const consecutiveBadShots = countConsecutiveBadShots(state.recentShots);
        if (consecutiveBadShots >= THRESHOLDS.CONSECUTIVE_BAD_SHOTS) {
            activeTriggers.push(GolferTrigger.CONSECUTIVE_BAD_SHOTS);
        }
    }
    
    // Mental state triggers
    if (mental && mental.pressure > THRESHOLDS.HIGH_PRESSURE) {
        activeTriggers.push(GolferTrigger.HIGH_PRESSURE);
    }
    if (mental && mental.confidence < THRESHOLDS.LOW_CONFIDENCE) {
        activeTriggers.push(GolferTrigger.LOW_CONFIDENCE);
    }
    if (mental && mental.trust < THRESHOLDS.LOW_TRUST) {
        activeTriggers.push(GolferTrigger.LOW_TRUST);
    }
    
    // Difficult hole trigger
    if (gameContext.isStartOfHole && isDifficultHole(gameContext)) {
        activeTriggers.push(GolferTrigger.DIFFICULT_HOLE);
    }
    
    // Shot outcome triggers
    if (state && state.previousShotOutcome) {
        switch (state.previousShotOutcome) {
            case ShotOutcome.Perfect:
                activeTriggers.push(GolferTrigger.PERFECT_SHOT);
                break;
            case ShotOutcome.HazardWater:
                activeTriggers.push(GolferTrigger.WATER_HAZARD);
                break;
            case ShotOutcome.HazardBunker:
                activeTriggers.push(GolferTrigger.IN_BUNKER);
                break;
        }
    }
    
    // Lie-based triggers from game context
    if (gameContext.currentLie) {
        switch (gameContext.currentLie) {
            case 'rough':
            case 'deep_rough':
                activeTriggers.push(GolferTrigger.IN_ROUGH);
                break;
            case 'bunker':
                if (!activeTriggers.includes(GolferTrigger.IN_BUNKER)) {
                    activeTriggers.push(GolferTrigger.IN_BUNKER);
                }
                break;
        }
    }
    
    // Special situation triggers from game context
    if (gameContext.hitTree) {
        activeTriggers.push(GolferTrigger.HIT_TREE);
    }
    if (gameContext.hitGreen) {
        activeTriggers.push(GolferTrigger.HIT_GREEN);
    }
    if (gameContext.hitFairway) {
        activeTriggers.push(GolferTrigger.HIT_FAIRWAY);
    }
    if (gameContext.longPuttMade) {
        activeTriggers.push(GolferTrigger.LONG_PUTT_MADE);
    }
    if (gameContext.missedShortPutt) {
        activeTriggers.push(GolferTrigger.MISSED_SHORT_PUTT);
    }
    if (gameContext.greatRecovery) {
        activeTriggers.push(GolferTrigger.GREAT_RECOVERY);
    }
    if (gameContext.closeToPin) {
        activeTriggers.push(GolferTrigger.CLOSE_TO_PIN);
    }
    
    return activeTriggers;
}

/**
 * Count consecutive bad shots from the end of the recent shots array
 * @param {Array<string>} recentShots - Array of recent ShotOutcome values
 * @returns {number} - Number of consecutive bad shots at the end
 */
function countConsecutiveBadShots(recentShots) {
    if (!recentShots || recentShots.length === 0) {
        return 0;
    }
    
    const badOutcomes = [
        ShotOutcome.MissDistanceShort,
        ShotOutcome.MissDistanceLong,
        ShotOutcome.MissDirectionLeft,
        ShotOutcome.MissDirectionRight,
        ShotOutcome.HazardBunker,
        ShotOutcome.HazardWater,
        ShotOutcome.BadLuck,
        ShotOutcome.Disaster
    ];
    
    let count = 0;
    // Count from the end of the array
    for (let i = recentShots.length - 1; i >= 0; i--) {
        if (badOutcomes.includes(recentShots[i])) {
            count++;
        } else {
            break; // Stop counting when we hit a non-bad shot
        }
    }
    
    return count;
}

/**
 * Check if a hole is considered difficult
 * @param {Object} gameContext - Game context with hole information
 * @returns {boolean} - True if the hole is difficult
 */
function isDifficultHole(gameContext) {
    // Par 5 is considered difficult
    if (gameContext.holePar >= 5) {
        return true;
    }
    
    // Check for water carry
    if (gameContext.hasWaterCarry) {
        return true;
    }
    
    // Check for narrow fairway
    if (gameContext.hasNarrowFairway) {
        return true;
    }
    
    // Check for other difficult features
    if (gameContext.holeFeatures) {
        const features = gameContext.holeFeatures;
        if (features.includes('water') || 
            features.includes('narrow') || 
            features.includes('dogleg') ||
            features.includes('island green')) {
            return true;
        }
    }
    
    return false;
}

/**
 * Get an appropriate golfer message for a trigger type
 * Validates: Requirement 10.1
 * @param {string} trigger - A GolferTrigger value
 * @returns {string} - A message for the golfer to say
 */
export function getGolferMessage(trigger) {
    const messages = GOLFER_MESSAGES[trigger];
    
    if (!messages || messages.length === 0) {
        return "Hey, can we talk?";
    }
    
    // Return a random message from the available options
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
}

/**
 * Determine if the golfer should initiate conversation
 * Returns the highest priority trigger if any are active, null otherwise
 * Validates: Requirement 10.1
 * @param {Object} state - The current result state
 * @param {Object} mental - The golfer's mental stats
 * @param {Object} gameContext - Game context
 * @returns {string|null} - The trigger type if golfer should initiate, null otherwise
 */
export function shouldGolferInitiate(state, mental, gameContext = {}) {
    const triggers = checkGolferInitiationTriggers(state, mental, gameContext);
    
    if (triggers.length === 0) {
        return null;
    }
    
    // Priority order for triggers (return highest priority)
    const priorityOrder = [
        GolferTrigger.FIRST_TEE,
        GolferTrigger.LONG_PUTT_MADE,
        GolferTrigger.MISSED_SHORT_PUTT,
        GolferTrigger.WATER_HAZARD,
        GolferTrigger.PERFECT_SHOT,
        GolferTrigger.CLOSE_TO_PIN,
        GolferTrigger.HIT_TREE,
        GolferTrigger.GREAT_RECOVERY,
        GolferTrigger.LOW_TRUST,
        GolferTrigger.LOW_CONFIDENCE,
        GolferTrigger.HIGH_PRESSURE,
        GolferTrigger.IN_BUNKER,
        GolferTrigger.IN_ROUGH,
        GolferTrigger.CONSECUTIVE_BAD_SHOTS,
        GolferTrigger.HIT_GREEN,
        GolferTrigger.HIT_FAIRWAY,
        GolferTrigger.DIFFICULT_HOLE
    ];
    
    for (const priority of priorityOrder) {
        if (triggers.includes(priority)) {
            return priority;
        }
    }
    
    return triggers[0];
}

/**
 * Get all trigger thresholds (for testing/debugging)
 * @returns {Object} - Copy of threshold values
 */
export function getTriggerThresholds() {
    return { ...THRESHOLDS };
}

