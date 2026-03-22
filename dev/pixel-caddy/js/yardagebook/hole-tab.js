/**
 * Yardage Book - Hole Tab
 * 
 * Renders the hole overview map showing:
 * - Terrain features (fairway, rough, bunkers, water)
 * - Distance markers and yardage overlays
 * - Ball position and hole location
 * - Slope arrows and compass rose
 * 
 * Validates: Requirements 5.2
 */

import { 
    worldToCapture, 
    drawTerrainFeatures, 
    drawPathFeatures,
    calculateFocusBounds,
    calculateViewSpaceFocusBounds,
    calculateViewExtentFromViewSpaceBounds,
    calculateRotatedViewExtent,
    calculateHoleYardage,
    filterFeaturesForHole
} from './utils.js';
import { THEME_COLORS } from '../theme-colors.js';
import { getWorldInstance } from './index.js';
import { 
    WORLD_SCALE, 
    yardsToWorld,
    worldToYards,
    findCircleCentrelineIntersection,
    seededRandom
} from '../utils.js';
import { 
    getSlopeAt, 
    findGreenFront,
    findTeeFront,
    getTerrainAt, 
    TerrainType, 
    getElevationAt 
} from '../terrain.js';
import { treeProperties } from '../trees.js';

/**
 * Render the hole tab content.
 * Creates a 2D map view of the hole with terrain, trees, and yardage overlays.
 * 
 * @param {HTMLElement} container - The container element to render into
 * @param {Object} hole - The hole data object
 */
export function renderHoleTab(container, hole) {
    const yardage = calculateHoleYardage(hole);
    container.innerHTML = `
        <div class="yardage-header-compact">
            <span class="hole-info-compact">${hole.name} · Par ${hole.par} · ${yardage} yds</span>
        </div>
        <div class="yardage-map-hole" id="yardage-map-hole">
            <div class="yardage-loading">Capturing view...</div>
        </div>
    `;

    // Capture the world view after a brief delay to let container render
    requestAnimationFrame(() => {
        renderCapturedHoleMap(container, hole);
    });
}

/**
 * Render the captured hole map with terrain, trees, and overlays.
 * 
 * @param {HTMLElement} container - The container element
 * @param {Object} hole - The hole data object
 */
