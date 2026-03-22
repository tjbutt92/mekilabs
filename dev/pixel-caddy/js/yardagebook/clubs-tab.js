/**
 * Yardage Book - Clubs Tab
 * 
 * Renders the clubs information view showing:
 * - Club list with distances
 * - Shot dispersion patterns
 * - Club statistics from shot history
 * 
 * Validates: Requirements 5.2
 */

import { shotClubs, clubs } from '../clubs.js';
import { golfer } from '../golfer.js';
import { clamp } from '../utils.js';
import { putterStats } from '../puttSimulation.js';

/**
 * Calculate statistics from shot history for a club.
 * @param {Array} shots - Array of shot objects with x, y, miss, thisRound properties
 * @returns {Object} Statistics object with distAvg, dirAvg, bias, maxExtent, missRate, dominantMiss
 */
function calculateStatsFromShots(shots) {
    if (shots.length === 0) {
        return { distAvg: 0, dirAvg: 0, bias: 'Center', maxExtent: 10, missRate: 0, dominantMiss: null };
    }
    
    const normalShots = shots.filter(s => !s.miss);
    const missShots = shots.filter(s => s.miss);
    const missRate = shots.length > 0 ? missShots.length / shots.length : 0;
    
    let dominantMiss = null;
    if (missShots.length > 0) {
        const avgMissX = missShots.reduce((sum, s) => sum + s.x, 0) / missShots.length;
        const avgMissY = missShots.reduce((sum, s) => sum + s.y, 0) / missShots.length;
        
        const isRight = avgMissX > 3, isLeft = avgMissX < -3;
        const isShort = avgMissY < -3, isLong = avgMissY > 3;
        
        if (isRight && isShort) dominantMiss = 'Push-Fade';
        else if (isLeft && isLong) dominantMiss = 'Pull-Draw';
        else if (isRight) dominantMiss = 'Push';
        else if (isLeft) dominantMiss = 'Pull';
        else if (isShort) dominantMiss = 'Short';
        else if (isLong) dominantMiss = 'Long';
        else dominantMiss = 'Mixed';
    }
    
    const allX = shots.map(s => Math.abs(s.x));
    const allY = shots.map(s => Math.abs(s.y));
    const maxExtent = Math.max(...allX, ...allY, 10);
    
    if (normalShots.length === 0) {
        return { distAvg: 0, dirAvg: 0, bias: 'Center', maxExtent, missRate, dominantMiss };
    }
    
    const distAvg = Math.round(normalShots.reduce((sum, s) => sum + s.y, 0) / normalShots.length);
    const dirAvg = Math.round(normalShots.reduce((sum, s) => sum + s.x, 0) / normalShots.length);
    
    let bias = 'Center';
    if (dirAvg > 2) bias = 'Right';
    else if (dirAvg < -2) bias = 'Left';
    
    return { distAvg, dirAvg, bias, maxExtent, missRate, dominantMiss };
}

/**
 * Render mini dispersion pattern from shot history.
 * @param {Array} shots - Array of shot objects
 * @param {Object} stats - Statistics object from calculateStatsFromShots
 * @returns {string} HTML string for the mini dispersion display
 */
function renderMiniDispersionFromShots(shots, stats) {
    if (shots.length === 0) {
        return `
            <div class="mini-dispersion-crosshair-v"></div>
            <div class="mini-dispersion-crosshair-h"></div>
            <div class="mini-dispersion-target"></div>
            <div class="no-shots-mini">No shots</div>
        `;
    }
    
    const mapRange = stats.maxExtent * 1.2;
    const yardsToPercent = (yards) => 50 + (yards / mapRange) * 45;
    
    const points = shots.map(s => ({
        x: clamp(yardsToPercent(s.x), 2, 98),
        y: clamp(yardsToPercent(-s.y), 2, 98),
        miss: s.miss,
        thisRound: s.thisRound
    }));
    
    let ringYards;
    if (mapRange < 12) ringYards = [2, 4, 6];
    else if (mapRange < 20) ringYards = [5, 10, 15];
    else if (mapRange < 35) ringYards = [5, 10, 20];
    else ringYards = [10, 20, 30];
    
    const ringPercent = (yards) => (yards / mapRange) * 90;
    
    return `
        <div class="mini-dispersion-crosshair-v"></div>
        <div class="mini-dispersion-crosshair-h"></div>
        <div class="mini-ring" style="width: ${ringPercent(ringYards[0])}%; height: ${ringPercent(ringYards[0])}%;" data-yards="${ringYards[0]}y"></div>
        <div class="mini-ring" style="width: ${ringPercent(ringYards[1])}%; height: ${ringPercent(ringYards[1])}%;" data-yards="${ringYards[1]}y"></div>
        <div class="mini-ring" style="width: ${ringPercent(ringYards[2])}%; height: ${ringPercent(ringYards[2])}%;" data-yards="${ringYards[2]}y"></div>
        <div class="mini-dispersion-target"></div>
        ${points.map(p => {
            let className = 'mini-dispersion-point';
            if (p.miss) className += ' miss';
            if (p.thisRound) className += ' this-round';
            return `<div class="${className}" style="left: ${p.x}%; top: ${p.y}%"></div>`;
        }).join('')}
        <span class="mini-label-short">Short</span>
        <span class="mini-label-long">Long</span>
    `;
}

