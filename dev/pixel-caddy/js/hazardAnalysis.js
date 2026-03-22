// Hazard Analysis Module
// Implements "What concerns you?" functionality for golfer-caddy interaction
// Validates: Requirements 7.5, 7.6, 7.7, 7.8

import { TerrainType, getTerrainAt } from './terrain.js';
import { getWind } from './wind.js';
import { LieType, lieData } from './lie.js';
import { modifyStat } from './mentalStats.js';

// Module state
let concernsBubble = null;
let trackedConcernSettings = null;
let identifiedConcerns = null;
let hasViewedConcerns = false;

// Wind thresholds for concern levels
const WIND_THRESHOLDS = {
    STRONG: 12,      // Strong wind concern
    MODERATE: 7      // Moderate wind concern
};

// Lie types that are considered difficult
const DIFFICULT_LIES = [
    LieType.SITTING_DOWN,
    LieType.BURIED,
    LieType.BUNKER_PLUGGED
];

/**
 * Analyze current shot setup for potential hazards
 * Validates: Requirement 7.6
 * @param {Object} shotSetup - Current shot setup
 * @param {Object} shotSetup.ballPos - Ball position {x, y}
 * @param {number} shotSetup.aimAngle - Aim angle in degrees
 * @param {Object} shotSetup.hole - Current hole data with zones
 * @param {Object} shotSetup.lie - Current lie {type, data}
 * @param {string} shotSetup.clubName - Selected club name
 * @param {number} shotSetup.power - Power percentage
 * @param {number} shotSetup.expectedDistance - Expected shot distance in yards
 * @returns {Object} - Identified hazards with details
 */
export function analyzeHazards(shotSetup) {
    const { ballPos, aimAngle, hole, lie, clubName, power, expectedDistance } = shotSetup;
    const hazards = {
        wind: null,
        water: [],
        bunkers: [],
        lie: null,
        hasAnyConcerns: false
    };
    
    // 1. Analyze wind conditions
    const wind = getWind();
    if (wind.speed >= WIND_THRESHOLDS.STRONG) {
        hazards.wind = {
            severity: 'strong',
            speed: wind.speed,
            direction: wind.direction,
            relativeDirection: getRelativeWindDirection(wind.direction, aimAngle)
        };
        hazards.hasAnyConcerns = true;
    } else if (wind.speed >= WIND_THRESHOLDS.MODERATE) {
        hazards.wind = {
            severity: 'moderate',
            speed: wind.speed,
            direction: wind.direction,
            relativeDirection: getRelativeWindDirection(wind.direction, aimAngle)
        };
        hazards.hasAnyConcerns = true;
    }
    
    // 2. Analyze water hazards in play
    if (hole && hole.zones) {
        const waterZones = hole.zones.filter(z => z.terrain === TerrainType.WATER);
        for (const zone of waterZones) {
            const inPlay = isHazardInPlay(ballPos, aimAngle, expectedDistance, zone);
            if (inPlay) {
                hazards.water.push({
                    zone,
                    position: inPlay.position,
                    distance: inPlay.distance
                });
                hazards.hasAnyConcerns = true;
            }
        }
    }
    
    // 3. Analyze bunker positions
    if (hole && hole.zones) {
        const bunkerZones = hole.zones.filter(z => z.terrain === TerrainType.BUNKER);
        for (const zone of bunkerZones) {
            const inPlay = isHazardInPlay(ballPos, aimAngle, expectedDistance, zone);
            if (inPlay) {
                hazards.bunkers.push({
                    zone,
                    position: inPlay.position,
                    distance: inPlay.distance
                });
                hazards.hasAnyConcerns = true;
            }
        }
    }
    
    // 4. Analyze lie conditions
    if (lie && DIFFICULT_LIES.includes(lie.type)) {
        hazards.lie = {
            type: lie.type,
            name: lie.data.name,
            description: lie.data.description,
            effects: lie.data.effects
        };
        hazards.hasAnyConcerns = true;
    }
    
    // Store identified concerns for later comparison
    identifiedConcerns = hazards;
    
    return hazards;
}

