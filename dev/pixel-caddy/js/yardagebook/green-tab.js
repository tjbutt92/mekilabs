/**
 * Yardage Book - Green Tab
 * 
 * Renders the green detail view showing:
 * - Green contours and elevation
 * - Slope arrows and break indicators
 * - Pin position and distances
 * - Green depth and width measurements
 * 
 * Validates: Requirements 5.2
 */

import { 
    worldToCapture, 
    captureToWorld,
    drawTerrainFeatures, 
    drawPathFeatures,
    addSlopeArrows,
    drawTerrainOutline,
    addCompassRose,
    drawTree2DCanopy
} from './utils.js';
import { THEME_COLORS } from '../theme-colors.js';
import { getWorldInstance, getBallInstance } from './index.js';
import { 
    seededRandom,
    isPointInPolygon,
    distanceToSegment,
    yardsToWorld
} from '../utils.js';
import { 
    getSlopeAt, 
    findGreenFront, 
    getTerrainAt, 
    TerrainType, 
    getElevationAt 
} from '../terrain.js';
import { treeProperties } from '../trees.js';

/**
 * Render the green tab content.
 * Creates a detailed view of the green with elevation coloring and measurements.
 * 
 * @param {HTMLElement} container - The container element to render into
 * @param {Object} hole - The hole data object
 */
export function renderGreenTab(container, hole) {
    container.innerHTML = `
        <div class="yardage-header">
            <div class="modal-title">${hole.name} - Green</div>
        </div>
        <div class="yardage-map-container">
            <div class="yardage-map-hole" id="yardage-map-green">
                <div class="yardage-loading">Rendering green...</div>
            </div>
        </div>
    `;

    // Render green view after container renders
    requestAnimationFrame(() => {
        renderGreenMap(container, hole);
    });
}

/**
 * Render the green map with terrain, elevation grid, and overlays.
 * 
 * @param {HTMLElement} container - The container element
 * @param {Object} hole - The hole data object
 */
