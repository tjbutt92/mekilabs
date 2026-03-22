// Main game module
import * as THREE from 'three';
import { clubs } from './clubs.js';
import { Ball } from './ball.js';
import { AimLine } from './aim.js';
import { setupUI, updateYardageIndicator, createSimulatePuttButton, updateSimulatePuttButtonVisibility, disableSimulatePuttButton, setSimulatePuttButtonSimulating, resetSimulatePuttButton, createSpeakButton, updateSpeakButtonVisibility } from './ui.js';
import { ShotSimulator } from './shot.js';
import { golfer, initializeGolferHistory, recordShot } from './golfer.js';
import { course as defaultCourse } from '../courses/test_course.js';
import { TerrainType, setCourse, getTerrainAt, getSlopeAt, getElevationAt, getCentrelineAngleFromTee } from './terrain.js';
import { createWorld } from './world.js';
import { createLieWindow, updateLieWindow } from './lieWindow.js';
import { createStatsHUD, updateStatsHUD } from './statsHUD.js';
import { determineLie } from './lie.js';
import { validateTrees } from './trees.js';
import { WORLD_SCALE } from './utils.js';
import { CAMERA, TIMING } from './constants.js';
import { initializeWind, getWindForShot } from './wind.js';
import { setLastShotData } from './yardagebook/golfer-tab.js';
import { runPuttSimulations } from './puttSimulation.js';
import { ShotOutcome, recordShotResult, recordHoleResult, getResultState } from './resultState.js';
import { getCurrentWindow, markInteractionComplete, setTimingWindow, TimingWindow, handleSilence } from './caddySystem.js';
import { getOptionsForWindow, calculateAllScaledEffects, postShotOptions } from './dialogueOptions.js';
import { showDialoguePanel } from './dialoguePanel.js';
import { modifyStat, applyCarryover, resetToBaseline } from './mentalStats.js';
import { 
    initGolferSimulation, 
    runGolferSimulation, 
    displayPredictionLineAtPosition, 
    hidePredictionLine,
    trackShotSettings, 
    checkIfAccepted, 
    handleSimulationResult,
    hasViewedGolferSimulation,
    getSimulationResult,
    resetSimulationState
} from './golferSimulation.js';
import {
    analyzeHazards,
    formatConcernsMessage,
    showConcernsBubble,
    hideConcernsBubble,
    trackConcernSettings,
    checkIfAdjusted as checkIfAdjustedForConcerns,
    checkIfIgnoredObviousConcern,
    handleConcernsResult,
    applyIgnorePenalty,
    hasViewedConcernsThisShot,
    getIdentifiedConcerns,
    getTrackedConcernSettings,
    resetConcernsState
} from './hazardAnalysis.js';
import { checkAndShowGolferInitiation } from './golferConversation.js';

/**
 * Categorize shot outcome based on result data
 * Validates: Requirements 5.1, 5.2
 * @param {Object} shotData - Shot result data containing distanceError, directionError, lie, etc.
 * @param {Object} newLie - The lie where the ball landed
 * @returns {string} - A ShotOutcome value
 */
function categorizeShotOutcome(shotData, newLie) {
    if (!shotData) return ShotOutcome.Acceptable;
    
    // Shot simulation knows if ball landed or rolled into water - use that first
    if (shotData.landedInWater || shotData.rolledIntoWater) {
        return ShotOutcome.HazardWater;
    }
    
    // Check for hazards from lie/terrain (in case terrain lookup catches it)
    if (newLie) {
        const terrainName = newLie.name?.toLowerCase() || '';
        if (terrainName.includes('water')) {
            return ShotOutcome.HazardWater;
        }
        if (terrainName.includes('bunker') || terrainName.includes('sand')) {
            return ShotOutcome.HazardBunker;
        }
    }
    
    // Check for tree hits (bad luck)
    if (shotData.hitTree) {
        return ShotOutcome.BadLuck;
    }
    
    // Check for disaster (severe miss)
    if (shotData.isMiss && Math.abs(shotData.distanceError) > 30) {
        return ShotOutcome.Disaster;
    }
    
    const distanceError = shotData.distanceError || 0;
    const directionError = shotData.directionError || 0;
    
    // Thresholds for categorization (in yards)
    const PERFECT_DISTANCE_THRESHOLD = 3;
    const PERFECT_DIRECTION_THRESHOLD = 2;
    const GOOD_DISTANCE_THRESHOLD = 8;
    const GOOD_DIRECTION_THRESHOLD = 5;
    const ACCEPTABLE_DISTANCE_THRESHOLD = 15;
    const ACCEPTABLE_DIRECTION_THRESHOLD = 10;
    
    const absDistanceError = Math.abs(distanceError);
    const absDirectionError = Math.abs(directionError);
    
    // Perfect shot: very close to intended
    if (absDistanceError <= PERFECT_DISTANCE_THRESHOLD && absDirectionError <= PERFECT_DIRECTION_THRESHOLD) {
        return ShotOutcome.Perfect;
    }
    
    // Good shot: close to intended
    if (absDistanceError <= GOOD_DISTANCE_THRESHOLD && absDirectionError <= GOOD_DIRECTION_THRESHOLD) {
        return ShotOutcome.Good;
    }
    
    // Acceptable shot: within reasonable range
    if (absDistanceError <= ACCEPTABLE_DISTANCE_THRESHOLD && absDirectionError <= ACCEPTABLE_DIRECTION_THRESHOLD) {
        return ShotOutcome.Acceptable;
    }
    
    // Determine if it's primarily a distance or direction miss
    // Compare relative errors to determine which is worse
    const relativeDistanceError = absDistanceError / ACCEPTABLE_DISTANCE_THRESHOLD;
    const relativeDirectionError = absDirectionError / ACCEPTABLE_DIRECTION_THRESHOLD;
    
    if (relativeDistanceError > relativeDirectionError) {
        // Distance miss is worse
        return distanceError < 0 ? ShotOutcome.MissDistanceShort : ShotOutcome.MissDistanceLong;
    } else {
        // Direction miss is worse
        return directionError < 0 ? ShotOutcome.MissDirectionLeft : ShotOutcome.MissDirectionRight;
    }
}

/**
 * Handle Speak button click - wire dialogue panel to caddy system
 * Validates: Requirements 3.1, 3.5, 3.8
 */
function handleSpeakButtonClick() {
    // 1. Get the current timing window from caddySystem
    const currentWindow = getCurrentWindow();
    
    // 2. Get the current result state for context
    const state = getResultState();
    
    // 3. Get available options from dialogueOptions using getOptionsForWindow
    // Validates: Requirement 3.8 - only display options relevant to current window and context
    const options = getOptionsForWindow(currentWindow, state);
    
    if (!options || options.length === 0) {
        console.log('No dialogue options available for current window:', currentWindow);
        return;
    }
    
    // 4. Show the dialogue panel with those options
    // Validates: Requirement 3.1 - display dialogue panel overlay with available options
    // Enable auto-close for caddy-initiated timing windows
    showDialoguePanel(options, (selectedOptionId) => {
        // 5. Handle selection callback
        handleDialogueSelection(selectedOptionId, options, state);
    }, golfer.mental, () => {
        // 6. Handle silence callback - apply penalties for staying silent after negative outcomes
        // Validates: Requirements 8.2, 8.6, 8.8
        handleSilenceCallback(state);
    }, true); // true = enable auto-close for timing windows
}

/**
 * Handle silence callback - apply penalties when player stays silent after negative outcomes
 * Validates: Requirements 8.2, 8.6, 8.8
 * @param {Object} state - The current result state
 */
function handleSilenceCallback(state) {
    // Only apply silence penalties in PostShot window
    const currentWindow = getCurrentWindow();
    if (currentWindow !== TimingWindow.PostShot) {
        // Mark interaction complete even if no penalty applied
        markInteractionComplete();
        return;
    }
    
    // Apply silence penalties using handleSilence from caddySystem
    const appliedEffects = handleSilence(state, modifyStat);
    
    if (appliedEffects) {
        console.log(`Player stayed silent after ${state.previousShotOutcome} - penalties applied`);
    }
    
    // Mark interaction complete
    markInteractionComplete();
}