function renderCapturedHoleMap(container, hole) {
    const mapContainer = container.querySelector('#yardage-map-hole');
    if (!mapContainer) return;
    
    // Get container dimensions
    const containerRect = mapContainer.getBoundingClientRect();
    const width = Math.floor(containerRect.width) || 400;
    const height = Math.floor(containerRect.height) || 500;
    
    // Clear loading message
    mapContainer.innerHTML = '';
    
    // Get full terrain (water, fairways, greens, bunkers, etc.); filter only trees/points to 50yd corridor
    const worldInstance = getWorldInstance();
    let terrain = null;
    let trees = null;
    let sprinklerHeads = null;
    let measurePoints = null;
    if (worldInstance && worldInstance.course) {
        const filtered = filterFeaturesForHole(
            worldInstance.course.terrain,
            worldInstance.course.trees,
            worldInstance.course.sprinklerHeads,
            worldInstance.course.measurePoints,
            hole,
            Infinity, // full map: include all trees, sprinkler heads, measure points
            Infinity  // full terrain: include all fairways, greens, water, bunkers
        );
        terrain = filtered.terrain;
        trees = filtered.trees;
        sprinklerHeads = filtered.sprinklerHeads;
        measurePoints = filtered.measurePoints;
    }
    
    // Full map: use focus bounds (tee + fairway + green, green buffered 25yd).
    // Bounding box is built in view space after rotation so it's vertical (tee bottom, green top).
    const teeRef = findTeeFront(hole) || hole.tee;
    const greenRef = findGreenFront(hole) || hole.hole;
    const dx = greenRef.x - teeRef.x;
    const dy = greenRef.y - teeRef.y;
    const rotationAngle = Math.atan2(dx, -dy);
    const centerWorld = { x: (teeRef.x + greenRef.x) / 2, y: (teeRef.y + greenRef.y) / 2 };

    let viewWidth, viewHeight;
    const viewSpaceBounds = calculateViewSpaceFocusBounds(hole, terrain, centerWorld, rotationAngle, 25);
    if (viewSpaceBounds) {
        const extent = calculateViewExtentFromViewSpaceBounds(viewSpaceBounds, width, height);
        viewWidth = extent.viewWidth;
        viewHeight = extent.viewHeight;
    } else {
        const bounds = calculateFocusBounds(hole, terrain, 25);
        const viewExtent = calculateRotatedViewExtent(bounds, rotationAngle, width, height);
        viewWidth = viewExtent.viewWidth;
        viewHeight = viewExtent.viewHeight;
    }

    // Create canvas for 2D rendering
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%;';
    
    const ctx = canvas.getContext('2d');
    
    // Fill with light green (rough/grass base)
    ctx.fillStyle = THEME_COLORS.rough;
    ctx.fillRect(0, 0, width, height);
    
    // Store capture data for coordinate transforms
    const captureData = {
        centerWorld: centerWorld,
        rotationAngle: rotationAngle,
        viewWidth: viewWidth,
        viewHeight: viewHeight,
        width: width,
        height: height
    };
    
    // Helper to convert world coords to canvas coords (with rotation)
    function worldToCanvas(worldX, worldY) {
        return worldToCapture(worldX, worldY, captureData);
    }
    
    // Draw terrain features - each layer draws fill then outline
    // Higher layers cover lower layer outlines where they overlap
    if (terrain) {
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        
        // Layer 1: Fairway (fill + outline)
        ctx.fillStyle = THEME_COLORS.fairway;
        drawTerrainFeatures(ctx, terrain.fairway, worldToCanvas);
        drawTerrainOutlinesForType(ctx, terrain.fairway, worldToCanvas);
        
        // Layer 2: Tee box (fill + outline)
        ctx.fillStyle = THEME_COLORS.fairway;
        drawTerrainFeatures(ctx, terrain.teeBox, worldToCanvas);
        drawTerrainOutlinesForType(ctx, terrain.teeBox, worldToCanvas);
        
        // Draw path (no outline needed)
        ctx.strokeStyle = THEME_COLORS.path;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawPathFeatures(ctx, terrain.path, worldToCanvas, viewWidth, width);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        
        // Layer 3: Water (fill + outline) - covers fairway outline
        ctx.fillStyle = THEME_COLORS.water;
        drawTerrainFeatures(ctx, terrain.water, worldToCanvas);
        drawTerrainOutlinesForType(ctx, terrain.water, worldToCanvas);

        // Layer 4: Bunkers (fill + outline) - covers fairway outline
        ctx.fillStyle = THEME_COLORS.bunker;
        drawTerrainFeatures(ctx, terrain.bunker, worldToCanvas);
        drawTerrainOutlinesForType(ctx, terrain.bunker, worldToCanvas);
        
        // Layer 5: Green (fill + outline) - covers fairway/bunker outlines
        ctx.fillStyle = THEME_COLORS.green;
        drawTerrainFeatures(ctx, terrain.green, worldToCanvas);
        drawTerrainOutlinesForType(ctx, terrain.green, worldToCanvas);
    }
    
    // Draw slope arrows on canvas (below trees)
    drawSlopeArrowsOnCanvas(ctx, hole, captureData, worldToCanvas);
    
    // Draw trees (flattened 2D canopy clusters with black dot for trunk)
    if (trees) {
        trees.forEach(tree => {
            const props = treeProperties[tree.type];
            if (!props) return;
            
            const pos = worldToCanvas(tree.x, tree.y);
            // canopyRadius in treeProperties is in YARDS; yardage book uses world units (1 unit = 4 yd)
            const canopyRadiusYards = (props.canopyRadius.min + props.canopyRadius.max) / 2;
            const canopyRadius = yardsToWorld(canopyRadiusYards);
            const category = props.category;
            
            // Generate seed from tree position for consistent randomness
            const seed = Math.abs(tree.x * 1000 + tree.y * 7);
            
            // Draw flattened canopy clusters
            ctx.fillStyle = 'rgba(34, 85, 34, 0.5)';
            drawTree2DCanopy(ctx, pos, canopyRadius, category, seed, viewWidth, width, rotationAngle);
            
            // Black dot for trunk
            ctx.fillStyle = 'black';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    mapContainer.appendChild(canvas);
    
    // Add overlays (yardage markers, terrain outlines, etc.) - slope arrows now on canvas
    renderYardageOverlays(mapContainer, hole, captureData, terrain, trees, sprinklerHeads, measurePoints);
    
    // Add compass rose
    addCompassRose(mapContainer, rotationAngle);
}

/**
 * Draw flattened 2D tree canopy based on tree type.
 * Creates clusters of circles to represent the canopy from above.
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} pos - Screen position {x, y}
 * @param {number} canopyRadius - Canopy radius in world units
 * @param {string} category - Tree category (tall_pine, short_pine, deciduous)
 * @param {number} seed - Random seed for consistent appearance
 * @param {number} viewWidth - View width in world units
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} rotationAngle - Map rotation angle in radians
 */
function drawTree2DCanopy(ctx, pos, canopyRadius, category, seed, viewWidth, canvasWidth, rotationAngle) {
    const scale = canvasWidth / viewWidth;
    
    if (category === 'tall_pine') {
        // Tall pines - sparse clusters at branch ends, mostly at top
        const branchCount = 4 + Math.floor(seededRandom(seed + 20) * 3);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = seededRandom(seed + 40 + i) * Math.PI * 2 + rotationAngle;
            const branchLength = canopyRadius * (0.4 + seededRandom(seed + 50 + i) * 0.5);
            
            // 1-2 clusters per branch
            const clusterCount = 1 + Math.floor(seededRandom(seed + 70 + i) * 2);
            for (let j = 0; j < clusterCount; j++) {
                const clusterSize = canopyRadius * (0.25 + seededRandom(seed + 80 + i * 10 + j) * 0.3);
                const dist = branchLength * (0.6 + seededRandom(seed + 90 + i * 10 + j) * 0.4);
                
                const cx = pos.x + Math.cos(angle) * dist * scale;
                const cy = pos.y + Math.sin(angle) * dist * scale;
                const r = Math.max(clusterSize * scale, 3);
                
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Small top cluster
        const topSize = canopyRadius * 0.4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(topSize * scale, 3), 0, Math.PI * 2);
        ctx.fill();

    } else if (category === 'short_pine') {
        // Short pines - denser, more clusters
        const branchCount = 5 + Math.floor(seededRandom(seed + 20) * 3);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = seededRandom(seed + 40 + i) * Math.PI * 2 + rotationAngle;
            const branchLength = canopyRadius * (0.5 + seededRandom(seed + 50 + i) * 0.5);
            
            const clusterCount = 2 + Math.floor(seededRandom(seed + 70 + i) * 2);
            for (let j = 0; j < clusterCount; j++) {
                const clusterSize = canopyRadius * (0.3 + seededRandom(seed + 80 + i * 10 + j) * 0.3);
                const dist = branchLength * (0.5 + seededRandom(seed + 90 + i * 10 + j) * 0.5);
                
                const cx = pos.x + Math.cos(angle) * dist * scale;
                const cy = pos.y + Math.sin(angle) * dist * scale;
                const r = Math.max(clusterSize * scale, 3);
                
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Center cluster
        const centerSize = canopyRadius * 0.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(centerSize * scale, 4), 0, Math.PI * 2);
        ctx.fill();
        
    } else if (category === 'deciduous') {
        // Deciduous - rounder, fuller canopy with overlapping clusters
        const branchCount = 5 + Math.floor(seededRandom(seed + 20) * 4);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = seededRandom(seed + 40 + i) * Math.PI * 2 + rotationAngle;
            const branchLength = canopyRadius * (0.3 + seededRandom(seed + 50 + i) * 0.6);
            
            const clusterCount = 2 + Math.floor(seededRandom(seed + 70 + i) * 3);
            for (let j = 0; j < clusterCount; j++) {
                const clusterSize = canopyRadius * (0.35 + seededRandom(seed + 80 + i * 10 + j) * 0.4);
                const dist = branchLength * (0.4 + seededRandom(seed + 90 + i * 10 + j) * 0.6);
                
                const cx = pos.x + Math.cos(angle) * dist * scale;
                const cy = pos.y + Math.sin(angle) * dist * scale;
                const r = Math.max(clusterSize * scale, 4);

                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Large center cluster for deciduous
        const centerSize = canopyRadius * 0.6;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.max(centerSize * scale, 5), 0, Math.PI * 2);
        ctx.fill();
        
    } else {
        // Fallback - simple circle
        const r = Math.max(canopyRadius * scale, 4);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Draw slope arrows directly on the canvas (below trees).
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} hole - The hole data object
 * @param {Object} captureData - Capture configuration
 * @param {Function} worldToCanvas - Coordinate transform function
 */
function drawSlopeArrowsOnCanvas(ctx, hole, captureData, worldToCanvas) {
    const { centerWorld, viewWidth, viewHeight, width, height } = captureData;

    // Grid spacing in world units (5 world units = 20 yards)
    const gridSpacing = 5;
    
    // Minimum gradient to show arrow (feet per yard)
    const minGradient = 0.35;
    
    // Gradient for full opacity (feet per yard)
    const maxGradient = 4.0;
    
    // Fixed arrow length in pixels
    const arrowLength = 10;
    
    // Calculate world bounds visible in capture
    const halfViewW = viewWidth / 2;
    const halfViewH = viewHeight / 2;
    
    const minX = centerWorld.x - halfViewW;
    const maxX = centerWorld.x + halfViewW;
    const minY = centerWorld.y - halfViewH;
    const maxY = centerWorld.y + halfViewH;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Sample grid points
    for (let worldX = minX; worldX <= maxX; worldX += gridSpacing) {
        for (let worldY = minY; worldY <= maxY; worldY += gridSpacing) {
            // Skip greens, bunkers, and water
            const terrain = getTerrainAt(hole, worldX, worldY);
            if (terrain === TerrainType.GREEN || 
                terrain === TerrainType.BUNKER || 
                terrain === TerrainType.WATER) continue;
            
            const slope = getSlopeAt(hole, worldX, worldY);
            
            // Skip if gradient too small (flat areas)
            if (slope.magnitude < minGradient) continue;
            
            // Calculate opacity based on gradient (0.4 to 1.0)
            const gradientNormalized = Math.min((slope.magnitude - minGradient) / (maxGradient - minGradient), 1.0);
            const opacity = 0.4 + gradientNormalized * 0.6;
            
            // Calculate stroke width based on gradient (1.0 to 2.5)
            const strokeWidth = 1.0 + gradientNormalized * 1.5;
            
            // Get screen position
            const pos = worldToCanvas(worldX, worldY);

            // Skip if outside visible area
            if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) continue;
            
            // Downhill direction (negative of gradient)
            const downhillX = -slope.x;
            const downhillY = -slope.y;
            const mag = Math.sqrt(downhillX * downhillX + downhillY * downhillY);
            
            if (mag === 0) continue;
            
            // Normalize direction
            const dirX = downhillX / mag;
            const dirY = downhillY / mag;
            
            // Apply rotation to match camera view
            const cos = Math.cos(captureData.rotationAngle);
            const sin = Math.sin(captureData.rotationAngle);
            const rotDirX = dirX * cos + dirY * sin;
            const rotDirY = -dirX * sin + dirY * cos;
            
            // Calculate arrow endpoints - centered on grid point
            const halfLen = arrowLength / 2;
            const startX = pos.x - rotDirX * halfLen;
            const startY = pos.y - rotDirY * halfLen;
            const endX = pos.x + rotDirX * halfLen;
            const endY = pos.y + rotDirY * halfLen;
            
            // Set style
            ctx.strokeStyle = `rgba(68, 68, 68, ${opacity})`;
            ctx.lineWidth = strokeWidth;
            
            // Draw arrow line
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            
            // Draw arrowhead at downhill end
            const headSize = 3;
            const headAngle = Math.PI / 6; // 30 degrees
            const angle = Math.atan2(rotDirY, rotDirX);
            const wing1X = endX - headSize * Math.cos(angle - headAngle);
            const wing1Y = endY - headSize * Math.sin(angle - headAngle);
            const wing2X = endX - headSize * Math.cos(angle + headAngle);
            const wing2Y = endY - headSize * Math.sin(angle + headAngle);
            
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(wing1X, wing1Y);
            ctx.moveTo(endX, endY);
            ctx.lineTo(wing2X, wing2Y);
            ctx.stroke();
        }
    }
}

/**
 * Draw terrain outlines for a specific terrain type array.
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Array} features - Array of terrain features
 * @param {Function} worldToCanvas - Coordinate transform function
 */
function drawTerrainOutlinesForType(ctx, features, worldToCanvas) {
    if (!features) return;
    
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    
    features.forEach(feature => {
        drawFeatureOutline(ctx, feature, worldToCanvas);
    });
}

/**
 * Draw outline for a single terrain feature on canvas.
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} feature - The terrain feature
 * @param {Function} worldToCanvas - Coordinate transform function
 */
function drawFeatureOutline(ctx, feature, worldToCanvas) {
    ctx.beginPath();
    
    if (feature.shape === 'polygon' && feature.points) {
        feature.points.forEach((pt, i) => {
            const pos = worldToCanvas(pt[0], pt[1]);
            if (i === 0) {
                ctx.moveTo(pos.x, pos.y);
            } else {
                ctx.lineTo(pos.x, pos.y);
            }
        });
        ctx.closePath();
    } else if (feature.shape === 'ellipse') {
        // Draw ellipse
        for (let a = 0; a <= Math.PI * 2; a += 0.1) {
            const wx = feature.cx + feature.rx * Math.cos(a);
            const wy = feature.cy + feature.ry * Math.sin(a);
            const pos = worldToCanvas(wx, wy);
            if (a === 0) {
                ctx.moveTo(pos.x, pos.y);
            } else {
                ctx.lineTo(pos.x, pos.y);
            }
        }
        ctx.closePath();
    } else if (feature.shape === 'rect') {
        const tl = worldToCanvas(feature.x, feature.y);
        const tr = worldToCanvas(feature.x + feature.width, feature.y);
        const br = worldToCanvas(feature.x + feature.width, feature.y + feature.height);
        const bl = worldToCanvas(feature.x, feature.y + feature.height);
        
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(bl.x, bl.y);
        ctx.closePath();
    }
    
    ctx.stroke();
}

/**
 * Calculate reference points for yardage overlays.
 * @param {Object} hole - The hole data object
 * @returns {Object} Reference points {teeFront, greenFront}
 */
function calculateReferencePoints(hole) {
    return {
        teeFront: findTeeFront(hole),
        greenFront: findGreenFront(hole)
    };
}

/**
 * Render yardage overlays on the hole map.
 * Includes terrain outlines, slope arrows, distance markers, and hazard yardages.
 * 
 * @param {HTMLElement} container - The map container element
 * @param {Object} hole - The hole data object
 * @param {Object} captureData - Capture configuration for coordinate transforms
 * @param {Object} filteredTerrain - Pre-filtered terrain features for this hole
 * @param {Array} filteredTrees - Pre-filtered trees for this hole
 */
function renderYardageOverlays(container, hole, captureData, filteredTerrain, filteredTrees, filteredSprinklerHeads, filteredMeasurePoints) {
    // Create SVG overlay for circles and labels
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'yardage-overlay-svg');
    svg.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;';
    svg.setAttribute('viewBox', `0 0 ${captureData.width} ${captureData.height}`);

    const refs = calculateReferencePoints(hole);
    const greenFront = refs.greenFront;
    const teeFront = refs.teeFront;
    
    // Terrain outlines are now drawn on canvas (below trees)
    
    // Create a group for labels that will be added last (on top of everything)
    const labelsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelsGroup.setAttribute('class', 'yardage-labels-group');
    
    // === LAYER 2: Distance circles and markers ===
    // Collect all occupied positions (yardage markers) to avoid label overlap
    const occupiedPositions = [];
    
    // Add fairway yardage markers (100, 150, 200 from front of green)
    if (hole.centreline && greenFront) {
        const markerYardages = [100, 150, 200];
        const markerColors = [THEME_COLORS.markerRed, THEME_COLORS.markerWhite, THEME_COLORS.markerBlue]; // Red, White, Blue
        
        // Get elevation at front of green for elevation difference calc
        const greenFrontElevation = getElevationAt(hole, greenFront.x, greenFront.y);
        
        markerYardages.forEach((yards, idx) => {
            const radiusWorld = yardsToWorld(yards);
            const markerWorldPos = findCircleCentrelineIntersection(hole.centreline, greenFront, radiusWorld);
            if (markerWorldPos) {
                const pos = worldToCapture(markerWorldPos.x, markerWorldPos.y, captureData);
                
                // Calculate distance from tee
                let yardsFromTee = null;
                if (teeFront) {
                    const dx = markerWorldPos.x - teeFront.x;
                    const dy = markerWorldPos.y - teeFront.y;
                    const distWorld = Math.sqrt(dx * dx + dy * dy);
                    yardsFromTee = Math.round(worldToYards(distWorld));
                }
                
                // Calculate elevation difference to front of green
                const markerElevation = getElevationAt(hole, markerWorldPos.x, markerWorldPos.y);
                const elevDiff = Math.round(greenFrontElevation - markerElevation);
                
                addYardageMarker(svg, labelsGroup, pos, markerColors[idx], yards, yardsFromTee, elevDiff);
                occupiedPositions.push({ x: pos.x, y: pos.y, radius: 30 });
            }
        });
    }

    // === LAYER 4: Hazard cover yardages (top) ===
    if (hole.centreline && teeFront) {
        addHazardCoverYardages(svg, labelsGroup, hole, teeFront, captureData, occupiedPositions, filteredTerrain);
    }
    
    // === LAYER 5: Tree yardages ===
    if (teeFront && greenFront) {
        addTreeYardages(svg, labelsGroup, hole, teeFront, greenFront, captureData, occupiedPositions, filteredTrees);
    }
    
    // === LAYER 6: Sprinkler head yardages ===
    if (teeFront && greenFront) {
        addSprinklerHeadYardages(svg, labelsGroup, hole, teeFront, greenFront, captureData, occupiedPositions, filteredSprinklerHeads);
    }
    
    // === LAYER 7: Measure point yardages ===
    if (teeFront && greenFront) {
        addMeasurePointYardages(svg, labelsGroup, hole, teeFront, greenFront, captureData, occupiedPositions, filteredMeasurePoints);
    }
    
    // Append labels group last so labels are on top of everything
    svg.appendChild(labelsGroup);
    
    container.appendChild(svg);
    
    // Add reference markers (quartered circles at front of tee and front of green)
    if (teeFront) {
        addReferenceMarker(container, teeFront, captureData, 'tee');
    }
    if (greenFront) {
        addReferenceMarker(container, greenFront, captureData, 'green');
    }
}

/**
 * Add a yardage marker to the SVG overlay.
 * Shows yards to green, yards from tee, and elevation difference.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} pos - Screen position {x, y}
 * @param {string} color - Marker color
 * @param {number} yardsToGreen - Distance to front of green
 * @param {number} yardsFromTee - Distance from tee
 * @param {number} elevDiff - Elevation difference
 */
function addYardageMarker(svg, labelsGroup, pos, color, yardsToGreen, yardsFromTee, elevDiff) {
    // Marker circle - smaller with black outline
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', '3.5');
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', 'black');
    circle.setAttribute('stroke-width', '1');
    svg.appendChild(circle);
    
    // Text positioning - closer to the marker (50% closer)
    const textX = pos.x + 5;
    const textY = pos.y;
    
    // 1. Black number - yards to front of green
    const greenText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    greenText.setAttribute('x', textX);
    greenText.setAttribute('y', textY);
    greenText.setAttribute('fill', 'black');
    greenText.setAttribute('font-size', '15');
    greenText.setAttribute('font-weight', 'bold');
    greenText.setAttribute('dominant-baseline', 'middle');
    greenText.setAttribute('stroke', 'white');
    greenText.setAttribute('stroke-width', '2');
    greenText.setAttribute('paint-order', 'stroke');
    greenText.textContent = yardsToGreen;
    labelsGroup.appendChild(greenText);
    
    // 2. Red number - yards from front of tee (smaller, almost touching below)
    if (yardsFromTee !== null) {
        const teeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        teeText.setAttribute('x', textX);
        teeText.setAttribute('y', textY + 10);
        teeText.setAttribute('fill', THEME_COLORS.compassRed);
        teeText.setAttribute('font-size', '12');
        teeText.setAttribute('font-weight', 'bold');
        teeText.setAttribute('dominant-baseline', 'middle');
        teeText.setAttribute('stroke', 'white');
        teeText.setAttribute('stroke-width', '1.5');
        teeText.setAttribute('paint-order', 'stroke');
        teeText.textContent = yardsFromTee;
        labelsGroup.appendChild(teeText);
    }
    
    // 3. Black elevation difference (smaller, almost touching above)
    if (elevDiff !== null && elevDiff !== 0) {
        const elevText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        elevText.setAttribute('x', textX);
        elevText.setAttribute('y', textY - 9);
        elevText.setAttribute('fill', 'black');
        elevText.setAttribute('font-size', '11');
        elevText.setAttribute('font-weight', 'bold');
        elevText.setAttribute('dominant-baseline', 'middle');
        elevText.setAttribute('stroke', 'white');
        elevText.setAttribute('stroke-width', '1.5');
        elevText.setAttribute('paint-order', 'stroke');
        elevText.textContent = (elevDiff > 0 ? '+' : '') + elevDiff;
        labelsGroup.appendChild(elevText);
    }
}

/**
 * Add a reference marker (quartered circle) at a world position.
 * 
 * @param {HTMLElement} container - The container element
 * @param {Object} worldPos - World position {x, y}
 * @param {Object} captureData - Capture configuration
 * @param {string} type - Marker type ('tee' or 'green')
 */
function addReferenceMarker(container, worldPos, captureData, type) {
    const pos = worldToCapture(worldPos.x, worldPos.y, captureData);

    const marker = document.createElement('div');
    marker.className = `yardage-ref-marker ${type}-ref`;
    marker.style.cssText = `position: absolute; left: ${pos.x}px; top: ${pos.y}px; transform: translate(-50%, -50%); z-index: 15;`;
    marker.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" fill="none" stroke="${THEME_COLORS.textDark}" stroke-width="1"/>
            <path d="M8,1 A7,7 0 0,1 15,8 L8,8 Z" fill="${THEME_COLORS.markerWhite}"/>
            <path d="M8,8 A7,7 0 0,1 1,8 L8,8 Z" fill="${THEME_COLORS.markerWhite}"/>
            <path d="M15,8 A7,7 0 0,1 8,15 L8,8 Z" fill="${THEME_COLORS.textDark}"/>
            <path d="M1,8 A7,7 0 0,1 8,1 L8,8 Z" fill="${THEME_COLORS.textDark}"/>
        </svg>
    `;
    container.appendChild(marker);
}

/**
 * Add black outlines around terrain features (bunkers, water, green).
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} hole - The hole data object
 * @param {Object} captureData - Capture configuration
 */
function addTerrainOutlines(svg, hole, captureData) {
    const worldInstance = getWorldInstance();
    let terrain = null;
    if (worldInstance && worldInstance.course && worldInstance.course.terrain) {
        terrain = worldInstance.course.terrain;
    }
    
    if (!terrain) return;
    
    const outlineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    outlineGroup.setAttribute('class', 'terrain-outlines');
    
    // Draw fairway outlines
    if (terrain.fairway) {
        terrain.fairway.forEach(fairway => {
            drawTerrainOutline(outlineGroup, fairway, captureData);
        });
    }
    
    // Draw tee box outlines
    if (terrain.teeBox) {
        terrain.teeBox.forEach(tee => {
            drawTerrainOutline(outlineGroup, tee, captureData);
        });
    }

    // Draw out of bounds outlines
    if (terrain.outOfBounds) {
        terrain.outOfBounds.forEach(oob => {
            drawTerrainOutline(outlineGroup, oob, captureData);
        });
    }
    
    // Draw bunker outlines
    if (terrain.bunker) {
        terrain.bunker.forEach(bunker => {
            drawTerrainOutline(outlineGroup, bunker, captureData);
        });
    }
    
    // Draw water outlines
    if (terrain.water) {
        terrain.water.forEach(water => {
            drawTerrainOutline(outlineGroup, water, captureData);
        });
    }
    
    // Draw green outlines
    if (terrain.green) {
        terrain.green.forEach(green => {
            drawTerrainOutline(outlineGroup, green, captureData);
        });
    }
    
    svg.appendChild(outlineGroup);
}

/**
 * Draw outline for a single terrain feature.
 * Only draws the stroke outline - fill is handled by the canvas layer below.
 * 
 * @param {SVGGElement} group - The SVG group element
 * @param {Object} feature - The terrain feature
 * @param {Object} captureData - Capture configuration
 */
function drawTerrainOutline(group, feature, captureData) {
    if (feature.shape === 'polygon' && feature.points) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = '';
        feature.points.forEach((pt, i) => {
            const pos = worldToCapture(pt[0], pt[1], captureData);
            d += (i === 0 ? 'M' : 'L') + `${pos.x},${pos.y}`;
        });
        d += 'Z';
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '1');
        group.appendChild(path);
    } else if (feature.shape === 'ellipse') {
        // Draw ellipse as a path (to handle rotation properly)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = '';
        for (let a = 0; a <= Math.PI * 2; a += 0.1) {
            const wx = feature.cx + feature.rx * Math.cos(a);
            const wy = feature.cy + feature.ry * Math.sin(a);
            const pos = worldToCapture(wx, wy, captureData);
            d += (a === 0 ? 'M' : 'L') + `${pos.x},${pos.y}`;
        }
        d += 'Z';
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '1');
        group.appendChild(path);
    } else if (feature.shape === 'rect') {
        // Draw rect as a path with 4 corners (to handle rotation properly)
        const tl = worldToCapture(feature.x, feature.y, captureData);
        const tr = worldToCapture(feature.x + feature.width, feature.y, captureData);
        const br = worldToCapture(feature.x + feature.width, feature.y + feature.height, captureData);
        const bl = worldToCapture(feature.x, feature.y + feature.height, captureData);
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M${tl.x},${tl.y} L${tr.x},${tr.y} L${br.x},${br.y} L${bl.x},${bl.y} Z`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '1');
        group.appendChild(path);
    }
}