function renderGreenMap(container, hole) {
    const mapContainer = container.querySelector('#yardage-map-green');
    if (!mapContainer) return;
    
    // Get container dimensions
    const containerRect = mapContainer.getBoundingClientRect();
    const width = Math.floor(containerRect.width) || 400;
    const height = Math.floor(containerRect.height) || 500;
    
    // Find the green zone for this hole: the one that contains the hole (cup), or the one the centreline intercepts
    const greenZone = getGreenZoneForHole(hole);
    if (!greenZone) {
        mapContainer.innerHTML = '<div class="yardage-fallback">No green data available</div>';
        return;
    }
    
    // Calculate green bounds with padding for surrounding terrain (tighter = more zoomed in)
    const greenBounds = calculateGreenBounds(greenZone, 4);
    
    // Clear loading message
    mapContainer.innerHTML = '';
    
    // Get terrain and trees data from world instance
    const worldInstance = getWorldInstance();
    let terrain = null;
    let trees = null;
    if (worldInstance && worldInstance.course) {
        terrain = worldInstance.course.terrain;
        trees = worldInstance.course.trees;
    }
    
    // Calculate rotation angle to orient tee at bottom, hole at top
    const teePos = hole.tee;
    const holePos = hole.hole;
    const dx = holePos.x - teePos.x;
    const dy = holePos.y - teePos.y;
    const rotationAngle = Math.atan2(dx, -dy);

    // Calculate view dimensions
    const boundsWidth = greenBounds.maxX - greenBounds.minX;
    const boundsHeight = greenBounds.maxY - greenBounds.minY;
    const aspect = width / height;
    
    let viewWidth, viewHeight;
    if (boundsWidth / boundsHeight > aspect) {
        viewWidth = boundsWidth * 0.95;
        viewHeight = viewWidth / aspect;
    } else {
        viewHeight = boundsHeight * 0.95;
        viewWidth = viewHeight * aspect;
    }
    
    const centerX = (greenBounds.minX + greenBounds.maxX) / 2;
    const centerY = (greenBounds.minY + greenBounds.maxY) / 2;
    
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
        centerWorld: { x: centerX, y: centerY },
        rotationAngle: rotationAngle,
        viewWidth: viewWidth,
        viewHeight: viewHeight,
        width: width,
        height: height,
        greenBounds: greenBounds
    };
    
    // Helper to convert world coords to canvas coords (with rotation)
    function worldToCanvas(worldX, worldY) {
        return worldToCapture(worldX, worldY, captureData);
    }

    // Draw terrain features (same as hole page)
    if (terrain) {
        // Draw fairway
        ctx.fillStyle = THEME_COLORS.fairway;
        drawTerrainFeatures(ctx, terrain.fairway, worldToCanvas);
        
        // Draw tee box
        ctx.fillStyle = THEME_COLORS.fairway;
        drawTerrainFeatures(ctx, terrain.teeBox, worldToCanvas);
        
        // Draw path
        ctx.strokeStyle = THEME_COLORS.path;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawPathFeatures(ctx, terrain.path, worldToCanvas, viewWidth, width);
        
        // Draw water
        ctx.fillStyle = THEME_COLORS.water;
        drawTerrainFeatures(ctx, terrain.water, worldToCanvas);
        
        // Draw bunkers
        ctx.fillStyle = THEME_COLORS.bunker;
        drawTerrainFeatures(ctx, terrain.bunker, worldToCanvas);
        
        // Don't draw green here - we draw it as solid fill with slope arrows on the green tab
    }
    
    // Draw trees
    if (trees) {
        trees.forEach(tree => {
            const props = treeProperties[tree.type];
            if (!props) return;
            
            const pos = worldToCanvas(tree.x, tree.y);
            // canopyRadius in treeProperties is in YARDS; yardage book uses world units (1 unit = 4 yd)
            const canopyRadiusYards = (props.canopyRadius.min + props.canopyRadius.max) / 2;
            const canopyRadius = yardsToWorld(canopyRadiusYards);
            const category = props.category;
            const seed = Math.abs(tree.x * 1000 + tree.y * 7);
            
            ctx.fillStyle = THEME_COLORS.treeCanopy2D;
            drawTree2DCanopy(ctx, pos, canopyRadius, category, seed, viewWidth, width, rotationAngle, seededRandom);
            
            ctx.fillStyle = THEME_COLORS.trunkDot;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    mapContainer.appendChild(canvas);

    // Draw green as solid fill (base), then slope arrows will show steep slopes on top
    const greenFillCanvas = document.createElement('canvas');
    greenFillCanvas.width = width;
    greenFillCanvas.height = height;
    greenFillCanvas.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none;';
    const greenCtx = greenFillCanvas.getContext('2d');
    greenCtx.fillStyle = THEME_COLORS.green;
    drawGreenFill(greenCtx, greenZone, captureData);
    greenCtx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    greenCtx.lineWidth = 2;
    drawGreenOutline(greenCtx, greenZone, captureData);
    mapContainer.appendChild(greenFillCanvas);
    
    // Create SVG overlay for markers and arrows
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'yardage-overlay-svg');
    svg.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10;';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // Add terrain outlines
    addTerrainOutlines(svg, hole, captureData);
    
    // Add slope arrows on the green only (steep slopes; arrows point downhill)
    addSlopeArrows(svg, hole, captureData, {
        gridSpacing: 1.5,
        minGradient: 0.2,
        maxGradient: 3.0,
        arrowLength: 12,
        onlyTerrain: TerrainType.GREEN
    }, getSlopeAt, getTerrainAt, TerrainType);
    
    // Add slope arrows on surrounding terrain (NOT on the green)
    addSlopeArrows(svg, hole, captureData, {
        gridSpacing: 3,  // Tighter grid for green detail view
        minGradient: 0.35,
        maxGradient: 4.0,
        arrowLength: 10
    }, getSlopeAt, getTerrainAt, TerrainType);
    
    // Add front of green marker and depth line
    const greenFront = findGreenFront(hole);
    if (greenFront) {
        addGreenFrontMarker(svg, greenFront, hole, greenZone, captureData);
    }
    
    // Add hole marker
    if (hole.hole) {
        addHoleMarker(svg, hole.hole, captureData);
    }
    
    // Add ball marker if ball is within or near the green view
    const ballInstance = getBallInstance();
    if (ballInstance) {
        addBallMarker(svg, ballInstance, captureData);
    }
    
    mapContainer.appendChild(svg);
    
    // Add slope legend (arrows point downhill)
    addSlopeLegend(mapContainer);
    
    // Add compass rose
    addCompassRose(mapContainer, rotationAngle);
}


/**
 * Get the green zone for the current hole: the one that contains the hole (cup),
 * or the one the centreline intercepts. Used when course has multiple greens.
 * 
 * @param {Object} hole - The hole data object
 * @returns {Object|null} The green zone feature or null
 */
function getGreenZoneForHole(hole) {
    const greenZones = hole.zones?.filter(z => z.terrain === TerrainType.GREEN) || [];
    if (greenZones.length === 0) return null;
    if (hole.hole) {
        const containing = greenZones.find(z => isPointInGreen(hole.hole.x, hole.hole.y, z));
        if (containing) return containing;
    }
    const greenFront = findGreenFront(hole);
    if (greenFront) {
        const intercept = greenZones.find(z => isPointInGreen(greenFront.x, greenFront.y, z));
        if (intercept) return intercept;
    }
    return greenZones[0];
}

/**
 * Calculate bounds for the green zone with padding.
 * 
 * @param {Object} greenZone - The green zone feature
 * @param {number} padding - Padding to add around bounds (default: 3 world units)
 * @returns {Object} Bounds object {minX, maxX, minY, maxY}
 */
function calculateGreenBounds(greenZone, padding = 3) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    if (greenZone.shape === 'ellipse') {
        minX = greenZone.cx - greenZone.rx;
        maxX = greenZone.cx + greenZone.rx;
        minY = greenZone.cy - greenZone.ry;
        maxY = greenZone.cy + greenZone.ry;
    } else if (greenZone.shape === 'rect') {
        minX = greenZone.x;
        maxX = greenZone.x + greenZone.width;
        minY = greenZone.y;
        maxY = greenZone.y + greenZone.height;
    } else if (greenZone.shape === 'polygon' && greenZone.points) {
        greenZone.points.forEach(p => {
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]);
            maxY = Math.max(maxY, p[1]);
        });
    }
    
    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minY: minY - padding,
        maxY: maxY + padding
    };
}