/**
 * Handle dialogue option selection - apply effects and mark interaction complete
 * Validates: Requirement 3.5 - apply selected option's effects and close panel
 * @param {string} selectedOptionId - The ID of the selected option
 * @param {Array} options - The available options array
 * @param {Object} state - The current result state
 */
function handleDialogueSelection(selectedOptionId, options, state) {
    // Find the selected option
    const selectedOption = options.find(opt => opt.id === selectedOptionId);
    
    if (!selectedOption) {
        console.warn('Selected option not found:', selectedOptionId);
        markInteractionComplete();
        return;
    }
    
    // Check for special actions
    // Validates: Requirement 7.1 - "What do you think?" triggers golfer simulation
    if (selectedOption.action === 'runSimulation') {
        handleRunSimulationAction(selectedOption);
        return;
    }
    
    // Validates: Requirement 7.5, 7.6 - "What concerns you?" triggers hazard flagging
    if (selectedOption.action === 'flagHazards') {
        handleFlagHazardsAction(selectedOption);
        return;
    }
    
    // Water hazard resolution - caddy decides how to proceed (drop or replay)
    if (selectedOption.action === 'waterDropCrossing' || selectedOption.action === 'waterReplay') {
        handleWaterResolutionAction(selectedOption);
    }
    
    // Calculate scaled effects using calculateAllScaledEffects
    const scaledEffects = calculateAllScaledEffects(selectedOption, state);
    
    // Apply effects
    if (scaledEffects.carryover) {
        // Apply carryover effects (for next hole's baseline)
        applyCarryover(scaledEffects);
        console.log('Applied carryover effects:', scaledEffects);
    } else {
        // Apply immediate effects using modifyStat
        for (const [stat, value] of Object.entries(scaledEffects)) {
            // Skip non-stat properties
            if (stat === 'carryover' || stat === 'nextShotModifier' || stat === 'nextHoleEffects') {
                continue;
            }
            modifyStat(stat, value);
        }
        console.log('Applied immediate effects:', scaledEffects);
    }
    
    // Store next shot modifier if present (for shot mechanics to use)
    if (scaledEffects.nextShotModifier) {
        gameState.nextShotModifier = scaledEffects.nextShotModifier;
        console.log('Stored next shot modifier:', scaledEffects.nextShotModifier);
    }
    
    // Mark interaction complete using markInteractionComplete
    markInteractionComplete();
    
    console.log(`Dialogue option selected: "${selectedOption.text}"`);
}

/**
 * Handle the "What do you think?" action - run golfer simulation
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 1.5
 * @param {Object} option - The dialogue option with runSimulation action
 */
function handleRunSimulationAction(option) {
    // Get current shot parameters
    const ballPos = ball.getPosition();
    const aimAngle = aimLine.getAngle();
    const terrain = gameState.currentLie?.name?.toLowerCase() || 'fairway';
    
    const shotParams = {
        clubName: gameState.club.name,
        power: gameState.power,
        shape: gameState.shape,
        golferStats: golfer,
        terrain: terrain,
        wind: gameState.wind
    };
    
    // Track current settings to detect changes later
    // Validates: Requirements 7.3, 7.4
    trackShotSettings({
        club: gameState.club.name,
        power: gameState.power,
        shape: gameState.shape,
        aimAngle: aimAngle
    });
    
    // Run the golfer simulation with trust-based noise
    // Validates: Requirements 7.1, 1.5
    const trustLevel = golfer.mental.trust;
    const simulationResult = runGolferSimulation(shotParams, trustLevel);
    
    if (simulationResult && simulationResult.trajectory) {
        // Display yellow prediction line on 3D view
        // Validates: Requirement 7.2
        displayPredictionLineAtPosition(
            simulationResult.trajectory, 
            ballPos, 
            aimAngle, 
            world.worldTo3D.bind(world)
        );
        
        console.log(`Golfer simulation: Predicted carry ${simulationResult.predictedCarry.toFixed(1)} yards, ` +
                    `lateral ${simulationResult.predictedLateral.toFixed(1)} yards (noise: ±${(simulationResult.noiseApplied * 100).toFixed(0)}%)`);
    } else {
        console.warn('Golfer simulation failed to produce result');
    }
    
    // Mark interaction complete
    markInteractionComplete();
    
    console.log(`Dialogue option selected: "${option.text}" - Golfer simulation displayed`);
}

/**
 * Handle the "What concerns you?" action - flag hazards
 * Validates: Requirements 7.5, 7.6, 7.7, 7.8
 * @param {Object} option - The dialogue option with flagHazards action
 */
function handleFlagHazardsAction(option) {
    // Get current shot parameters
    const ballPos = ball.getPosition();
    const aimAngle = aimLine.getAngle();
    
    // Estimate expected distance based on club and power
    const expectedDistance = estimateExpectedDistance(gameState.club.name, gameState.power);
    
    // Build shot setup for hazard analysis
    const shotSetup = {
        ballPos: ballPos,
        aimAngle: aimAngle,
        hole: gameState.currentHole,
        lie: gameState.currentLie,
        clubName: gameState.club.name,
        power: gameState.power,
        expectedDistance: expectedDistance
    };
    
    // Analyze hazards
    // Validates: Requirement 7.6
    const hazards = analyzeHazards(shotSetup);
    
    // Format and display concerns message
    const message = formatConcernsMessage(hazards);
    showConcernsBubble(message);
    
    // Track current settings to detect changes later
    // Validates: Requirements 7.7, 7.8
    trackConcernSettings({
        club: gameState.club.name,
        power: gameState.power,
        shape: gameState.shape,
        aimAngle: aimAngle
    });
    
    console.log(`Hazard analysis: ${hazards.hasAnyConcerns ? 'Concerns identified' : 'No major concerns'}`);
    
    // Mark interaction complete
    markInteractionComplete();
    
    console.log(`Dialogue option selected: "${option.text}" - Concerns displayed`);
}

/**
 * Handle water hazard resolution - apply penalty stroke and move ball per caddy decision
 * Validates: Water hazard is a caddy decision (drop where crossed or replay)
 * @param {Object} option - Selected option with action 'waterDropCrossing' or 'waterReplay'
 */
function handleWaterResolutionAction(option) {
    const data = gameState.waterResolutionData;
    if (!data || !data.shotData) {
        console.warn('Water resolution data missing');
        return;
    }
    const { shotData, finalPosition } = data;
    
    // One stroke penalty
    gameState.strokes++;
    
    let dropX, dropY;
    if (option.action === 'waterReplay') {
        const start = shotData.shotStartPosition;
        if (start) {
            dropX = start.x;
            dropY = start.y;
        } else {
            dropX = finalPosition.x;
            dropY = finalPosition.y;
        }
    } else {
        // waterDropCrossing: use last dry point if we have it (rolled into water), else walk back from water
        if (shotData.waterLastDryPoint) {
            dropX = shotData.waterLastDryPoint.x;
            dropY = shotData.waterLastDryPoint.y;
        } else if (shotData.waterPosition && shotData.shotStartPosition) {
            const wx = shotData.waterPosition.x;
            const wy = shotData.waterPosition.y;
            const sx = shotData.shotStartPosition.x;
            const sy = shotData.shotStartPosition.y;
            const dx = wx - sx;
            const dy = wy - sy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const step = 0.15;
            let t = dist;
            while (t > 0) {
                const x = sx + (dx / dist) * t;
                const y = sy + (dy / dist) * t;
                const terrain = getTerrainAt(gameState.currentHole, x, y);
                if (terrain !== 'water') {
                    dropX = x;
                    dropY = y;
                    break;
                }
                t -= step;
            }
            if (dropX === undefined) {
                dropX = sx;
                dropY = sy;
            } else {
                const margin = 0.5;
                const nx = dx / dist;
                const ny = dy / dist;
                dropX = dropX - nx * margin;
                dropY = dropY - ny * margin;
            }
        } else {
            dropX = shotData.shotStartPosition ? shotData.shotStartPosition.x : finalPosition.x;
            dropY = shotData.shotStartPosition ? shotData.shotStartPosition.y : finalPosition.y;
        }
    }
    
    if (getTerrainAt(gameState.currentHole, dropX, dropY) === 'water') {
        dropX = shotData.shotStartPosition?.x ?? finalPosition.x;
        dropY = shotData.shotStartPosition?.y ?? finalPosition.y;
    }
    
    ball.setPosition(dropX, dropY, 0);
    gameState.waterResolvedPosition = { x: dropX, y: dropY };
    gameState.pendingWaterResolution = false;
    console.log(`Water hazard resolved: ball at (${dropX.toFixed(1)}, ${dropY.toFixed(1)}), stroke count ${gameState.strokes}`);
}