/**
 * Add slope arrows showing terrain gradient.
 * Arrows point downhill, fixed length, opacity indicates steepness.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} hole - The hole data object
 * @param {Object} captureData - Capture configuration
 */
function addSlopeArrows(svg, hole, captureData) {
    const { centerWorld, viewWidth, viewHeight, width, height } = captureData;

    // Grid spacing in world units (5 world units = 20 yards)
    const gridSpacing = 5;
    
    // Minimum gradient to show arrow (feet per yard)
    const minGradient = 0.35;
    
    // Gradient for full opacity (feet per yard)
    const maxGradient = 4.0;
    
    // Fixed arrow length in pixels
    const arrowLength = 10;
    
    // Calculate world bounds visible in capture
    const halfViewW = viewWidth / 2;
    const halfViewH = viewHeight / 2;
    
    const minX = centerWorld.x - halfViewW;
    const maxX = centerWorld.x + halfViewW;
    const minY = centerWorld.y - halfViewH;
    const maxY = centerWorld.y + halfViewH;
    
    // Create a group for all arrows
    const arrowGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arrowGroup.setAttribute('class', 'slope-arrows');
    
    // Sample grid points
    for (let worldX = minX; worldX <= maxX; worldX += gridSpacing) {
        for (let worldY = minY; worldY <= maxY; worldY += gridSpacing) {
            // Skip greens, bunkers, and water
            const terrain = getTerrainAt(hole, worldX, worldY);
            if (terrain === TerrainType.GREEN || 
                terrain === TerrainType.BUNKER || 
                terrain === TerrainType.WATER) continue;
            
            const slope = getSlopeAt(hole, worldX, worldY);
            
            // Skip if gradient too small (flat areas)
            if (slope.magnitude < minGradient) continue;
            
            // Calculate opacity based on gradient (0.4 to 1.0)
            const gradientNormalized = Math.min((slope.magnitude - minGradient) / (maxGradient - minGradient), 1.0);
            const opacity = 0.4 + gradientNormalized * 0.6;
            
            // Calculate stroke width based on gradient (1.0 to 2.5)
            const strokeWidth = 1.0 + gradientNormalized * 1.5;
            
            // Get screen position
            const pos = worldToCapture(worldX, worldY, captureData);

            // Skip if outside visible area
            if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) continue;
            
            // Downhill direction (negative of gradient)
            const downhillX = -slope.x;
            const downhillY = -slope.y;
            const mag = Math.sqrt(downhillX * downhillX + downhillY * downhillY);
            
            if (mag === 0) continue;
            
            // Normalize direction
            const dirX = downhillX / mag;
            const dirY = downhillY / mag;
            
            // Apply rotation to match camera view
            const cos = Math.cos(captureData.rotationAngle);
            const sin = Math.sin(captureData.rotationAngle);
            const rotDirX = dirX * cos + dirY * sin;
            const rotDirY = -dirX * sin + dirY * cos;
            
            // Calculate arrow endpoints - centered on grid point
            const halfLen = arrowLength / 2;
            const startX = pos.x - rotDirX * halfLen;
            const startY = pos.y - rotDirY * halfLen;
            const endX = pos.x + rotDirX * halfLen;
            const endY = pos.y + rotDirY * halfLen;
            
            // Create arrow line - dark gray with opacity and variable thickness
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', startX);
            line.setAttribute('y1', startY);
            line.setAttribute('x2', endX);
            line.setAttribute('y2', endY);
            line.setAttribute('stroke', '#444444');
            line.setAttribute('stroke-width', strokeWidth);
            line.setAttribute('opacity', opacity);
            arrowGroup.appendChild(line);
            
            // Create arrowhead at downhill end (end point)
            const headSize = 3;
            const headAngle = Math.PI / 6; // 30 degrees
            
            // Arrowhead wings
            const angle = Math.atan2(rotDirY, rotDirX);
            const wing1X = endX - headSize * Math.cos(angle - headAngle);
            const wing1Y = endY - headSize * Math.sin(angle - headAngle);
            const wing2X = endX - headSize * Math.cos(angle + headAngle);
            const wing2Y = endY - headSize * Math.sin(angle + headAngle);

            const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arrowhead.setAttribute('d', `M${endX},${endY} L${wing1X},${wing1Y} M${endX},${endY} L${wing2X},${wing2Y}`);
            arrowhead.setAttribute('stroke', '#444444');
            arrowhead.setAttribute('stroke-width', strokeWidth);
            arrowhead.setAttribute('fill', 'none');
            arrowhead.setAttribute('opacity', opacity);
            arrowGroup.appendChild(arrowhead);
        }
    }
    
    svg.appendChild(arrowGroup);
}

