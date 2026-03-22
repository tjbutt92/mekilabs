// Golfer Simulation Module
// Implements "What do you think?" functionality for golfer-caddy interaction
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 1.5, 11.1, 11.2, 11.3, 11.4

import * as THREE from 'three';
import { simulateFullShot } from './physics.js';
import { modifyStat } from './mentalStats.js';
import { CONVERSION } from './constants.js';

const WORLD_SCALE = CONVERSION.WORLD_SCALE;

// Module state
let predictionLine = null;
let predictionScene = null;
let trackedSettings = null;
let simulationResult = null;
let hasViewedSimulation = false;

/**
 * Initialize the golfer simulation module with the Three.js scene
 * @param {THREE.Scene} scene - The Three.js scene to add prediction line to
 */
export function initGolferSimulation(scene) {
    predictionScene = scene;
}

/**
 * Calculate noise percentage based on trust level
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 1.5
 * @param {number} trustLevel - Current trust stat (0-100)
 * @returns {number} - Noise percentage (0.01 to 0.15)
 */
function getNoisePercent(trustLevel) {
    if (trustLevel < 30) {
        return 0.15;  // ±15% noise for low trust
    } else if (trustLevel < 70) {
        return 0.08;  // ±8% noise for moderate trust
    } else if (trustLevel < 90) {
        return 0.03;  // ±3% noise for high trust
    } else {
        return 0.01;  // ±1% noise for very high trust
    }
}

/**
 * Run golfer simulation on current shot settings with trust-based noise
 * Validates: Requirements 7.1, 1.5
 * @param {Object} shotParams - Shot parameters
 * @param {string} shotParams.clubName - Name of the club
 * @param {number} shotParams.power - Power percentage (0-100)
 * @param {string} shotParams.shape - Shot shape ('Draw', 'Straight', 'Fade')
 * @param {Object} shotParams.golferStats - Golfer statistics
 * @param {string} shotParams.terrain - Landing terrain type
 * @param {Object} shotParams.wind - Wind conditions {speed, direction}
 * @param {number} trustLevel - Current trust stat (0-100)
 * @returns {Object} - Predicted shot result with noise applied
 */
export function runGolferSimulation(shotParams, trustLevel) {
    const { clubName, power, shape, golferStats, terrain, wind } = shotParams;
    
    // Run actual physics simulation
    const actualResult = simulateFullShot(clubName, power, shape, golferStats, terrain, wind);
    
    if (!actualResult) {
        return null;
    }
    
    // Get noise percentage based on trust level
    const noisePercent = getNoisePercent(trustLevel);
    
    // Apply noise to predicted landing position
    // Noise is random within ±noisePercent range
    const carryNoise = (Math.random() - 0.5) * 2 * noisePercent;
    const lateralNoise = (Math.random() - 0.5) * 2 * noisePercent;
    
    // Store the simulation result for later comparison
    simulationResult = {
        actualCarry: actualResult.result.carryYards,
        actualLateral: actualResult.result.lateralYards,
        predictedCarry: actualResult.result.carryYards * (1 + carryNoise),
        predictedLateral: actualResult.result.lateralYards * (1 + lateralNoise),
        trajectory: actualResult.flight.trajectory,
        noiseApplied: noisePercent
    };
    
    hasViewedSimulation = true;
    
    return simulationResult;
}

/**
 * Display yellow prediction line on 3D view
 * Validates: Requirement 7.2
 * @param {Array} trajectory - Array of trajectory points from simulation
 * @param {Function} worldTo3D - Function to convert world coords to 3D coords
 */
