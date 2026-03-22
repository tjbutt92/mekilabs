// Dialogue Panel Module
// Displays dialogue options for caddy-golfer interaction as a slide-out panel
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5

import { golfer } from './golfer.js';

// Panel element references
let panelContainer = null;
let optionsContainer = null;
let moodIndicator = null;
let autoCloseTimeout = null;

// Callback for when an option is selected
let onSelectCallback = null;

// Callback for when the player stays silent (no selection made)
let onSilenceCallback = null;

// Auto-close duration in milliseconds - disabled for golfer-initiated conversations
// Only used for caddy-initiated timing windows
const AUTO_CLOSE_DURATION = 6000;

// Flag to control whether auto-close is enabled
let autoCloseEnabled = true;

// Edge case handling state
// Validates: Requirements 3.5, 3.6, 3.7
let isAnimating = false;           // Prevents interactions during open/close animations
let isSelectionProcessing = false; // Prevents rapid taps on dialogue options
let isPanelOpen = false;           // Tracks if panel is currently open

/**
 * Calculates the mood emoji based on mental stats average
 * Uses confidence, pressure (inverted), focus, and trust
 * @param {Object} mental - Mental stats object
 * @returns {string} Emoji representing current mood
 */
export function getMoodEmoji(mental) {
    if (!mental) return '😐';
    
    // Calculate mood score: higher is better
    // Pressure is inverted (lower pressure = better mood)
    const confidence = mental.confidence || 50;
    const pressure = mental.pressure || 50;
    const focus = mental.focus || 50;
    const trust = mental.trust || 50;
    
    // Average with pressure inverted (100 - pressure)
    const moodScore = (confidence + (100 - pressure) + focus + trust) / 4;
    
    // Map score to emoji
    if (moodScore >= 75) {
        return '😊'; // Happy - high confidence, low pressure, good focus/trust
    } else if (moodScore >= 55) {
        return '🙂'; // Content - decent mental state
    } else if (moodScore >= 45) {
        return '😐'; // Neutral - average mental state
    } else if (moodScore >= 30) {
        return '😟'; // Worried - struggling mentally
    } else {
        return '😰'; // Stressed - very poor mental state
    }
}

/**
 * Gets the speak button wrapper element, creating it if needed
 * @returns {HTMLElement} The wrapper element for the speak button
 */
function getSpeakButtonWrapper() {
    const speakBtn = document.getElementById('btn-speak');
    if (!speakBtn) return null;
    
    // Check if wrapper already exists
    let wrapper = speakBtn.closest('.speak-btn-wrapper');
    if (wrapper) return wrapper;
    
    // Create wrapper and wrap the speak button
    wrapper = document.createElement('div');
    wrapper.className = 'speak-btn-wrapper';
    speakBtn.parentNode.insertBefore(wrapper, speakBtn);
    wrapper.appendChild(speakBtn);
    
    return wrapper;
}

/**
 * Creates the dialogue panel slide-out structure
 * Slides out from the right, aligned with bottom of speak button
 * Validates: Requirements 3.1, 3.2
 */
function createPanelStructure() {
    // Create panel container - slides from right
    panelContainer = document.createElement('div');
    panelContainer.className = 'dialogue-panel-slideout collapsed';
    
    // Create options container
    optionsContainer = document.createElement('div');
    optionsContainer.className = 'dialogue-options';
    
    // Assemble panel
    panelContainer.appendChild(optionsContainer);
    
    return panelContainer;
}

/**
 * Updates the mood indicator with current mental state
 * @param {Object} mental - Mental stats object (optional, uses golfer.mental if not provided)
 */
function updateMoodIndicator(mental) {
    if (!moodIndicator) return;
    
    const stats = mental || golfer.mental;
    const emoji = getMoodEmoji(stats);
    
    // Create mood display with emoji and label
    moodIndicator.innerHTML = `
        <span class="mood-emoji">${emoji}</span>
        <span class="mood-label">Golfer's Mood</span>
    `;
}

/**
 * Shows the dialogue panel with the given options
 * Validates: Requirements 3.1, 3.2, 3.4
 * Edge case handling: Prevents multiple panels, handles animation state
 * @param {Array} options - Array of DialogueOption objects
 * @param {Function} onSelect - Callback when an option is selected (receives option id)
 * @param {Object} mental - Optional mental stats object for mood indicator
 * @param {Function} onSilence - Optional callback when player stays silent (no selection made)
 * @param {boolean} enableAutoClose - Whether to auto-close after timeout (default: false)
 */