/**
 * Add hazard yardage labels.
 * For each hazard within 200 yards of centreline:
 * 1. Find the closest point on the hazard to the front of tee
 * 2. Find the closest point on the hazard to the front of green
 * 3. Display yardages at each point (styled like trees: black=to green, red=from tee)
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} hole - The hole data object
 * @param {Object} teeFront - Front of tee position
 * @param {Object} captureData - Capture configuration
 * @param {Array} occupiedPositions - Already occupied label positions
 */
function addHazardCoverYardages(svg, labelsGroup, hole, teeFront, captureData, occupiedPositions, filteredTerrain) {
    const terrain = filteredTerrain;
    
    if (!terrain || !teeFront) return;
    
    // Get front of green for distance calculations
    const greenFront = findGreenFront(hole);
    if (!greenFront) return;
    
    const maxDistYards = 200;
    const maxDistWorld = maxDistYards / 4; // 4 yards per world unit
    
    // Process bunkers
    if (terrain.bunker) {
        terrain.bunker.forEach(bunker => {
            if (isHazardNearCentreline(bunker, hole.centreline, maxDistWorld)) {
                drawHazardYardages(svg, labelsGroup, teeFront, greenFront, bunker, captureData, occupiedPositions);
            }
        });
    }
    
    // Process water
    if (terrain.water) {
        terrain.water.forEach(water => {
            if (isHazardNearCentreline(water, hole.centreline, maxDistWorld)) {
                drawHazardYardages(svg, labelsGroup, teeFront, greenFront, water, captureData, occupiedPositions);
            }
        });
    }
}

