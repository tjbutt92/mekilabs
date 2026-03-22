// Terrain types and their properties
import { isPointInPolygon, bilinearInterpolate, lineSegmentIntersect, distanceToSegment } from './utils.js';

export const TerrainType = {
    TEE: 'tee',
    FAIRWAY: 'fairway',
    ROUGH: 'rough',
    GREEN: 'green',
    BUNKER: 'bunker',
    WATER: 'water',
    OUT_OF_BOUNDS: 'oob'
};

export const terrainProperties = {
    [TerrainType.TEE]: {
        name: 'Tee Box',
        color: '#4a7c43',
        friction: 0.1,
        lieQuality: 1.0,      // 1.0 = perfect lie
        canHitFrom: true,
        penalty: 0
    },
    [TerrainType.FAIRWAY]: {
        name: 'Fairway',
        color: '#3d6b35',
        friction: 0.15,
        lieQuality: 0.95,
        canHitFrom: true,
        penalty: 0
    },
    [TerrainType.ROUGH]: {
        name: 'Rough',
        color: '#022906',
        friction: 0.4,
        lieQuality: 0.7,      // harder to hit clean
        canHitFrom: true,
        penalty: 0
    },
    [TerrainType.GREEN]: {
        name: 'Green',
        color: '#5cb85c',
        friction: 0.05,
        lieQuality: 1.0,
        canHitFrom: true,
        penalty: 0
    },
    [TerrainType.BUNKER]: {
        name: 'Bunker',
        color: '#e8d4a8',
        friction: 0.6,
        lieQuality: 0.5,
        canHitFrom: true,
        penalty: 0
    },
    [TerrainType.WATER]: {
        name: 'Water Hazard',
        color: '#3498db',
        friction: 0,
        lieQuality: 0,
        canHitFrom: false,
        penalty: 1            // 1 stroke penalty
    },
    [TerrainType.OUT_OF_BOUNDS]: {
        name: 'Out of Bounds',
        color: '#1a1a1a',
        friction: 0,
        lieQuality: 0,
        canHitFrom: false,
        penalty: 2            // stroke and distance
    }
};

export function getTerrainAt(hole, x, y) {
    // Terrain priority (higher = renders on top):
    // 1. Rough (base - automatic default)
    // 2. Fairway (middle layer)
    // 3. Bunker, Water, OOB (hazards)
    // 4. Tee, Green (always take precedence - you can't have water on a tee box)
    
    const priorityMap = {
        [TerrainType.ROUGH]: 0,
        [TerrainType.FAIRWAY]: 1,
        [TerrainType.BUNKER]: 2,
        [TerrainType.WATER]: 2,
        [TerrainType.OUT_OF_BOUNDS]: 2,
        [TerrainType.TEE]: 3,
        [TerrainType.GREEN]: 3
    };
    
    let highestPriority = -1;
    let resultTerrain = TerrainType.ROUGH;
    
    // Collect zones from course level and all holes (for backward compatibility)
    let allZones = [];
    if (currentCourse) {
        if (currentCourse.zones) {
            allZones = allZones.concat(currentCourse.zones);
        }
        // Also check zones in each hole for backward compatibility
        if (currentCourse.holes) {
            currentCourse.holes.forEach(h => {
                if (h.zones) {
                    allZones = allZones.concat(h.zones);
                }
            });
        }
    }
    // Fallback to hole.zones if no course set
    if (allZones.length === 0 && hole && hole.zones) {
        allZones = hole.zones;
    }
    
    // Check all zones and pick the one with highest priority
    for (const zone of allZones) {
        if (isPointInZone(x, y, zone)) {
            const priority = priorityMap[zone.terrain] ?? 0;
            if (priority > highestPriority) {
                highestPriority = priority;
                resultTerrain = zone.terrain;
            }
        }
    }
    
    return resultTerrain;
}