/**
 * Get relative wind direction description
 * @param {number} windDirection - Wind direction in degrees
 * @param {number} aimAngle - Aim angle in degrees
 * @returns {string} - Description of wind relative to shot
 */
function getRelativeWindDirection(windDirection, aimAngle) {
    const relative = (windDirection - aimAngle + 360) % 360;
    
    if (relative >= 337.5 || relative < 22.5) {
        return 'headwind';
    } else if (relative >= 22.5 && relative < 67.5) {
        return 'left-to-right crosswind';
    } else if (relative >= 67.5 && relative < 112.5) {
        return 'strong left-to-right';
    } else if (relative >= 112.5 && relative < 157.5) {
        return 'helping from left';
    } else if (relative >= 157.5 && relative < 202.5) {
        return 'tailwind';
    } else if (relative >= 202.5 && relative < 247.5) {
        return 'helping from right';
    } else if (relative >= 247.5 && relative < 292.5) {
        return 'strong right-to-left';
    } else {
        return 'right-to-left crosswind';
    }
}

/**
 * Check if a hazard zone is in play for the current shot
 * @param {Object} ballPos - Ball position {x, y}
 * @param {number} aimAngle - Aim angle in degrees
 * @param {number} expectedDistance - Expected shot distance
 * @param {Object} zone - Hazard zone to check
 * @returns {Object|null} - Position info if in play, null otherwise
 */
function isHazardInPlay(ballPos, aimAngle, expectedDistance, zone) {
    // Get zone center
    const zoneCenter = getZoneCenter(zone);
    if (!zoneCenter) return null;
    
    // Calculate distance to zone center
    const dx = zoneCenter.x - ballPos.x;
    const dy = zoneCenter.y - ballPos.y;
    const distanceToZone = Math.sqrt(dx * dx + dy * dy);
    
    // Check if zone is within shot range (with some margin)
    const margin = 30; // yards margin for hazard consideration
    if (distanceToZone > expectedDistance + margin) {
        return null;
    }
    
    // Calculate angle to zone center
    const angleToZone = Math.atan2(dx, -dy) * (180 / Math.PI);
    const angleDiff = Math.abs(normalizeAngle(angleToZone - aimAngle));
    
    // Check if zone is roughly in the shot direction (within 45 degrees)
    if (angleDiff > 45) {
        return null;
    }
    
    // Determine position relative to shot line
    let position;
    const normalizedAngleDiff = normalizeAngle(angleToZone - aimAngle);
    if (Math.abs(normalizedAngleDiff) < 15) {
        position = 'directly ahead';
    } else if (normalizedAngleDiff > 0) {
        position = 'to the right';
    } else {
        position = 'to the left';
    }
    
    return {
        position,
        distance: Math.round(distanceToZone)
    };
}

/**
 * Get the center point of a zone
 * @param {Object} zone - Zone object
 * @returns {Object|null} - Center point {x, y} or null
 */
function getZoneCenter(zone) {
    if (zone.shape === 'ellipse') {
        return { x: zone.cx, y: zone.cy };
    } else if (zone.shape === 'rect') {
        return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
    } else if (zone.shape === 'polygon' && zone.points && zone.points.length > 0) {
        let sumX = 0, sumY = 0;
        for (const pt of zone.points) {
            sumX += pt[0];
            sumY += pt[1];
        }
        return { x: sumX / zone.points.length, y: sumY / zone.points.length };
    }
    return null;
}

/**
 * Normalize angle to [-180, 180] range
 * @param {number} angle - Angle in degrees
 * @returns {number} - Normalized angle
 */
function normalizeAngle(angle) {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
}

/**
 * Format hazards into a readable message for the golfer
 * Validates: Requirement 7.6
 * @param {Object} hazards - Identified hazards from analyzeHazards
 * @returns {string} - Formatted message
 */