/**
 * Draw yardage labels at the closest points of a hazard to tee and green.
 * Styled like trees: black text = yards to green, red text = yards from tee.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} teeFront - Front of tee position {x, y}
 * @param {Object} greenFront - Front of green position {x, y}
 * @param {Object} hazard - The hazard feature
 * @param {Object} captureData - Capture configuration
 * @param {Array} occupiedPositions - Already occupied label positions
 */
function drawHazardYardages(svg, labelsGroup, teeFront, greenFront, hazard, captureData, occupiedPositions) {
    // Get hazard boundary points based on shape
    const boundaryPoints = getHazardBoundaryPoints(hazard);
    if (!boundaryPoints || boundaryPoints.length < 3) return;
    
    // Find the closest point on the hazard boundary to the front of tee
    const closestToTee = findClosestPointOnPolygon(teeFront, boundaryPoints);
    
    // Find the closest point on the hazard boundary to the front of green
    const closestToGreen = findClosestPointOnPolygon(greenFront, boundaryPoints);
    
    // Draw yardage label at the point closest to tee
    if (closestToTee) {
        drawHazardPointYardages(svg, labelsGroup, closestToTee, teeFront, greenFront, captureData, occupiedPositions);
    }
    
    // Draw yardage label at the point closest to green (if different enough from tee point)
    if (closestToGreen && closestToTee) {
        const dx = closestToGreen.x - closestToTee.x;
        const dy = closestToGreen.y - closestToTee.y;
        const separation = Math.sqrt(dx * dx + dy * dy);
        
        // Only draw second point if it's at least 3 world units (12 yards) away from first
        if (separation > 3) {
            drawHazardPointYardages(svg, labelsGroup, closestToGreen, teeFront, greenFront, captureData, occupiedPositions);
        }
    }
}