function isPointInZone(x, y, zone) {
    switch (zone.shape) {
        case 'rect':
            return x >= zone.x && x <= zone.x + zone.width &&
                   y >= zone.y && y <= zone.y + zone.height;
        case 'ellipse':
            const dx = (x - zone.cx) / (zone.rx);
            const dy = (y - zone.cy) / (zone.ry);
            return (dx * dx + dy * dy) <= 1;
        case 'polygon':
            return isPointInPolygon(x, y, zone.points);
        default:
            return false;
    }
}

// Elevation grid system
// Grid stores elevation values in feet, interpolated for any point

// Course reference for elevation grid (set when loading a hole)
let currentCourse = null;

export function setCourse(course) {
    currentCourse = course;
}

export function getElevationAt(hole, x, y) {
    // Check for elevation grid on hole first, then course
    const grid = hole.elevationGrid || (currentCourse && currentCourse.elevationGrid);
    if (!grid) return 0;
    
    const cols = grid.cols;
    const rows = grid.rows;
    const data = grid.data;
    
    // Get bounds from hole first, then course, then default
    const bounds = hole.bounds || (currentCourse && currentCourse.bounds) || { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    const rangeX = bounds.maxX - bounds.minX;
    const rangeY = bounds.maxY - bounds.minY;
    
    // Convert world coords to grid indices
    const gridX = ((x - bounds.minX) / rangeX) * (cols - 1);
    const gridY = ((y - bounds.minY) / rangeY) * (rows - 1);
    
    // Get base elevation from grid using bilinear interpolation
    // (matches GPU terrain mesh interpolation for consistent positioning)
    let elevation = bilinearInterpolate(data, gridX, gridY, cols, rows);
    
    // Auto-dip for bunkers - check if point is in a bunker and apply depression
    const bunkerDip = getBunkerDip(hole, x, y);
    elevation += bunkerDip;
    
    return elevation;
}

// Calculate bunker depression at a point
// Returns negative value (dip) if inside bunker, 0 otherwise
// Bunkers are asymmetric: steeper face toward tee if closer to tee, toward green if closer to green
function getBunkerDip(hole, x, y) {
    if (!hole.zones) return 0;
    
    // Get tee and green front positions for asymmetry calculation
    const teePos = hole.tee || { x: 0, y: 0 };
    const greenFront = findGreenFront(hole) || hole.hole || { x: 0, y: 0 };
    
    for (const zone of hole.zones) {
        if (zone.terrain !== TerrainType.BUNKER) continue;
        
        // Get bunker center
        const bunkerCenter = getBunkerCenter(zone);
        
        // Determine if bunker is closer to tee or green
        const distToTee = Math.sqrt((bunkerCenter.x - teePos.x) ** 2 + (bunkerCenter.y - teePos.y) ** 2);
        const distToGreen = Math.sqrt((bunkerCenter.x - greenFront.x) ** 2 + (bunkerCenter.y - greenFront.y) ** 2);
        const closerToGreen = distToGreen < distToTee;
        
        // Direction from bunker center to the strategic target (tee if closer to tee, green if closer to green)
        // Steepest face is AWAY from tee if closer to tee, TOWARD green if closer to green
        const targetPos = closerToGreen ? greenFront : teePos;
        const dirToTarget = {
            x: targetPos.x - bunkerCenter.x,
            y: targetPos.y - bunkerCenter.y
        };
        const dirMag = Math.sqrt(dirToTarget.x ** 2 + dirToTarget.y ** 2) || 1;
        dirToTarget.x /= dirMag;
        dirToTarget.y /= dirMag;
        
        // If closer to tee, steep face is AWAY from tee (toward green)
        // If closer to green, steep face is TOWARD green
        // So in both cases, the steep face direction points toward the green
        const steepFaceDir = closerToGreen ? dirToTarget : { x: -dirToTarget.x, y: -dirToTarget.y };
        
        let distFromEdge = 0;
        let asymmetryFactor = 0; // -1 to 1, positive = toward steep face
        
        if (zone.shape === 'ellipse') {
            const dx = (x - zone.cx) / zone.rx;
            const dy = (y - zone.cy) / zone.ry;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist <= 1) {
                distFromEdge = 1 - dist;
                // Calculate asymmetry based on position relative to center
                const offsetX = x - zone.cx;
                const offsetY = y - zone.cy;
                const offsetMag = Math.sqrt(offsetX ** 2 + offsetY ** 2) || 1;
                asymmetryFactor = (offsetX * steepFaceDir.x + offsetY * steepFaceDir.y) / offsetMag;
            }
        } else if (zone.shape === 'rect') {
            if (x >= zone.x && x <= zone.x + zone.width &&
                y >= zone.y && y <= zone.y + zone.height) {
                const distLeft = x - zone.x;
                const distRight = zone.x + zone.width - x;
                const distTop = y - zone.y;
                const distBottom = zone.y + zone.height - y;
                const minEdgeDist = Math.min(distLeft, distRight, distTop, distBottom);
                const halfSize = Math.min(zone.width, zone.height) / 2;
                distFromEdge = minEdgeDist / halfSize;
                
                const centerX = zone.x + zone.width / 2;
                const centerY = zone.y + zone.height / 2;
                const offsetX = x - centerX;
                const offsetY = y - centerY;
                const offsetMag = Math.sqrt(offsetX ** 2 + offsetY ** 2) || 1;
                asymmetryFactor = (offsetX * steepFaceDir.x + offsetY * steepFaceDir.y) / offsetMag;
            }
        } else if (zone.shape === 'polygon' && isPointInPolygon(x, y, zone.points)) {
            // For polygons, calculate distance from centroid and asymmetry
            const centroid = bunkerCenter;
            const offsetX = x - centroid.x;
            const offsetY = y - centroid.y;
            const offsetMag = Math.sqrt(offsetX ** 2 + offsetY ** 2) || 1;
            
            // Estimate distance from edge using ray casting to find nearest edge
            distFromEdge = estimatePolygonDistFromEdge(x, y, zone.points, centroid);
            asymmetryFactor = (offsetX * steepFaceDir.x + offsetY * steepFaceDir.y) / offsetMag;
        }
        
        if (distFromEdge > 0) {
            // Base depth: 4-5 feet (increased from 3)
            const bunkerDepth = zone.depth || 4.5;
            
            // Asymmetric profile: steeper on one side
            // asymmetryFactor ranges from -1 to 1
            // Positive = toward steep face, negative = away from steep face
            // Steep side: depth multiplier up to 1.4x
            // Shallow side: depth multiplier down to 0.7x
            const asymmetryStrength = 0.35; // How much asymmetry (0 = symmetric, 1 = extreme)
            const depthMultiplier = 1 + (asymmetryFactor * asymmetryStrength);
            
            // Use steeper curve for more dramatic bowl shape
            // sin^1.5 creates steeper walls near edges
            const baseCurve = Math.sin(distFromEdge * Math.PI / 2);
            const steepCurve = Math.pow(baseCurve, 0.7); // Exponent < 1 makes walls steeper
            
            return -bunkerDepth * steepCurve * depthMultiplier;
        }
    }
    
    return 0;
}

