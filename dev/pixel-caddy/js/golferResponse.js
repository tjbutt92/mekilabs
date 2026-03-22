// Golfer Response Module
// Handles response and ignore effects for golfer-initiated conversations
// Validates: Requirements 10.4, 10.5

import { Trend, getTrend, getResultState } from './resultState.js';
import { modifyStat } from './mentalStats.js';
import { GolferTrigger } from './golferInitiation.js';

/**
 * Base Trust bonus when responding to golfer-initiated conversation
 * Validates: Requirement 10.4
 */
const RESPONSE_TRUST_BONUS = 2;

/**
 * Trust bonus when responding during Cold trend
 * Validates: Requirement 10.4 - "if trend is Cold, Trust bonus scales to +4"
 */
const RESPONSE_TRUST_BONUS_COLD = 4;

/**
 * Base Pressure penalties for ignoring golfer bubble by context
 * Validates: Requirement 10.5 - "Pressure +3 to +6 depending on context"
 */
const IGNORE_PRESSURE_PENALTIES = {
    // Low penalty - positive moments or casual
    [GolferTrigger.FIRST_TEE]: 3,
    [GolferTrigger.PERFECT_SHOT]: 2,
    [GolferTrigger.HIT_GREEN]: 2,
    [GolferTrigger.HIT_FAIRWAY]: 2,
    [GolferTrigger.LONG_PUTT_MADE]: 2,
    [GolferTrigger.GREAT_RECOVERY]: 2,
    [GolferTrigger.CLOSE_TO_PIN]: 2,
    
    // Medium penalty - situational
    [GolferTrigger.DIFFICULT_HOLE]: 4,
    [GolferTrigger.IN_BUNKER]: 4,
    [GolferTrigger.IN_ROUGH]: 4,
    [GolferTrigger.HIT_TREE]: 4,
    
    // Higher penalty - needs support
    [GolferTrigger.CONSECUTIVE_BAD_SHOTS]: 5,
    [GolferTrigger.HIGH_PRESSURE]: 5,
    [GolferTrigger.LOW_CONFIDENCE]: 5,
    [GolferTrigger.MISSED_SHORT_PUTT]: 5,
    
    // High penalty - emotional/relationship
    [GolferTrigger.WATER_HAZARD]: 6,
    [GolferTrigger.LOW_TRUST]: 6
};

/**
 * Default Pressure penalty when trigger type is unknown
 */
const DEFAULT_IGNORE_PRESSURE_PENALTY = 4;

/**
 * Cold trend scaling multiplier for ignore penalties
 * Validates: Requirement 10.5 - "if trend is Cold, penalty scales by 1.5x"
 */
const COLD_TREND_IGNORE_SCALING = 1.5;

/**
 * Handle player responding to a golfer-initiated conversation
 * Applies bonus Trust +2 (scaled to +4 when Cold)
 * Validates: Requirement 10.4
 * @param {string} triggerType - The GolferTrigger that initiated the conversation
 * @param {Object} [state] - Optional result state (defaults to current state)
 * @returns {Object} - The applied effects { trust: number }
 */
export function handleGolferResponse(triggerType, state = null) {
    const currentState = state || getResultState();
    const trend = currentState.trend || getTrend();
    
    // Calculate Trust bonus based on trend
    // Validates: Requirement 10.4
    let trustBonus = RESPONSE_TRUST_BONUS;
    
    if (trend === Trend.Cold) {
        trustBonus = RESPONSE_TRUST_BONUS_COLD;
    }
    
    // Apply the Trust bonus
    modifyStat('trust', trustBonus);
    
    console.log(`Golfer response: Applied Trust +${trustBonus} (trend: ${trend}, trigger: ${triggerType})`);
    
    return { trust: trustBonus };
}

/**
 * Handle player ignoring a golfer-initiated conversation
 * Applies Pressure +3 to +6 depending on context (scaled by 1.5x when Cold)
 * Validates: Requirement 10.5
 * @param {string} triggerType - The GolferTrigger that initiated the conversation
 * @param {Object} [state] - Optional result state (defaults to current state)
 * @returns {Object} - The applied effects { pressure: number }
 */
export function handleGolferIgnore(triggerType, state = null) {
    const currentState = state || getResultState();
    const trend = currentState.trend || getTrend();
    
    // Get base Pressure penalty based on trigger context
    // Validates: Requirement 10.5 - "Pressure +3 to +6 depending on context"
    let pressurePenalty = IGNORE_PRESSURE_PENALTIES[triggerType] || DEFAULT_IGNORE_PRESSURE_PENALTY;
    
    // Scale penalty by 1.5x when trend is Cold
    // Validates: Requirement 10.5 - "if trend is Cold, penalty scales by 1.5x"
    if (trend === Trend.Cold) {
        pressurePenalty = Math.round(pressurePenalty * COLD_TREND_IGNORE_SCALING);
    }
    
    // Apply the Pressure penalty
    modifyStat('pressure', pressurePenalty);
    
    console.log(`Golfer ignored: Applied Pressure +${pressurePenalty} (trend: ${trend}, trigger: ${triggerType})`);
    
    return { pressure: pressurePenalty };
}

/**
 * Calculate the response Trust bonus without applying it
 * Useful for previewing effects
 * @param {Object} [state] - Optional result state
 * @returns {number} - The Trust bonus that would be applied
 */
export function calculateResponseBonus(state = null) {
    const currentState = state || getResultState();
    const trend = currentState.trend || getTrend();
    
    return trend === Trend.Cold ? RESPONSE_TRUST_BONUS_COLD : RESPONSE_TRUST_BONUS;
}

/**
 * Calculate the ignore Pressure penalty without applying it
 * Useful for previewing effects
 * @param {string} triggerType - The GolferTrigger type
 * @param {Object} [state] - Optional result state
 * @returns {number} - The Pressure penalty that would be applied
 */
export function calculateIgnorePenalty(triggerType, state = null) {
    const currentState = state || getResultState();
    const trend = currentState.trend || getTrend();
    
    let penalty = IGNORE_PRESSURE_PENALTIES[triggerType] || DEFAULT_IGNORE_PRESSURE_PENALTY;
    
    if (trend === Trend.Cold) {
        penalty = Math.round(penalty * COLD_TREND_IGNORE_SCALING);
    }
    
    return penalty;
}

/**
 * Get the ignore pressure penalties configuration (for testing)
 * @returns {Object} - Copy of the penalties configuration
 */
export function getIgnorePenaltiesConfig() {
    return { ...IGNORE_PRESSURE_PENALTIES };
}