/**
 * Get boundary points for a hazard feature (handles different shapes).
 * 
 * @param {Object} hazard - The hazard feature
 * @returns {Array|null} Array of [x, y] points or null
 */
function getHazardBoundaryPoints(hazard) {
    if (hazard.shape === 'polygon' && hazard.points && hazard.points.length >= 3) {
        return hazard.points;
    } else if (hazard.shape === 'ellipse') {
        // Sample points around the ellipse
        const points = [];
        for (let a = 0; a < Math.PI * 2; a += 0.2) {
            points.push([
                hazard.cx + hazard.rx * Math.cos(a),
                hazard.cy + hazard.ry * Math.sin(a)
            ]);
        }
        return points;
    } else if (hazard.shape === 'rect') {
        // Return rectangle corners
        return [
            [hazard.x, hazard.y],
            [hazard.x + hazard.width, hazard.y],
            [hazard.x + hazard.width, hazard.y + hazard.height],
            [hazard.x, hazard.y + hazard.height]
        ];
    }
    return null;
}

/**
 * Draw yardage labels at a hazard point (styled like trees).
 * Black text = yards to green (above), Red text = yards from tee (below).
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} point - The hazard point {x, y}
 * @param {Object} teeFront - Front of tee position {x, y}
 * @param {Object} greenFront - Front of green position {x, y}
 * @param {Object} captureData - Capture configuration
 * @param {Array} occupiedPositions - Already occupied label positions
 */
function drawHazardPointYardages(svg, labelsGroup, point, teeFront, greenFront, captureData, occupiedPositions) {
    // Get screen position
    const pos = worldToCapture(point.x, point.y, captureData);
    
    // Skip if outside visible area
    if (!isPositionVisible(pos, captureData)) return;
    
    // Check for overlap with existing labels
    const minDist = 25;
    const overlaps = occupiedPositions.some(occ => {
        const dx = pos.x - occ.x;
        const dy = pos.y - occ.y;
        return Math.sqrt(dx * dx + dy * dy) < minDist;
    });
    
    if (overlaps) return;
    
    // Calculate yards from front of tee
    const dxTee = point.x - teeFront.x;
    const dyTee = point.y - teeFront.y;
    const distFromTee = Math.sqrt(dxTee * dxTee + dyTee * dyTee);
    const yardsFromTee = Math.round(worldToYards(distFromTee));
    
    // Calculate yards to front of green
    const dxGreen = point.x - greenFront.x;
    const dyGreen = point.y - greenFront.y;
    const distToGreen = Math.sqrt(dxGreen * dxGreen + dyGreen * dyGreen);
    const yardsToGreen = Math.round(worldToYards(distToGreen));
    
    // Draw black dot at the hazard point
    drawHazardDot(svg, pos);
    
    // Draw yardage labels to the right of dot, aligned vertically with dot center
    // Same style as trees
    const textX = pos.x + 6;
    const textY = pos.y;
    
    // Black text for yards to green (above center)
    const greenText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    greenText.setAttribute('x', textX);
    greenText.setAttribute('y', textY - 5);
    greenText.setAttribute('fill', 'black');
    greenText.setAttribute('font-size', '12');
    greenText.setAttribute('font-weight', 'bold');
    greenText.setAttribute('dominant-baseline', 'middle');
    greenText.setAttribute('stroke', 'white');
    greenText.setAttribute('stroke-width', '1.5');
    greenText.setAttribute('paint-order', 'stroke');
    greenText.textContent = yardsToGreen;
    labelsGroup.appendChild(greenText);
    
    // Red text for yards from tee (below center)
    const teeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    teeText.setAttribute('x', textX);
    teeText.setAttribute('y', textY + 5);
    teeText.setAttribute('fill', THEME_COLORS.compassRed);
    teeText.setAttribute('font-size', '12');
    teeText.setAttribute('font-weight', 'bold');
    teeText.setAttribute('dominant-baseline', 'middle');
    teeText.setAttribute('stroke', 'white');
    teeText.setAttribute('stroke-width', '1.5');
    teeText.setAttribute('paint-order', 'stroke');
    teeText.textContent = yardsFromTee;
    labelsGroup.appendChild(teeText);
    
    occupiedPositions.push({ x: pos.x, y: pos.y, radius: minDist / 2 });
}

/**
 * Check if a position is within the visible area.
 */
function isPositionVisible(pos, captureData) {
    const padding = 10;
    return pos.x >= padding && pos.x <= captureData.width - padding &&
           pos.y >= padding && pos.y <= captureData.height - padding;
}

/**
 * Draw a black dot at a hazard entry/exit point.
 */