export function formatConcernsMessage(hazards) {
    if (!hazards || !hazards.hasAnyConcerns) {
        return "Looking good - no major concerns here.";
    }
    
    const concerns = [];
    
    // Wind concerns
    if (hazards.wind) {
        const windDesc = hazards.wind.severity === 'strong' 
            ? `Strong ${Math.round(hazards.wind.speed)} mph ${hazards.wind.relativeDirection}`
            : `${Math.round(hazards.wind.speed)} mph ${hazards.wind.relativeDirection}`;
        concerns.push(`🌬️ ${windDesc}`);
    }
    
    // Water hazards
    if (hazards.water.length > 0) {
        for (const water of hazards.water) {
            concerns.push(`💧 Water ${water.position} at ${water.distance} yards`);
        }
    }
    
    // Bunkers
    if (hazards.bunkers.length > 0) {
        for (const bunker of hazards.bunkers) {
            concerns.push(`⛳ Bunker ${bunker.position} at ${bunker.distance} yards`);
        }
    }
    
    // Lie conditions
    if (hazards.lie) {
        concerns.push(`🏌️ ${hazards.lie.description}`);
    }
    
    return concerns.join('\n');
}


/**
 * Show a text bubble with identified concerns
 * Validates: Requirement 7.6
 * @param {string} message - The concerns message to display
 */
export function showConcernsBubble(message) {
    // Remove existing bubble if any
    hideConcernsBubble();
    
    // Create bubble container
    concernsBubble = document.createElement('div');
    concernsBubble.className = 'concerns-bubble';
    concernsBubble.innerHTML = `
        <div class="concerns-bubble-content">
            <div class="concerns-bubble-header">
                <span class="concerns-icon">🤔</span>
                <span class="concerns-title">Concerns</span>
            </div>
            <div class="concerns-bubble-message">${message.replace(/\n/g, '<br>')}</div>
        </div>
    `;
    
    // Add styles if not already present
    addConcernsBubbleStyles();
    
    // Add to document
    document.body.appendChild(concernsBubble);
    
    // Animate in
    requestAnimationFrame(() => {
        concernsBubble.classList.add('visible');
    });
    
    console.log('Concerns bubble shown:', message);
}

/**
 * Hide/remove the concerns bubble
 */
export function hideConcernsBubble() {
    if (concernsBubble) {
        concernsBubble.classList.remove('visible');
        setTimeout(() => {
            if (concernsBubble && concernsBubble.parentNode) {
                concernsBubble.parentNode.removeChild(concernsBubble);
            }
            concernsBubble = null;
        }, 300);
    }
}

/**
 * Add CSS styles for the concerns bubble
 */