/**
 * Estimate expected shot distance based on club and power
 * @param {string} clubName - Name of the club
 * @param {number} power - Power percentage (0-100)
 * @returns {number} - Expected distance in yards
 */
function estimateExpectedDistance(clubName, power) {
    // Base distances for each club (approximate)
    const clubDistances = {
        'Driver': 250,
        '3 Wood': 220,
        '5 Wood': 200,
        '3 Hybrid': 190,
        '4 Hybrid': 180,
        '4 Iron': 170,
        '5 Iron': 160,
        '6 Iron': 150,
        '7 Iron': 140,
        '8 Iron': 130,
        '9 Iron': 120,
        'PW': 110,
        'GW': 100,
        'SW': 80,
        'LW': 60,
        'Putter': 30
    };
    
    const baseDistance = clubDistances[clubName] || 150;
    return baseDistance * (power / 100);
}

// Current course (default course loaded directly)
let course = defaultCourse;

// Convert course terrain structure to zones array
function buildZonesFromTerrain(terrain) {
    const zones = [];
    const terrainMapping = {
        teeBox: TerrainType.TEE,
        fairway: TerrainType.FAIRWAY,
        rough: TerrainType.ROUGH,
        green: TerrainType.GREEN,
        bunker: TerrainType.BUNKER,
        water: TerrainType.WATER,
        outOfBounds: TerrainType.OUT_OF_BOUNDS
    };
    for (const [key, terrainType] of Object.entries(terrainMapping)) {
        const shapes = terrain[key] || [];
        for (const shape of shapes) {
            zones.push({ ...shape, terrain: terrainType });
        }
    }
    return zones;
}

// Game state - initialized after course selection
let hole1 = null;
const gameState = {
    club: clubs[0],
    power: 100,
    shape: 'Straight',
    strokes: 0,
    currentHole: null,
    currentHoleIndex: 0,
    currentLie: null,
    courseBounds: null,
    wind: { speed: 0, direction: 0 },
    putterDistance: 30  // Default putt distance in feet
};

// Game entities
const ball = new Ball(0, 0);
const aimLine = new AimLine();
let shotSimulator = null;
let world = null;
let scene, camera, renderer;
let ballMesh = null;
let aimLineMesh = null;

// Shot tracer
let shotTracerLine = null;
let shotTracerPoints = [];
let isTracingShot = false;

// Putt simulation paths
let puttSimulationLines = [];
let puttSimulationAnimations = [];
let isPuttSimulationActive = false;
let puttSimulationFadeStart = null;

// Camera fly-along state
let isCameraFlying = false;
let cameraFlyStartTime = null;
let cameraFlyDuration = TIMING.CAMERA_FLY_MIN; // Initial value, adjusted based on path length
let cameraFlyPath = [];
let cameraFlyCallback = null;

function init() {
    // Load game directly without landing page
    initGame();
}