export function showDialoguePanel(options, onSelect, mental = null, onSilence = null, enableAutoClose = false) {
    // Edge case: Prevent opening if already open or animating
    // Validates: Requirements 3.5, 3.6, 3.7
    if (isPanelOpen || isAnimating) {
        console.warn('Dialogue panel already open or animating, ignoring show request');
        return;
    }
    
    // Get or create the speak button wrapper
    const wrapper = getSpeakButtonWrapper();
    if (!wrapper) {
        console.warn('Speak button not found, cannot show dialogue panel');
        return;
    }
    
    // Clear any existing timeout
    if (autoCloseTimeout) {
        clearTimeout(autoCloseTimeout);
        autoCloseTimeout = null;
    }
    
    // Reset edge case state
    isSelectionProcessing = false;
    isAnimating = true;
    isPanelOpen = true;
    autoCloseEnabled = enableAutoClose;
    
    // Store callbacks
    onSelectCallback = onSelect;
    onSilenceCallback = onSilence;
    
    // Create panel if it doesn't exist
    if (!panelContainer) {
        createPanelStructure();
    }
    
    // Clear existing options
    optionsContainer.innerHTML = '';
    
    // Add dialogue option buttons
    if (options && options.length > 0) {
        options.forEach(option => {
            const button = createOptionButton(option);
            optionsContainer.appendChild(button);
        });
    }
    
    // Add "Stay Silent" button at bottom
    const silentButton = createSilentButton();
    optionsContainer.appendChild(silentButton);
    
    // Add to wrapper if not already present
    if (!wrapper.contains(panelContainer)) {
        wrapper.appendChild(panelContainer);
    }
    
    // Trigger animation
    requestAnimationFrame(() => {
        panelContainer.classList.remove('collapsed');
        panelContainer.classList.add('expanded');
        
        // Mark animation complete after transition
        setTimeout(() => {
            isAnimating = false;
        }, 300); // Match CSS transition duration
    });
    
    // Only set auto-close timeout if enabled
    if (autoCloseEnabled) {
        autoCloseTimeout = setTimeout(() => {
            hideDialoguePanel(true); // true indicates silence (auto-close)
        }, AUTO_CLOSE_DURATION);
    }
    
    // Add click-outside listener
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
    }, 50);
}

/**
 * Handles clicks outside the dialogue panel to close it
 */
function handleClickOutside(e) {
    if (!panelContainer || !isPanelOpen) return;
    
    const speakBtn = document.getElementById('btn-speak');
    if (panelContainer.contains(e.target) || (speakBtn && speakBtn.contains(e.target))) {
        return; // Click inside panel or on speak button
    }
    
    if (!isAnimating && !isSelectionProcessing) {
        hideDialoguePanel();
    }
}

/**
 * Determines if a stat effect is positive (good for the golfer)
 * For pressure, negative values are good (reduces pressure)
 * For other stats, positive values are good
 * @param {string} stat - Stat name (confidence, pressure, focus, trust)
 * @param {number} value - Effect value
 * @returns {boolean} True if the effect is positive/beneficial
 */
function isPositiveEffect(stat, value) {
    if (stat === 'pressure') {
        // For pressure, negative values are good (reduces pressure)
        return value < 0;
    }
    // For confidence, focus, trust - positive values are good
    return value > 0;
}

/**
 * Creates stat effect indicators for a dialogue option
 * Returns empty container - effects are hidden from caddy
 * @param {Object} baseEffects - Object with stat effects (unused, kept for API compatibility)
 * @returns {HTMLElement} Empty container
 */
function createStatIndicators(baseEffects) {
    const container = document.createElement('span');
    container.className = 'stat-indicators';
    // Return empty container - caddy shouldn't know the outcome of their choices
    return container;
}

/**
 * Creates a dialogue option button
 * Uses square-themed button style matching existing UI
 * Validates: Requirements 3.2, 3.3, 3.5
 * Edge case handling: Prevents rapid taps with debounce
 * @param {Object} option - DialogueOption object
 * @returns {HTMLElement} Button element
 */
