// Shared utility functions for golf game
// Geometry, math, and coordinate conversion utilities

// ============================================
// Constants
// ============================================

// Scale factor: world units to 3D units (1 world unit = 4 yards)
export const WORLD_SCALE = 4;

// Conversion: yards to world units (internal use)
const YARDS_TO_WORLD = 1 / 4;

// ============================================
// Math Utilities
// ============================================

/**
 * Clamp a value between min and max
 */
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Smooth interpolation (smoothstep)
 */
export function smoothstep(t) {
    return t * t * (3 - 2 * t);
}

/**
 * Gaussian random number generator using Box-Muller transform
 * Returns a random number from a standard normal distribution (mean=0, stddev=1)
 */
export function gaussianRandom() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Seeded random number generator for consistent/reproducible random values
 * Uses sine-based hash function to generate deterministic pseudo-random numbers
 * @param {number} seed - The seed value
 * @returns {number} A pseudo-random number between 0 and 1
 */
export function seededRandom(seed) {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
}

/**
 * Convert yards to world units
 */
export function yardsToWorld(yards) {
    return yards * YARDS_TO_WORLD;
}

/**
 * Convert world units to yards
 */
export function worldToYards(worldUnits) {
    return worldUnits * WORLD_SCALE;
}

// ============================================
// Geometry Utilities
// ============================================

/**
 * Check if a point is inside a polygon using ray casting
 */
export function isPointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i][0], yi = points[i][1];
        const xj = points[j][0], yj = points[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Calculate distance from a point to a line segment
 */
export function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    
    if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    
    const nearX = x1 + t * dx;
    const nearY = y1 + t * dy;
    
    return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}

/**
 * Calculate distance from a point to a polygon edge
 */
export function distanceToPolygon(x, y, points) {
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const dist = distanceToSegment(x, y, p1[0], p1[1], p2[0], p2[1]);
        if (dist < minDist) minDist = dist;
    }
    return minDist;
}

/**
 * Find intersection point of two line segments
 * Returns null if no intersection
 */
export function lineSegmentIntersect(p1, p2, p3, p4) {
    const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1], x4 = p4[0], y4 = p4[1];
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    }
    return null;
}

// ============================================
// Centreline / Yardage Utilities
// ============================================

/**
 * Find a point along the centreline at a specific yardage from a reference point
 * Walks backwards from the reference point toward the tee
 */
export function findPointAtYardageFromRef(centreline, refPoint, yards) {
    const targetDistWorld = yardsToWorld(yards);
    
    // Find the closest point ON the centreline (not just vertices)
    let closestSegIdx = 0;
    let closestT = 0;
    let closestDist = Infinity;
    
    for (let i = 0; i < centreline.length - 1; i++) {
        const p1 = centreline[i];
        const p2 = centreline[i + 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) continue;
        
        // Project refPoint onto segment
        let t = ((refPoint.x - p1[0]) * dx + (refPoint.y - p1[1]) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        
        const nearX = p1[0] + t * dx;
        const nearY = p1[1] + t * dy;
        const dist = Math.sqrt((refPoint.x - nearX) ** 2 + (refPoint.y - nearY) ** 2);
        
        if (dist < closestDist) {
            closestDist = dist;
            closestSegIdx = i;
            closestT = t;
        }
    }
    
    // Calculate distance from start of closest segment to the projected point
    const p1 = centreline[closestSegIdx];
    const p2 = centreline[closestSegIdx + 1];
    const segDx = p2[0] - p1[0];
    const segDy = p2[1] - p1[1];
    const distIntoSeg = closestT * Math.sqrt(segDx * segDx + segDy * segDy);
    
    // Walk back from the projected point toward the tee
    let accumulatedDist = 0;
    
    // First, walk back within the current segment
    if (distIntoSeg >= targetDistWorld) {
        const t = (distIntoSeg - targetDistWorld) / Math.sqrt(segDx * segDx + segDy * segDy);
        return {
            x: p1[0] + t * segDx,
            y: p1[1] + t * segDy
        };
    }
    accumulatedDist = distIntoSeg;
    
    // Then walk back through previous segments
    for (let i = closestSegIdx; i > 0; i--) {
        const dx = centreline[i][0] - centreline[i-1][0];
        const dy = centreline[i][1] - centreline[i-1][1];
        const segmentDist = Math.sqrt(dx * dx + dy * dy);
        
        if (accumulatedDist + segmentDist >= targetDistWorld) {
            const remaining = targetDistWorld - accumulatedDist;
            const t = remaining / segmentDist;
            return {
                x: centreline[i][0] - t * dx,
                y: centreline[i][1] - t * dy
            };
        }
        accumulatedDist += segmentDist;
    }
    
    return null; // Yardage is beyond the tee
}

/**
 * Find where a circle centered at refPoint intersects the centreline
 */
export function findCircleCentrelineIntersection(centreline, refPoint, radiusWorld) {
    for (let i = 0; i < centreline.length - 1; i++) {
        const p1 = centreline[i];
        const p2 = centreline[i + 1];
        
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const fx = p1[0] - refPoint.x;
        const fy = p1[1] - refPoint.y;
        
        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - radiusWorld * radiusWorld;
        
        const discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) {
            const sqrtD = Math.sqrt(discriminant);
            const t1 = (-b - sqrtD) / (2 * a);
            const t2 = (-b + sqrtD) / (2 * a);
            
            for (const t of [t1, t2]) {
                if (t >= 0 && t <= 1) {
                    return {
                        x: p1[0] + t * dx,
                        y: p1[1] + t * dy
                    };
                }
            }
        }
    }
    return null;
}