function initGame() {
    const container = document.querySelector('.golf-hole');
    
    // Build hole data
    gameState.currentHoleIndex = 0;
    const holeData = course.holes[0];
    const zones = buildZonesFromTerrain(course.terrain || {});
    hole1 = { ...holeData, zones, trees: course.trees || [] };
    
    gameState.currentHole = hole1;
    gameState.courseBounds = course.bounds;
    
    initializeGolferHistory(golfer);
    gameState.wind = initializeWind();
    setCourse(course);
    
    // Setup Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    
    // Add atmospheric fog for depth perception
    // Fog color slightly blue-grey, starts at 250 yards, fully opaque at 600 yards
    scene.fog = new THREE.Fog(0xa8c8d8, 250, 600);
    
    camera = new THREE.PerspectiveCamera(CAMERA.FOV, container.clientWidth / container.clientHeight, CAMERA.NEAR, CAMERA.FAR);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(100, 200, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    scene.add(sun);
    
    // Create world using the simple world.js renderer
    world = createWorld(scene);
    world.loadCourse(course);
    world.setHole(1);
    
    // Initialize golfer simulation module with scene
    // Validates: Requirements 7.1, 7.2
    initGolferSimulation(scene);
    
    // Create ball mesh
    createBallMesh();
    
    // Create aim line
    createAimLineMesh();
    
    // Initialize ball (2D logic)
    ball.init(container);
    ball.setPosition(hole1.tee.x, hole1.tee.y);
    updateBallMeshPosition();
    
    // Initialize lie window
    createLieWindow();
    updateBallLie(hole1.tee.x, hole1.tee.y);
    
    // Initialize Stats HUD
    // Validates: Requirements 4.4, 4.5
    createStatsHUD(container);
    updateStatsHUD(golfer.mental);
    
    // Initialize aim line
    aimLine.init(container, ball);
    aimLine.setOnAngleChange((ballX, ballY, angle) => {
        updateAimLineMesh(ballX, ballY, angle);
        if (gameState.updateWindDisplay) gameState.updateWindDisplay(angle);
    });
    aimLine.setOnAimModeChange((isAimMode) => { 
        aimModeActive = isAimMode;
        // Change aim line color: red when aim mode active, white when inactive
        if (aimLineMesh && aimLineMesh.material) {
            aimLineMesh.material.color.setHex(isAimMode ? 0xff0000 : 0xffffff);
        }
    });
    aimLine.setProjectBallToScreen(() => getBallScreenPosition());
    aimLine.setScreenToGroundPoint(screenToGroundPoint);
    aimLine.setAimAtPoint(aimAtPoint);
    
    // Point aim from tee toward hole (along centreline when available)
    const teePos = gameState.currentHole.tee;
    const holePos = gameState.currentHole.hole;
    const centrelineAngle = getCentrelineAngleFromTee(gameState.currentHole);
    aimLine.setAngle(centrelineAngle);
    const ballPos = ball.getPosition();
    updateAimLineMesh(ballPos.x, ballPos.y, centrelineAngle);
    
    // Position camera behind ball, looking toward hole
    updateCameraForBallAlongCentreline(hole1.tee.x, hole1.tee.y, centrelineAngle);
    
    // Setup shot simulator
    shotSimulator = new ShotSimulator(ball, onShotComplete);
    
    // Setup UI
    setupUI(gameState, aimLine, ball, hitShot, world, [aimLineMesh, ballMesh, shotTracerLine]);
    if (gameState.updateWindDisplay) gameState.updateWindDisplay(centrelineAngle);
    
    // Setup Speak button for caddy interaction
    // Validates: Requirements 3.1, 3.5, 3.8
    const rightControls = document.querySelector('.right-controls');
    if (rightControls) {
        // Create speak button first
        createSpeakButton(rightControls, handleSpeakButtonClick);
        // Create Read (putt simulation) button - will be inserted before speak button
        createSimulatePuttButton(rightControls, gameState, runPuttSimulation);
    }
    
    // Setup camera controls
    setupCameraControls();
    
    // Handle resize
    window.addEventListener('resize', onResize);
    
    // Start render loop
    animate(0);
    
    console.log(`Golf game initialized! Wind: ${gameState.wind.speed} mph from ${gameState.wind.direction}°`);
    
    // Set StartOfHole timing window at hole initialization
    // Validates: Requirements 2.1, 6.1-6.4
    setTimingWindow(TimingWindow.StartOfHole);
    updateSpeakButtonVisibility();
    
    // Check for first tee golfer initiation after a short delay
    // Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
    setTimeout(() => {
        const gameContext = {
            holeNumber: 1,
            isStartOfHole: true,
            strokesOnHole: 0
        };
        checkAndShowGolferInitiation(golfer.mental, gameContext);
    }, 1500); // Delay to let UI settle
}

function createBallMesh() {
    // Golf ball is 1.68 inches diameter = 0.047 yards
    // Scale by WORLD_SCALE (4) to convert yards to 3D units, then reduce to 33% for visual balance
    const ballRadiusYards = 0.047;
    const geom = new THREE.IcosahedronGeometry(ballRadiusYards * WORLD_SCALE * 0.33, 1);
    const mat = new THREE.MeshLambertMaterial({ 
        color: 0xffffff, 
        flatShading: true,
        emissive: 0x666666 // Add self-illumination so ball stands out
    });
    ballMesh = new THREE.Mesh(geom, mat);
    ballMesh.castShadow = true;
    scene.add(ballMesh);
}


function updateBallMeshPosition() {
    if (!ballMesh || !ball || !world) return;
    const pos = ball.getPosition();
    const rawHeight = ball.getHeight();
    const pos3D = world.worldTo3D(pos.x, pos.y);
    // Ball radius is 0.047 yards, scaled by WORLD_SCALE * 0.33 for 3D positioning
    const ballRadius = 0.047 * WORLD_SCALE * 0.33;
    const terrainOffset = 0.02; // Small offset to prevent z-fighting with terrain
    
    // If height is negative, ball is dropping into hole - use directly as yards
    // If positive, it's from flight animation (pixels) - convert to yards
    const height = rawHeight < 0 ? rawHeight : rawHeight / 2.5;
    
    ballMesh.position.set(pos3D.x, pos3D.y + ballRadius + terrainOffset + height, pos3D.z);
    
    // Apply roll rotation for putting (axis in 3D: X and Z)
    const roll = ball.getRoll();
    if (roll.angle !== 0 && (roll.axisX !== 0 || roll.axisZ !== 0)) {
        const axis = new THREE.Vector3(roll.axisX, 0, roll.axisZ).normalize();
        ballMesh.quaternion.setFromAxisAngle(axis, roll.angle);
    } else {
        ballMesh.quaternion.identity();
    }
    
    // Add point to shot tracer if tracing
    if (isTracingShot) {
        addTracerPoint(pos3D.x, pos3D.y + ballRadius + terrainOffset + height, pos3D.z);
    }
}

// Shot tracer functions
function startShotTracer() {
    isTracingShot = true;
    shotTracerPoints = [];
    if (shotTracerLine) {
        scene.remove(shotTracerLine);
        shotTracerLine.geometry.dispose();
        shotTracerLine.material.dispose();
        shotTracerLine = null;
    }
}

function addTracerPoint(x, y, z) {
    const lastPoint = shotTracerPoints[shotTracerPoints.length - 1];
    if (lastPoint) {
        const dist = Math.sqrt((x - lastPoint.x) ** 2 + (y - lastPoint.y) ** 2 + (z - lastPoint.z) ** 2);
        if (dist < 0.3) return;
    }
    shotTracerPoints.push(new THREE.Vector3(x, y, z));
    updateTracerLine();
}

function updateTracerLine() {
    if (shotTracerPoints.length < 2) return;
    if (shotTracerLine) {
        scene.remove(shotTracerLine);
        shotTracerLine.geometry.dispose();
    }
    
    const colors = [];
    for (let i = 0; i < shotTracerPoints.length; i++) {
        const t = i / (shotTracerPoints.length - 1);
        colors.push(1, 1, 0.3 + t * 0.7);
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(shotTracerPoints);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2,
        transparent: true,
        opacity: 0.9
    });
    
    shotTracerLine = new THREE.Line(geometry, material);
    scene.add(shotTracerLine);
}

function stopShotTracer() {
    isTracingShot = false;
}

function clearShotTracer() {
    isTracingShot = false;
    shotTracerPoints = [];
    if (shotTracerLine) {
        scene.remove(shotTracerLine);
        shotTracerLine.geometry.dispose();
        shotTracerLine.material.dispose();
        shotTracerLine = null;
    }
}

// Putt simulation functions
function runPuttSimulation() {
    if (isPuttSimulationActive || shotSimulator.isAnimating) return;
    
    const ballPos = ball.getPosition();
    const aimAngle = aimLine.getAngle();
    const distanceFeet = gameState.putterDistance;
    
    // Set button to simulating state
    setSimulatePuttButtonSimulating(true);
    
    // Run simulations
    const simulations = runPuttSimulations(ballPos, aimAngle, distanceFeet, gameState.currentHole);
    
    // Clear any existing simulation paths
    clearPuttSimulationPaths();
    
    // Create 3D paths for each simulation
    isPuttSimulationActive = true;
    puttSimulationAnimations = [];
    
    // Color scheme: all paths same color
    const pathColor = 0x3498db;  // Blue
    const pathOpacity = 0.8;
    
    simulations.forEach((sim, index) => {
        // Convert path to 3D points
        const points3D = sim.path.map(p => {
            const pos3D = world.worldTo3D(p.x, p.y);
            return new THREE.Vector3(pos3D.x, pos3D.y + 0.05, pos3D.z); // Slight offset above terrain
        });
        
        // Create line geometry (initially empty, will be animated)
        const geometry = new THREE.BufferGeometry();
        const material = new THREE.LineBasicMaterial({
            color: pathColor,
            transparent: true,
            opacity: pathOpacity,
            linewidth: 2
        });
        
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        puttSimulationLines.push(line);
        
        // Store animation data
        puttSimulationAnimations.push({
            points3D,
            duration: sim.duration,
            startTime: null,
            currentIndex: 0,
            complete: false,
            line,
            material,
            baseOpacity: pathOpacity
        });
    });
    
    // Disable button after use
    disableSimulatePuttButton();
    setSimulatePuttButtonSimulating(false);
}

function updatePuttSimulationAnimation(currentTime) {
    if (!isPuttSimulationActive || puttSimulationAnimations.length === 0) return;
    
    let allComplete = true;
    
    puttSimulationAnimations.forEach(anim => {
        if (anim.complete) return;
        
        // Initialize start time on first frame
        if (anim.startTime === null) {
            anim.startTime = currentTime;
        }
        
        const elapsed = currentTime - anim.startTime;
        const t = Math.min(elapsed / anim.duration, 1);
        
        // Calculate how many points to show based on time
        const targetIndex = Math.floor(t * (anim.points3D.length - 1)) + 1;
        
        if (targetIndex > anim.currentIndex) {
            anim.currentIndex = targetIndex;
            
            // Update line geometry with points up to current index
            const visiblePoints = anim.points3D.slice(0, anim.currentIndex + 1);
            anim.line.geometry.dispose();
            anim.line.geometry = new THREE.BufferGeometry().setFromPoints(visiblePoints);
        }
        
        if (t >= 1) {
            anim.complete = true;
        } else {
            allComplete = false;
        }
    });
    
    // If all animations complete, start fade timer
    if (allComplete && puttSimulationFadeStart === null) {
        puttSimulationFadeStart = currentTime;
    }
    
    // Handle fade out (1 second hold, then 5 second fade)
    if (puttSimulationFadeStart !== null) {
        const fadeElapsed = currentTime - puttSimulationFadeStart;
        const holdTime = 1000; // 1 second hold
        const fadeTime = 5000; // 5 second fade
        
        if (fadeElapsed > holdTime) {
            const fadeT = Math.min((fadeElapsed - holdTime) / fadeTime, 1);
            
            // Fade out all lines
            puttSimulationAnimations.forEach(anim => {
                anim.material.opacity = anim.baseOpacity * (1 - fadeT);
            });
            
            // Clean up when fade complete
            if (fadeT >= 1) {
                clearPuttSimulationPaths();
            }
        }
    }
}

