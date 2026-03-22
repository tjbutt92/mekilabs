// Mental Stats Module
// Provides stat manipulation functions for the caddy system
// Validates: Requirements 12.1, 12.2, 12.3, 12.4

import { golfer } from './golfer.js';
import { updateStatsHUD } from './statsHUD.js';

// Baseline values for stats that reset each hole
const BASELINE = {
    confidence: 70,
    pressure: 30,
    focus: 75
};

// Stats that persist across holes (not reset)
const PERSISTENT_STATS = ['trust'];

// Pending carryover effects to apply at next hole start
let pendingCarryover = {
    confidence: 0,
    pressure: 0,
    focus: 0
};

/**
 * Clamp a value to the valid stat range [0, 100]
 * Validates: Requirement 12.4
 * @param {number} value - The value to clamp
 * @returns {number} - The clamped value
 */
function clamp(value) {
    return Math.max(0, Math.min(100, value));
}

/**
 * Modify a mental stat by a delta amount, clamping to [0, 100]
 * Validates: Requirement 12.4
 * @param {string} stat - The stat to modify ('confidence', 'pressure', 'focus', 'trust')
 * @param {number} delta - The amount to add (can be negative)
 */
export function modifyStat(stat, delta) {
    if (!(stat in golfer.mental)) {
        console.warn(`Unknown mental stat: ${stat}`);
        return;
    }
    
    const currentValue = golfer.mental[stat];
    golfer.mental[stat] = clamp(currentValue + delta);
    
    // Update Stats HUD to reflect the change
    // Validates: Requirement 4.5
    updateStatsHUD(golfer.mental);
}

/**
 * Apply carryover effects at hole start
 * These effects modify the baseline values for the next hole
 * Validates: Requirement 12.3
 * @param {Object} effects - Object with stat names as keys and delta values
 * @param {number} [effects.confidence] - Confidence carryover modifier
 * @param {number} [effects.pressure] - Pressure carryover modifier
 * @param {number} [effects.focus] - Focus carryover modifier
 */
export function applyCarryover(effects) {
    if (!effects || typeof effects !== 'object') {
        return;
    }
    
    // Accumulate carryover effects for non-persistent stats only
    for (const stat of Object.keys(effects)) {
        if (stat in pendingCarryover && !PERSISTENT_STATS.includes(stat)) {
            pendingCarryover[stat] += effects[stat];
        }
    }
}

/**
 * Reset stats to baseline at hole start, applying any pending carryover effects
 * Trust persists throughout the round and is NOT reset
 * Validates: Requirements 12.1, 12.2, 12.3
 */
export function resetToBaseline() {
    // Reset confidence, pressure, focus to baseline + carryover
    // Trust is NOT reset (persists throughout round)
    for (const stat of Object.keys(BASELINE)) {
        if (!PERSISTENT_STATS.includes(stat)) {
            const baselineValue = BASELINE[stat];
            const carryoverValue = pendingCarryover[stat] || 0;
            golfer.mental[stat] = clamp(baselineValue + carryoverValue);
        }
    }
    
    // Clear pending carryover after applying
    pendingCarryover = {
        confidence: 0,
        pressure: 0,
        focus: 0
    };
    
    // Update Stats HUD to reflect the reset
    // Validates: Requirement 4.5
    updateStatsHUD(golfer.mental);
}

/**
 * Get the current value of a mental stat
 * @param {string} stat - The stat to get
 * @returns {number} - The current stat value
 */
export function getStat(stat) {
    return golfer.mental[stat];
}

/**
 * Get all current mental stats
 * @returns {Object} - Copy of current mental stats
 */
export function getAllStats() {
    return { ...golfer.mental };
}

/**
 * Get pending carryover effects (for testing/debugging)
 * @returns {Object} - Copy of pending carryover effects
 */
export function getPendingCarryover() {
    return { ...pendingCarryover };
}

/**
 * Clear pending carryover without applying (for testing)
 */
export function clearPendingCarryover() {
    pendingCarryover = {
        confidence: 0,
        pressure: 0,
        focus: 0
    };
}