// ============================================
// Interpolation Utilities
// ============================================

/**
 * Catmull-Rom cubic interpolation
 */
export function cubicInterpolate(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    
    return 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
}

/**
 * Bilinear interpolation on a 2D grid
 * Matches GPU terrain mesh interpolation for consistent elevation sampling
 */
export function bilinearInterpolate(data, x, y, cols, rows) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    
    // Clamp indices to valid range
    const x0 = Math.max(0, Math.min(cols - 1, xi));
    const x1 = Math.max(0, Math.min(cols - 1, xi + 1));
    const y0 = Math.max(0, Math.min(rows - 1, yi));
    const y1 = Math.max(0, Math.min(rows - 1, yi + 1));
    
    // Get four corner values
    const v00 = data[y0][x0];
    const v10 = data[y0][x1];
    const v01 = data[y1][x0];
    const v11 = data[y1][x1];
    
    // Bilinear interpolation
    const v0 = v00 + (v10 - v00) * xf;
    const v1 = v01 + (v11 - v01) * xf;
    return v0 + (v1 - v0) * yf;
}

/**
 * Bicubic interpolation on a 2D grid
 */
export function bicubicInterpolate(data, x, y, cols, rows) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    
    // Get value with bounds clamping
    const getValue = (gx, gy) => {
        const cx = Math.max(0, Math.min(cols - 1, gx));
        const cy = Math.max(0, Math.min(rows - 1, gy));
        return data[cy][cx];
    };
    
    // Interpolate 4 rows
    const row0 = cubicInterpolate(
        getValue(xi - 1, yi - 1), getValue(xi, yi - 1), getValue(xi + 1, yi - 1), getValue(xi + 2, yi - 1), xf
    );
    const row1 = cubicInterpolate(
        getValue(xi - 1, yi), getValue(xi, yi), getValue(xi + 1, yi), getValue(xi + 2, yi), xf
    );
    const row2 = cubicInterpolate(
        getValue(xi - 1, yi + 1), getValue(xi, yi + 1), getValue(xi + 1, yi + 1), getValue(xi + 2, yi + 1), xf
    );
    const row3 = cubicInterpolate(
        getValue(xi - 1, yi + 2), getValue(xi, yi + 2), getValue(xi + 1, yi + 2), getValue(xi + 2, yi + 2), xf
    );
    
    // Interpolate column
    return cubicInterpolate(row0, row1, row2, row3, yf);
}

// ============================================
// Club Utilities
// ============================================

/**
 * Get club difficulty multiplier for a given lie
 * Long clubs are harder to hit from bad lies
 * @param {string} clubName - Name of the club being used
 * @param {string} [lieType] - Optional lie type for special handling (e.g., bunker)
 * @returns {number} Difficulty multiplier (0-1, higher = more difficult)
 */
export function getClubLieDifficulty(clubName, lieType) {
    const clubDifficulty = {
        'Driver': 1.0,
        '3 Wood': 0.9,
        '5 Wood': 0.8,
        '4 Iron': 0.7,
        '5 Iron': 0.6,
        '6 Iron': 0.5,
        '7 Iron': 0.4,
        '8 Iron': 0.3,
        '9 Iron': 0.2,
        'PW': 0.15,
        'GW': 0.1,
        'SW': 0.05,
        'LW': 0.1,
        'Putter': 0
    };

    // Sand wedge is designed for bunkers - no difficulty penalty
    if (lieType && lieType.includes('bunker') && clubName === 'SW') {
        return 0;
    }

    return clubDifficulty[clubName] || 0.5;
}