function clearPuttSimulationPaths() {
    puttSimulationLines.forEach(line => {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
    });
    puttSimulationLines = [];
    puttSimulationAnimations = [];
    isPuttSimulationActive = false;
    puttSimulationFadeStart = null;
}

// Camera fly-along functions
function startCameraFlyAlong(onComplete) {
    if (shotTracerPoints.length < 2) {
        if (onComplete) onComplete();
        return;
    }
    
    // Copy all tracer points for smooth interpolation
    cameraFlyPath = shotTracerPoints.map(p => p.clone());
    
    // Find landing point (where ball first touches ground after being in air)
    // and smooth out the Y values after landing to prevent camera bounce
    let landingIndex = -1;
    let maxHeight = 0;
    let maxHeightIndex = 0;
    
    // Find apex
    for (let i = 0; i < cameraFlyPath.length; i++) {
        if (cameraFlyPath[i].y > maxHeight) {
            maxHeight = cameraFlyPath[i].y;
            maxHeightIndex = i;
        }
    }
    
    // Find landing (first point near ground after apex)
    for (let i = maxHeightIndex; i < cameraFlyPath.length; i++) {
        if (cameraFlyPath[i].y < 0.5) {
            landingIndex = i;
            break;
        }
    }
    
    // Smooth out Y values after landing - keep camera at ground level
    if (landingIndex > 0) {
        const groundY = cameraFlyPath[landingIndex].y;
        for (let i = landingIndex; i < cameraFlyPath.length; i++) {
            cameraFlyPath[i].y = groundY;
        }
    }
    
    // Calculate cumulative distances for smooth parametric interpolation
    cameraFlyPath.distances = [0];
    for (let i = 1; i < cameraFlyPath.length; i++) {
        const dist = cameraFlyPath[i].distanceTo(cameraFlyPath[i - 1]);
        cameraFlyPath.distances.push(cameraFlyPath.distances[i - 1] + dist);
    }
    cameraFlyPath.totalLength = cameraFlyPath.distances[cameraFlyPath.distances.length - 1];
    
    // Duration based on path length
    cameraFlyDuration = Math.max(TIMING.CAMERA_FLY_MIN, Math.min(TIMING.CAMERA_FLY_MAX, cameraFlyPath.totalLength * 12));
    
    isCameraFlying = true;
    cameraFlyStartTime = null;
    cameraFlyCallback = onComplete;
    
    // Store initial camera state for smooth start
    cameraFlyPath.startPos = camera.position.clone();
    cameraFlyPath.startLookAt = new THREE.Vector3();
    camera.getWorldDirection(cameraFlyPath.startLookAt);
    cameraFlyPath.startLookAt.multiplyScalar(50).add(camera.position);
}

function getPointOnPath(path, t) {
    // Clamp t
    t = Math.max(0, Math.min(1, t));
    
    const targetDist = t * path.totalLength;
    
    // Binary search for segment
    let low = 0, high = path.distances.length - 1;
    while (low < high - 1) {
        const mid = Math.floor((low + high) / 2);
        if (path.distances[mid] <= targetDist) low = mid;
        else high = mid;
    }
    
    const segmentStart = path.distances[low];
    const segmentEnd = path.distances[high];
    const segmentLength = segmentEnd - segmentStart;
    
    if (segmentLength < 0.001) return path[low].clone();
    
    const segmentT = (targetDist - segmentStart) / segmentLength;
    return path[low].clone().lerp(path[high], segmentT);
}

function updateCameraFlyAlong(time) {
    if (!isCameraFlying || cameraFlyPath.length < 2) return false;
    
    if (cameraFlyStartTime === null) {
        cameraFlyStartTime = time;
    }
    
    const elapsed = time - cameraFlyStartTime;
    const rawT = Math.min(elapsed / cameraFlyDuration, 1);
    
    // Smooth ease-in-out (cubic)
    const t = rawT < 0.5 
        ? 4 * rawT * rawT * rawT 
        : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
    
    // Get current position on path
    const pathPos = getPointOnPath(cameraFlyPath, t);
    
    // Get look-ahead position (10% ahead on path)
    const lookAheadT = Math.min(t + 0.1, 1);
    const lookAheadPos = getPointOnPath(cameraFlyPath, lookAheadT);
    
    // Calculate smooth direction
    const direction = new THREE.Vector3().subVectors(lookAheadPos, pathPos);
    if (direction.length() < 0.01) {
        direction.set(0, 0, -1); // Default forward
    }
    direction.normalize();
    
    // Camera height: higher when ball is high, lower near ground
    const baseHeight = 2.5;
    const heightBoost = Math.max(0, pathPos.y) * 0.3;
    const camHeight = baseHeight + heightBoost;
    
    // Camera behind offset
    const behindOffset = 5;
    
    // Target camera position
    const targetCamPos = new THREE.Vector3(
        pathPos.x - direction.x * behindOffset,
        pathPos.y + camHeight,
        pathPos.z - direction.z * behindOffset
    );
    
    // Target look position
    const targetLookAt = new THREE.Vector3(
        lookAheadPos.x,
        lookAheadPos.y + 0.5,
        lookAheadPos.z
    );
    
    // Blend from starting position for first 15% of animation
    if (rawT < 0.15) {
        const blendT = rawT / 0.15;
        const smoothBlend = blendT * blendT * (3 - 2 * blendT); // smoothstep
        camera.position.lerpVectors(cameraFlyPath.startPos, targetCamPos, smoothBlend);
        const blendedLookAt = new THREE.Vector3().lerpVectors(cameraFlyPath.startLookAt, targetLookAt, smoothBlend);
        camera.lookAt(blendedLookAt);
    } else {
        camera.position.copy(targetCamPos);
        camera.lookAt(targetLookAt);
    }
    
    // Complete
    if (rawT >= 1) {
        isCameraFlying = false;
        cameraFlyPath = [];
        if (cameraFlyCallback) {
            cameraFlyCallback();
            cameraFlyCallback = null;
        }
        return false;
    }
    
    return true;
}

function createAimLineMesh() {
    const mat = new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 1,
        gapSize: 0.5,
        transparent: true,
        opacity: 0.8
    });
    const geom = new THREE.BufferGeometry();
    aimLineMesh = new THREE.Line(geom, mat);
    scene.add(aimLineMesh);
}

function updateAimLineMesh(ballX, ballY, aimAngle) {
    if (!aimLineMesh || !world) return;
    
    const aimRad = (aimAngle * Math.PI) / 180;
    const points = [];
    const bounds = course.bounds;
    
    // Line parameters - shorter on green for putting
    const onGreen = gameState.currentLie?.name === 'Green';
    const lineLength = onGreen ? 50 : 500;
    const numPoints = onGreen ? 100 : 250;
    
    // The aim line should sit at the same height as the ball
    // Ball sits at: terrain elevation + ballRadius + small offset
    const ballRadius = 0.047 * WORLD_SCALE * 0.33;
    const ballTerrainOffset = 0.02;
    const lineHeight = ballRadius + ballTerrainOffset; // Match ball height above terrain
    
    // Start exactly at the ball position
    const ballPos3D = world.worldTo3D(ballX, ballY);
    points.push(new THREE.Vector3(ballPos3D.x, ballPos3D.y + lineHeight, ballPos3D.z));
    
    // Generate points along the aim direction, following terrain
    for (let i = 1; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const dist = t * lineLength;
        const worldX = ballX + Math.sin(aimRad) * dist;
        const worldY = ballY - Math.cos(aimRad) * dist;
        
        if (worldX >= bounds.minX && worldX <= bounds.maxX && worldY >= bounds.minY && worldY <= bounds.maxY) {
            const pos3D = world.worldTo3D(worldX, worldY);
            points.push(new THREE.Vector3(pos3D.x, pos3D.y + lineHeight, pos3D.z));
        }
    }
    
    if (points.length >= 2) {
        aimLineMesh.geometry.dispose();
        aimLineMesh.geometry = new THREE.BufferGeometry().setFromPoints(points);
        aimLineMesh.computeLineDistances();
    }
}