export function displayPredictionLine(trajectory, worldTo3D) {
    if (!predictionScene || !trajectory || trajectory.length < 2) {
        console.warn('Cannot display prediction line: missing scene or trajectory');
        return;
    }
    
    // Remove existing prediction line if any
    hidePredictionLine();
    
    // Convert trajectory points to 3D coordinates
    // Trajectory points are in yards: {x: lateral, y: height, z: forward}
    const points = [];
    
    for (const point of trajectory) {
        // The trajectory z is forward distance, x is lateral deviation
        // We need to convert these to world coordinates based on aim direction
        // For now, we'll use the trajectory directly as it represents the path
        const pos3D = new THREE.Vector3(
            point.x * WORLD_SCALE,  // Lateral (yards to 3D units)
            point.y * WORLD_SCALE * 0.33,  // Height (with terrain scale factor)
            -point.z * WORLD_SCALE  // Forward (negative because Three.js z is opposite)
        );
        points.push(pos3D);
    }
    
    // Create yellow line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Yellow dashed material for prediction line
    const material = new THREE.LineDashedMaterial({
        color: 0xffff00,  // Yellow
        dashSize: 2,
        gapSize: 1,
        linewidth: 2,
        transparent: true,
        opacity: 0.9
    });
    
    predictionLine = new THREE.Line(geometry, material);
    predictionLine.computeLineDistances();  // Required for dashed lines
    
    predictionScene.add(predictionLine);
}

/**
 * Display prediction line positioned relative to ball position and aim angle
 * Validates: Requirement 7.2
 * @param {Array} trajectory - Array of trajectory points from simulation
 * @param {Object} ballPos - Ball position in world coords {x, y}
 * @param {number} aimAngle - Aim angle in degrees
 * @param {Function} worldTo3D - Function to convert world coords to 3D coords
 */
export function displayPredictionLineAtPosition(trajectory, ballPos, aimAngle, worldTo3D) {
    if (!predictionScene || !trajectory || trajectory.length < 2) {
        console.warn('Cannot display prediction line: missing scene or trajectory');
        return;
    }
    
    // Remove existing prediction line if any
    hidePredictionLine();
    
    // Convert aim angle to radians
    const aimRad = (aimAngle * Math.PI) / 180;
    
    // Get ball 3D position
    const ballPos3D = worldTo3D(ballPos.x, ballPos.y);
    
    // Convert trajectory points to 3D coordinates relative to ball position
    const points = [];
    
    for (const point of trajectory) {
        // Trajectory: z = forward distance, x = lateral deviation, y = height
        // Rotate by aim angle to align with shot direction
        const forward = point.z;  // Forward distance in yards
        const lateral = point.x;  // Lateral deviation in yards
        const height = point.y;   // Height in yards
        
        // Calculate world position based on aim direction
        // Forward is along aim direction, lateral is perpendicular
        const worldX = ballPos.x + Math.sin(aimRad) * forward + Math.cos(aimRad) * lateral;
        const worldY = ballPos.y - Math.cos(aimRad) * forward + Math.sin(aimRad) * lateral;
        
        const pos3D = worldTo3D(worldX, worldY);
        
        // Add height (scaled appropriately)
        pos3D.y += height * WORLD_SCALE * 0.33;
        
        points.push(new THREE.Vector3(pos3D.x, pos3D.y, pos3D.z));
    }
    
    // Create yellow line geometry
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // Yellow dashed material for prediction line
    const material = new THREE.LineDashedMaterial({
        color: 0xffff00,  // Yellow
        dashSize: 2,
        gapSize: 1,
        linewidth: 2,
        transparent: true,
        opacity: 0.9
    });
    
    predictionLine = new THREE.Line(geometry, material);
    predictionLine.computeLineDistances();  // Required for dashed lines
    
    predictionScene.add(predictionLine);
}

/**
 * Hide/remove the yellow prediction line from 3D view
 */
export function hidePredictionLine() {
    if (predictionLine && predictionScene) {
        predictionScene.remove(predictionLine);
        predictionLine.geometry.dispose();
        predictionLine.material.dispose();
        predictionLine = null;
    }
}

/**
 * Track current shot settings to detect changes
 * Validates: Requirement 7.3, 7.4
 * @param {Object} settings - Current shot settings
 * @param {string} settings.club - Club name
 * @param {number} settings.power - Power percentage
 * @param {string} settings.shape - Shot shape
 * @param {number} settings.aimAngle - Aim angle in degrees
 */
