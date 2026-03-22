// Golfer Bubble Module
// Displays golfer-initiated conversation bubble in middle-top of screen
// Validates: Requirements 10.2, 10.3

import { isDialoguePanelOpen } from './dialoguePanel.js';

// Bubble element references
let bubbleContainer = null;
let bubbleText = null;
let autoDismissTimeout = null;

// Callbacks
let onTapCallback = null;
let onIgnoreCallback = null;

// Auto-dismiss duration in milliseconds (8 seconds)
const AUTO_DISMISS_DURATION = 8000;

// Animation duration in milliseconds
const ANIMATION_DURATION = 200;

// Edge case handling state
// Validates: Requirements 10.2, 10.3
let isAnimating = false;       // Prevents interactions during animations
let isTapProcessing = false;   // Prevents rapid taps
let isBubbleOpen = false;      // Tracks if bubble is currently visible

/**
 * Creates the golfer bubble structure
 * Positioned middle-top of screen with speech bubble appearance
 * Validates: Requirement 10.2
 */
function createBubbleStructure() {
    // Create main bubble container - positioned middle-top
    bubbleContainer = document.createElement('div');
    bubbleContainer.className = 'golfer-bubble';
    bubbleContainer.style.cssText = `
        position: fixed;
        top: 60px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        z-index: 140;
        opacity: 0;
        transition: opacity ${ANIMATION_DURATION}ms ease, transform ${ANIMATION_DURATION}ms ease;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
    `;

    // Create speech bubble with rounded corners and pointer/tail
    const bubble = document.createElement('div');
    bubble.className = 'golfer-bubble-content';
    bubble.style.cssText = `
        background-color: var(--color-bg-primary, #1e1e1e);
        border: 2px solid var(--color-accent-green, #5cb85c);
        border-radius: 12px;
        padding: 12px 16px;
        max-width: 280px;
        min-width: 120px;
        position: relative;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;

    // Create speech bubble tail/pointer pointing down
    const tail = document.createElement('div');
    tail.className = 'golfer-bubble-tail';
    tail.style.cssText = `
        position: absolute;
        bottom: -10px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 10px solid transparent;
        border-right: 10px solid transparent;
        border-top: 10px solid var(--color-accent-green, #5cb85c);
    `;

    // Create inner tail to match background
    const tailInner = document.createElement('div');
    tailInner.className = 'golfer-bubble-tail-inner';
    tailInner.style.cssText = `
        position: absolute;
        bottom: -7px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-top: 8px solid var(--color-bg-primary, #1e1e1e);
    `;

    // Create text element for golfer message
    bubbleText = document.createElement('div');
    bubbleText.className = 'golfer-bubble-text';
    bubbleText.style.cssText = `
        color: var(--color-text-primary, #fff);
        font-family: var(--font-family, 'Visitor', monospace);
        font-size: 14px;
        line-height: 1.4;
        text-align: center;
    `;

    // Create tap hint
    const tapHint = document.createElement('div');
    tapHint.className = 'golfer-bubble-hint';
    tapHint.style.cssText = `
        color: var(--color-text-muted, #888);
        font-family: var(--font-family, 'Visitor', monospace);
        font-size: 11px;
        text-align: center;
        margin-top: 6px;
        opacity: 0.8;
    `;
    tapHint.textContent = 'Tap to respond';

    // Assemble bubble
    bubble.appendChild(bubbleText);
    bubble.appendChild(tapHint);
    bubble.appendChild(tail);
    bubble.appendChild(tailInner);
    bubbleContainer.appendChild(bubble);

    // Handle tap to open dialogue panel
    // Validates: Requirement 10.3
    bubbleContainer.addEventListener('click', handleBubbleTap);

    // Add hover effect
    bubbleContainer.addEventListener('mouseenter', () => {
        bubble.style.borderColor = 'var(--color-accent-yellow, #f0ad4e)';
        tail.style.borderTopColor = 'var(--color-accent-yellow, #f0ad4e)';
    });
    bubbleContainer.addEventListener('mouseleave', () => {
        bubble.style.borderColor = 'var(--color-accent-green, #5cb85c)';
        tail.style.borderTopColor = 'var(--color-accent-green, #5cb85c)';
    });

    return bubbleContainer;
}

/**
 * Handles tap on the golfer bubble
 * Clears auto-dismiss and triggers onTap callback
 * Edge case handling: Prevents rapid taps and checks for dialogue panel conflict
 * Validates: Requirement 10.3
 */
function handleBubbleTap() {
    // Prevent rapid taps and interactions during animation
    if (isTapProcessing || isAnimating) {
        return;
    }
    
    // Edge case: Don't open dialogue if panel is already open
    if (isDialoguePanelOpen()) {
        console.warn('Dialogue panel already open, ignoring bubble tap');
        return;
    }
    
    // Mark tap as processing
    isTapProcessing = true;

    // Clear auto-dismiss timeout since player responded
    if (autoDismissTimeout) {
        clearTimeout(autoDismissTimeout);
        autoDismissTimeout = null;
    }

    // Call onTap callback to open dialogue panel
    if (onTapCallback) {
        onTapCallback();
    }

    // Hide the bubble
    hideGolferBubble(false); // false = not ignored
}

/**
 * Shows the golfer bubble with the given message
 * Edge case handling: Prevents showing if dialogue panel is open or bubble already visible
 * Validates: Requirements 10.2, 10.3
 * @param {string} message - The golfer's message to display
 * @param {Function} onTap - Callback when bubble is tapped (opens dialogue panel)
 * @param {Function} onIgnore - Callback when bubble is auto-dismissed (ignored)
 */
export function showGolferBubble(message, onTap, onIgnore = null) {
    // Edge case: Don't show bubble if dialogue panel is already open
    if (isDialoguePanelOpen()) {
        console.warn('Dialogue panel is open, not showing golfer bubble');
        return;
    }
    
    // Edge case: Don't show if bubble is already visible or animating
    if (isBubbleOpen || isAnimating) {
        console.warn('Golfer bubble already visible or animating, ignoring show request');
        return;
    }
    
    // Clear any existing timeout
    if (autoDismissTimeout) {
        clearTimeout(autoDismissTimeout);
        autoDismissTimeout = null;
    }

    // Reset edge case state
    isTapProcessing = false;
    isAnimating = true;
    isBubbleOpen = true;
    
    // Store callbacks
    onTapCallback = onTap;
    onIgnoreCallback = onIgnore;

    // Create bubble if it doesn't exist
    if (!bubbleContainer) {
        createBubbleStructure();
    }

    // Update message text
    if (bubbleText) {
        bubbleText.textContent = message || '';
    }

    // Add to DOM if not already present
    if (!document.body.contains(bubbleContainer)) {
        document.body.appendChild(bubbleContainer);
    }

    // Trigger show animation
    requestAnimationFrame(() => {
        if (!bubbleContainer || !isBubbleOpen) return;
        bubbleContainer.style.opacity = '1';
        bubbleContainer.style.transform = 'translateX(-50%) translateY(0)';
        
        // Mark animation complete after transition
        setTimeout(() => {
            isAnimating = false;
        }, ANIMATION_DURATION);
    });

    // Set auto-dismiss timeout (8 seconds)
    autoDismissTimeout = setTimeout(() => {
        hideGolferBubble(true); // true = ignored (auto-dismissed)
    }, AUTO_DISMISS_DURATION);
}

/**
 * Hides the golfer bubble
 * Edge case handling: Prevents double-hide, handles animation state
 * @param {boolean} wasIgnored - True if bubble was auto-dismissed (ignored by player)
 */
export function hideGolferBubble(wasIgnored = false) {
    // Edge case: Prevent hiding if not open or already animating out
    if (!isBubbleOpen) {
        return;
    }
    
    // Clear auto-dismiss timeout
    if (autoDismissTimeout) {
        clearTimeout(autoDismissTimeout);
        autoDismissTimeout = null;
    }

    if (!bubbleContainer) {
        // Reset state even if container doesn't exist
        isBubbleOpen = false;
        isAnimating = false;
        isTapProcessing = false;
        return;
    }
    
    // Mark as animating
    isAnimating = true;

    // Call onIgnore callback if bubble was ignored
    if (wasIgnored && onIgnoreCallback) {
        onIgnoreCallback();
    }

    // Animate out
    bubbleContainer.style.opacity = '0';
    bubbleContainer.style.transform = 'translateX(-50%) translateY(-20px)';

    // Remove from DOM after animation
    setTimeout(() => {
        if (bubbleContainer && bubbleContainer.parentNode) {
            bubbleContainer.parentNode.removeChild(bubbleContainer);
        }
        // Reset references for fresh creation next time
        bubbleContainer = null;
        bubbleText = null;
        onTapCallback = null;
        onIgnoreCallback = null;
        
        // Reset edge case state
        isBubbleOpen = false;
        isAnimating = false;
        isTapProcessing = false;
    }, ANIMATION_DURATION);
}

/**
 * Returns whether the golfer bubble is currently visible
 * @returns {boolean} True if bubble is currently shown
 */
export function isGolferBubbleVisible() {
    return isBubbleOpen;
}

/**
 * Force closes the golfer bubble without triggering callbacks
 * Used when timing window changes or other system events require immediate close
 */
export function forceCloseGolferBubble() {
    // Clear auto-dismiss timeout
    if (autoDismissTimeout) {
        clearTimeout(autoDismissTimeout);
        autoDismissTimeout = null;
    }
    
    if (!bubbleContainer) {
        // Reset state even if container doesn't exist
        isBubbleOpen = false;
        isAnimating = false;
        isTapProcessing = false;
        return;
    }
    
    // Immediately remove from DOM without animation
    if (bubbleContainer.parentNode) {
        bubbleContainer.parentNode.removeChild(bubbleContainer);
    }
    
    // Reset all references and state
    bubbleContainer = null;
    bubbleText = null;
    onTapCallback = null;
    onIgnoreCallback = null;
    isBubbleOpen = false;
    isAnimating = false;
    isTapProcessing = false;
}