function createOptionButton(option) {
    const button = document.createElement('button');
    button.className = 'dialogue-option-btn';
    button.dataset.optionId = option.id;
    
    // Button text
    const textSpan = document.createElement('span');
    textSpan.className = 'option-text';
    textSpan.textContent = option.text || '';
    button.appendChild(textSpan);
    
    // Stat effect indicators (green up-arrow for boost, red down-arrow for drop)
    // Validates: Requirement 3.3
    const indicators = createStatIndicators(option.baseEffects);
    button.appendChild(indicators);
    
    // Click handler - select option and close panel
    // Edge case: Prevent rapid taps by checking isSelectionProcessing
    // Validates: Requirement 3.5
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Prevent rapid taps and interactions during animation
        if (isSelectionProcessing || isAnimating) {
            return;
        }
        
        // Mark selection as processing to prevent further taps
        isSelectionProcessing = true;
        
        // Disable all option buttons visually
        disableAllOptionButtons();
        
        if (onSelectCallback) {
            onSelectCallback(option.id);
        }
        hideDialoguePanel();
    });
    
    return button;
}

/**
 * Creates the "Stay Silent" button
 * Validates: Requirement 3.6
 * Edge case handling: Prevents rapid taps
 * @returns {HTMLElement} Button element
 */
function createSilentButton() {
    const button = document.createElement('button');
    button.className = 'dialogue-silent-btn';
    button.textContent = 'Stay Silent';
    
    // Click handler - close without selecting (silence)
    // Edge case: Prevent rapid taps
    // Validates: Requirement 3.6
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Prevent rapid taps and interactions during animation
        if (isSelectionProcessing || isAnimating) {
            return;
        }
        
        // Mark selection as processing to prevent further taps
        isSelectionProcessing = true;
        
        // Disable all option buttons visually
        disableAllOptionButtons();
        
        hideDialoguePanel(true); // true indicates silence (explicit stay silent)
    });
    
    return button;
}

/**
 * Hides the dialogue panel
 * Validates: Requirements 3.6, 8.2, 8.6, 8.8
 * Edge case handling: Prevents double-close, handles animation state
 * @param {boolean} isSilence - True if closing due to silence (Stay Silent or auto-close)
 */
export function hideDialoguePanel(isSilence = false) {
    // Remove click-outside listener
    document.removeEventListener('click', handleClickOutside);
    
    // Edge case: Prevent hiding if already closing or not open
    if (!isPanelOpen || (isAnimating && !isSelectionProcessing)) {
        return;
    }
    
    // Clear auto-close timeout
    if (autoCloseTimeout) {
        clearTimeout(autoCloseTimeout);
        autoCloseTimeout = null;
    }
    
    if (!panelContainer) {
        // Reset state even if panel doesn't exist
        isPanelOpen = false;
        isAnimating = false;
        isSelectionProcessing = false;
        return;
    }
    
    // Mark as animating to prevent further interactions
    isAnimating = true;
    
    // Call silence callback if this is a silence close
    // Validates: Requirements 8.2, 8.6, 8.8
    if (isSilence && onSilenceCallback) {
        onSilenceCallback();
    }
    
    // Animate out
    panelContainer.classList.remove('expanded');
    panelContainer.classList.add('collapsed');
    
    // Reset state after animation
    setTimeout(() => {
        // Reset callbacks
        onSelectCallback = null;
        onSilenceCallback = null;
        
        // Reset edge case state
        isPanelOpen = false;
        isAnimating = false;
        isSelectionProcessing = false;
    }, 300);
}

// Export helper functions for testing
export { isPositiveEffect, createStatIndicators };

/**
 * Disables all option buttons visually to prevent further interaction
 * Called when a selection is being processed
 */
function disableAllOptionButtons() {
    if (!optionsContainer) return;
    
    const buttons = optionsContainer.querySelectorAll('button');
    buttons.forEach(button => {
        button.classList.add('disabled');
    });
}

/**
 * Returns whether the dialogue panel is currently open
 * Useful for other modules to check before showing conflicting UI
 * @returns {boolean} True if panel is currently shown
 */
export function isDialoguePanelOpen() {
    return isPanelOpen;
}

/**
 * Force closes the dialogue panel without triggering callbacks
 * Used when timing window changes or other system events require immediate close
 * Validates: Requirements 3.5, 3.6, 3.7
 */
export function forceCloseDialoguePanel() {
    // Remove click-outside listener
    document.removeEventListener('click', handleClickOutside);
    
    // Clear auto-close timeout
    if (autoCloseTimeout) {
        clearTimeout(autoCloseTimeout);
        autoCloseTimeout = null;
    }
    
    if (panelContainer) {
        // Immediately collapse without animation
        panelContainer.classList.remove('expanded');
        panelContainer.classList.add('collapsed');
    }
    
    // Reset all references and state
    onSelectCallback = null;
    onSilenceCallback = null;
    isPanelOpen = false;
    isAnimating = false;
    isSelectionProcessing = false;
}