// Get the center point of a bunker zone
function getBunkerCenter(zone) {
    if (zone.shape === 'ellipse') {
        return { x: zone.cx, y: zone.cy };
    } else if (zone.shape === 'rect') {
        return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
    } else if (zone.shape === 'polygon' && zone.points && zone.points.length > 0) {
        // Calculate centroid
        let sumX = 0, sumY = 0;
        for (const pt of zone.points) {
            sumX += pt[0];
            sumY += pt[1];
        }
        return { x: sumX / zone.points.length, y: sumY / zone.points.length };
    }
    return { x: 0, y: 0 };
}

// Estimate how far a point is from the edge of a polygon (0 at edge, 1 at center)
function estimatePolygonDistFromEdge(x, y, points, centroid) {
    // Find minimum distance to any edge
    let minDistToEdge = Infinity;
    
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const dist = distanceToSegment(x, y, p1[0], p1[1], p2[0], p2[1]);
        minDistToEdge = Math.min(minDistToEdge, dist);
    }
    
    // Distance from centroid to point
    const distFromCenter = Math.sqrt((x - centroid.x) ** 2 + (y - centroid.y) ** 2);
    
    // Estimate max possible distance (from centroid to edge in same direction)
    const maxDist = minDistToEdge + distFromCenter;
    
    if (maxDist <= 0) return 0.5;
    
    // Return normalized distance (0 at edge, 1 at center)
    return Math.min(1, minDistToEdge / (maxDist * 0.5));
}