function getBallScreenPosition() {
    if (!ballMesh || !camera || !renderer) return null;
    const vector = ballMesh.position.clone();
    vector.project(camera);
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    return {
        x: rect.left + (vector.x + 1) / 2 * rect.width,
        y: rect.top + (-vector.y + 1) / 2 * rect.height
    };
}

// Camera controls
let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;
let cameraYaw = 0, cameraPitch = 0;
let baseLookDir = new THREE.Vector3();
let aimModeActive = false;

function setupCameraControls() {
    const canvas = renderer.domElement;
    
    canvas.addEventListener('mousedown', (e) => {
        if (aimModeActive) return;
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging || aimModeActive) return;
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        cameraYaw += deltaX * 0.005;
        cameraPitch -= deltaY * 0.005;
        cameraPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 36, cameraPitch));
        updateCameraLook();
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });
    
    // Touch controls
    canvas.addEventListener('touchstart', (e) => {
        if (aimModeActive || e.touches.length !== 1) return;
        isDragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
    });
    
    canvas.addEventListener('touchmove', (e) => {
        if (!isDragging || aimModeActive || e.touches.length !== 1) return;
        e.preventDefault();
        const deltaX = e.touches[0].clientX - lastMouseX;
        const deltaY = e.touches[0].clientY - lastMouseY;
        cameraYaw += deltaX * 0.005;
        cameraPitch -= deltaY * 0.005;
        cameraPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 36, cameraPitch));
        updateCameraLook();
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
    });
    
    canvas.addEventListener('touchend', () => { isDragging = false; });
}

// Raycast to find ground point from screen coordinates
function screenToGroundPoint(clientX, clientY) {
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    
    // Normalize to -1 to 1
    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    
    // Use a ground plane at ball's elevation
    const ballPos = ball.getPosition();
    const ballPos3D = world.worldTo3D(ballPos.x, ballPos.y);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ballPos3D.y);
    const intersectPoint = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
        return intersectPoint;
    }
    
    // If ray doesn't hit plane (pointing above horizon), project ray direction onto ground
    // Use just the horizontal direction of the ray
    const dir = raycaster.ray.direction.clone();
    if (Math.abs(dir.x) > 0.001 || Math.abs(dir.z) > 0.001) {
        // Normalize horizontal direction and extend far
        const horizDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();
        const farPoint = ballPos3D.clone().add(horizDir.multiplyScalar(1000));
        farPoint.y = ballPos3D.y;
        return farPoint;
    }
    
    return null;
}

// Calculate aim angle from ball to a 3D point
function aimAtPoint(point3D) {
    if (!point3D) return;
    
    const ballPos = ball.getPosition();
    const ballPos3D = world.worldTo3D(ballPos.x, ballPos.y);
    
    // Direction from ball to clicked point
    const dx = point3D.x - ballPos3D.x;
    const dz = point3D.z - ballPos3D.z;
    
    // Convert to aim angle (0 = north, clockwise)
    const angle = Math.atan2(dx, -dz) * (180 / Math.PI);
    
    aimLine.setAngle(angle);
    updateAimLineMesh(ballPos.x, ballPos.y, angle);
}

function updateCameraLook() {
    const lookDir = baseLookDir.clone();
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
    lookDir.applyQuaternion(yawQuat);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lookDir).normalize();
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, cameraPitch);
    lookDir.applyQuaternion(pitchQuat);
    const target = camera.position.clone().add(lookDir.multiplyScalar(50));
    camera.lookAt(target);
}

function updateCameraForBall(ballX, ballY, isPutting = false) {
    const ballPos3D = world.worldTo3D(ballX, ballY);
    const holePos3D = world.getHolePosition();
    
    const dirX = holePos3D.x - ballPos3D.x;
    const dirZ = holePos3D.z - ballPos3D.z;
    const dist = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const normX = dist > 0 ? dirX / dist : 0;
    const normZ = dist > 0 ? dirZ / dist : 1;
    
    // Perpendicular direction (to the right of aim line)
    const perpX = normZ;
    const perpZ = -normX;
    
    // Use putting camera when on green or putting
    const onGreen = gameState.currentLie?.name === 'Green' || isPutting;
    
    const camHeight = onGreen ? CAMERA.PUTT_HEIGHT : CAMERA.HEIGHT;
    const camBehind = onGreen ? CAMERA.PUTT_BEHIND_DISTANCE : CAMERA.BEHIND_DISTANCE;
    const camSide = onGreen ? CAMERA.PUTT_SIDE_OFFSET : CAMERA.SIDE_OFFSET;
    
    // When putting, keep camera from dropping into depressions (e.g. near hole)
    const camY = ballPos3D.y + camHeight;
    const minCamY = onGreen ? holePos3D.y + CAMERA.PUTT_MIN_CAMERA_Y_OFFSET : camY;
    const effectiveCamY = onGreen ? Math.max(camY, minCamY) : camY;
    
    camera.position.set(
        ballPos3D.x - normX * camBehind + perpX * camSide,
        effectiveCamY,
        ballPos3D.z - normZ * camBehind + perpZ * camSide
    );
    
    // Look toward the target, level gaze (no downward tilt)
    baseLookDir.set(normX, 0, normZ).normalize();
    cameraYaw = 0;
    cameraPitch = 0;
    updateCameraLook();
}

// Camera aligned to hole centreline (using centreline angle)
function updateCameraForBallAlongCentreline(ballX, ballY, angleInDegrees, isPutting = false) {
    const ballPos3D = world.worldTo3D(ballX, ballY);
    const holePos3D = world.getHolePosition();
    
    // Convert angle to 3D direction
    const angleRad = (angleInDegrees * Math.PI) / 180;
    const norm3DX = Math.sin(angleRad);
    const norm3DZ = -Math.cos(angleRad);
    
    // Perpendicular direction (to the right of aim line)
    const perpX = norm3DZ;
    const perpZ = -norm3DX;
    
    // Use putting camera when on green or putting
    const onGreen = gameState.currentLie?.name === 'Green' || isPutting;
    
    const camHeight = onGreen ? CAMERA.PUTT_HEIGHT : CAMERA.HEIGHT;
    const camBehind = onGreen ? CAMERA.PUTT_BEHIND_DISTANCE : CAMERA.BEHIND_DISTANCE;
    const camSide = onGreen ? CAMERA.PUTT_SIDE_OFFSET : CAMERA.SIDE_OFFSET;
    
    // When putting, keep camera from dropping into depressions (e.g. near hole)
    const camY = ballPos3D.y + camHeight;
    const minCamY = onGreen ? holePos3D.y + CAMERA.PUTT_MIN_CAMERA_Y_OFFSET : camY;
    const effectiveCamY = onGreen ? Math.max(camY, minCamY) : camY;
    
    camera.position.set(
        ballPos3D.x - norm3DX * camBehind + perpX * camSide,
        effectiveCamY,
        ballPos3D.z - norm3DZ * camBehind + perpZ * camSide
    );
    
    // Look toward the target, level gaze
    baseLookDir.set(norm3DX, 0, norm3DZ).normalize();
    cameraYaw = 0;
    cameraPitch = 0;
    updateCameraLook();
}

