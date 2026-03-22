// Golfer Conversation Coordinator Module
// Integrates golfer initiation triggers with bubble display and response handling
// Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5

import { shouldGolferInitiate, getGolferMessage, GolferTrigger } from './golferInitiation.js';
import { showGolferBubble, hideGolferBubble, isGolferBubbleVisible } from './golferBubble.js';
import { handleGolferResponse, handleGolferIgnore } from './golferResponse.js';
import { getResultState } from './resultState.js';
import { showDialoguePanel } from './dialoguePanel.js';
import { getOptionsForWindow, calculateAllScaledEffects, getGolferInitiatedOptions } from './dialogueOptions.js';
import { modifyStat, applyCarryover } from './mentalStats.js';
import { markInteractionComplete, getCurrentWindow, TimingWindow } from './caddySystem.js';
import { golfer } from './golfer.js';

// Track the current golfer-initiated trigger for response/ignore handling
let currentGolferTrigger = null;

// Track if we've already checked for golfer initiation in the current context
let lastCheckContext = null;

// Cooldown to prevent rapid re-triggering (in milliseconds)
const INITIATION_COOLDOWN = 5000;
let lastInitiationTime = 0;

/**
 * Check if golfer should initiate conversation and show bubble if so
 * Call this at key game moments (after shots, at hole start, etc.)
 * Validates: Requirements 10.1, 10.2
 * @param {Object} mental - The golfer's mental stats
 * @param {Object} gameContext - Game context (holeNumber, holePar, isStartOfHole, etc.)
 * @returns {boolean} - True if golfer initiated conversation
 */
export function checkAndShowGolferInitiation(mental, gameContext = {}) {
    // Don't trigger if bubble is already visible
    if (isGolferBubbleVisible()) {
        return false;
    }
    
    // Cooldown check to prevent rapid re-triggering
    const now = Date.now();
    if (now - lastInitiationTime < INITIATION_COOLDOWN) {
        return false;
    }
    
    // Get current result state
    const state = getResultState();
    
    // Check if golfer should initiate
    // Validates: Requirement 10.1
    const trigger = shouldGolferInitiate(state, mental, gameContext);
    
    if (!trigger) {
        return false;
    }
    
    // Create a context key to avoid duplicate triggers for the same situation
    const contextKey = `${trigger}-${gameContext.holeNumber || 0}-${gameContext.strokesOnHole || 0}`;
    if (contextKey === lastCheckContext) {
        return false;
    }
    lastCheckContext = contextKey;
    
    // Store the trigger for response/ignore handling
    currentGolferTrigger = trigger;
    lastInitiationTime = now;
    
    // Get the golfer's message
    // Validates: Requirement 10.1
    const message = getGolferMessage(trigger);
    
    // Show the golfer bubble
    // Validates: Requirements 10.2, 10.3
    showGolferBubble(
        message,
        () => handleGolferBubbleTap(trigger),
        () => handleGolferBubbleIgnore(trigger)
    );
    
    console.log(`Golfer initiated conversation: ${trigger} - "${message}"`);
    
    return true;
}

/**
 * Handle when player taps the golfer bubble
 * Opens dialogue panel with appropriate options and applies response bonus
 * Validates: Requirements 10.3, 10.4
 * @param {string} trigger - The GolferTrigger that initiated the conversation
 */
