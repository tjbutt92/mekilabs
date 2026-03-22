/**
 * Yardage Book - Golfer Tab
 * 
 * Renders the golfer statistics view showing:
 * - Last shot summary data
 * - Golfer attributes and skills
 * - Mental state effects
 * - Recent shot history
 * 
 * Validates: Requirements 5.2
 */

import { golfer } from '../golfer.js';

// Store the last shot data for display
let lastShotData = null;
let lastShotClub = null;

/**
 * Set the last shot data to be displayed in the golfer tab.
 * @param {Object} shotData - The shot data from the completed shot
 * @param {string} clubName - The name of the club used
 */
export function setLastShotData(shotData, clubName = null) {
    lastShotData = shotData;
    if (clubName) lastShotClub = clubName;
}

/**
 * Get the last shot data.
 * @returns {Object|null} The last shot data or null if no shot has been made
 */
export function getLastShotData() {
    return lastShotData;
}

/**
 * Render the last shot summary.
 * @param {Object} shotData - The shot data object
 * @returns {string} HTML string of shot summary
 */
function renderLastShotSummary(shotData) {
    if (!shotData) {
        return '<div class="no-shot-data">No shot data yet</div>';
    }
    
    // Handle putt data differently
    if (shotData.isPutt) {
        return `
            <div class="shot-summary-header">Last Putt</div>
            <div class="shot-summary-grid">
                <div class="shot-summary-item">
                    <span class="shot-summary-label">Distance</span>
                    <span class="shot-summary-value">${shotData.intendedFeet.toFixed(0)} ft</span>
                </div>
                <div class="shot-summary-item">
                    <span class="shot-summary-label">Rolled</span>
                    <span class="shot-summary-value">${shotData.actualFeet.toFixed(1)} ft</span>
                </div>
            </div>
        `;
    }
    
    const { flight } = shotData;
    const clubName = lastShotClub || 'Unknown';
    
    // Determine start line (left/right/straight based on direction error)
    const dirError = shotData.directionError || 0;
    let startLine = 'Straight';
    if (dirError < -2) startLine = 'Left';
    else if (dirError > 2) startLine = 'Right';
    
    // Determine shape based on spin axis
    const spinAxis = shotData.launch?.spinAxis || 0;
    let shape = 'Straight';
    if (spinAxis < -3) shape = 'Draw';
    else if (spinAxis > 3) shape = 'Fade';
    
    return `
        <div class="shot-summary-header">Last Shot</div>
        <div class="shot-summary-list">
            <div class="shot-summary-item">
                <span class="shot-summary-label">Club</span>
                <span class="shot-summary-value">${clubName}</span>
            </div>
            <div class="shot-summary-item">
                <span class="shot-summary-label">Carry</span>
                <span class="shot-summary-value">${flight.carry.toFixed(0)} yd</span>
            </div>
            <div class="shot-summary-item">
                <span class="shot-summary-label">Total</span>
                <span class="shot-summary-value">${shotData.actualYards.toFixed(0)} yd</span>
            </div>
            <div class="shot-summary-item">
                <span class="shot-summary-label">Start</span>
                <span class="shot-summary-value">${startLine}</span>
            </div>
            <div class="shot-summary-item">
                <span class="shot-summary-label">Shape</span>
                <span class="shot-summary-value">${shape}</span>
            </div>
        </div>
    `;
}

/**
 * Render mental state effects based on current mental values.
 * @param {Object} mental - The mental state object with confidence, pressure, focus
 * @returns {string} HTML string of mental effect elements
 */
function renderMentalEffects(mental) {
    const effects = [];
    
    if (mental.confidence < 40) effects.push({ text: 'Low confidence: +15% miss rate', type: 'negative' });
    else if (mental.confidence > 80) effects.push({ text: 'High confidence: -10% miss rate', type: 'positive' });
    
    if (mental.pressure > 70) effects.push({ text: 'Under pressure: +20% direction spread', type: 'negative' });
    
    if (mental.focus < 50) effects.push({ text: 'Losing focus: +10% distance spread', type: 'negative' });
    else if (mental.focus > 80) effects.push({ text: 'Locked in: -5% all spreads', type: 'positive' });
    
    if (effects.length === 0) effects.push({ text: 'Steady state - no modifiers', type: 'neutral' });
    
    return effects.map(e => `<div class="mental-effect ${e.type}">${e.text}</div>`).join('');
}

/**
 * Render recent shot history.
 * @param {Array} shots - Array of recent shot objects with club, result, quality
 * @returns {string} HTML string of recent shot elements
 */
function renderRecentShots(shots) {
    if (shots.length === 0) return '<div class="no-shots">No shots yet</div>';
    
    return shots.slice(-5).map(shot => `
        <div class="recent-shot ${shot.quality}">
            <span class="shot-club">${shot.club}</span>
            <span class="shot-result">${shot.result}</span>
        </div>
    `).join('');
}

/**
 * Render the golfer tab content.
 * @param {HTMLElement} container - The container element to render into
 * @param {Object} hole - The hole data object (unused but kept for consistent tab interface)
 */
export function renderGolferTab(container, hole) {
    const g = golfer;
    
    container.innerHTML = `
        <div class="golfer-stats">
            <div class="stat-section shot-summary-section">
                ${renderLastShotSummary(lastShotData)}
            </div>
            
            <div class="golfer-header">
                <div class="golfer-name">${g.name}</div>
                <div class="golfer-subtitle">Mental State</div>
            </div>
            
            <div class="stat-section">
                <div class="stat-title">Current State</div>
                <div class="mental-state-display">
                    <div class="mental-meter">
                        <div class="mental-meter-fill" style="width: ${g.mental.confidence}%"></div>
                    </div>
                    <div class="mental-label confidence">Confidence</div>
                </div>
                <div class="mental-state-display">
                    <div class="mental-meter pressure">
                        <div class="mental-meter-fill" style="width: ${g.mental.pressure}%"></div>
                    </div>
                    <div class="mental-label pressure">Pressure</div>
                </div>
                <div class="mental-state-display">
                    <div class="mental-meter focus">
                        <div class="mental-meter-fill" style="width: ${g.mental.focus}%"></div>
                    </div>
                    <div class="mental-label focus">Focus</div>
                </div>
                <div class="mental-state-display">
                    <div class="mental-meter trust">
                        <div class="mental-meter-fill" style="width: ${g.mental.trust}%"></div>
                    </div>
                    <div class="mental-label trust">Trust</div>
                </div>
            </div>
            
            <div class="stat-section">
                <div class="stat-title">Effects</div>
                <div class="mental-effects">
                    ${renderMentalEffects(g.mental)}
                </div>
            </div>
            
            <div class="stat-section">
                <div class="stat-title">Recent Form</div>
                <div class="recent-shots">
                    ${renderRecentShots(g.recentShots || [])}
                </div>
            </div>
        </div>
    `;
}