function onResize() {
    const container = document.querySelector('.golf-hole');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function updateBallLie(x, y) {
    const terrain = getTerrainAt(gameState.currentHole, x, y);
    const slope = getSlopeAt(gameState.currentHole, x, y);
    const lie = determineLie(terrain, slope);
    gameState.currentLie = lie;
    if (shotSimulator) shotSimulator.currentLie = lie;
    updateLieWindow(lie, terrain);
    return lie;
}

function hitShot() {
    if (shotSimulator.isAnimating) return;
    gameState.strokes++;
    
    const isPutting = gameState.club.name === 'Putter';
    const intendedYards = isPutting ? (gameState.putterDistance / 3) : gameState.club.yards * (gameState.power / 100);
    
    gameState.lastShotIntent = {
        club: gameState.club.name,
        intendedYards,
        power: gameState.power,
        shape: gameState.shape,
        putterDistance: gameState.putterDistance
    };
    
    // Start shot tracer (not for putts - they stay on ground)
    if (!isPutting) {
        startShotTracer();
    }
    
    shotSimulator.hit({
        club: gameState.club,
        power: gameState.power,
        shape: gameState.shape,
        putterDistance: gameState.putterDistance,
        aimAngle: aimLine.getAngle(),
        holeData: gameState.currentHole,
        wind: getWindForShot(aimLine.getAngle())
    });
}

function onShotComplete(finalPosition, shotData) {
    // Stop shot tracer
    stopShotTracer();
    
    // Clear any putt simulation paths and reset button for next shot
    clearPuttSimulationPaths();
    resetSimulatePuttButton();
    
    // Handle golfer simulation result if player viewed simulation
    // Validates: Requirements 7.3, 7.4
    if (hasViewedGolferSimulation() && shotData && !shotData.isPutt) {
        const simulationResult = getSimulationResult();
        const currentSettings = {
            club: gameState.lastShotIntent?.club || gameState.club.name,
            power: gameState.lastShotIntent?.power || gameState.power,
            shape: gameState.lastShotIntent?.shape || gameState.shape,
            aimAngle: aimLine.getAngle()
        };
        const wasAccepted = checkIfAccepted(currentSettings);
        
        // Apply trust effects based on whether player accepted or overrode
        handleSimulationResult(
            { carryYards: shotData.carry, lateralYards: shotData.lateral },
            simulationResult,
            wasAccepted
        );
        
        // Hide the prediction line and reset simulation state
        resetSimulationState();
    }
    
    // Handle concerns result if player viewed concerns
    // Validates: Requirements 7.7, 7.8
    if (hasViewedConcernsThisShot() && shotData && !shotData.isPutt) {
        const concerns = getIdentifiedConcerns();
        const trackedSettings = getTrackedConcernSettings();
        
        if (concerns && trackedSettings) {
            const currentSettings = {
                club: gameState.lastShotIntent?.club || gameState.club.name,
                power: gameState.lastShotIntent?.power || gameState.power,
                shape: gameState.lastShotIntent?.shape || gameState.shape,
                aimAngle: aimLine.getAngle()
            };
            
            const wasAdjusted = checkIfAdjustedForConcerns(currentSettings, concerns);
            
            if (wasAdjusted) {
                // Player adjusted based on concerns - apply Trust +5
                // Validates: Requirement 7.7
                handleConcernsResult(true, concerns);
            } else if (checkIfIgnoredObviousConcern(currentSettings, concerns)) {
                // Player ignored obvious concern - apply Trust -4, Pressure +5
                // Validates: Requirement 7.8
                applyIgnorePenalty();
            }
        }
        
        // Hide concerns bubble and reset state
        resetConcernsState();
    }
    
    // Check if ball went in the hole!
    if (shotData && shotData.holed) {
        console.log('🎉 HOLED! Ball is in the cup!');
        
        // Calculate score relative to par for this hole
        // For now, assume par is stored in gameState or default to par 4
        const par = gameState.currentHole?.par || 4;
        const scoreRelativeToPar = gameState.strokes - par;
        
        // Record the hole result for the caddy system
        // Validates: Requirement 5.1
        recordHoleResult(scoreRelativeToPar);
        
        // Set EndOfHole timing window when ball is holed
        // Validates: Requirements 2.1, 9.1-9.4
        setTimingWindow(TimingWindow.EndOfHole);
        updateSpeakButtonVisibility();
        
        showHoledMessage(() => {
            // After celebration, show continue button to allow end-of-hole dialogue
            console.log(`Hole completed in ${gameState.strokes} strokes (${scoreRelativeToPar >= 0 ? '+' : ''}${scoreRelativeToPar})`);
            
            showContinueButton(() => {
                // Apply carryover effects before transitioning to next hole
                // Validates: Requirement 12.3
                resetToBaseline();
                
                // Clear EndOfHole window when transitioning to next hole
                setTimingWindow(TimingWindow.None);
                updateSpeakButtonVisibility();
                
                // Advance to next hole or finish the round
                advanceToNextHole();
            });
        });
        return;
    }
    
    const newLie = updateBallLie(finalPosition.x, finalPosition.y);
    const hole = gameState.currentHole.hole;
    const newAngle = Math.atan2(hole.x - finalPosition.x, finalPosition.y - hole.y) * (180 / Math.PI);
    
    if (gameState.updateWindDisplay) gameState.updateWindDisplay(newAngle);
    
    if (gameState.lastShotIntent && shotData && !shotData.isPutt) {
        recordShot(golfer, gameState.lastShotIntent.club, shotData);
    }
    
    // Store shot data for display in golfer tab of yardage book
    if (shotData) {
        const clubName = gameState.lastShotIntent?.club || null;
        setLastShotData(shotData, clubName);
    }
    
    // Track shot result for caddy system and determine outcome (used for water hazard flow)
    // Validates: Requirements 5.1, 5.2
    let outcome = null;
    if (shotData && !shotData.isPutt) {
        outcome = categorizeShotOutcome(shotData, newLie);
        recordShotResult(outcome);
        console.log(`Shot outcome: ${outcome}`);
        
        // Check if golfer should initiate conversation after this shot
        // Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
        const gameContext = {
            holeNumber: gameState.currentHoleIndex + 1,
            isStartOfHole: false,
            strokesOnHole: gameState.strokes
        };
        if (outcome !== ShotOutcome.HazardWater) {
            checkAndShowGolferInitiation(golfer.mental, gameContext);
        }
    }
    
    // Set PostShot timing window after shot simulation completes
    // Validates: Requirement 2.3
    setTimingWindow(TimingWindow.PostShot);
    updateSpeakButtonVisibility();
    
    function createWaterResolvedContinueCallback() {
        return () => {
            setTimingWindow(TimingWindow.None);
            updateSpeakButtonVisibility();
            const pos = gameState.waterResolvedPosition || { x: finalPosition.x, y: finalPosition.y };
            ball.setPosition(pos.x, pos.y, 0);
            const hole = gameState.currentHole.hole;
            const newAngle = Math.atan2(hole.x - pos.x, pos.y - hole.y) * (180 / Math.PI);
            clearShotTracer();
            aimLine.setAngle(newAngle);
            aimLine.render();
            const landedOnGreen = (updateBallLie(pos.x, pos.y)?.name === 'Green');
            updateCameraForBall(pos.x, pos.y, landedOnGreen);
            updateAimLineMesh(pos.x, pos.y, newAngle);
            setTimingWindow(TimingWindow.PreShot);
            updateSpeakButtonVisibility();
            updateYardageIndicator(gameState, ball);
        };
    }
    
    // Water hazard: caddy must decide how to resolve before continuing
    if (shotData && !shotData.isPutt && outcome === ShotOutcome.HazardWater) {
        gameState.pendingWaterResolution = true;
        gameState.waterResolutionData = { shotData, finalPosition };
        const state = getResultState();
        const options = postShotOptions[ShotOutcome.HazardWater] || [];
        showDialoguePanel(options, (selectedOptionId) => {
            handleDialogueSelection(selectedOptionId, options, state);
            showContinueButton(createWaterResolvedContinueCallback());
        }, golfer.mental, () => {
            handleWaterResolutionAction({ action: 'waterDropCrossing' });
            handleSilenceCallback(state);
            showContinueButton(createWaterResolvedContinueCallback());
        }, false);
        return;
    }
    
    // Update yardage indicator with new distance to hole
    // Requirements: 11.3 - Show current yardage to the hole
    updateYardageIndicator(gameState, ball);
    
    console.log(`Shot ${gameState.strokes} complete. Ball at (${finalPosition.x.toFixed(1)}, ${finalPosition.y.toFixed(1)})`);
    
    // For putts, skip the camera fly-along since there's no tracer
    const isPutt = shotData && shotData.isPutt;
    
    showContinueButton(() => {
        // Clear PostShot window when Continue is tapped
        // Validates: Requirement 2.3
        setTimingWindow(TimingWindow.None);
        updateSpeakButtonVisibility();
        
        if (isPutt) {
            // Just update camera and aim for next shot
            clearShotTracer();
            aimLine.setAngle(newAngle);
            aimLine.render();
            updateCameraForBall(finalPosition.x, finalPosition.y, true);
            updateAimLineMesh(finalPosition.x, finalPosition.y, newAngle);
            
            // Set PreShot window for next shot setup
            // Validates: Requirement 2.2
            setTimingWindow(TimingWindow.PreShot);
            updateSpeakButtonVisibility();
        } else {
            // Start camera fly-along, then set up for next shot
            startCameraFlyAlong(() => {
                // Clear shot tracer after fly-along completes
                clearShotTracer();
                
                aimLine.setAngle(newAngle);
                aimLine.render();
                // Check if we landed on the green
                const landedOnGreen = newLie?.name === 'Green';
                updateCameraForBall(finalPosition.x, finalPosition.y, landedOnGreen);
                updateAimLineMesh(finalPosition.x, finalPosition.y, newAngle);
                
                // Set PreShot window for next shot setup
                // Validates: Requirement 2.2
                setTimingWindow(TimingWindow.PreShot);
                updateSpeakButtonVisibility();
            });
        }
    });
}

/**
 * Advance to the next hole or finish the round
 */
function advanceToNextHole() {
    const nextIndex = gameState.currentHoleIndex + 1;
    
    // Check if there are more holes
    if (nextIndex >= course.holes.length) {
        showRoundComplete();
        return;
    }
    
    gameState.currentHoleIndex = nextIndex;
    const holeData = course.holes[nextIndex];
    const zones = buildZonesFromTerrain(course.terrain || {});
    const newHole = { ...holeData, zones, trees: course.trees || [] };
    
    // If tee is null, use the previous hole's cup position
    if (!newHole.tee) {
        const prevHole = course.holes[nextIndex - 1];
        newHole.tee = { x: prevHole.hole.x, y: prevHole.hole.y };
    }
    
    // Update game state
    gameState.currentHole = newHole;
    gameState.strokes = 0;
    gameState.wind = initializeWind();
    
    // Reset club to default
    gameState.club = clubs[0];
    gameState.power = 100;
    gameState.shape = 'Straight';
    
    // Update 3D world for new hole
    world.setHole(holeData.number);
    
    // Clear any leftover shot tracer
    clearShotTracer();
    clearPuttSimulationPaths();
    resetSimulatePuttButton();
    
    // Reset simulation states
    resetSimulationState();
    resetConcernsState();
    hideConcernsBubble();
    hidePredictionLine();
    
    // Move ball to new tee
    ball.setPosition(newHole.tee.x, newHole.tee.y);
    updateBallMeshPosition();
    updateBallLie(newHole.tee.x, newHole.tee.y);
    
    // Point aim from tee toward hole (along centreline when available)
    let centrelineAngle = getCentrelineAngleFromTee(newHole);
    aimLine.setAngle(centrelineAngle);
    aimLine.render();
    updateAimLineMesh(newHole.tee.x, newHole.tee.y, centrelineAngle);
    updateCameraForBallAlongCentreline(newHole.tee.x, newHole.tee.y, centrelineAngle);
    
    if (gameState.updateWindDisplay) gameState.updateWindDisplay(centrelineAngle);
    
    // Update UI
    updateYardageIndicator(gameState, ball);
    updateStatsHUD(golfer.mental);
    
    // Set StartOfHole timing window
    setTimingWindow(TimingWindow.StartOfHole);
    updateSpeakButtonVisibility();
    
    console.log(`Advanced to Hole ${holeData.number} - Par ${holeData.par}, ${holeData.yards} yards`);
    
    // Check for golfer initiation on new hole
    setTimeout(() => {
        const gameContext = {
            holeNumber: nextIndex + 1,
            isStartOfHole: true,
            strokesOnHole: 0
        };
        checkAndShowGolferInitiation(golfer.mental, gameContext);
    }, 1500);
}

/**
 * Show round complete message when all holes are finished
 */
function showRoundComplete() {
    const existing = document.querySelector('.holed-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'holed-overlay';
    overlay.innerHTML = `
        <div class="holed-message">
            <div class="holed-text">ROUND COMPLETE</div>
            <div class="holed-strokes">${course.holes.length} holes played</div>
        </div>
    `;
    document.body.appendChild(overlay);
    console.log('Round complete!');
}

/**
 * Show celebration message when ball is holed
 */
function showHoledMessage(onComplete) {
    const existing = document.querySelector('.holed-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'holed-overlay';
    overlay.innerHTML = `
        <div class="holed-message">
            <div class="holed-text">HOLED!</div>
            <div class="holed-strokes">${gameState.strokes} ${gameState.strokes === 1 ? 'stroke' : 'strokes'}</div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Auto-dismiss after 2 seconds
    setTimeout(() => {
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
            if (onComplete) onComplete();
        }, 500);
    }, 2000);
}

function showContinueButton(onContinue) {
    const existing = document.querySelector('.continue-overlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'continue-overlay';
    const button = document.createElement('button');
    button.className = 'continue-button';
    button.textContent = 'Continue';
    button.addEventListener('click', () => {
        overlay.remove();
        onContinue();
    });
    overlay.appendChild(button);
    document.body.appendChild(overlay);
}

// Game loop state for pause support
const loopState = {
    isPaused: false,
    lastTime: 0,
    updateCallbacks: [],
    renderCallbacks: []
};

// Main game loop with pause support
function gameLoop(currentTime) {
    requestAnimationFrame(gameLoop);
    
    if (loopState.isPaused) {
        return;
    }
    
    const deltaTime = currentTime - loopState.lastTime;
    loopState.lastTime = currentTime;
    
    // Update phase - run all update callbacks
    loopState.updateCallbacks.forEach(cb => cb(deltaTime, currentTime));
    
    // Render phase - run all render callbacks
    loopState.renderCallbacks.forEach(cb => cb());
}

// Core update function (registered as update callback)
function coreUpdate(deltaTime, currentTime) {
    if (world) world.update(currentTime * 0.001);
    
    // Update camera fly-along if active
    if (isCameraFlying) {
        updateCameraFlyAlong(currentTime);
    }
    
    // Update putt simulation animation if active
    if (isPuttSimulationActive) {
        updatePuttSimulationAnimation(currentTime);
    }
    
    updateBallMeshPosition();
}

// Core render function (registered as render callback)
function coreRender() {
    renderer.render(scene, camera);
}

// Public API for pause support
export function pause() {
    loopState.isPaused = true;
}

export function resume() {
    loopState.isPaused = false;
    loopState.lastTime = performance.now();
}

export function isPaused() {
    return loopState.isPaused;
}

export function addUpdateCallback(callback) {
    loopState.updateCallbacks.push(callback);
}

export function addRenderCallback(callback) {
    loopState.renderCallbacks.push(callback);
}

// Legacy animate function - now starts the game loop
function animate(time) {
    // Register core callbacks
    loopState.updateCallbacks.push(coreUpdate);
    loopState.renderCallbacks.push(coreRender);
    
    // Initialize lastTime
    loopState.lastTime = time;
    
    // Start the game loop
    gameLoop(time);
}

document.addEventListener('DOMContentLoaded', init);