export function getElevationChange(hole, fromX, fromY, toX, toY) {
    const startElev = getElevationAt(hole, fromX, fromY);
    const endElev = getElevationAt(hole, toX, toY);
    return endElev - startElev;
}

export function getSlopeAt(hole, x, y) {
    // Check for elevation grid on hole first, then course
    const grid = hole.elevationGrid || (currentCourse && currentCourse.elevationGrid);
    if (!grid) return { x: 0, y: 0, magnitude: 0 };
    
    // Get bounds from hole first, then course, then default
    const bounds = hole.bounds || (currentCourse && currentCourse.bounds) || { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    
    const delta = 1; // Sample 1 unit away
    const elevCenter = getElevationAt(hole, x, y);
    const elevLeft = getElevationAt(hole, Math.max(bounds.minX, x - delta), y);
    const elevRight = getElevationAt(hole, Math.min(bounds.maxX, x + delta), y);
    const elevUp = getElevationAt(hole, x, Math.max(bounds.minY, y - delta));
    const elevDown = getElevationAt(hole, x, Math.min(bounds.maxY, y + delta));
    
    // Gradient (positive = uphill in that direction)
    const slopeX = (elevRight - elevLeft) / (2 * delta);
    const slopeY = (elevDown - elevUp) / (2 * delta);
    
    return {
        x: slopeX,
        y: slopeY,
        magnitude: Math.sqrt(slopeX * slopeX + slopeY * slopeY)
    };
}

// ============================================
// Green front calculation utilities
// ============================================

// Find the front of green position (where centreline intersects green zone)
// When course has multiple holes, hole.zones contains all zones; we need the green
// that this hole's centreline actually intersects (closest to tee).
export function findGreenFront(hole) {
    const centreline = hole.centreline;
    
    if (centreline && centreline.length >= 2 && hole.zones) {
        const greenZones = hole.zones.filter(z => z.terrain === TerrainType.GREEN);
        let best = null; // { x, y, dist } with minimum dist (closest to tee)
        for (const greenZone of greenZones) {
            const intersection = findCentrelineZoneIntersection(centreline, greenZone, true);
            if (intersection && (best === null || intersection.dist < best.dist)) {
                best = intersection;
            }
        }
        if (best) return { x: best.x, y: best.y };
    }
    
    // Fallback to hole position
    return hole.hole ? { x: hole.hole.x, y: hole.hole.y } : null;
}

// Find where centreline intersects a zone
// findFront=true returns first intersection (closest to tee), false returns last
function findCentrelineZoneIntersection(centreline, zone, findFront = false) {
    const intersections = [];
    
    for (let i = 0; i < centreline.length - 1; i++) {
        const p1 = centreline[i];
        const p2 = centreline[i + 1];
        
        let zoneIntersections = [];
        
        if (zone.shape === 'rect') {
            zoneIntersections = findLineRectIntersections(p1, p2, zone);
        } else if (zone.shape === 'ellipse') {
            zoneIntersections = findLineEllipseIntersections(p1, p2, zone);
        } else if (zone.shape === 'polygon') {
            zoneIntersections = findLinePolygonIntersections(p1, p2, zone.points);
        }
        
        zoneIntersections.forEach(pt => {
            let dist = 0;
            for (let j = 0; j < i; j++) {
                const dx = centreline[j+1][0] - centreline[j][0];
                const dy = centreline[j+1][1] - centreline[j][1];
                dist += Math.sqrt(dx * dx + dy * dy);
            }
            dist += Math.sqrt((pt.x - p1[0]) ** 2 + (pt.y - p1[1]) ** 2);
            intersections.push({ x: pt.x, y: pt.y, dist });
        });
    }
    
    if (intersections.length === 0) return null;
    
    intersections.sort((a, b) => a.dist - b.dist);
    return findFront ? intersections[0] : intersections[intersections.length - 1];
}

// Find the front of tee box position (where centreline exits tee box toward hole)
// When course has multiple holes, hole.zones contains all zones; we need the tee
// that this hole's centreline actually intersects (exit point toward green).
export function findTeeFront(hole) {
    const centreline = hole.centreline;
    
    if (centreline && centreline.length >= 2 && hole.zones) {
        const teeZones = hole.zones.filter(z => z.terrain === TerrainType.TEE);
        let best = null; // { x, y, dist } with maximum dist (closest to green = front of tee)
        for (const teeZone of teeZones) {
            const intersection = findCentrelineZoneIntersection(centreline, teeZone, false);
            if (intersection && (best === null || intersection.dist > best.dist)) {
                best = intersection;
            }
        }
        if (best) return { x: best.x, y: best.y };
    }
    
    // Fallback to tee marker position
    return hole.tee ? { x: hole.tee.x, y: hole.tee.y } : null;
}

/**
 * Get the aim angle (degrees) along the centreline from the tee.
 * Uses the first segment of the centreline when available, so the starting line is aimed along the centreline.
 * @param {Object} hole - Hole with centreline and tee
 * @returns {number} Angle in degrees, or 0 if not available
 */
export function getCentrelineAngleFromTee(hole) {
    if (hole.centreline && hole.centreline.length >= 2) {
        const p0 = hole.centreline[0];
        const p1 = hole.centreline[1];
        return Math.atan2(p1[0] - p0[0], p0[1] - p1[1]) * (180 / Math.PI);
    }
    if (hole.tee && hole.hole) {
        return Math.atan2(
            hole.hole.x - hole.tee.x,
            hole.tee.y - hole.hole.y
        ) * (180 / Math.PI);
    }
    return 0;
}

function findLineRectIntersections(p1, p2, rect) {
    const intersections = [];
    const edges = [
        [[rect.x, rect.y], [rect.x + rect.width, rect.y]],
        [[rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height]],
        [[rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]],
        [[rect.x, rect.y], [rect.x, rect.y + rect.height]]
    ];
    edges.forEach(edge => {
        const pt = lineSegmentIntersect(p1, p2, edge[0], edge[1]);
        if (pt) intersections.push(pt);
    });
    return intersections;
}

function findLineEllipseIntersections(p1, p2, ellipse) {
    const intersections = [];
    const cx = ellipse.cx, cy = ellipse.cy, rx = ellipse.rx, ry = ellipse.ry;
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    
    const a = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    const b = 2 * ((p1[0] - cx) * dx / (rx * rx) + (p1[1] - cy) * dy / (ry * ry));
    const c = ((p1[0] - cx) ** 2) / (rx * rx) + ((p1[1] - cy) ** 2) / (ry * ry) - 1;
    
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
        const sqrtD = Math.sqrt(discriminant);
        [(-b - sqrtD) / (2 * a), (-b + sqrtD) / (2 * a)].forEach(t => {
            if (t >= 0 && t <= 1) {
                intersections.push({ x: p1[0] + t * dx, y: p1[1] + t * dy });
            }
        });
    }
    return intersections;
}

function findLinePolygonIntersections(p1, p2, points) {
    const intersections = [];
    for (let i = 0; i < points.length; i++) {
        const pt = lineSegmentIntersect(p1, p2, points[i], points[(i + 1) % points.length]);
        if (pt) intersections.push(pt);
    }
    return intersections;
}