/**
 * Check if a point is inside the green zone.
 * 
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} greenZone - The green zone feature
 * @returns {boolean} True if point is inside green
 */
function isPointInGreen(x, y, greenZone) {
    if (greenZone.shape === 'ellipse') {
        const dx = (x - greenZone.cx) / greenZone.rx;
        const dy = (y - greenZone.cy) / greenZone.ry;
        return (dx * dx + dy * dy) <= 1;
    } else if (greenZone.shape === 'polygon') {
        return isPointInPolygon(x, y, greenZone.points);
    } else if (greenZone.shape === 'rect') {
        return x >= greenZone.x && x <= greenZone.x + greenZone.width &&
               y >= greenZone.y && y <= greenZone.y + greenZone.height;
    }
    return false;
}


/**
 * Draw elevation-colored grid on the green.
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} hole - The hole data object
 * @param {Object} greenZone - The green zone feature
 * @param {Object} captureData - Capture configuration
 */
function drawGreenElevationGrid(ctx, hole, greenZone, captureData) {
    const { width, height } = captureData;
    
    // Sample elevation at high resolution
    const gridResolution = 2; // pixels per sample
    
    // Find elevation range on the green for color mapping
    let minElev = Infinity, maxElev = -Infinity;
    const elevationSamples = [];
    
    for (let py = 0; py < height; py += gridResolution) {
        for (let px = 0; px < width; px += gridResolution) {
            const worldPos = captureToWorld(px, py, captureData);
            if (isPointInGreen(worldPos.x, worldPos.y, greenZone)) {
                const elev = getElevationAt(hole, worldPos.x, worldPos.y);
                minElev = Math.min(minElev, elev);
                maxElev = Math.max(maxElev, elev);
                elevationSamples.push({ px, py, elev, inGreen: true });
            }
        }
    }

    // If no elevation variation, use a small range
    const elevRange = maxElev - minElev;
    if (elevRange < 0.5) {
        minElev -= 0.25;
        maxElev += 0.25;
    }
    
    // Draw elevation-colored grid on the green only
    elevationSamples.forEach(sample => {
        // Map elevation to color: blue (low) -> green (mid) -> yellow/red (high)
        const t = (sample.elev - minElev) / (maxElev - minElev || 1);
        const color = getElevationColor(t);
        
        ctx.fillStyle = color;
        ctx.fillRect(sample.px, sample.py, gridResolution, gridResolution);
    });
    
    // Draw green outline
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.lineWidth = 2;
    drawGreenOutline(ctx, greenZone, captureData);
}

