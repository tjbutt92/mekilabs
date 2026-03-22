// Lie Window UI - displays current ball lie in bottom left corner

import { THEME_COLORS } from './theme-colors.js';
import { TerrainType } from './terrain.js';

let lieWindowElement = null;
let currentLie = null;

// Map terrain types to background colors (varying shades of green + sand/water)
const terrainColors = {
    [TerrainType.TEE]: THEME_COLORS.fairway,
    [TerrainType.FAIRWAY]: THEME_COLORS.fairway,
    [TerrainType.ROUGH]: THEME_COLORS.rough,
    [TerrainType.GREEN]: THEME_COLORS.green,
    [TerrainType.BUNKER]: THEME_COLORS.bunker,
    [TerrainType.WATER]: THEME_COLORS.water
};

/**
 * Initialize the lie window - uses existing element from HTML
 */
export function createLieWindow() {
    if (lieWindowElement) return lieWindowElement;
    
    // Use existing element from HTML instead of creating new one
    lieWindowElement = document.getElementById('lie-window');
    
    if (lieWindowElement) {
        // Populate the placeholder with content (no emoji, just abbreviated name)
        lieWindowElement.innerHTML = `
            <div class="lie-window-content">
                <div class="lie-name">PL</div>
            </div>
        `;
    }
    
    return lieWindowElement;
}

/**
 * Update the lie window with new lie data
 * @param {object} lie - The lie object { type, data }
 * @param {string} terrain - The terrain type at ball position
 */
export function updateLieWindow(lie, terrain = null) {
    if (!lieWindowElement) {
        createLieWindow();
    }
    
    currentLie = lie;
    const data = lie.data;
    
    // Update name only (no emoji)
    lieWindowElement.querySelector('.lie-name').textContent = data.name;
    
    // Update background color based on terrain
    if (terrain && terrainColors[terrain]) {
        lieWindowElement.style.backgroundColor = terrainColors[terrain];
        // Use dark text for light backgrounds (bunker, fairway, green)
        const lightBackgrounds = [TerrainType.BUNKER, TerrainType.FAIRWAY, TerrainType.GREEN, TerrainType.TEE];
        if (lightBackgrounds.includes(terrain)) {
            lieWindowElement.querySelector('.lie-name').style.color = '#333';
        } else {
            lieWindowElement.querySelector('.lie-name').style.color = '#fff';
        }
    }
}

/**
 * Get the current lie
 */
export function getCurrentLie() {
    return currentLie;
}

/**
 * Hide the lie window
 */
export function hideLieWindow() {
    if (lieWindowElement) {
        lieWindowElement.style.display = 'none';
    }
}

/**
 * Show the lie window
 */
export function showLieWindow() {
    if (lieWindowElement) {
        lieWindowElement.style.display = 'flex';
    }
}