/**
 * Render a single expandable club item.
 * @param {Object} club - Club object with name and yards properties
 * @returns {string} HTML string for the expandable club item
 */
function renderClubExpandable(club) {
    const shots = golfer.shotHistory[club.name] || [];
    const stats = calculateStatsFromShots(shots);
    
    let distArrow = '•', distVal = 0;
    if (stats.distAvg > 0) { distArrow = '↑ '; distVal = stats.distAvg; }
    else if (stats.distAvg < 0) { distArrow = '↓ '; distVal = Math.abs(stats.distAvg); }
    
    let dirArrow = '•', dirVal = 0;
    if (stats.dirAvg > 0) { dirArrow = '→ '; dirVal = stats.dirAvg; }
    else if (stats.dirAvg < 0) { dirArrow = '← '; dirVal = Math.abs(stats.dirAvg); }
    
    const missDisplay = stats.dominantMiss || 'None';
    const missRatePct = Math.round(stats.missRate * 100);
    
    return `
        <div class="club-expandable">
            <div class="club-header">
                <span class="club-header-name">${club.name}</span>
                <span class="club-header-yards">${club.yards}</span>
                <span class="club-header-stat">${distArrow}${distVal}</span>
                <span class="club-header-stat">${dirArrow}${dirVal}</span>
            </div>
            <div class="club-details">
                <div class="club-dispersion-mini">
                    ${renderMiniDispersionFromShots(shots, stats)}
                </div>
                <div class="club-stats-row">
                    <div class="club-stat">
                        <span class="club-stat-label">Distance</span>
                        <span class="club-stat-value">${distArrow}${distVal}y</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Direction</span>
                        <span class="club-stat-value">${dirArrow}${dirVal}y</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Bias</span>
                        <span class="club-stat-value">${stats.bias}</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Miss ${missRatePct}%</span>
                        <span class="club-stat-value">${missDisplay}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render the putter stats section.
 * Shows bias and spread for putt simulation dispersion.
 * @returns {string} HTML string for putter stats
 */
function renderPutterStats() {
    const biasDirection = putterStats.bias > 0 ? 'Right' : putterStats.bias < 0 ? 'Left' : 'Center';
    const biasAmount = Math.abs(putterStats.bias * 100).toFixed(0);
    const pressureEffect = golfer.mental.pressure;
    const effectiveSpread = putterStats.spread * (1 + pressureEffect / 100);
    
    return `
        <div class="club-expandable putter-section">
            <div class="club-header">
                <span class="club-header-name">Putter</span>
                <span class="club-header-yards">—</span>
                <span class="club-header-stat">${biasDirection}</span>
                <span class="club-header-stat">±${effectiveSpread.toFixed(1)}°</span>
            </div>
            <div class="club-details">
                <div class="putter-stats-display">
                    <div class="putter-bias-visual">
                        <div class="bias-track">
                            <div class="bias-center-mark"></div>
                            <div class="bias-indicator" style="left: ${50 + putterStats.bias * 30}%"></div>
                        </div>
                        <div class="bias-labels">
                            <span>Left</span>
                            <span>Right</span>
                        </div>
                    </div>
                </div>
                <div class="club-stats-row">
                    <div class="club-stat">
                        <span class="club-stat-label">Bias</span>
                        <span class="club-stat-value">${biasDirection} ${biasAmount}%</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Base Spread</span>
                        <span class="club-stat-value">±${putterStats.spread.toFixed(1)}°</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Pressure</span>
                        <span class="club-stat-value">${pressureEffect}%</span>
                    </div>
                    <div class="club-stat">
                        <span class="club-stat-label">Effective</span>
                        <span class="club-stat-value">±${effectiveSpread.toFixed(1)}°</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render the expandable clubs list.
 * @returns {string} HTML string for the clubs list
 */
function renderClubsListExpandable() {
    return `<div class="clubs-list-expandable">
        ${shotClubs.map(club => renderClubExpandable(club)).join('')}
        ${renderPutterStats()}
    </div>`;
}

/**
 * Wire up click handlers for expandable club headers.
 * @param {HTMLElement} container - The container element with club items
 */
function setupClubExpandHandlers(container) {
    container.querySelectorAll('.club-header').forEach(header => {
        header.addEventListener('click', () => {
            const item = header.parentElement;
            const wasExpanded = item.classList.contains('expanded');
            // Collapse all other clubs
            container.querySelectorAll('.club-expandable').forEach(el => el.classList.remove('expanded'));
            // Toggle this one
            if (!wasExpanded) {
                item.classList.add('expanded');
            }
        });
    });
}

/**
 * Render the clubs tab content.
 * @param {HTMLElement} container - The container element to render into
 * @param {Object} hole - The hole data object (unused but kept for consistent tab interface)
 */
export function renderClubsTab(container, hole) {
    container.innerHTML = `
        <div class="clubs-page">
            <div class="clubs-header">
                <div class="clubs-title">Club Yardages</div>
            </div>
            ${renderClubsListExpandable()}
        </div>
    `;
    
    // Wire up expandable club headers
    setupClubExpandHandlers(container);
}
