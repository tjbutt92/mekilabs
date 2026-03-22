// Tool Manager - Handles all tool interactions
export class ToolManager {
    constructor(canvas, courseData) {
        this.canvas = canvas;
        this.courseData = courseData;
        
        this.currentTool = 'select';
        this.currentTerrain = null;
        this.treeType = 'TALL_PINE_1';
        
        // Centreline editing state
        this.isDraggingCentrelinePoint = false;
        
        // Elevation brush settings
        this.elevationBrushSize = 15;
        this.elevationStrength = 3;
        this.isElevationPainting = false;
        
        // Drawing state
        this.isDrawing = false;
        this.isDragging = false;
        this.isPanning = false;
        this.dragStart = { x: 0, y: 0 };
        this.panStart = { x: 0, y: 0 };
        
        // Options
        this.smoothingEnabled = true;
        this.smoothingAmount = 3;
        this.snapEnabled = false;
        this.gridSize = 5;
        
        this.setupEvents();
    }
    
    setupEvents() {
        const canvasEl = this.canvas.canvas;
        
        canvasEl.addEventListener('mousedown', (e) => this.onMouseDown(e));
        canvasEl.addEventListener('mousemove', (e) => this.onMouseMove(e));
        canvasEl.addEventListener('mouseup', (e) => this.onMouseUp(e));
        canvasEl.addEventListener('dblclick', (e) => this.onDoubleClick(e));
        canvasEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.onRightClick(e);
        });
        
        // Mouse wheel for zoom - zoom toward cursor position
        canvasEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = canvasEl.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.max(0.25, Math.min(4, this.canvas.zoom + delta));
            this.canvas.setZoom(newZoom, mouseX, mouseY);
            document.getElementById('zoom-slider').value = newZoom;
            document.getElementById('zoom-display').textContent = Math.round(newZoom * 100) + '%';
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
    }
    
    setTool(tool, terrain = null) {
        // Finish any current drawing
        if (this.isDrawing) {
            if (this.currentTool === 'path') {
                this.finishPath();
            } else {
                this.finishDrawing();
            }
        }
        
        this.currentTool = tool;
        this.currentTerrain = terrain;
        
        // Clear elevation brush preview when switching tools
        this.canvas.elevationBrushPos = null;
        
        // Update cursor
        const canvasEl = this.canvas.canvas;
        if (tool === 'pan') {
            canvasEl.style.cursor = 'grab';
        } else if (tool === 'select') {
            canvasEl.style.cursor = 'default';
        } else if (tool.startsWith('elevation')) {
            canvasEl.style.cursor = 'crosshair';
        } else {
            canvasEl.style.cursor = 'crosshair';
        }
    }
    
    setElevationBrushSize(size) {
        this.elevationBrushSize = size;
        this.canvas.elevationBrushSize = size;
    }
    
    setElevationStrength(strength) {
        this.elevationStrength = strength;
    }
    
    setTreeType(type) {
        this.treeType = type;
    }
    
    setSmoothingEnabled(enabled) {
        this.smoothingEnabled = enabled;
    }
    
    setSmoothingAmount(amount) {
        this.smoothingAmount = amount;
    }
    
    setSnapEnabled(enabled) {
        this.snapEnabled = enabled;
    }
    
    setGridSize(size) {
        this.gridSize = size;
    }
    
    snapToGrid(value) {
        if (!this.snapEnabled) return value;
        return Math.round(value / this.gridSize) * this.gridSize;
    }
    
    onMouseDown(e) {
        const rect = this.canvas.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.canvas.screenToWorld(screenX, screenY);
        
        // Middle mouse or pan tool = pan
        if (e.button === 1 || this.currentTool === 'pan') {
            this.isPanning = true;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.canvas.canvas.style.cursor = 'grabbing';
            return;
        }
        
        // Left click
        if (e.button === 0) {
            switch (this.currentTool) {
                case 'select':
                    this.handleSelect(screenX, screenY, world);
                    break;
                    
                case 'teeBox':
                    this.startRectDraw(world);
                    break;
                    
                case 'fairway':
                case 'rough':
                case 'green':
                case 'bunker':
                case 'water':
                case 'outOfBounds':
                    this.addDrawingPoint(world);
                    break;
                    
                case 'path':
                    this.addPathPoint(world);
                    break;
                    
                case 'place-tee':
                    this.placeTee(world);
                    break;
                    
                case 'place-hole':
                    this.placeHole(world);
                    break;
                    
                case 'tree':
                    this.placeTree(world);
                    break;
                    
                case 'sprinkler':
                    this.placeSprinklerHead(world);
                    break;
                    
                case 'measure':
                    this.placeMeasurePoint(world);
                    break;
                    
                case 'elevation-up':
                case 'elevation-down':
                case 'elevation-smooth':
                    this.isElevationPainting = true;
                    this.applyElevation(world);
                    break;
                    
                case 'centreline':
                    this.handleCentrelineClick(screenX, screenY, world);
                    break;
            }
        }
    }
    
    onMouseMove(e) {
        const rect = this.canvas.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const world = this.canvas.screenToWorld(screenX, screenY);
        
        // Update cursor info display
        this.updateCursorInfo(world);
        
        // Show elevation brush preview
        if (this.currentTool.startsWith('elevation')) {
            this.canvas.elevationBrushPos = world;
            this.canvas.render();
        }
        
        // Update hovered centreline point
        if (this.currentTool === 'centreline') {
            const pointIndex = this.canvas.hitTestCentrelinePoint(screenX, screenY);
            if (pointIndex !== this.canvas.hoveredCentrelinePoint) {
                this.canvas.hoveredCentrelinePoint = pointIndex;
                this.canvas.render();
            }
        }
        
        // Dragging centreline point
        if (this.isDraggingCentrelinePoint && this.canvas.selectedCentrelinePoint !== null) {
            const hole = this.courseData.getHole(this.canvas.currentHoleIndex);
            if (hole && hole.centreline) {
                hole.centreline[this.canvas.selectedCentrelinePoint] = [
                    this.snapToGrid(world.x),
                    this.snapToGrid(world.y)
                ];
                this.canvas.render();
            }
            return;
        }
        
        // Elevation painting while dragging
        if (this.isElevationPainting) {
            this.applyElevation(world);
            return;
        }
        
        // Panning
        if (this.isPanning) {
            const dx = e.clientX - this.panStart.x;
            const dy = e.clientY - this.panStart.y;
            this.canvas.panX += dx;
            this.canvas.panY += dy;
            this.panStart = { x: e.clientX, y: e.clientY };
            this.canvas.render();
            return;
        }
        
        // Dragging node of a zone (global terrain)
        if (this.isDragging && this.canvas.selectedNode !== null) {
            const allTerrain = this.courseData.getAllTerrain();
            const zoneInfo = allTerrain[this.canvas.selectedZone];
            if (zoneInfo && zoneInfo.shape === 'polygon') {
                // Get the actual zone from the terrain dictionary
                const terrainType = zoneInfo.terrain;
                const zone = this.courseData.terrain[terrainType][zoneInfo.index];
                if (zone && zone.points) {
                    zone.points[this.canvas.selectedNode] = [
                        this.snapToGrid(world.x),
                        this.snapToGrid(world.y)
                    ];
                    this.canvas.render();
                }
            }
            return;
        }
        
        // Rectangle drawing
        if (this.isDrawing && this.currentTool === 'teeBox') {
            this.updateRectDraw(world);
            return;
        }
        
        // Update hovered node
        if (this.currentTool === 'select' && this.canvas.selectedZone !== null) {
            const nodeIndex = this.canvas.hitTestNode(screenX, screenY);
            if (nodeIndex !== this.canvas.hoveredNode) {
                this.canvas.hoveredNode = nodeIndex;
                this.canvas.render();
            }
        }
    }
    
    updateCursorInfo(world) {
        const WORLD_TO_YARDS = 4;
        const worldX = Math.round(world.x * 10) / 10;
        const worldY = Math.round(world.y * 10) / 10;
        const yardsX = Math.round(world.x * WORLD_TO_YARDS);
        const yardsY = Math.round(world.y * WORLD_TO_YARDS);
        
        document.getElementById('cursor-world').textContent = `X: ${worldX}, Y: ${worldY}`;
        document.getElementById('cursor-yards').textContent = `${yardsX}y × ${yardsY}y`;
    }
    
    onMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.canvas.style.cursor = this.currentTool === 'pan' ? 'grab' : 'default';
            return;
        }
        
        if (this.isElevationPainting) {
            this.isElevationPainting = false;
            return;
        }
        
        if (this.isDraggingCentrelinePoint) {
            this.isDraggingCentrelinePoint = false;
            return;
        }
        
        if (this.isDragging) {
            this.isDragging = false;
            return;
        }
        
        // Finish rectangle drawing
        if (this.isDrawing && this.currentTool === 'teeBox') {
            this.finishRectDraw();
        }
    }
    
    onDoubleClick(e) {
        // Finish polygon drawing or path drawing
        if (this.isDrawing) {
            if (this.currentTool === 'path') {
                this.finishPath();
            } else if (this.canvas.currentPoints.length >= 3) {
                this.finishDrawing();
            }
        }
    }
    
    onRightClick(e) {
        // Cancel current drawing or finish polygon/path
        if (this.isDrawing) {
            if (this.currentTool === 'path') {
                if (this.canvas.currentPoints.length >= 2) {
                    this.finishPath();
                } else {
                    this.cancelDrawing();
                }
            } else if (this.canvas.currentPoints.length >= 3) {
                this.finishDrawing();
            } else {
                this.cancelDrawing();
            }
        }
    }
    
    onKeyDown(e) {
        // Delete key
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.canvas.selectedCentrelinePoint !== null) {
                // Delete centreline point
                this.deleteCentrelinePoint();
            } else if (this.canvas.selectedNode !== null) {
                // Delete node from polygon (global terrain)
                const allTerrain = this.courseData.getAllTerrain();
                const zoneInfo = allTerrain[this.canvas.selectedZone];
                if (zoneInfo && zoneInfo.shape === 'polygon') {
                    const zone = this.courseData.terrain[zoneInfo.terrain][zoneInfo.index];
                    if (zone && zone.points && zone.points.length > 3) {
                        zone.points.splice(this.canvas.selectedNode, 1);
                        this.canvas.selectedNode = null;
                        this.canvas.render();
                    }
                }
            } else {
                this.canvas.deleteSelected();
            }
        }
        
        // Escape - cancel drawing
        if (e.key === 'Escape') {
            this.cancelDrawing();
        }
        
        // Space - toggle pan
        if (e.key === ' ' && !this.isDrawing) {
            e.preventDefault();
            this.setTool('pan');
        }
    }
    
    handleSelect(screenX, screenY, world) {
        // First check if clicking on a node of selected zone
        if (this.canvas.selectedZone !== null) {
            const nodeIndex = this.canvas.hitTestNode(screenX, screenY);
            if (nodeIndex >= 0) {
                this.canvas.selectedNode = nodeIndex;
                this.isDragging = true;
                this.canvas.render();
                return;
            }
        }
        
        // Check for sprinkler head hit (global sprinkler heads)
        const sprinklerIndex = this.canvas.hitTestSprinklerHead(world.x, world.y);
        if (sprinklerIndex >= 0) {
            this.canvas.selectedZone = null;
            this.canvas.selectedTree = null;
            this.canvas.selectedSprinklerHead = sprinklerIndex;
            this.canvas.selectedMeasurePoint = null;
            this.canvas.selectedNode = null;
            this.canvas.render();
            this.updateSelectionProps();
            return;
        }
        
        // Check for measure point hit (global measure points)
        const measureIndex = this.canvas.hitTestMeasurePoint(world.x, world.y);
        if (measureIndex >= 0) {
            this.canvas.selectedZone = null;
            this.canvas.selectedTree = null;
            this.canvas.selectedSprinklerHead = null;
            this.canvas.selectedMeasurePoint = measureIndex;
            this.canvas.selectedNode = null;
            this.canvas.render();
            this.updateSelectionProps();
            return;
        }
        
        // Check for tree hit (global trees)
        const treeIndex = this.canvas.hitTestTree(world.x, world.y);
        if (treeIndex >= 0) {
            this.canvas.selectedZone = null;
            this.canvas.selectedTree = treeIndex;
            this.canvas.selectedSprinklerHead = null;
            this.canvas.selectedMeasurePoint = null;
            this.canvas.selectedNode = null;
            this.canvas.render();
            this.updateSelectionProps();
            return;
        }
        
        // Check for zone hit (global terrain)
        const zoneIndex = this.canvas.hitTestZone(world.x, world.y);
        if (zoneIndex >= 0) {
            this.canvas.selectedZone = zoneIndex;
            this.canvas.selectedTree = null;
            this.canvas.selectedSprinklerHead = null;
            this.canvas.selectedMeasurePoint = null;
            this.canvas.selectedNode = null;
            this.canvas.render();
            this.updateSelectionProps();
            return;
        }
        
        // Clear selection
        this.canvas.clearSelection();
        this.canvas.render();
        this.updateSelectionProps();
    }
    
    addDrawingPoint(world) {
        const x = this.snapToGrid(world.x);
        const y = this.snapToGrid(world.y);
        
        if (!this.isDrawing) {
            this.isDrawing = true;
            this.canvas.isDrawing = true;
            this.canvas.currentPoints = [];
        }
        
        this.canvas.currentPoints.push([x, y]);
        this.canvas.render();
    }
    
    startRectDraw(world) {
        this.isDrawing = true;
        this.canvas.isDrawing = true;
        this.dragStart = {
            x: this.snapToGrid(world.x),
            y: this.snapToGrid(world.y)
        };
        this.canvas.currentPoints = [
            [this.dragStart.x, this.dragStart.y],
            [this.dragStart.x, this.dragStart.y]
        ];
        this.canvas.render();
    }
    
    updateRectDraw(world) {
        const x = this.snapToGrid(world.x);
        const y = this.snapToGrid(world.y);
        
        this.canvas.currentPoints = [
            [this.dragStart.x, this.dragStart.y],
            [x, this.dragStart.y],
            [x, y],
            [this.dragStart.x, y]
        ];
        this.canvas.render();
    }
    
    finishRectDraw() {
        if (this.canvas.currentPoints.length < 4) {
            this.cancelDrawing();
            return;
        }
        
        const pts = this.canvas.currentPoints;
        const minX = Math.min(pts[0][0], pts[2][0]);
        const maxX = Math.max(pts[0][0], pts[2][0]);
        const minY = Math.min(pts[0][1], pts[2][1]);
        const maxY = Math.max(pts[0][1], pts[2][1]);
        
        if (maxX - minX < 1 || maxY - minY < 1) {
            this.cancelDrawing();
            return;
        }
        
        const zone = {
            shape: 'rect',
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
        
        // Add to global terrain dictionary
        this.courseData.addTerrain(this.currentTerrain, zone);
        this.cancelDrawing();
        this.canvas.render();
    }
    
    finishDrawing() {
        // Path should never be a polygon - use finishPath instead
        if (this.currentTerrain === 'path' || this.currentTool === 'path') {
            this.finishPath();
            return;
        }
        
        if (this.canvas.currentPoints.length < 3) {
            this.cancelDrawing();
            return;
        }
        
        let points = this.canvas.currentPoints;
        
        // Apply smoothing for non-teeBox terrain
        if (this.smoothingEnabled && this.currentTerrain !== 'teeBox') {
            points = this.smoothPoints(points, this.smoothingAmount);
        }
        
        const zone = {
            shape: 'polygon',
            points: points
        };
        
        // Add to global terrain dictionary
        this.courseData.addTerrain(this.currentTerrain, zone);
        this.cancelDrawing();
        this.canvas.render();
    }
    
    // Path drawing - lines, not polygons
    addPathPoint(world) {
        const x = this.snapToGrid(world.x);
        const y = this.snapToGrid(world.y);
        
        if (!this.isDrawing) {
            this.isDrawing = true;
            this.canvas.isDrawing = true;
            this.canvas.currentPoints = [];
            this.canvas.drawingType = 'path';
        }
        
        this.canvas.currentPoints.push([x, y]);
        this.canvas.render();
    }
    
    finishPath() {
        if (this.canvas.currentPoints.length < 2) {
            this.cancelDrawing();
            return;
        }
        
        let points = this.canvas.currentPoints;
        
        // Apply smoothing if enabled
        if (this.smoothingEnabled && points.length >= 3) {
            points = this.smoothPathPoints(points, this.smoothingAmount);
        }
        
        const zone = {
            shape: 'line',
            points: points,
            width: 3 // default path width in world units
        };
        
        this.courseData.addTerrain('path', zone);
        this.cancelDrawing();
        this.canvas.render();
    }
    
    // Smooth path points (open line, not closed polygon)
    smoothPathPoints(points, iterations) {
        if (points.length < 3) return points;
        
        let result = [...points.map(p => [...p])];
        
        for (let iter = 0; iter < iterations; iter++) {
            const newPoints = [];
            
            // Keep first point fixed
            newPoints.push(result[0]);
            
            for (let i = 0; i < result.length - 1; i++) {
                const curr = result[i];
                const next = result[i + 1];
                
                // Add midpoint between current and next
                newPoints.push([
                    (curr[0] + next[0]) / 2,
                    (curr[1] + next[1]) / 2
                ]);
            }
            
            // Keep last point fixed
            newPoints.push(result[result.length - 1]);
            
            // Smooth interior points by averaging with neighbors
            result = [newPoints[0]]; // Keep first point
            for (let i = 1; i < newPoints.length - 1; i++) {
                const prev = newPoints[i - 1];
                const curr = newPoints[i];
                const next = newPoints[i + 1];
                
                result.push([
                    (prev[0] + curr[0] * 2 + next[0]) / 4,
                    (prev[1] + curr[1] * 2 + next[1]) / 4
                ]);
            }
            result.push(newPoints[newPoints.length - 1]); // Keep last point
        }
        
        // Reduce point count if too many
        if (result.length > 30) {
            const reduced = [result[0]]; // Keep first
            const step = Math.ceil((result.length - 2) / 28);
            for (let i = step; i < result.length - 1; i += step) {
                reduced.push(result[i]);
            }
            reduced.push(result[result.length - 1]); // Keep last
            result = reduced;
        }
        
        return result;
    }
    
    cancelDrawing() {
        this.isDrawing = false;
        this.canvas.isDrawing = false;
        this.canvas.currentPoints = [];
        this.canvas.drawingType = null;
        this.canvas.render();
    }
    
    smoothPoints(points, iterations) {
        if (points.length < 3) return points;
        
        let result = [...points.map(p => [...p])];
        
        for (let iter = 0; iter < iterations; iter++) {
            const newPoints = [];
            
            for (let i = 0; i < result.length; i++) {
                const curr = result[i];
                const next = result[(i + 1) % result.length];
                
                // Add current point
                newPoints.push(curr);
                
                // Add midpoint
                newPoints.push([
                    (curr[0] + next[0]) / 2,
                    (curr[1] + next[1]) / 2
                ]);
            }
            
            // Smooth by averaging with neighbors
            result = [];
            for (let i = 0; i < newPoints.length; i++) {
                const prev = newPoints[(i - 1 + newPoints.length) % newPoints.length];
                const curr = newPoints[i];
                const next = newPoints[(i + 1) % newPoints.length];
                
                result.push([
                    (prev[0] + curr[0] * 2 + next[0]) / 4,
                    (prev[1] + curr[1] * 2 + next[1]) / 4
                ]);
            }
        }
        
        // Reduce point count if too many
        if (result.length > 50) {
            const reduced = [];
            const step = Math.ceil(result.length / 50);
            for (let i = 0; i < result.length; i += step) {
                reduced.push(result[i]);
            }
            result = reduced;
        }
        
        return result;
    }
    
    placeTee(world) {
        const x = this.snapToGrid(world.x);
        const y = this.snapToGrid(world.y);
        this.courseData.setTeePosition(this.canvas.currentHoleIndex, x, y);
        this.canvas.render();
    }
    
    placeHole(world) {
        const x = this.snapToGrid(world.x);
        const y = this.snapToGrid(world.y);
        this.courseData.setHolePosition(this.canvas.currentHoleIndex, x, y);
        this.canvas.render();
    }
    
    placeTree(world) {
        const x = this.snapToGrid(world.x);
        const y = this.snapToGrid(world.y);
        
        const tree = {
            type: this.treeType,
            x: x,
            y: y
        };
        
        // Add to global trees array
        this.courseData.addTree(tree);
        this.canvas.render();
    }
    
    placeSprinklerHead(world) {
        const x = this.snapToGrid(world.x);
        const y = this.snapToGrid(world.y);
        
        const sprinklerHead = {
            x: x,
            y: y
        };
        
        // Add to global sprinkler heads array
        this.courseData.addSprinklerHead(sprinklerHead);
        this.canvas.render();
    }
    
    placeMeasurePoint(world) {
        const x = this.snapToGrid(world.x);
        const y = this.snapToGrid(world.y);
        
        const measurePoint = {
            x: x,
            y: y
        };
        
        // Add to global measure points array
        this.courseData.addMeasurePoint(measurePoint);
        this.canvas.render();
    }
    
    updateSelectionProps() {
        const propsDiv = document.getElementById('selection-props');
        
        if (this.canvas.selectedCentrelinePoint !== null) {
            const hole = this.courseData.getHole(this.canvas.currentHoleIndex);
            const point = hole.centreline[this.canvas.selectedCentrelinePoint];
            const WORLD_TO_YARDS = 4;
            
            // Calculate distance from start
            let distFromStart = 0;
            for (let i = 1; i <= this.canvas.selectedCentrelinePoint; i++) {
                const p1 = hole.centreline[i - 1];
                const p2 = hole.centreline[i];
                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                distFromStart += Math.sqrt(dx * dx + dy * dy);
            }
            
            propsDiv.innerHTML = `
                <div class="prop-row">
                    <span class="prop-label">Type:</span>
                    <span class="prop-value">Centreline Point</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">Point #:</span>
                    <span class="prop-value">${this.canvas.selectedCentrelinePoint + 1} of ${hole.centreline.length}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">X:</span>
                    <span class="prop-value">${point[0].toFixed(1)}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">Y:</span>
                    <span class="prop-value">${point[1].toFixed(1)}</span>
                </div>
                <div class="prop-row">
                    <span class="prop-label">From Tee:</span>
                    <span class="prop-value">${Math.round(distFromStart * WORLD_TO_YARDS)} yards</span>
                </div>
            `;
        } else if (this.canvas.selectedZone !== null) {
            // Get zone from global terrain
            const allTerrain = this.courseData.getAllTerrain();
            const zone = allTerrain[this.canvas.selectedZone];
            
            if (zone) {
                propsDiv.innerHTML = `
                    <div class="prop-row">
                        <span class="prop-label">Type:</span>
                        <span class="prop-value">${zone.terrain}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Shape:</span>
                        <span class="prop-value">${zone.shape}</span>
                    </div>
                    ${zone.shape === 'polygon' ? `
                    <div class="prop-row">
                        <span class="prop-label">Points:</span>
                        <span class="prop-value">${zone.points.length}</span>
                    </div>
                    ` : ''}
                `;
            }
        } else if (this.canvas.selectedTree !== null) {
            const tree = this.courseData.trees[this.canvas.selectedTree];
            
            if (tree) {
                propsDiv.innerHTML = `
                    <div class="prop-row">
                        <span class="prop-label">Type:</span>
                        <span class="prop-value">${tree.type}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">X:</span>
                        <span class="prop-value">${tree.x.toFixed(1)}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Y:</span>
                        <span class="prop-value">${tree.y.toFixed(1)}</span>
                    </div>
                `;
            }
        } else if (this.canvas.selectedSprinklerHead !== null) {
            const sprinkler = this.courseData.sprinklerHeads[this.canvas.selectedSprinklerHead];
            
            if (sprinkler) {
                const WORLD_TO_YARDS = 4;
                propsDiv.innerHTML = `
                    <div class="prop-row">
                        <span class="prop-label">Type:</span>
                        <span class="prop-value">Sprinkler Head</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">X:</span>
                        <span class="prop-value">${sprinkler.x.toFixed(1)}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Y:</span>
                        <span class="prop-value">${sprinkler.y.toFixed(1)}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Position:</span>
                        <span class="prop-value">${Math.round(sprinkler.x * WORLD_TO_YARDS)}y × ${Math.round(sprinkler.y * WORLD_TO_YARDS)}y</span>
                    </div>
                `;
            }
        } else if (this.canvas.selectedMeasurePoint !== null) {
            const measure = this.courseData.measurePoints[this.canvas.selectedMeasurePoint];
            
            if (measure) {
                const WORLD_TO_YARDS = 4;
                propsDiv.innerHTML = `
                    <div class="prop-row">
                        <span class="prop-label">Type:</span>
                        <span class="prop-value">Measure Point</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">X:</span>
                        <span class="prop-value">${measure.x.toFixed(1)}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Y:</span>
                        <span class="prop-value">${measure.y.toFixed(1)}</span>
                    </div>
                    <div class="prop-row">
                        <span class="prop-label">Position:</span>
                        <span class="prop-value">${Math.round(measure.x * WORLD_TO_YARDS)}y × ${Math.round(measure.y * WORLD_TO_YARDS)}y</span>
                    </div>
                `;
            }
        } else {
            propsDiv.innerHTML = '<p class="no-selection">No selection</p>';
        }
    }
    
    applyElevation(world) {
        const brushSize = this.elevationBrushSize;
        const strength = this.elevationStrength;
        
        if (this.currentTool === 'elevation-up') {
            this.courseData.modifyElevation(world.x, world.y, brushSize, strength * 0.5);
        } else if (this.currentTool === 'elevation-down') {
            this.courseData.modifyElevation(world.x, world.y, brushSize, -strength * 0.5);
        } else if (this.currentTool === 'elevation-smooth') {
            this.courseData.smoothElevation(world.x, world.y, brushSize);
        }
        
        this.canvas.render();
    }
    
    // Centreline tool methods
    handleCentrelineClick(screenX, screenY, world) {
        // Check if clicking on an existing point
        const pointIndex = this.canvas.hitTestCentrelinePoint(screenX, screenY);
        
        if (pointIndex >= 0) {
            // Select the point for dragging
            this.canvas.selectedCentrelinePoint = pointIndex;
            this.isDraggingCentrelinePoint = true;
            this.canvas.render();
            this.updateSelectionProps();
        } else {
            // Add a new point to the centreline
            const x = this.snapToGrid(world.x);
            const y = this.snapToGrid(world.y);
            this.courseData.addCentrelinePoint(this.canvas.currentHoleIndex, x, y);
            
            // Select the new point
            const hole = this.courseData.getHole(this.canvas.currentHoleIndex);
            this.canvas.selectedCentrelinePoint = hole.centreline.length - 1;
            this.canvas.render();
            this.updateSelectionProps();
            
            // Update hole length display
            this.updateHoleLength();
        }
    }
    
    deleteCentrelinePoint() {
        if (this.canvas.selectedCentrelinePoint !== null) {
            this.courseData.removeCentrelinePoint(
                this.canvas.currentHoleIndex,
                this.canvas.selectedCentrelinePoint
            );
            this.canvas.selectedCentrelinePoint = null;
            this.canvas.render();
            this.updateSelectionProps();
            
            // Update hole length display
            this.updateHoleLength();
        }
    }
    
    clearCentreline() {
        this.courseData.clearCentreline(this.canvas.currentHoleIndex);
        this.canvas.selectedCentrelinePoint = null;
        this.canvas.render();
        this.updateSelectionProps();
        
        // Update hole length display
        this.updateHoleLength();
    }
    
    updateHoleLength() {
        const hole = this.courseData.getHole(this.canvas.currentHoleIndex);
        if (!hole) return;
        
        const WORLD_TO_YARDS = 4;
        let yards = 0;
        
        if (hole.centreline && hole.centreline.length >= 2) {
            let totalDist = 0;
            for (let i = 1; i < hole.centreline.length; i++) {
                const p1 = hole.centreline[i - 1];
                const p2 = hole.centreline[i];
                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                totalDist += Math.sqrt(dx * dx + dy * dy);
            }
            yards = Math.round(totalDist * WORLD_TO_YARDS);
        } else if (hole.tee && hole.hole) {
            const dx = hole.hole.x - hole.tee.x;
            const dy = hole.hole.y - hole.tee.y;
            yards = Math.round(Math.sqrt(dx * dx + dy * dy) * WORLD_TO_YARDS);
        }
        
        document.getElementById('hole-yards-display').textContent = `${yards} yards`;
    }
}