function drawHazardDot(svg, pos) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', '2.5');
    circle.setAttribute('fill', 'black');
    circle.setAttribute('stroke', 'white');
    circle.setAttribute('stroke-width', '0.5');
    svg.appendChild(circle);
}

/**
 * Find the closest point on a polygon boundary to a given point.
 */
function findClosestPointOnPolygon(point, polygonPoints) {
    let closestPoint = null;
    let closestDist = Infinity;
    
    for (let i = 0; i < polygonPoints.length; i++) {
        const p1 = polygonPoints[i];
        const p2 = polygonPoints[(i + 1) % polygonPoints.length];
        
        const closest = closestPointOnSegment(point.x, point.y, p1[0], p1[1], p2[0], p2[1]);
        const dist = Math.sqrt((closest.x - point.x) ** 2 + (closest.y - point.y) ** 2);
        
        if (dist < closestDist) {
            closestDist = dist;
            closestPoint = closest;
        }
    }
    
    return closestPoint;
}

/**
 * Add yardage labels to trees on the hole map.
 * Groups nearby trees and shows yardages at the closest tree in each group.
 * Red text = yards from tee, Black text = yards to green (no elevation).
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} hole - The hole data object
 * @param {Object} teeFront - Front of tee position {x, y}
 * @param {Object} greenFront - Front of green position {x, y}
 * @param {Object} captureData - Capture configuration
 * @param {Array} occupiedPositions - Already occupied label positions
 */
function addTreeYardages(svg, labelsGroup, hole, teeFront, greenFront, captureData, occupiedPositions, filteredTrees) {
    const trees = filteredTrees;
    
    if (!trees || trees.length === 0) return;
    
    // Group nearby trees (within 5 world units = 20 yards)
    const groupRadius = 5;
    const treeGroups = groupTrees(trees, groupRadius);
    
    // For each group, find the closest tree to the tee and add yardage labels
    treeGroups.forEach(group => {
        // Find the tree closest to the tee in this group
        let closestTree = null;
        let closestDist = Infinity;
        
        group.forEach(tree => {
            const dx = tree.x - teeFront.x;
            const dy = tree.y - teeFront.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist) {
                closestDist = dist;
                closestTree = tree;
            }
        });
        
        if (!closestTree) return;
        
        // Calculate distances
        const yardsFromTee = Math.round(worldToYards(closestDist));
        
        const dxGreen = closestTree.x - greenFront.x;
        const dyGreen = closestTree.y - greenFront.y;
        const distToGreen = Math.sqrt(dxGreen * dxGreen + dyGreen * dyGreen);
        const yardsToGreen = Math.round(worldToYards(distToGreen));
        
        // Get screen position (at the trunk)
        const pos = worldToCapture(closestTree.x, closestTree.y, captureData);
        
        // Skip if outside visible area
        if (!isPositionVisible(pos, captureData)) return;
        
        // Check for overlap with existing labels
        const minDist = 25;
        const overlaps = occupiedPositions.some(occ => {
            const dx = pos.x - occ.x;
            const dy = pos.y - occ.y;
            return Math.sqrt(dx * dx + dy * dy) < minDist;
        });
        
        if (overlaps) return;
        
        // Draw yardage labels to the right of trunk, aligned vertically with trunk center
        const textX = pos.x + 6;
        const textY = pos.y;
        
        // Black text for yards to green (above center)
        const greenText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        greenText.setAttribute('x', textX);
        greenText.setAttribute('y', textY - 5);
        greenText.setAttribute('fill', 'black');
        greenText.setAttribute('font-size', '12');
        greenText.setAttribute('font-weight', 'bold');
        greenText.setAttribute('dominant-baseline', 'middle');
        greenText.setAttribute('stroke', 'white');
        greenText.setAttribute('stroke-width', '1.5');
        greenText.setAttribute('paint-order', 'stroke');
        greenText.textContent = yardsToGreen;
        labelsGroup.appendChild(greenText);
        
        // Red text for yards from tee (below center)
        const teeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        teeText.setAttribute('x', textX);
        teeText.setAttribute('y', textY + 5);
        teeText.setAttribute('fill', THEME_COLORS.compassRed);
        teeText.setAttribute('font-size', '12');
        teeText.setAttribute('font-weight', 'bold');
        teeText.setAttribute('dominant-baseline', 'middle');
        teeText.setAttribute('stroke', 'white');
        teeText.setAttribute('stroke-width', '1.5');
        teeText.setAttribute('paint-order', 'stroke');
        teeText.textContent = yardsFromTee;
        labelsGroup.appendChild(teeText);
        
        occupiedPositions.push({ x: pos.x, y: pos.y, radius: minDist / 2 });
    });
}

/**
 * Add yardage labels to sprinkler heads on the hole map.
 * Uses the same style as the 100/150/200 yard markers (white, blue, red).
 * Shows yards to green, yards from tee, and elevation difference.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} hole - The hole data object
 * @param {Object} teeFront - Front of tee position {x, y}
 * @param {Object} greenFront - Front of green position {x, y}
 * @param {Object} captureData - Capture configuration
 * @param {Array} occupiedPositions - Already occupied label positions
 */
function addSprinklerHeadYardages(svg, labelsGroup, hole, teeFront, greenFront, captureData, occupiedPositions, filteredSprinklerHeads) {
    const sprinklerHeads = filteredSprinklerHeads;
    
    if (!sprinklerHeads || sprinklerHeads.length === 0) return;
    
    // Get elevation at front of green for elevation difference calc
    const greenFrontElevation = getElevationAt(hole, greenFront.x, greenFront.y);
    
    sprinklerHeads.forEach(sprinkler => {
        // Get screen position
        const pos = worldToCapture(sprinkler.x, sprinkler.y, captureData);
        
        // Skip if outside visible area
        if (!isPositionVisible(pos, captureData)) return;
        
        // Check for overlap with existing labels
        const minDist = 30;
        const overlaps = occupiedPositions.some(occ => {
            const dx = pos.x - occ.x;
            const dy = pos.y - occ.y;
            return Math.sqrt(dx * dx + dy * dy) < minDist;
        });
        
        if (overlaps) return;
        
        // Calculate yards to front of green
        const dxGreen = sprinkler.x - greenFront.x;
        const dyGreen = sprinkler.y - greenFront.y;
        const distToGreen = Math.sqrt(dxGreen * dxGreen + dyGreen * dyGreen);
        const yardsToGreen = Math.round(worldToYards(distToGreen));
        
        // Calculate yards from front of tee
        const dxTee = sprinkler.x - teeFront.x;
        const dyTee = sprinkler.y - teeFront.y;
        const distFromTee = Math.sqrt(dxTee * dxTee + dyTee * dyTee);
        const yardsFromTee = Math.round(worldToYards(distFromTee));
        
        // Calculate elevation difference to front of green
        const sprinklerElevation = getElevationAt(hole, sprinkler.x, sprinkler.y);
        const elevDiff = Math.round(greenFrontElevation - sprinklerElevation);
        
        // Use black color for sprinkler head marker (they're black circles on the course)
        addYardageMarker(svg, labelsGroup, pos, THEME_COLORS.textDark, yardsToGreen, yardsFromTee, elevDiff);
        occupiedPositions.push({ x: pos.x, y: pos.y, radius: minDist });
    });
}