function addConcernsBubbleStyles() {
    if (document.getElementById('concerns-bubble-styles')) {
        return;
    }
    
    const style = document.createElement('style');
    style.id = 'concerns-bubble-styles';
    style.textContent = `
        .concerns-bubble {
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%) translateY(-20px);
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
            z-index: 1000;
            pointer-events: none;
        }
        
        .concerns-bubble.visible {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        
        .concerns-bubble-content {
            background: rgba(40, 40, 40, 0.95);
            border: 2px solid #f0c040;
            border-radius: 12px;
            padding: 12px 16px;
            min-width: 200px;
            max-width: 350px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        }
        
        .concerns-bubble-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(240, 192, 64, 0.3);
        }
        
        .concerns-icon {
            font-size: 20px;
        }
        
        .concerns-title {
            color: #f0c040;
            font-weight: bold;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .concerns-bubble-message {
            color: #ffffff;
            font-size: 14px;
            line-height: 1.5;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Track current shot settings when concerns were shown
 * Validates: Requirement 7.7
 * @param {Object} settings - Current shot settings
 * @param {string} settings.club - Club name
 * @param {number} settings.power - Power percentage
 * @param {string} settings.shape - Shot shape
 * @param {number} settings.aimAngle - Aim angle in degrees
 */
export function trackConcernSettings(settings) {
    trackedConcernSettings = {
        club: settings.club,
        power: settings.power,
        shape: settings.shape,
        aimAngle: settings.aimAngle
    };
    hasViewedConcerns = true;
}

/**
 * Check if player adjusted their shot based on concerns
 * Validates: Requirement 7.7
 * @param {Object} newSettings - New shot settings to compare
 * @param {Object} concerns - The identified concerns
 * @returns {boolean} - True if player made adjustments
 */
export function checkIfAdjusted(newSettings, concerns) {
    if (!trackedConcernSettings || !concerns) {
        return false;
    }
    
    // Check if any settings changed
    const clubChanged = trackedConcernSettings.club !== newSettings.club;
    const powerChanged = Math.abs(trackedConcernSettings.power - newSettings.power) > 5;
    const aimChanged = Math.abs(trackedConcernSettings.aimAngle - newSettings.aimAngle) > 3;
    const shapeChanged = trackedConcernSettings.shape !== newSettings.shape;
    
    return clubChanged || powerChanged || aimChanged || shapeChanged;
}

/**
 * Check if player ignored an obvious concern
 * Validates: Requirement 7.8
 * @param {Object} newSettings - New shot settings
 * @param {Object} concerns - The identified concerns
 * @returns {boolean} - True if player ignored obvious concern
 */
export function checkIfIgnoredObviousConcern(newSettings, concerns) {
    if (!trackedConcernSettings || !concerns || !concerns.hasAnyConcerns) {
        return false;
    }
    
    // Check for strong crosswind without aim adjustment
    if (concerns.wind && concerns.wind.severity === 'strong') {
        const relDir = concerns.wind.relativeDirection;
        const isCrosswind = relDir.includes('crosswind') || relDir.includes('left-to-right') || relDir.includes('right-to-left');
        
        if (isCrosswind) {
            const aimChanged = Math.abs(trackedConcernSettings.aimAngle - newSettings.aimAngle) > 3;
            if (!aimChanged) {
                return true; // Ignored strong crosswind
            }
        }
    }
    
    // Check for water directly ahead without adjustment
    if (concerns.water.length > 0) {
        const waterAhead = concerns.water.find(w => w.position === 'directly ahead');
        if (waterAhead) {
            const aimChanged = Math.abs(trackedConcernSettings.aimAngle - newSettings.aimAngle) > 5;
            const clubChanged = trackedConcernSettings.club !== newSettings.club;
            const powerChanged = Math.abs(trackedConcernSettings.power - newSettings.power) > 10;
            
            if (!aimChanged && !clubChanged && !powerChanged) {
                return true; // Ignored water directly ahead
            }
        }
    }
    
    return false;
}

/**
 * Handle the result of concerns - apply trust/pressure effects
 * Validates: Requirements 7.7, 7.8
 * @param {boolean} wasAdjusted - Whether player adjusted based on concerns
 * @param {Object} concerns - The identified concerns
 */
export function handleConcernsResult(wasAdjusted, concerns) {
    if (!hasViewedConcerns || !concerns) {
        return;
    }
    
    if (wasAdjusted) {
        // Player adjusted based on concerns - apply Trust +5
        // Validates: Requirement 7.7
        modifyStat('trust', 5);
        console.log('Player adjusted based on concerns: Trust +5');
    } else if (concerns.hasAnyConcerns) {
        // Check if they ignored an obvious concern
        // This will be called from game.js with the new settings
        console.log('Player did not adjust - will check for ignored concerns on shot');
    }
}

/**
 * Apply penalty for ignoring obvious concern
 * Validates: Requirement 7.8
 */
export function applyIgnorePenalty() {
    // Trust -4, Pressure +5
    modifyStat('trust', -4);
    modifyStat('pressure', 5);
    console.log('Player ignored obvious concern: Trust -4, Pressure +5');
}

/**
 * Check if concerns have been viewed this shot
 * @returns {boolean} - True if concerns were viewed
 */
export function hasViewedConcernsThisShot() {
    return hasViewedConcerns;
}

/**
 * Get the stored concerns
 * @returns {Object|null} - The identified concerns or null
 */
export function getIdentifiedConcerns() {
    return identifiedConcerns;
}

/**
 * Get the tracked settings when concerns were shown
 * @returns {Object|null} - The tracked settings or null
 */
export function getTrackedConcernSettings() {
    return trackedConcernSettings;
}

/**
 * Reset concerns state for new shot
 */
export function resetConcernsState() {
    trackedConcernSettings = null;
    identifiedConcerns = null;
    hasViewedConcerns = false;
    hideConcernsBubble();
}
