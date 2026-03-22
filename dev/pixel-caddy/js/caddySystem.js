// Caddy System Core Module
// Central coordinator for timing windows, dialogue options, and stat effects
// Validates: Requirements 2.1, 2.2, 2.3, 2.4

import { postShotOptions } from './dialogueOptions.js';
import { forceCloseDialoguePanel, isDialoguePanelOpen } from './dialoguePanel.js';
import { forceCloseGolferBubble, isGolferBubbleVisible } from './golferBubble.js';

/**
 * Timing windows for caddy interactions
 * Validates: Requirement 2.1
 * @enum {string}
 */
export const TimingWindow = {
    StartOfHole: 'StartOfHole',
    PreShot: 'PreShot',
    PostShot: 'PostShot',
    EndOfHole: 'EndOfHole',
    None: 'None'
};

// Internal state
let currentWindow = TimingWindow.None;
let hasInteracted = false;

// Edge case handling: Track if interaction is in progress
// Validates: Requirements 2.4, 3.5, 3.6, 3.7
let isInteractionInProgress = false;

/**
 * Set the current timing window
 * Resets interaction tracking when window changes
 * Edge case handling: Closes any open dialogue panel or golfer bubble when window changes
 * Validates: Requirements 2.1, 2.4, 3.5, 3.6, 3.7
 * @param {string} window - A TimingWindow value
 */
export function setTimingWindow(window) {
    if (!Object.values(TimingWindow).includes(window)) {
        console.warn(`Unknown timing window: ${window}`);
        return;
    }
    
    // Reset interaction tracking when window changes
    if (window !== currentWindow) {
        // Edge case: Force close any open UI elements when timing window changes
        // This prevents stale dialogue panels or bubbles from persisting
        if (isDialoguePanelOpen()) {
            console.log('Timing window changed, force closing dialogue panel');
            forceCloseDialoguePanel();
        }
        if (isGolferBubbleVisible()) {
            console.log('Timing window changed, force closing golfer bubble');
            forceCloseGolferBubble();
        }
        
        hasInteracted = false;
        isInteractionInProgress = false;
    }
    
    currentWindow = window;
}

/**
 * Get the current timing window
 * Validates: Requirements 2.1, 2.2, 2.3
 * @returns {string} - The current TimingWindow value
 */
export function getCurrentWindow() {
    return currentWindow;
}

/**
 * Check if an interaction has occurred in the current window
 * Validates: Requirement 2.4
 * @returns {boolean} - True if interaction has occurred
 */
export function hasInteractedInWindow() {
    return hasInteracted;
}

/**
 * Mark that an interaction has occurred in the current window
 * After this is called, no more interactions are allowed until window changes
 * Validates: Requirement 2.4
 */
export function markInteractionComplete() {
    hasInteracted = true;
}

/**
 * Reset interaction tracking for the current window
 * Called when window changes or for testing purposes
 */
export function resetWindowInteraction() {
    hasInteracted = false;
}

/**
 * Check if interaction is currently allowed
 * Interaction is allowed when a window is active and no interaction has occurred yet
 * Edge case handling: Also checks if an interaction is currently in progress
 * Validates: Requirement 2.4
 * @returns {boolean} - True if interaction is allowed
 */
export function canInteract() {
    return currentWindow !== TimingWindow.None && !hasInteracted && !isInteractionInProgress;
}

/**
 * Mark that an interaction is starting (dialogue panel opening)
 * Prevents multiple interactions from starting simultaneously
 * Validates: Requirement 2.4
 */
export function markInteractionStarted() {
    isInteractionInProgress = true;
}

/**
 * Mark that an interaction has ended (dialogue panel closed)
 * Called after dialogue panel closes, regardless of selection
 * Validates: Requirement 2.4
 */
export function markInteractionEnded() {
    isInteractionInProgress = false;
}

/**
 * Check if an interaction is currently in progress
 * @returns {boolean} - True if interaction is in progress
 */
export function isInteracting() {
    return isInteractionInProgress;
}

/**
 * Reset the caddy system state (for testing or new round)
 * Also closes any open UI elements
 */
export function resetCaddySystem() {
    // Force close any open UI elements
    if (isDialoguePanelOpen()) {
        forceCloseDialoguePanel();
    }
    if (isGolferBubbleVisible()) {
        forceCloseGolferBubble();
    }
    
    currentWindow = TimingWindow.None;
    hasInteracted = false;
    isInteractionInProgress = false;
}

/**
 * Handle silence (player stayed silent after a shot)
 * Applies appropriate penalties based on the previous shot outcome and trend
 * Validates: Requirements 8.2, 8.6, 8.8
 * @param {Object} state - The current result state
 * @param {Function} modifyStatFn - Function to modify stats
 * @returns {Object|null} - The applied effects or null if no penalty
 */
export function handleSilence(state, modifyStatFn) {
    if (!state || !state.previousShotOutcome) {
        return null;
    }
    
    // Get the options for the previous shot outcome
    const outcomeOptions = postShotOptions[state.previousShotOutcome];
    
    if (!outcomeOptions || outcomeOptions.length === 0) {
        return null;
    }
    
    // Find an option with silence effects defined
    const optionWithSilence = outcomeOptions.find(opt => opt.silenceEffects);
    
    if (!optionWithSilence || !optionWithSilence.silenceEffects) {
        return null;
    }
    
    // Calculate scaled silence effects
    const silenceEffects = { ...optionWithSilence.silenceEffects };
    const scalingRules = optionWithSilence.silenceScalingRules || [];
    
    // Apply scaling rules
    for (const rule of scalingRules) {
        if (rule.stat in silenceEffects && rule.condition(state)) {
            if (rule.scale !== undefined) {
                silenceEffects[rule.stat] = Math.round(silenceEffects[rule.stat] * rule.scale);
            }
        }
    }
    
    // Apply the silence effects
    if (modifyStatFn) {
        for (const [stat, value] of Object.entries(silenceEffects)) {
            modifyStatFn(stat, value);
        }
    }
    
    console.log('Applied silence penalties:', silenceEffects);
    
    return silenceEffects;
}
