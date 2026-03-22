// Course Data Model
export class CourseData {
    constructor() {
        this.name = 'New Course';
        // Larger bounds for a full 18-hole course
        // Roughly 1500 yards x 1500 yards (375 x 375 world units)
        this.bounds = { minX: -200, maxX: 600, minY: -400, maxY: 400 };
        
        // Terrain dictionaries - all terrain stored globally by type
        this.terrain = {
            fairway: [],    // Array of zone shapes
            rough: [],
            bunker: [],
            water: [],
            green: [],
            teeBox: [],
            outOfBounds: [],
            path: []
        };
        
        // Trees stored globally
        this.trees = [];
        
        // Sprinkler heads stored globally - yardage markers for caddies
        this.sprinklerHeads = [];
        
        // Measure points stored globally - custom yardage reference points
        this.measurePoints = [];
        
        // Hole details - just positioning info, not terrain
        this.holes = [];
        
        // Elevation grid - covers entire course bounds
        // Grid resolution: 1 cell = 2 world units = 8 yards
        this.elevationGridSize = 2;
        this.initElevationGrid();
        
        // Add first hole
        this.addHole();
    }
    
    initElevationGrid() {
        const cellSize = this.elevationGridSize;
        const cols = Math.ceil((this.bounds.maxX - this.bounds.minX) / cellSize) + 1;
        const rows = Math.ceil((this.bounds.maxY - this.bounds.minY) / cellSize) + 1;
        
        this.elevationGrid = {
            cols: cols,
            rows: rows,
            cellSize: cellSize,
            data: []
        };
        
        // Initialize all elevations to 0
        for (let y = 0; y < rows; y++) {
            this.elevationGrid.data[y] = [];
            for (let x = 0; x < cols; x++) {
                this.elevationGrid.data[y][x] = 0;
            }
        }
    }
    
    // Get elevation at world coordinates
    getElevationAt(worldX, worldY) {
        const grid = this.elevationGrid;
        const cellSize = grid.cellSize;
        
        // Convert world to grid coords
        const gx = (worldX - this.bounds.minX) / cellSize;
        const gy = (worldY - this.bounds.minY) / cellSize;
        
        // Bilinear interpolation
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const x1 = Math.min(x0 + 1, grid.cols - 1);
        const y1 = Math.min(y0 + 1, grid.rows - 1);
        
        const fx = gx - x0;
        const fy = gy - y0;
        
        const v00 = grid.data[Math.max(0, y0)]?.[Math.max(0, x0)] || 0;
        const v10 = grid.data[Math.max(0, y0)]?.[x1] || 0;
        const v01 = grid.data[y1]?.[Math.max(0, x0)] || 0;
        const v11 = grid.data[y1]?.[x1] || 0;
        
        return v00 * (1 - fx) * (1 - fy) +
               v10 * fx * (1 - fy) +
               v01 * (1 - fx) * fy +
               v11 * fx * fy;
    }
    
