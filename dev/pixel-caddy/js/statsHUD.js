// Stats HUD Module
// Displays golfer mental stats as colored bars in top-left corner
// Validates: Requirements 4.4, 4.5

// Bar colors for each stat - matches yardage book golfer tab
const STAT_COLORS = {
    confidence: '#9b59b6', // purple
    pressure: '#e74c3c',   // red
    focus: '#3498db',      // blue
    trust: '#f0ad4e'       // yellow
};

// Order of stats to display
const STAT_ORDER = ['confidence', 'pressure', 'focus', 'trust'];

// Animation duration for bar changes (ms)
const ANIMATION_DURATION = 300;

// HUD element references
let hudContainer = null;
let bars = {};

// Edge case handling: Track pending updates during animations
// Validates: Requirements 4.5, 4.6
let pendingUpdate = null;
let isAnimating = false;
let animationTimeout = null;

/**
 * Creates the Stats HUD and appends it to the container
 * Validates: Requirement 4.4
 * @param {HTMLElement} container - The container element to append the HUD to
 */
export function createStatsHUD(container) {
    // Create main HUD container - positioned top-left
    hudContainer = document.createElement('div');
    hudContainer.className = 'stats-hud';
    hudContainer.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: none;
        border: none;
        border-radius: 0;
        z-index: 100;
    `;

    // Create small golfer portrait placeholder - square to match theme
    const portrait = document.createElement('div');
    portrait.className = 'stats-hud-portrait';
    portrait.style.cssText = `
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
        border-radius: 0;
        border: 2px solid #718096;
        flex-shrink: 0;
    `;
    hudContainer.appendChild(portrait);

    // Create bars container
    const barsContainer = document.createElement('div');
    barsContainer.className = 'stats-hud-bars';
    barsContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 3px;
    `;

    // Create 4 slim colored bars (no text labels) - thinner with square ends
    STAT_ORDER.forEach(stat => {
        const barWrapper = document.createElement('div');
        barWrapper.className = `stats-hud-bar-wrapper stats-hud-bar-${stat}`;
        barWrapper.style.cssText = `
            width: 60px;
            height: 4px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 0;
            overflow: hidden;
        `;

        const barFill = document.createElement('div');
        barFill.className = `stats-hud-bar-fill stats-hud-bar-fill-${stat}`;
        barFill.style.cssText = `
            width: 50%;
            height: 100%;
            background: ${STAT_COLORS[stat]};
            border-radius: 0;
            transition: width ${ANIMATION_DURATION}ms ease-out;
        `;

        barWrapper.appendChild(barFill);
        barsContainer.appendChild(barWrapper);
        bars[stat] = barFill;
    });

    hudContainer.appendChild(barsContainer);
    container.appendChild(hudContainer);

    return hudContainer;
}

/**
 * Updates the Stats HUD bar widths based on mental stats
 * Animates bar changes over 300ms
 * Edge case handling: Queues updates during animations to ensure final state is correct
 * Validates: Requirements 4.5, 4.6
 * @param {Object} mental - Mental stats object with confidence, pressure, focus, trust (0-100)
 */
export function updateStatsHUD(mental) {
    if (!hudContainer || !mental) return;

    // If currently animating, store this update as pending
    // This ensures rapid stat changes result in the correct final state
    if (isAnimating) {
        pendingUpdate = { ...mental };
        return;
    }

    // Mark as animating
    isAnimating = true;

    // Clear any existing animation timeout
    if (animationTimeout) {
        clearTimeout(animationTimeout);
    }

    STAT_ORDER.forEach(stat => {
        if (bars[stat] && typeof mental[stat] === 'number') {
            // Clamp value to 0-100 range
            const value = Math.max(0, Math.min(100, mental[stat]));
            bars[stat].style.width = `${value}%`;
        }
    });

    // After animation completes, check for pending updates
    animationTimeout = setTimeout(() => {
        isAnimating = false;
        
        // If there's a pending update, apply it now
        if (pendingUpdate) {
            const update = pendingUpdate;
            pendingUpdate = null;
            updateStatsHUD(update);
        }
    }, ANIMATION_DURATION);
}

/**
 * Immediately updates the Stats HUD without animation
 * Used for initial state or when animation is not desired
 * @param {Object} mental - Mental stats object with confidence, pressure, focus, trust (0-100)
 */
export function updateStatsHUDImmediate(mental) {
    if (!hudContainer || !mental) return;

    // Clear any pending animation state
    if (animationTimeout) {
        clearTimeout(animationTimeout);
        animationTimeout = null;
    }
    isAnimating = false;
    pendingUpdate = null;

    STAT_ORDER.forEach(stat => {
        if (bars[stat] && typeof mental[stat] === 'number') {
            // Temporarily disable transition
            bars[stat].style.transition = 'none';
            
            // Clamp value to 0-100 range
            const value = Math.max(0, Math.min(100, mental[stat]));
            bars[stat].style.width = `${value}%`;
            
            // Re-enable transition after a frame
            requestAnimationFrame(() => {
                if (bars[stat]) {
                    bars[stat].style.transition = `width ${ANIMATION_DURATION}ms ease-out`;
                }
            });
        }
    });
}