/**
 * Get color for elevation value.
 * Color gradient: dark blue (low) -> light green (mid) -> yellow -> orange (high)
 * 
 * @param {number} t - Normalized elevation (0-1, where 0 is lowest, 1 is highest)
 * @returns {string} CSS color string
 */
function getElevationColor(t) {
    let r, g, b;
    
    if (t < 0.25) {
        // Dark blue to light blue
        const s = t / 0.25;
        r = Math.round(40 + s * 40);
        g = Math.round(80 + s * 60);
        b = Math.round(140 + s * 40);
    } else if (t < 0.5) {
        // Light blue to green
        const s = (t - 0.25) / 0.25;
        r = Math.round(80 - s * 20);
        g = Math.round(140 + s * 60);
        b = Math.round(180 - s * 80);
    } else if (t < 0.75) {
        // Green to yellow
        const s = (t - 0.5) / 0.25;
        r = Math.round(60 + s * 180);
        g = Math.round(200 - s * 20);
        b = Math.round(100 - s * 80);
    } else {
        // Yellow to orange/red
        const s = (t - 0.75) / 0.25;
        r = Math.round(240 + s * 15);
        g = Math.round(180 - s * 80);
        b = Math.round(20);
    }
    
    return `rgb(${r}, ${g}, ${b})`;
}


/**
 * Draw the outline of the green zone.
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} greenZone - The green zone feature
 * @param {Object} captureData - Capture configuration
 */