    // Modify elevation in a circular brush area
    modifyElevation(worldX, worldY, brushRadius, amount) {
        const grid = this.elevationGrid;
        const cellSize = grid.cellSize;
        
        // Convert brush to grid space
        const centerGX = (worldX - this.bounds.minX) / cellSize;
        const centerGY = (worldY - this.bounds.minY) / cellSize;
        const radiusG = brushRadius / cellSize;
        
        // Affect cells within brush radius
        const minGX = Math.max(0, Math.floor(centerGX - radiusG));
        const maxGX = Math.min(grid.cols - 1, Math.ceil(centerGX + radiusG));
        const minGY = Math.max(0, Math.floor(centerGY - radiusG));
        const maxGY = Math.min(grid.rows - 1, Math.ceil(centerGY + radiusG));
        
        for (let gy = minGY; gy <= maxGY; gy++) {
            for (let gx = minGX; gx <= maxGX; gx++) {
                const dx = gx - centerGX;
                const dy = gy - centerGY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist <= radiusG) {
                    // Falloff from center (1 at center, 0 at edge)
                    const falloff = 1 - (dist / radiusG);
                    const smoothFalloff = falloff * falloff * (3 - 2 * falloff); // Smoothstep
                    grid.data[gy][gx] += amount * smoothFalloff;
                }
            }
        }
    }
    
    // Smooth elevation in a circular area
    smoothElevation(worldX, worldY, brushRadius) {
        const grid = this.elevationGrid;
        const cellSize = grid.cellSize;
        
        const centerGX = (worldX - this.bounds.minX) / cellSize;
        const centerGY = (worldY - this.bounds.minY) / cellSize;
        const radiusG = brushRadius / cellSize;
        
        const minGX = Math.max(1, Math.floor(centerGX - radiusG));
        const maxGX = Math.min(grid.cols - 2, Math.ceil(centerGX + radiusG));
        const minGY = Math.max(1, Math.floor(centerGY - radiusG));
        const maxGY = Math.min(grid.rows - 2, Math.ceil(centerGY + radiusG));
        
        // Create copy for reading
        const oldData = grid.data.map(row => [...row]);
        
        for (let gy = minGY; gy <= maxGY; gy++) {
            for (let gx = minGX; gx <= maxGX; gx++) {
                const dx = gx - centerGX;
                const dy = gy - centerGY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist <= radiusG) {
                    // Average with neighbors
                    const avg = (
                        oldData[gy - 1][gx] +
                        oldData[gy + 1][gx] +
                        oldData[gy][gx - 1] +
                        oldData[gy][gx + 1] +
                        oldData[gy][gx]
                    ) / 5;
                    
                    const falloff = 1 - (dist / radiusG);
                    grid.data[gy][gx] = oldData[gy][gx] * (1 - falloff) + avg * falloff;
                }
            }
        }
    }
    
    // Expand bounds and elevation grid if needed
    expandBoundsIfNeeded(worldX, worldY) {
        let needsExpand = false;
        const margin = 50; // Add generous margin when expanding
        
        if (worldX < this.bounds.minX + 10) {
            this.bounds.minX = worldX - margin;
            needsExpand = true;
        }
        if (worldX > this.bounds.maxX - 10) {
            this.bounds.maxX = worldX + margin;
            needsExpand = true;
        }
        if (worldY < this.bounds.minY + 10) {
            this.bounds.minY = worldY - margin;
            needsExpand = true;
        }
        if (worldY > this.bounds.maxY - 10) {
            this.bounds.maxY = worldY + margin;
            needsExpand = true;
        }
        
        if (needsExpand) {
            this.resizeElevationGrid();
        }
    }
    
    // Resize elevation grid to match current bounds
    resizeElevationGrid() {
        const cellSize = this.elevationGridSize;
        const newCols = Math.ceil((this.bounds.maxX - this.bounds.minX) / cellSize) + 1;
        const newRows = Math.ceil((this.bounds.maxY - this.bounds.minY) / cellSize) + 1;
        
        const oldGrid = this.elevationGrid;
        const newData = [];
        
        // Initialize new grid with zeros
        for (let y = 0; y < newRows; y++) {
            newData[y] = [];
            for (let x = 0; x < newCols; x++) {
                newData[y][x] = 0;
            }
        }
        
        // Copy old data if it exists (this preserves elevation when expanding)
        if (oldGrid && oldGrid.data) {
            // Calculate offset between old and new grid origins
            // For simplicity, we'll just keep elevation at 0 for new areas
            // A more sophisticated approach would interpolate
            const oldMinX = this.bounds.minX;
            const oldMinY = this.bounds.minY;
            
            for (let gy = 0; gy < Math.min(oldGrid.rows, newRows); gy++) {
                for (let gx = 0; gx < Math.min(oldGrid.cols, newCols); gx++) {
                    if (oldGrid.data[gy] && oldGrid.data[gy][gx] !== undefined) {
                        newData[gy][gx] = oldGrid.data[gy][gx];
                    }
                }
            }
        }
        
        this.elevationGrid = {
            cols: newCols,
            rows: newRows,
            cellSize: cellSize,
            data: newData
        };
    }
    
    // Hole management - holes only contain positioning, not terrain
    addHole() {
        const holeNum = this.holes.length + 1;
        this.holes.push({
            number: holeNum,
            name: `Hole ${holeNum}`,
            par: 4,
            tee: null,
            hole: null,
            centreline: [] // Array of [x, y] points defining the ideal playing line
        });
    }
    
    getHole(index) {
        return this.holes[index] || null;
    }
    
    removeHole(index) {
        if (this.holes.length > 1 && this.holes[index]) {
            this.holes.splice(index, 1);
            // Renumber remaining holes
            this.holes.forEach((hole, i) => {
                hole.number = i + 1;
                hole.name = `Hole ${i + 1}`;
            });
        }
    }
    
    // Hole detail methods
    setTeePosition(holeIndex, x, y) {
        const hole = this.holes[holeIndex];
        if (hole) {
            this.expandBoundsIfNeeded(x, y);
            hole.tee = { x, y };
        }
    }
    
    setHolePosition(holeIndex, x, y) {
        const hole = this.holes[holeIndex];
        if (hole) {
            this.expandBoundsIfNeeded(x, y);
            hole.hole = { x, y };
        }
    }
    
    setHolePar(holeIndex, par) {
        const hole = this.holes[holeIndex];
        if (hole) {
            hole.par = par;
        }
    }
    
    // Centreline methods
    setCentreline(holeIndex, points) {
        const hole = this.holes[holeIndex];
        if (hole) {
            hole.centreline = points;
        }
    }
    
    addCentrelinePoint(holeIndex, x, y) {
        const hole = this.holes[holeIndex];
        if (hole) {
            this.expandBoundsIfNeeded(x, y);
            hole.centreline.push([x, y]);
        }
    }
    
    removeCentrelinePoint(holeIndex, pointIndex) {
        const hole = this.holes[holeIndex];
        if (hole && hole.centreline[pointIndex]) {
            hole.centreline.splice(pointIndex, 1);
        }
    }
    
    clearCentreline(holeIndex) {
        const hole = this.holes[holeIndex];
        if (hole) {
            hole.centreline = [];
        }
    }
    
    // Terrain methods - terrain is global, not per-hole
    addTerrain(terrainType, zone) {
        if (!this.terrain[terrainType]) {
            this.terrain[terrainType] = [];
        }
        
        // Expand bounds if zone extends beyond current bounds
        if (zone.shape === 'polygon' && zone.points) {
            zone.points.forEach(pt => this.expandBoundsIfNeeded(pt[0], pt[1]));
        } else if (zone.shape === 'rect') {
            this.expandBoundsIfNeeded(zone.x, zone.y);
            this.expandBoundsIfNeeded(zone.x + zone.width, zone.y + zone.height);
        } else if (zone.shape === 'ellipse') {
            this.expandBoundsIfNeeded(zone.cx - zone.rx, zone.cy - zone.ry);
            this.expandBoundsIfNeeded(zone.cx + zone.rx, zone.cy + zone.ry);
        }
        
        this.terrain[terrainType].push(zone);
    }
    
    removeTerrain(terrainType, index) {
        if (this.terrain[terrainType] && this.terrain[terrainType][index]) {
            this.terrain[terrainType].splice(index, 1);
        }
    }
    
    getAllTerrain() {
        const all = [];
        for (const [type, zones] of Object.entries(this.terrain)) {
            zones.forEach((zone, index) => {
                all.push({ ...zone, terrain: type, index });
            });
        }
        return all;
    }
    
    // Tree methods - trees are global
    addTree(tree) {
        this.expandBoundsIfNeeded(tree.x, tree.y);
        this.trees.push(tree);
    }
    
    removeTree(index) {
        if (this.trees[index]) {
            this.trees.splice(index, 1);
        }
    }
    
    // Sprinkler head methods - sprinkler heads are global
    addSprinklerHead(sprinklerHead) {
        this.expandBoundsIfNeeded(sprinklerHead.x, sprinklerHead.y);
        this.sprinklerHeads.push(sprinklerHead);
    }
    
    removeSprinklerHead(index) {
        if (this.sprinklerHeads[index]) {
            this.sprinklerHeads.splice(index, 1);
        }
    }
    
    // Measure point methods - measure points are global
    addMeasurePoint(measurePoint) {
        this.expandBoundsIfNeeded(measurePoint.x, measurePoint.y);
        this.measurePoints.push(measurePoint);
    }
    
    removeMeasurePoint(index) {
        if (this.measurePoints[index]) {
            this.measurePoints.splice(index, 1);
        }
    }
    
    // Export/Import
    export() {
        return {
            name: this.name,
            bounds: this.bounds,
            terrain: this.terrain,
            trees: this.trees,
            sprinklerHeads: this.sprinklerHeads,
            measurePoints: this.measurePoints,
            elevationGrid: this.elevationGrid,
            holes: this.holes.map(hole => ({
                number: hole.number,
                name: hole.name,
                par: hole.par,
                tee: hole.tee,
                hole: hole.hole,
                centreline: hole.centreline || []
            }))
        };
    }
    
    import(data) {
        this.name = data.name || 'Imported Course';
        this.bounds = data.bounds || this.bounds;
        
        // Import terrain dictionaries
        if (data.terrain) {
            this.terrain = data.terrain;
        }
        
        // Import trees
        this.trees = data.trees || [];
        
        // Import sprinkler heads
        this.sprinklerHeads = data.sprinklerHeads || [];
        
        // Import measure points
        this.measurePoints = data.measurePoints || [];
        
        // Import elevation grid
        if (data.elevationGrid && data.elevationGrid.data && data.elevationGrid.data.length > 0) {
            this.elevationGrid = data.elevationGrid;
        } else {
            // Reinitialize grid if data is empty or missing
            this.initElevationGrid();
        }
        
        // Import hole details
        this.holes = data.holes || [];
        
        // Ensure all holes have centreline array
        this.holes.forEach(hole => {
            if (!hole.centreline) {
                hole.centreline = [];
            }
        });
        
        if (this.holes.length === 0) {
            this.addHole();
        }
    }
}