export function trackShotSettings(settings) {
    trackedSettings = {
        club: settings.club,
        power: settings.power,
        shape: settings.shape,
        aimAngle: settings.aimAngle
    };
}

/**
 * Check if player accepted the golfer's suggestion (settings unchanged)
 * Validates: Requirement 7.3
 * @param {Object} newSettings - New shot settings to compare
 * @returns {boolean} - True if settings are unchanged (accepted)
 */
export function checkIfAccepted(newSettings) {
    if (!trackedSettings) {
        return false;
    }
    
    return (
        trackedSettings.club === newSettings.club &&
        trackedSettings.power === newSettings.power &&
        trackedSettings.shape === newSettings.shape &&
        Math.abs(trackedSettings.aimAngle - newSettings.aimAngle) < 1  // Allow small aim tolerance
    );
}

/**
 * Check if simulation has been viewed this shot
 * @returns {boolean} - True if simulation was viewed
 */
export function hasViewedGolferSimulation() {
    return hasViewedSimulation;
}

/**
 * Get the stored simulation result
 * @returns {Object|null} - The simulation result or null
 */
export function getSimulationResult() {
    return simulationResult;
}

/**
 * Handle simulation result after shot is complete
 * Applies trust effects based on whether player accepted or overrode
 * Validates: Requirements 7.3, 7.4
 * @param {Object} actualResult - Actual shot result
 * @param {Object} predictedResult - Predicted shot result from simulation
 * @param {boolean} wasAccepted - Whether player accepted the suggestion
 */
export function handleSimulationResult(actualResult, predictedResult, wasAccepted) {
    if (!hasViewedSimulation || !predictedResult) {
        return;
    }
    
    if (wasAccepted) {
        // Player accepted the suggestion - apply Trust +6
        // Validates: Requirement 7.3
        modifyStat('trust', 6);
        console.log('Player accepted golfer suggestion: Trust +6');
    } else {
        // Player changed settings - check if actual result was worse
        // Validates: Requirement 7.4
        if (actualResult) {
            const actualDistance = actualResult.carryYards || actualResult.totalYards || 0;
            const predictedDistance = predictedResult.predictedCarry || 0;
            
            // Calculate how far off the actual result was from target
            // "Worse" means the actual shot deviated more from intended than predicted
            const actualDeviation = Math.abs(actualResult.lateralYards || 0);
            const predictedDeviation = Math.abs(predictedResult.predictedLateral || 0);
            
            // If actual result is worse (more deviation or significantly shorter)
            const isWorse = actualDeviation > predictedDeviation * 1.2 || 
                           actualDistance < predictedDistance * 0.85;
            
            if (isWorse) {
                // Golfer feels ignored - apply Trust -10
                modifyStat('trust', -10);
                console.log('Player overrode golfer suggestion with worse result: Trust -10');
            }
        }
    }
}

/**
 * Reset simulation state for new shot
 */
export function resetSimulationState() {
    trackedSettings = null;
    simulationResult = null;
    hasViewedSimulation = false;
    hidePredictionLine();
}

/**
 * Compare actual shot result to predicted result
 * @param {Object} actualResult - Actual shot result from physics
 * @param {Object} predictedResult - Predicted result from golfer simulation
 * @returns {Object} - Comparison data
 */
export function compareResults(actualResult, predictedResult) {
    if (!actualResult || !predictedResult) {
        return null;
    }
    
    const actualCarry = actualResult.carryYards || actualResult.result?.carryYards || 0;
    const actualLateral = actualResult.lateralYards || actualResult.result?.lateralYards || 0;
    
    return {
        carryDifference: actualCarry - predictedResult.predictedCarry,
        lateralDifference: actualLateral - predictedResult.predictedLateral,
        carryAccuracy: 1 - Math.abs(actualCarry - predictedResult.predictedCarry) / Math.max(actualCarry, 1),
        lateralAccuracy: predictedResult.predictedLateral !== 0 
            ? 1 - Math.abs(actualLateral - predictedResult.predictedLateral) / Math.abs(predictedResult.predictedLateral)
            : actualLateral === 0 ? 1 : 0
    };
}