function handleGolferBubbleTap(trigger) {
    // Apply the response Trust bonus
    // Validates: Requirement 10.4
    const responseEffects = handleGolferResponse(trigger);
    
    const state = getResultState();
    
    // Get contextual options specific to this trigger
    const options = getGolferInitiatedOptions(trigger);
    
    if (options.length === 0) {
        // Fallback to generic pre-shot options if no specific options
        const currentWindow = getCurrentWindow();
        const fallbackOptions = currentWindow !== TimingWindow.None 
            ? getOptionsForWindow(currentWindow, state)
            : getOptionsForWindow(TimingWindow.PreShot, state);
        
        if (fallbackOptions.length === 0) {
            markInteractionComplete();
            console.log('No dialogue options available for golfer-initiated conversation');
            return;
        }
        
        showDialoguePanel(
            fallbackOptions,
            (selectedOptionId) => handleGolferDialogueSelection(selectedOptionId, fallbackOptions, state, trigger),
            golfer.mental,
            () => {
                markInteractionComplete();
            }
        );
        return;
    }
    
    // Show dialogue panel with trigger-specific options
    // Validates: Requirement 10.3
    showDialoguePanel(
        options,
        (selectedOptionId) => handleGolferDialogueSelection(selectedOptionId, options, state, trigger),
        golfer.mental,
        () => {
            // Silence callback - no additional penalty since response bonus already applied
            markInteractionComplete();
        }
    );
}

/**
 * Handle when player ignores the golfer bubble (auto-dismissed)
 * Applies Pressure penalty based on context
 * Validates: Requirement 10.5
 * @param {string} trigger - The GolferTrigger that initiated the conversation
 */
function handleGolferBubbleIgnore(trigger) {
    // Apply the ignore Pressure penalty
    // Validates: Requirement 10.5
    const ignoreEffects = handleGolferIgnore(trigger);
    
    // Clear the current trigger
    currentGolferTrigger = null;
    
    console.log(`Player ignored golfer bubble (${trigger})`);
}

/**
 * Handle dialogue selection from golfer-initiated conversation
 * @param {string} selectedOptionId - The ID of the selected option
 * @param {Array} options - The available options
 * @param {Object} state - The current result state
 * @param {string} trigger - The GolferTrigger that initiated the conversation
 */
function handleGolferDialogueSelection(selectedOptionId, options, state, trigger) {
    const selectedOption = options.find(opt => opt.id === selectedOptionId);
    
    if (!selectedOption) {
        console.warn('Selected option not found:', selectedOptionId);
        markInteractionComplete();
        return;
    }
    
    // Calculate and apply scaled effects
    const scaledEffects = calculateAllScaledEffects(selectedOption, state);
    
    if (scaledEffects.carryover) {
        applyCarryover(scaledEffects);
        console.log('Applied carryover effects from golfer conversation:', scaledEffects);
    } else {
        for (const [stat, value] of Object.entries(scaledEffects)) {
            if (stat === 'carryover' || stat === 'nextShotModifier' || stat === 'nextHoleEffects') {
                continue;
            }
            modifyStat(stat, value);
        }
        console.log('Applied effects from golfer conversation:', scaledEffects);
    }
    
    // Mark interaction complete
    markInteractionComplete();
    
    // Clear the current trigger
    currentGolferTrigger = null;
    
    console.log(`Golfer dialogue selected: "${selectedOption.text}" (trigger: ${trigger})`);
}

/**
 * Get the current golfer trigger (for testing/debugging)
 * @returns {string|null} - The current GolferTrigger or null
 */
export function getCurrentGolferTrigger() {
    return currentGolferTrigger;
}

/**
 * Reset the golfer conversation state (for testing or new round)
 */
export function resetGolferConversation() {
    currentGolferTrigger = null;
    lastCheckContext = null;
    lastInitiationTime = 0;
    
    // Hide any visible bubble
    if (isGolferBubbleVisible()) {
        hideGolferBubble(false);
    }
}

/**
 * Force show a golfer-initiated conversation (for testing)
 * @param {string} trigger - The GolferTrigger to simulate
 * @param {string} [message] - Optional custom message
 */
export function forceGolferInitiation(trigger, message = null) {
    currentGolferTrigger = trigger;
    lastInitiationTime = Date.now();
    
    const displayMessage = message || getGolferMessage(trigger);
    
    showGolferBubble(
        displayMessage,
        () => handleGolferBubbleTap(trigger),
        () => handleGolferBubbleIgnore(trigger)
    );
    
    console.log(`Forced golfer initiation: ${trigger} - "${displayMessage}"`);
}