function drawGreenFill(ctx, greenZone, captureData) {
    ctx.beginPath();
    
    if (greenZone.shape === 'ellipse') {
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const worldX = greenZone.cx + Math.cos(angle) * greenZone.rx;
            const worldY = greenZone.cy + Math.sin(angle) * greenZone.ry;
            const pos = worldToCapture(worldX, worldY, captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        }
    } else if (greenZone.shape === 'polygon' && greenZone.points) {
        greenZone.points.forEach((p, i) => {
            const pos = worldToCapture(p[0], p[1], captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        });
        ctx.closePath();
    } else if (greenZone.shape === 'rect') {
        const corners = [
            [greenZone.x, greenZone.y],
            [greenZone.x + greenZone.width, greenZone.y],
            [greenZone.x + greenZone.width, greenZone.y + greenZone.height],
            [greenZone.x, greenZone.y + greenZone.height]
        ];
        corners.forEach((c, i) => {
            const pos = worldToCapture(c[0], c[1], captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        });
        ctx.closePath();
    }
    
    ctx.fill();
}

/**
 * Draw the outline of the green zone.
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {Object} greenZone - The green zone feature
 * @param {Object} captureData - Capture configuration
 */
function drawGreenOutline(ctx, greenZone, captureData) {
    ctx.beginPath();
    
    if (greenZone.shape === 'ellipse') {
        // Sample ellipse points
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const worldX = greenZone.cx + Math.cos(angle) * greenZone.rx;
            const worldY = greenZone.cy + Math.sin(angle) * greenZone.ry;
            const pos = worldToCapture(worldX, worldY, captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        }
    } else if (greenZone.shape === 'polygon' && greenZone.points) {
        greenZone.points.forEach((p, i) => {
            const pos = worldToCapture(p[0], p[1], captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        });
        ctx.closePath();
    } else if (greenZone.shape === 'rect') {
        const corners = [
            [greenZone.x, greenZone.y],
            [greenZone.x + greenZone.width, greenZone.y],
            [greenZone.x + greenZone.width, greenZone.y + greenZone.height],
            [greenZone.x, greenZone.y + greenZone.height]
        ];
        corners.forEach((c, i) => {
            const pos = worldToCapture(c[0], c[1], captureData);
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        });
        ctx.closePath();
    }
    
    ctx.stroke();
}


/**
 * Add terrain outlines to the SVG overlay.
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
 * Add front of green marker with depth and width lines.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} greenFront - Front of green position {x, y}
 * @param {Object} hole - The hole data object
 * @param {Object} greenZone - The green zone feature
 * @param {Object} captureData - Capture configuration
 */
function addGreenFrontMarker(svg, greenFront, hole, greenZone, captureData) {
    const frontPos = worldToCapture(greenFront.x, greenFront.y, captureData);
    
    // Add front of green marker (quartered circle)
    const markerSize = 12;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    marker.setAttribute('transform', `translate(${frontPos.x}, ${frontPos.y})`);
    
    // Quartered circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', markerSize / 2);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', THEME_COLORS.textDark);
    circle.setAttribute('stroke-width', '1');
    marker.appendChild(circle);
    
    // Quarters
    const quarters = [
        { d: `M0,-${markerSize/2} A${markerSize/2},${markerSize/2} 0 0,1 ${markerSize/2},0 L0,0 Z`, fill: THEME_COLORS.markerWhite },
        { d: `M0,0 L${markerSize/2},0 A${markerSize/2},${markerSize/2} 0 0,1 0,${markerSize/2} Z`, fill: THEME_COLORS.textDark },
        { d: `M0,0 L0,${markerSize/2} A${markerSize/2},${markerSize/2} 0 0,1 -${markerSize/2},0 Z`, fill: THEME_COLORS.markerWhite },
        { d: `M-${markerSize/2},0 A${markerSize/2},${markerSize/2} 0 0,1 0,-${markerSize/2} L0,0 Z`, fill: THEME_COLORS.textDark }
    ];
    quarters.forEach(q => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', q.d);
        path.setAttribute('fill', q.fill);
        marker.appendChild(path);
    });
    
    svg.appendChild(marker);

    // Calculate and draw depth line (vertical - along centreline)
    const depthInfo = calculateGreenDepth(hole, greenFront, greenZone, captureData);
    if (depthInfo) {
        drawGreenDepthLine(svg, depthInfo, captureData);
        
        // Calculate and draw width line (horizontal - perpendicular at midpoint of depth)
        const widthInfo = calculateGreenWidth(greenFront, greenZone, depthInfo);
        if (widthInfo) {
            drawGreenWidthLine(svg, widthInfo, captureData);
        }
    }
}

/**
 * Calculate green depth along the centreline.
 * 
 * @param {Object} hole - The hole data object
 * @param {Object} greenFront - Front of green position
 * @param {Object} greenZone - The green zone feature
 * @param {Object} captureData - Capture configuration
 * @returns {Object|null} Depth info or null if cannot calculate
 */
function calculateGreenDepth(hole, greenFront, greenZone, captureData) {
    // Get centreline direction at green front
    const centreline = hole.centreline;
    if (!centreline || centreline.length < 2) return null;
    
    // Find direction along centreline at green front
    let dirX = 0, dirY = 0;
    for (let i = 0; i < centreline.length - 1; i++) {
        const p1 = centreline[i];
        const p2 = centreline[i + 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        
        // Check if green front is near this segment
        const dist = distanceToSegment(greenFront.x, greenFront.y, p1[0], p1[1], p2[0], p2[1]);
        if (dist < 2) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dirX = dx / len;
            dirY = dy / len;
            break;
        }
    }
    
    if (dirX === 0 && dirY === 0) {
        // Fallback: use tee to hole direction
        const dx = hole.hole.x - hole.tee.x;
        const dy = hole.hole.y - hole.tee.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        dirX = dx / len;
        dirY = dy / len;
    }
    
    // Extend line from green front along centreline direction until it exits green
    let backX = greenFront.x;
    let backY = greenFront.y;
    const step = 0.5;
    let maxSteps = 200;
    
    while (maxSteps-- > 0) {
        const nextX = backX + dirX * step;
        const nextY = backY + dirY * step;
        
        if (!isPointInGreen(nextX, nextY, greenZone)) {
            break;
        }
        backX = nextX;
        backY = nextY;
    }
    
    // Calculate depth in feet (world units * 4 yards * 3 feet)
    const depthWorld = Math.sqrt((backX - greenFront.x) ** 2 + (backY - greenFront.y) ** 2);
    const depthYards = depthWorld * 4;
    const depthFeet = Math.round(depthYards * 3);
    
    return {
        frontX: greenFront.x,
        frontY: greenFront.y,
        backX: backX,
        backY: backY,
        depthFeet: depthFeet,
        dirX: dirX,
        dirY: dirY
    };
}


/**
 * Calculate green width perpendicular to centreline at midpoint of depth.
 * 
 * @param {Object} greenFront - Front of green position
 * @param {Object} greenZone - The green zone feature
 * @param {Object} depthInfo - Depth calculation result
 * @returns {Object|null} Width info or null if cannot calculate
 */
function calculateGreenWidth(greenFront, greenZone, depthInfo) {
    // Perpendicular direction (rotate 90 degrees)
    const perpX = -depthInfo.dirY;
    const perpY = depthInfo.dirX;
    
    // Start from midpoint of depth line
    const midX = (depthInfo.frontX + depthInfo.backX) / 2;
    const midY = (depthInfo.frontY + depthInfo.backY) / 2;
    
    // Find left edge
    let leftX = midX;
    let leftY = midY;
    const step = 0.5;
    let maxSteps = 200;
    
    while (maxSteps-- > 0) {
        const nextX = leftX - perpX * step;
        const nextY = leftY - perpY * step;
        
        if (!isPointInGreen(nextX, nextY, greenZone)) {
            break;
        }
        leftX = nextX;
        leftY = nextY;
    }
    
    // Find right edge
    let rightX = midX;
    let rightY = midY;
    maxSteps = 200;
    
    while (maxSteps-- > 0) {
        const nextX = rightX + perpX * step;
        const nextY = rightY + perpY * step;
        
        if (!isPointInGreen(nextX, nextY, greenZone)) {
            break;
        }
        rightX = nextX;
        rightY = nextY;
    }
    
    // Calculate width in feet
    const widthWorld = Math.sqrt((rightX - leftX) ** 2 + (rightY - leftY) ** 2);
    const widthYards = widthWorld * 4;
    const widthFeet = Math.round(widthYards * 3);
    
    return {
        leftX: leftX,
        leftY: leftY,
        rightX: rightX,
        rightY: rightY,
        widthFeet: widthFeet
    };
}


/**
 * Draw the green depth line with measurement label.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} depthInfo - Depth calculation result
 * @param {Object} captureData - Capture configuration
 */
function drawGreenDepthLine(svg, depthInfo, captureData) {
    const frontPos = worldToCapture(depthInfo.frontX, depthInfo.frontY, captureData);
    const backPos = worldToCapture(depthInfo.backX, depthInfo.backY, captureData);
    
    // Draw depth line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', frontPos.x);
    line.setAttribute('y1', frontPos.y);
    line.setAttribute('x2', backPos.x);
    line.setAttribute('y2', backPos.y);
    line.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(line);
    
    // Draw end markers
    const markerSize = 6;
    [frontPos, backPos].forEach(pos => {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const angle = Math.atan2(backPos.y - frontPos.y, backPos.x - frontPos.x) + Math.PI / 2;
        const dx = Math.cos(angle) * markerSize;
        const dy = Math.sin(angle) * markerSize;
        marker.setAttribute('x1', pos.x - dx);
        marker.setAttribute('y1', pos.y - dy);
        marker.setAttribute('x2', pos.x + dx);
        marker.setAttribute('y2', pos.y + dy);
        marker.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
        marker.setAttribute('stroke-width', '2');
        svg.appendChild(marker);
    });
    
    // Draw depth label - position at 25% along the line
    const labelX = frontPos.x + (backPos.x - frontPos.x) * 0.25;
    const labelY = frontPos.y + (backPos.y - frontPos.y) * 0.25;
    
    const lineAngle = Math.atan2(backPos.y - frontPos.y, backPos.x - frontPos.x);
    const rotationDeg = (lineAngle * 180 / Math.PI);
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', labelX);
    text.setAttribute('y', labelY);
    text.setAttribute('fill', 'black');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('stroke', 'white');
    text.setAttribute('stroke-width', '2');
    text.setAttribute('paint-order', 'stroke');
    text.setAttribute('transform', `rotate(${rotationDeg}, ${labelX}, ${labelY})`);
    text.textContent = `${depthInfo.depthFeet} ft`;
    svg.appendChild(text);
}


/**
 * Draw the green width line with measurement label.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} widthInfo - Width calculation result
 * @param {Object} captureData - Capture configuration
 */
function drawGreenWidthLine(svg, widthInfo, captureData) {
    const leftPos = worldToCapture(widthInfo.leftX, widthInfo.leftY, captureData);
    const rightPos = worldToCapture(widthInfo.rightX, widthInfo.rightY, captureData);
    
    // Draw width line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', leftPos.x);
    line.setAttribute('y1', leftPos.y);
    line.setAttribute('x2', rightPos.x);
    line.setAttribute('y2', rightPos.y);
    line.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(line);
    
    // Draw end markers
    const markerSize = 6;
    [leftPos, rightPos].forEach(pos => {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        const angle = Math.atan2(rightPos.y - leftPos.y, rightPos.x - leftPos.x) + Math.PI / 2;
        const dx = Math.cos(angle) * markerSize;
        const dy = Math.sin(angle) * markerSize;
        marker.setAttribute('x1', pos.x - dx);
        marker.setAttribute('y1', pos.y - dy);
        marker.setAttribute('x2', pos.x + dx);
        marker.setAttribute('y2', pos.y + dy);
        marker.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
        marker.setAttribute('stroke-width', '2');
        svg.appendChild(marker);
    });
    
    // Draw width label - position at 75% along the line
    const labelX = leftPos.x + (rightPos.x - leftPos.x) * 0.75;
    const labelY = leftPos.y + (rightPos.y - leftPos.y) * 0.75;
    
    const lineAngle = Math.atan2(rightPos.y - leftPos.y, rightPos.x - leftPos.x);
    const rotationDeg = (lineAngle * 180 / Math.PI);
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', labelX);
    text.setAttribute('y', labelY);
    text.setAttribute('fill', 'black');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('stroke', 'white');
    text.setAttribute('stroke-width', '2');
    text.setAttribute('paint-order', 'stroke');
    text.setAttribute('transform', `rotate(${rotationDeg}, ${labelX}, ${labelY})`);
    text.textContent = `${widthInfo.widthFeet} ft`;
    svg.appendChild(text);
}


/**
 * Add hole marker (cup) to the SVG overlay.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} holePos - Hole position {x, y}
 * @param {Object} captureData - Capture configuration
 */
function addHoleMarker(svg, holePos, captureData) {
    const pos = worldToCapture(holePos.x, holePos.y, captureData);
    
    // Hole cup (dark circle) - no flag
    const cup = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    cup.setAttribute('cx', pos.x);
    cup.setAttribute('cy', pos.y);
    cup.setAttribute('r', '6');
    cup.setAttribute('fill', THEME_COLORS.holeCup);
    cup.setAttribute('stroke', THEME_COLORS.markerWhite);
    cup.setAttribute('stroke-width', '1.5');
    svg.appendChild(cup);
}

/**
 * Add ball marker to the SVG overlay if ball is visible.
 * 
 * @param {SVGElement} svg - The SVG element
 * @param {Object} ballInstance - The ball instance
 * @param {Object} captureData - Capture configuration
 */
function addBallMarker(svg, ballInstance, captureData) {
    if (!ballInstance) return;
    
    const ballPos = ballInstance.getPosition();
    const pos = worldToCapture(ballPos.x, ballPos.y, captureData);
    
    // Only show if ball is within the visible area
    if (pos.x < 0 || pos.x > captureData.width || pos.y < 0 || pos.y > captureData.height) {
        return;
    }
    
    // Ball marker - white circle with black outline
    const ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ball.setAttribute('cx', pos.x);
    ball.setAttribute('cy', pos.y);
    ball.setAttribute('r', '5');
    ball.setAttribute('fill', THEME_COLORS.markerWhite);
    ball.setAttribute('stroke', THEME_COLORS.textDark);
    ball.setAttribute('stroke-width', '1.5');
    svg.appendChild(ball);
}

/**
 * Add slope legend to the map container.
 * Arrows point downhill; opacity indicates steepness.
 * 
 * @param {HTMLElement} container - The map container element
 */
function addSlopeLegend(container) {
    const legend = document.createElement('div');
    legend.className = 'green-elevation-legend';
    legend.innerHTML = `
        <div class="legend-gradient">
            <div class="legend-bar"></div>
            <div class="legend-labels">
                <span>Arrows point downhill</span>
                <span>Steeper = thicker</span>
            </div>
        </div>
    `;
    container.appendChild(legend);
}

