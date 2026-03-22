/**
 * Yardage Book - Course Tab
 * 
 * Renders the course overview showing:
 * - Wind conditions display with arrow and compass direction
 * - Course details (holes count, total par, total yards)
 * - Hole table with par and yards for each hole
 * - Leaderboard section (placeholder)
 * 
 * Validates: Requirements 5.2
 */

import { getWind } from '../wind.js';
import { getWorldInstance } from './index.js';
import { THEME_COLORS } from '../theme-colors.js';

/**
 * Convert degrees to compass abbreviation.
 * Maps 0-360 degrees to 16-point compass directions.
 * 
 * @param {number} degrees - Wind direction in degrees (0 = from north)
 * @returns {string} Compass direction abbreviation (N, NNE, NE, etc.)
 */
function degreesToCompass(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

/**
 * Render the course tab content.
 * Shows wind conditions, course details, hole table, and leaderboard.
 * 
 * @param {HTMLElement} container - The container element to render into
 * @param {Object} hole - The hole data object (unused but kept for consistent tab interface)
 */
export function renderCourseTab(container, hole) {
    const wind = getWind();
    const compassDir = degreesToCompass(wind.direction);
    
    // Get course data from world instance
    const worldInstance = getWorldInstance();
    let courseName = 'Unknown Course';
    let holes = [];
    let totalPar = 0;
    let totalYards = 0;
    
    if (worldInstance && worldInstance.course) {
        courseName = worldInstance.course.name || 'Unknown Course';
        holes = worldInstance.course.holes || [];
        holes.forEach(h => {
            totalPar += h.par || 0;
            totalYards += h.yards || 0;
        });
    }
    
    container.innerHTML = `
        <div class="course-page">
            <div class="course-header">
                <div class="course-title">${courseName}</div>
            </div>
            <div class="course-stats">
                <div class="course-section">
                    <h3>Wind Conditions</h3>
                    <div class="wind-display">
                        <div class="wind-arrow" style="transform: rotate(${wind.direction}deg)">
                            <svg width="60" height="60" viewBox="0 0 60 60">
                                <circle cx="30" cy="30" r="28" fill="${THEME_COLORS.windArrowBgLight}" stroke="${THEME_COLORS.windArrowBlue}" stroke-width="2"/>
                                <polygon points="30,8 24,28 30,24 36,28" fill="${THEME_COLORS.windArrowBlue}"/>
                                <circle cx="30" cy="30" r="4" fill="${THEME_COLORS.windArrowBlue}"/>
                            </svg>
                        </div>
                        <div class="wind-info">
                            <div class="wind-speed">${Math.round(wind.speed)} mph</div>
                            <div class="wind-direction">${wind.direction}° ${compassDir}</div>
                        </div>
                    </div>
                </div>
                
                <div class="course-section">
                    <h3>Course Details</h3>
                    <div class="course-details">
                        <div class="detail-row">
                            <span class="detail-label">Holes:</span>
                            <span class="detail-value">${holes.length}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Total Par:</span>
                            <span class="detail-value">${totalPar}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Total Yards:</span>
                            <span class="detail-value">${totalYards.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    ${holes.length > 0 ? `
                    <div class="hole-list">
                        <table class="hole-table">
                            <thead>
                                <tr>
                                    <th>Hole</th>
                                    <th>Par</th>
                                    <th>Yards</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${holes.map(h => `
                                    <tr>
                                        <td>${h.number || h.name}</td>
                                        <td>${h.par}</td>
                                        <td>${h.yards}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ` : ''}
                </div>
                
                <div class="course-section">
                    <h3>Leaderboard</h3>
                    <div class="leaderboard" id="leaderboard">
                        <div class="leaderboard-empty">No scores recorded yet</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