/**
 * Add yardage labels to measure points on the hole map.
 * Uses the same style as the 100/150/200 yard markers (white, blue, red).
 * Shows yards to green, yards from tee, and elevation difference.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} hole - The hole data object
 * @param {Object} teeFront - Front of tee position {x, y}
 * @param {Object} greenFront - Front of green position {x, y}
 * @param {Object} captureData - Capture configuration
 * @param {Array} occupiedPositions - Already occupied label positions
 */
function addMeasurePointYardages(svg, labelsGroup, hole, teeFront, greenFront, captureData, occupiedPositions, filteredMeasurePoints) {
    const measurePoints = filteredMeasurePoints;
    
    if (!measurePoints || measurePoints.length === 0) return;
    
    // Get elevation at front of green for elevation difference calc
    const greenFrontElevation = getElevationAt(hole, greenFront.x, greenFront.y);
    
    measurePoints.forEach(measure => {
        // Get screen position
        const pos = worldToCapture(measure.x, measure.y, captureData);
        
        // Skip if outside visible area
        if (!isPositionVisible(pos, captureData)) return;
        
        // Check for overlap with existing labels
        const minDist = 30;
        const overlaps = occupiedPositions.some(occ => {
            const dx = pos.x - occ.x;
            const dy = pos.y - occ.y;
            return Math.sqrt(dx * dx + dy * dy) < minDist;
        });
        
        if (overlaps) return;
        
        // Calculate yards to front of green
        const dxGreen = measure.x - greenFront.x;
        const dyGreen = measure.y - greenFront.y;
        const distToGreen = Math.sqrt(dxGreen * dxGreen + dyGreen * dyGreen);
        const yardsToGreen = Math.round(worldToYards(distToGreen));
        
        // Calculate yards from front of tee
        const dxTee = measure.x - teeFront.x;
        const dyTee = measure.y - teeFront.y;
        const distFromTee = Math.sqrt(dxTee * dxTee + dyTee * dyTee);
        const yardsFromTee = Math.round(worldToYards(distFromTee));
        
        // Calculate elevation difference to front of green
        const measureElevation = getElevationAt(hole, measure.x, measure.y);
        const elevDiff = Math.round(greenFrontElevation - measureElevation);
        
        // Use orange color for measure point marker (they're orange diamonds in the editor)
        addYardageMarker(svg, labelsGroup, pos, THEME_COLORS.accentOrange, yardsToGreen, yardsFromTee, elevDiff);
        occupiedPositions.push({ x: pos.x, y: pos.y, radius: minDist });
    });
}

/**
 * Group trees that are close together.
 * Uses a simple clustering algorithm based on distance.
 * 
 * @param {Array} trees - Array of tree objects with x, y coordinates
 * @param {number} radius - Maximum distance between trees in the same group
 * @returns {Array} Array of tree groups (each group is an array of trees)
 */
function groupTrees(trees, radius) {
    const groups = [];
    const assigned = new Set();
    
    trees.forEach((tree, index) => {
        if (assigned.has(index)) return;
        
        // Start a new group with this tree
        const group = [tree];
        assigned.add(index);
        
        // Find all nearby trees
        trees.forEach((otherTree, otherIndex) => {
            if (assigned.has(otherIndex)) return;
            
            // Check if any tree in the group is close to this tree
            const isNearby = group.some(groupTree => {
                const dx = groupTree.x - otherTree.x;
                const dy = groupTree.y - otherTree.y;
                return Math.sqrt(dx * dx + dy * dy) <= radius;
            });
            
            if (isNearby) {
                group.push(otherTree);
                assigned.add(otherIndex);
            }
        });
        
        groups.push(group);
    });
    
    return groups;
}

/**
 * Check if a hazard is near the centreline.
 * 
 * @param {Object} hazard - The hazard feature
 * @param {Array} centreline - The hole centreline points
 * @param {number} maxDistWorld - Maximum distance in world units
 * @returns {boolean} True if hazard is near centreline
 */
function isHazardNearCentreline(hazard, centreline, maxDistWorld) {
    if (!centreline || centreline.length < 2) return false;
    
    // Get hazard center
    let cx, cy;
    if (hazard.shape === 'ellipse') {
        cx = hazard.cx;
        cy = hazard.cy;
    } else if (hazard.shape === 'rect') {
        cx = hazard.x + hazard.width / 2;
        cy = hazard.y + hazard.height / 2;
    } else if (hazard.shape === 'polygon' && hazard.points) {
        cx = hazard.points.reduce((sum, p) => sum + p[0], 0) / hazard.points.length;
        cy = hazard.points.reduce((sum, p) => sum + p[1], 0) / hazard.points.length;
    } else {
        return false;
    }
    
    // Check distance to each centreline segment
    for (let i = 0; i < centreline.length - 1; i++) {
        const p1 = centreline[i];
        const p2 = centreline[i + 1];
        const dist = distanceToSegment(cx, cy, p1[0], p1[1], p2[0], p2[1]);
        if (dist < maxDistWorld) return true;
    }
    
    return false;
}

/**
 * Distance from point to line segment.
 */
function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    
    return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

/**
 * Find closest point on a line segment to a point.
 */
function closestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    
    if (len2 === 0) return { x: x1, y: y1 };
    
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    
    return {
        x: x1 + t * dx,
        y: y1 + t * dy
    };
}


/**
 * Add a compass rose to the map container.
 * Shows north direction relative to the rotated map view.
 * 
 * @param {HTMLElement} container - The map container element
 * @param {number} rotationAngle - Map rotation angle in radians
 */
function addCompassRose(container, rotationAngle) {
    const rose = document.createElement('div');
    rose.className = 'compass-rose';
    rose.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        width: 50px;
        height: 50px;
        z-index: 20;
    `;
    
    // The map is rotated by rotationAngle, so north arrow needs to point opposite
    const northAngle = -rotationAngle * (180 / Math.PI);
    
    rose.innerHTML = `
        <svg width="50" height="50" viewBox="0 0 50 50">
            <g transform="rotate(${northAngle}, 25, 25)">
                <!-- Outer circle -->
                <circle cx="25" cy="25" r="22" fill="rgba(255,255,255,0.8)" stroke="${THEME_COLORS.textDark}" stroke-width="1"/>
                
                <!-- North arrow (red) -->
                <polygon points="25,5 21,20 25,17 29,20" fill="${THEME_COLORS.compassRed}" stroke="${THEME_COLORS.compassDarkRed}" stroke-width="0.5"/>
                
                <!-- South arrow (white) -->
                <polygon points="25,45 21,30 25,33 29,30" fill="${THEME_COLORS.markerWhite}" stroke="${THEME_COLORS.textDark}" stroke-width="0.5"/>
                
                <!-- East-West line -->
                <line x1="8" y1="25" x2="17" y2="25" stroke="${THEME_COLORS.textDark}" stroke-width="1.5"/>
                <line x1="33" y1="25" x2="42" y2="25" stroke="${THEME_COLORS.textDark}" stroke-width="1.5"/>
                
                <!-- N label -->
                <text x="25" y="14" text-anchor="middle" font-size="12" font-weight="bold" fill="${THEME_COLORS.compassRed}">N</text>
                
                <!-- Center dot -->
                <circle cx="25" cy="25" r="2" fill="${THEME_COLORS.textDark}"/>
            </g>
        </svg>
    `;
    
    container.appendChild(rose);
}
