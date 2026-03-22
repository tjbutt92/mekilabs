// Editor Canvas - Rendering and interaction
export class EditorCanvas {
    constructor(canvas, container, courseData) {
        this.canvas = canvas;
        this.container = container;
        this.ctx = canvas.getContext('2d');
        this.courseData = courseData;
        
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.currentHoleIndex = 0;
        
        // Selection
        this.selectedZone = null;
        this.selectedTree = null;
        this.selectedSprinklerHead = null;
        this.selectedMeasurePoint = null;
        this.selectedNode = null;
        this.hoveredNode = null;
        this.selectedCentrelinePoint = null;
        this.hoveredCentrelinePoint = null;
        
        // Drawing state
        this.isDrawing = false;
        this.currentPoints = [];
        this.drawingType = null; // 'path' for line drawing, null for polygon
        
        // Layer visibility
        this.layers = {
            grid: true,
            elevation: true,
            terrain: true,
            trees: true,
            markers: true,
            sprinklers: true,
            measurePoints: true,
            centreline: true,
            nodes: true
        };
        
        // Elevation brush preview
        this.elevationBrushPos = null;
        this.elevationBrushSize = 15;
        
        // Terrain colors
        this.terrainColors = {
            teeBox: '#4a7c43',
            fairway: '#3d6b35',
            rough: '#022906',
            green: '#5cb85c',
            bunker: '#e8d4a8',
            water: '#3498db',
            outOfBounds: '#1a1a1a',
            path: '#8b7355'
        };
        
        this.setupCanvas();
        this.setupEvents();
    }
    
    // Helper to apply alpha to hex color
    applyAlpha(hexColor, alpha) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    setupCanvas() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        // Center the view on a good starting position (near origin but offset for typical hole layout)
        // Start at world (50, 0) which gives room for tee on left, hole extending right
        this.panX = this.canvas.width / 2 - (50 * this.zoom * 4);
        this.panY = this.canvas.height / 2;
        
        this.render();
    }
    
    setupEvents() {
        // These will be handled by ToolManager
    }
    
    setZoom(zoom, focusX = null, focusY = null) {
        // If no focus point provided, use center of canvas
        const fx = focusX !== null ? focusX : this.canvas.width / 2;
        const fy = focusY !== null ? focusY : this.canvas.height / 2;
        
        // Get world position at focus point before zoom
        const worldFocus = this.screenToWorld(fx, fy);
        
        // Apply new zoom
        this.zoom = zoom;
        
        // Adjust pan so the same world point stays under the cursor/focus
        this.panX = fx - worldFocus.x * this.zoom * 4;
        this.panY = fy - worldFocus.y * this.zoom * 4;
        
        this.render();
    }
    
    setLayerVisible(layer, visible) {
        this.layers[layer] = visible;
        this.render();
    }
    
    setCurrentHole(index) {
        this.currentHoleIndex = index;
        this.clearSelection();
        this.render();
    }
    
    clearSelection() {
        this.selectedZone = null;
        this.selectedTree = null;
        this.selectedSprinklerHead = null;
        this.selectedMeasurePoint = null;
        this.selectedNode = null;
        this.selectedCentrelinePoint = null;
    }
    
    deleteSelected() {
        if (this.selectedZone !== null) {
            // Delete from global terrain
            const allTerrain = this.courseData.getAllTerrain();
            const zoneInfo = allTerrain[this.selectedZone];
            if (zoneInfo) {
                this.courseData.removeTerrain(zoneInfo.terrain, zoneInfo.index);
            }
            this.selectedZone = null;
        }
        if (this.selectedTree !== null) {
            this.courseData.removeTree(this.selectedTree);
            this.selectedTree = null;
        }
        if (this.selectedSprinklerHead !== null) {
            this.courseData.removeSprinklerHead(this.selectedSprinklerHead);
            this.selectedSprinklerHead = null;
        }
        if (this.selectedMeasurePoint !== null) {
            this.courseData.removeMeasurePoint(this.selectedMeasurePoint);
            this.selectedMeasurePoint = null;
        }
        this.render();
    }
    
    // Convert world coordinates to screen coordinates
    worldToScreen(x, y) {
        return {
            x: this.panX + x * this.zoom * 4, // 4 pixels per world unit at zoom 1
            y: this.panY + y * this.zoom * 4
        };
    }
    
    // Convert screen coordinates to world coordinates
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.panX) / (this.zoom * 4),
            y: (sy - this.panY) / (this.zoom * 4)
        };
    }
    
    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // Clear
        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, w, h);
        
        // Draw elevation heatmap (under grid)
        if (this.layers.elevation) {
            this.drawElevation();
        }
        
        // Draw grid
        if (this.layers.grid) {
            this.drawGrid();
        }
        
        // Draw terrain zones
        if (this.layers.terrain) {
            this.drawTerrain();
        }
        
        // Draw trees
        if (this.layers.trees) {
            this.drawTrees();
        }
        
        // Draw sprinkler heads
        if (this.layers.sprinklers) {
            this.drawSprinklerHeads();
        }
        
        // Draw measure points
        if (this.layers.measurePoints) {
            this.drawMeasurePoints();
        }
        
        // Draw markers (tee, hole)
        if (this.layers.markers) {
            this.drawMarkers();
        }
        
        // Draw centreline
        if (this.layers.centreline) {
            this.drawCentreline();
        }
        
        // Draw nodes for selected zone
        if (this.layers.nodes && this.selectedZone !== null) {
            this.drawNodes();
        }
        
        // Draw current drawing
        if (this.isDrawing && this.currentPoints.length > 0) {
            this.drawCurrentPath();
        }
        
        // Draw elevation brush preview
        if (this.elevationBrushPos) {
            this.drawElevationBrush();
        }
    }
    
    drawElevation() {
        const ctx = this.ctx;
        const grid = this.courseData.elevationGrid;
        if (!grid) return;
        
        const cellSize = grid.cellSize;
        
        // Find elevation range for color mapping
        let minElev = Infinity, maxElev = -Infinity;
        for (let y = 0; y < grid.rows; y++) {
            for (let x = 0; x < grid.cols; x++) {
                const e = grid.data[y][x];
                minElev = Math.min(minElev, e);
                maxElev = Math.max(maxElev, e);
            }
        }
        
        // If flat, don't draw
        if (maxElev - minElev < 0.5) return;
        
        const range = maxElev - minElev;
        
        // Draw each cell
        for (let gy = 0; gy < grid.rows - 1; gy++) {
            for (let gx = 0; gx < grid.cols - 1; gx++) {
                const worldX = this.courseData.bounds.minX + gx * cellSize;
                const worldY = this.courseData.bounds.minY + gy * cellSize;
                
                const elev = grid.data[gy][gx];
                const normalized = (elev - minElev) / range;
                
                // Color: blue (low) -> green (mid) -> brown (high)
                let r, g, b;
                if (normalized < 0.5) {
                    // Blue to green
                    const t = normalized * 2;
                    r = Math.round(30 * (1 - t) + 45 * t);
                    g = Math.round(80 * (1 - t) + 90 * t);
                    b = Math.round(120 * (1 - t) + 45 * t);
                } else {
                    // Green to brown
                    const t = (normalized - 0.5) * 2;
                    r = Math.round(45 * (1 - t) + 100 * t);
                    g = Math.round(90 * (1 - t) + 70 * t);
                    b = Math.round(45 * (1 - t) + 40 * t);
                }
                
                const tl = this.worldToScreen(worldX, worldY);
                const br = this.worldToScreen(worldX + cellSize, worldY + cellSize);
                
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
                ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
            }
        }
    }
    
    drawElevationBrush() {
        const ctx = this.ctx;
        const screen = this.worldToScreen(this.elevationBrushPos.x, this.elevationBrushPos.y);
        const radiusPixels = this.elevationBrushSize * this.zoom * 4;
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radiusPixels, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Show elevation at cursor
        const elev = this.courseData.getElevationAt(this.elevationBrushPos.x, this.elevationBrushPos.y);
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${elev.toFixed(1)} ft`, screen.x, screen.y - radiusPixels - 10);
    }
    
    drawGrid() {
        const ctx = this.ctx;
        const WORLD_TO_YARDS = 4; // 1 world unit = 4 yards
        
        // Grid sizes in world units
        const minorGridSize = 10;  // 40 yards
        const majorGridSize = 25;  // 100 yards
        
        // Calculate visible range
        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(this.canvas.width, this.canvas.height);
        
        const startX = Math.floor(topLeft.x / minorGridSize) * minorGridSize;
        const endX = Math.ceil(bottomRight.x / minorGridSize) * minorGridSize;
        const startY = Math.floor(topLeft.y / minorGridSize) * minorGridSize;
        const endY = Math.ceil(bottomRight.y / minorGridSize) * minorGridSize;
        
        // Minor grid lines (40 yard intervals)
        ctx.strokeStyle = '#1a1a3a';
        ctx.lineWidth = 1;
        
        for (let x = startX; x <= endX; x += minorGridSize) {
            const screen = this.worldToScreen(x, 0);
            ctx.beginPath();
            ctx.moveTo(screen.x, 0);
            ctx.lineTo(screen.x, this.canvas.height);
            ctx.stroke();
        }
        
        for (let y = startY; y <= endY; y += minorGridSize) {
            const screen = this.worldToScreen(0, y);
            ctx.beginPath();
            ctx.moveTo(0, screen.y);
            ctx.lineTo(this.canvas.width, screen.y);
            ctx.stroke();
        }
        
        // Major grid lines (100 yard intervals)
        ctx.strokeStyle = '#2a2a4a';
        ctx.lineWidth = 1;
        
        const majorStartX = Math.floor(topLeft.x / majorGridSize) * majorGridSize;
        const majorEndX = Math.ceil(bottomRight.x / majorGridSize) * majorGridSize;
        const majorStartY = Math.floor(topLeft.y / majorGridSize) * majorGridSize;
        const majorEndY = Math.ceil(bottomRight.y / majorGridSize) * majorGridSize;
        
        for (let x = majorStartX; x <= majorEndX; x += majorGridSize) {
            const screen = this.worldToScreen(x, 0);
            ctx.beginPath();
            ctx.moveTo(screen.x, 0);
            ctx.lineTo(screen.x, this.canvas.height);
            ctx.stroke();
        }
        
        for (let y = majorStartY; y <= majorEndY; y += majorGridSize) {
            const screen = this.worldToScreen(0, y);
            ctx.beginPath();
            ctx.moveTo(0, screen.y);
            ctx.lineTo(this.canvas.width, screen.y);
            ctx.stroke();
        }
        
        // Draw origin axes
        ctx.strokeStyle = '#4a4a6a';
        ctx.lineWidth = 2;
        
        const origin = this.worldToScreen(0, 0);
        ctx.beginPath();
        ctx.moveTo(origin.x, 0);
        ctx.lineTo(origin.x, this.canvas.height);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, origin.y);
        ctx.lineTo(this.canvas.width, origin.y);
        ctx.stroke();
        
        // Draw yardage labels on major grid lines
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        // X-axis labels (along top)
        for (let x = majorStartX; x <= majorEndX; x += majorGridSize) {
            const screen = this.worldToScreen(x, 0);
            const yards = x * WORLD_TO_YARDS;
            const label = yards === 0 ? '0' : `${yards}y`;
            ctx.fillText(label, screen.x, 5);
        }
        
        // Y-axis labels (along left side)
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        for (let y = majorStartY; y <= majorEndY; y += majorGridSize) {
            const screen = this.worldToScreen(0, y);
            const yards = y * WORLD_TO_YARDS;
            const label = yards === 0 ? '0' : `${yards}y`;
            ctx.fillText(label, 5, screen.y);
        }
        
        // Draw scale indicator in bottom-right corner
        this.drawScaleIndicator();
    }
    
    drawScaleIndicator() {
        const ctx = this.ctx;
        const WORLD_TO_YARDS = 4;
        
        // 50 yard scale bar
        const scaleYards = 50;
        const scaleWorld = scaleYards / WORLD_TO_YARDS;
        const scalePixels = scaleWorld * this.zoom * 4;
        
        const x = this.canvas.width - 20 - scalePixels;
        const y = this.canvas.height - 30;
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x - 10, y - 5, scalePixels + 20, 25);
        
        // Scale bar
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + 5);
        ctx.lineTo(x + scalePixels, y + 5);
        ctx.stroke();
        
        // End caps
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 10);
        ctx.moveTo(x + scalePixels, y);
        ctx.lineTo(x + scalePixels, y + 10);
        ctx.stroke();
        
        // Label
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${scaleYards} yards`, x + scalePixels / 2, y + 10);
    }
    
    drawTerrain() {
        const ctx = this.ctx;
        
        // Draw all global terrain zones
        const allTerrain = this.courseData.getAllTerrain();
        
        allTerrain.forEach((zone, index) => {
            const isSelected = this.selectedZone === index;
            this.drawZone(zone, isSelected, 1.0);
        });
    }
    
    drawZone(zone, isSelected, alpha = 1.0) {
        const ctx = this.ctx;
        const baseColor = this.terrainColors[zone.terrain] || '#888';
        
        // Apply alpha to color
        const color = alpha < 1 ? this.applyAlpha(baseColor, alpha) : baseColor;
        
        ctx.fillStyle = color;
        ctx.strokeStyle = isSelected ? '#fff' : `rgba(255,255,255,${0.3 * alpha})`;
        ctx.lineWidth = isSelected ? 2 : 1;
        
        if (zone.shape === 'rect') {
            const tl = this.worldToScreen(zone.x, zone.y);
            const br = this.worldToScreen(zone.x + zone.width, zone.y + zone.height);
            ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
            ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        } else if (zone.shape === 'line' && zone.points && zone.points.length >= 2) {
            // Draw path as a thick line
            const pathWidth = (zone.width || 3) * this.zoom * 4;
            ctx.lineWidth = pathWidth;
            ctx.strokeStyle = color;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            const first = this.worldToScreen(zone.points[0][0], zone.points[0][1]);
            ctx.moveTo(first.x, first.y);
            
            for (let i = 1; i < zone.points.length; i++) {
                const pt = this.worldToScreen(zone.points[i][0], zone.points[i][1]);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            
            // Draw selection outline
            if (isSelected) {
                ctx.lineWidth = pathWidth + 4;
                ctx.strokeStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(first.x, first.y);
                for (let i = 1; i < zone.points.length; i++) {
                    const pt = this.worldToScreen(zone.points[i][0], zone.points[i][1]);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
                
                // Redraw path on top
                ctx.lineWidth = pathWidth;
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(first.x, first.y);
                for (let i = 1; i < zone.points.length; i++) {
                    const pt = this.worldToScreen(zone.points[i][0], zone.points[i][1]);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
            }
        } else if (zone.shape === 'polygon' && zone.points && zone.points.length > 2) {
            ctx.beginPath();
            const first = this.worldToScreen(zone.points[0][0], zone.points[0][1]);
            ctx.moveTo(first.x, first.y);
            
            for (let i = 1; i < zone.points.length; i++) {
                const pt = this.worldToScreen(zone.points[i][0], zone.points[i][1]);
                ctx.lineTo(pt.x, pt.y);
            }
            
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (zone.shape === 'ellipse') {
            const center = this.worldToScreen(zone.cx, zone.cy);
            const rx = zone.rx * this.zoom * 4;
            const ry = zone.ry * this.zoom * 4;
            
            ctx.beginPath();
            ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }
    
    drawNodes() {
        const ctx = this.ctx;
        if (this.selectedZone === null) return;
        
        // Get zone from global terrain
        const allTerrain = this.courseData.getAllTerrain();
        const zone = allTerrain[this.selectedZone];
        if (!zone || !zone.points) return;
        if (zone.shape !== 'polygon' && zone.shape !== 'line') return;
        
        zone.points.forEach((pt, index) => {
            const screen = this.worldToScreen(pt[0], pt[1]);
            const isHovered = this.hoveredNode === index;
            const isSelected = this.selectedNode === index;
            
            ctx.fillStyle = isSelected ? '#ff0' : (isHovered ? '#fff' : '#5cb85c');
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, isHovered ? 8 : 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Node index label
            ctx.fillStyle = '#fff';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(index.toString(), screen.x, screen.y - 12);
        });
    }
    
    drawTrees() {
        const ctx = this.ctx;
        
        // Draw all global trees
        this.courseData.trees.forEach((tree, index) => {
            const screen = this.worldToScreen(tree.x, tree.y);
            const isSelected = this.selectedTree === index;
            
            // Draw tree icon
            ctx.fillStyle = tree.type.includes('PINE') 
                ? 'rgba(26, 77, 26, 1)' 
                : 'rgba(45, 90, 39, 1)';
            ctx.strokeStyle = isSelected ? '#fff' : 'transparent';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Tree type indicator
            ctx.fillStyle = '#fff';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🌲', screen.x, screen.y + 3);
        });
    }
    
    drawMarkers() {
        const ctx = this.ctx;
        
        // Only draw markers for the current hole
        const hole = this.courseData.getHole(this.currentHoleIndex);
        if (!hole) return;
        
        // Draw tee marker
        if (hole.tee) {
            const screen = this.worldToScreen(hole.tee.x, hole.tee.y);
            ctx.fillStyle = '#4a7c43';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            
            ctx.beginPath();
            ctx.rect(screen.x - 8, screen.y - 4, 16, 8);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(hole.number.toString(), screen.x, screen.y + 3);
        }
        
        // Draw hole/flag marker
        if (hole.hole) {
            const screen = this.worldToScreen(hole.hole.x, hole.hole.y);
            
            // Flag pole
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(screen.x, screen.y);
            ctx.lineTo(screen.x, screen.y - 20);
            ctx.stroke();
            
            // Flag
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.moveTo(screen.x, screen.y - 20);
            ctx.lineTo(screen.x + 12, screen.y - 15);
            ctx.lineTo(screen.x, screen.y - 10);
            ctx.closePath();
            ctx.fill();
            
            // Hole number on flag
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(hole.number.toString(), screen.x + 2, screen.y - 13);
            
            // Hole circle
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawCentreline() {
        const ctx = this.ctx;
        
        // Only draw centreline for the current hole
        const hole = this.courseData.getHole(this.currentHoleIndex);
        if (!hole || !hole.centreline || hole.centreline.length < 2) return;
        
        const points = hole.centreline;
        
        // Draw the centreline path
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        
        ctx.beginPath();
        const first = this.worldToScreen(points[0][0], points[0][1]);
        ctx.moveTo(first.x, first.y);
        
        for (let i = 1; i < points.length; i++) {
            const pt = this.worldToScreen(points[i][0], points[i][1]);
            ctx.lineTo(pt.x, pt.y);
        }
        
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw direction arrows along the path
        this.drawCentrelineArrows(points, 1.0);
        
        // Draw control points
        points.forEach((pt, index) => {
            const screen = this.worldToScreen(pt[0], pt[1]);
            const isHovered = this.hoveredCentrelinePoint === index;
            const isSelected = this.selectedCentrelinePoint === index;
            
            // Outer ring
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, isHovered ? 10 : 8, 0, Math.PI * 2);
            ctx.stroke();
            
            // Inner fill
            ctx.fillStyle = isSelected ? '#ff6600' : (isHovered ? '#ffee00' : '#ffcc00');
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, isHovered ? 6 : 5, 0, Math.PI * 2);
            ctx.fill();
            
            // Point number label
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText((index + 1).toString(), screen.x, screen.y - 14);
        });
        
        // Draw yardage markers along centreline
        this.drawCentrelineYardages(points);
    }
    
    drawCentrelineArrows(points, alpha = 1.0) {
        const ctx = this.ctx;
        
        // Draw arrows at intervals along the path
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            // Midpoint
            const midX = (p1[0] + p2[0]) / 2;
            const midY = (p1[1] + p2[1]) / 2;
            const midScreen = this.worldToScreen(midX, midY);
            
            // Direction angle
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const angle = Math.atan2(dy, dx);
            
            // Draw arrow
            ctx.save();
            ctx.translate(midScreen.x, midScreen.y);
            ctx.rotate(angle);
            
            ctx.fillStyle = `rgba(255, 204, 0, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(-4, -5);
            ctx.lineTo(-4, 5);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
    }
    
    drawCentrelineYardages(points) {
        const ctx = this.ctx;
        const WORLD_TO_YARDS = 4;
        
        // Calculate cumulative distance from tee
        let totalDist = 0;
        
        for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const segmentDist = Math.sqrt(dx * dx + dy * dy);
            totalDist += segmentDist;
            
            // Show yardage at each point (except first)
            const screen = this.worldToScreen(p2[0], p2[1]);
            const yards = Math.round(totalDist * WORLD_TO_YARDS);
            
            // Background for readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            const text = `${yards}y`;
            const textWidth = ctx.measureText(text).width;
            ctx.fillRect(screen.x - textWidth / 2 - 3, screen.y + 12, textWidth + 6, 14);
            
            // Yardage text
            ctx.fillStyle = '#ffcc00';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(text, screen.x, screen.y + 23);
        }
    }
    
    // Hit test for centreline points
    hitTestCentrelinePoint(screenX, screenY) {
        const hole = this.courseData.getHole(this.currentHoleIndex);
        if (!hole || !hole.centreline) return -1;
        
        for (let i = 0; i < hole.centreline.length; i++) {
            const screen = this.worldToScreen(hole.centreline[i][0], hole.centreline[i][1]);
            const dx = screenX - screen.x;
            const dy = screenY - screen.y;
            if (dx * dx + dy * dy < 144) { // 12px radius
                return i;
            }
        }
        return -1;
    }
    
    drawCurrentPath() {
        const ctx = this.ctx;
        
        if (this.currentPoints.length < 1) return;
        
        // Different style for path (line) vs polygon drawing
        if (this.drawingType === 'path') {
            // Draw as thick line preview
            ctx.strokeStyle = this.terrainColors.path;
            ctx.lineWidth = 12;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.setLineDash([]);
            
            ctx.beginPath();
            const first = this.worldToScreen(this.currentPoints[0][0], this.currentPoints[0][1]);
            ctx.moveTo(first.x, first.y);
            
            for (let i = 1; i < this.currentPoints.length; i++) {
                const pt = this.worldToScreen(this.currentPoints[i][0], this.currentPoints[i][1]);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
        } else {
            // Polygon preview
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            
            ctx.beginPath();
            const first = this.worldToScreen(this.currentPoints[0][0], this.currentPoints[0][1]);
            ctx.moveTo(first.x, first.y);
            
            for (let i = 1; i < this.currentPoints.length; i++) {
                const pt = this.worldToScreen(this.currentPoints[i][0], this.currentPoints[i][1]);
                ctx.lineTo(pt.x, pt.y);
            }
            
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Draw nodes
        this.currentPoints.forEach((pt, index) => {
            const screen = this.worldToScreen(pt[0], pt[1]);
            ctx.fillStyle = this.drawingType === 'path' ? '#8b7355' : '#5cb85c';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    }
    
    // Hit testing
    hitTestZone(worldX, worldY) {
        // Test global terrain in reverse order (top zones first)
        const allTerrain = this.courseData.getAllTerrain();
        
        for (let i = allTerrain.length - 1; i >= 0; i--) {
            const zone = allTerrain[i];
            if (this.pointInZone(worldX, worldY, zone)) {
                return i;
            }
        }
        return -1;
    }
    
    hitTestNode(screenX, screenY) {
        if (this.selectedZone === null) return -1;
        
        const allTerrain = this.courseData.getAllTerrain();
        const zone = allTerrain[this.selectedZone];
        if (!zone || !zone.points) return -1;
        if (zone.shape !== 'polygon' && zone.shape !== 'line') return -1;
        
        for (let i = 0; i < zone.points.length; i++) {
            const screen = this.worldToScreen(zone.points[i][0], zone.points[i][1]);
            const dx = screenX - screen.x;
            const dy = screenY - screen.y;
            if (dx * dx + dy * dy < 100) { // 10px radius
                return i;
            }
        }
        return -1;
    }
    
    hitTestTree(worldX, worldY) {
        // Test global trees
        for (let i = this.courseData.trees.length - 1; i >= 0; i--) {
            const tree = this.courseData.trees[i];
            const dx = worldX - tree.x;
            const dy = worldY - tree.y;
            if (dx * dx + dy * dy < 4) { // 2 world unit radius
                return i;
            }
        }
        return -1;
    }
    
    pointInZone(x, y, zone) {
        if (zone.shape === 'rect') {
            return x >= zone.x && x <= zone.x + zone.width &&
                   y >= zone.y && y <= zone.y + zone.height;
        } else if (zone.shape === 'ellipse') {
            const dx = (x - zone.cx) / zone.rx;
            const dy = (y - zone.cy) / zone.ry;
            return dx * dx + dy * dy <= 1;
        } else if (zone.shape === 'line') {
            return this.pointNearLine(x, y, zone.points, zone.width || 3);
        } else if (zone.shape === 'polygon') {
            return this.pointInPolygon(x, y, zone.points);
        }
        return false;
    }
    
    pointNearLine(x, y, points, width) {
        const threshold = width + 2; // Add some tolerance
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const dist = this.pointToSegmentDistance(x, y, p1[0], p1[1], p2[0], p2[1]);
            if (dist <= threshold) return true;
        }
        return false;
    }
    
    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        
        if (lengthSq === 0) {
            // Segment is a point
            return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        }
        
        // Project point onto line segment
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        
        const nearestX = x1 + t * dx;
        const nearestY = y1 + t * dy;
        
        return Math.sqrt((px - nearestX) * (px - nearestX) + (py - nearestY) * (py - nearestY));
    }
    
    pointInPolygon(x, y, points) {
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
    
    drawSprinklerHeads() {
        const ctx = this.ctx;
        
        // Draw all global sprinkler heads
        this.courseData.sprinklerHeads.forEach((sprinkler, index) => {
            const screen = this.worldToScreen(sprinkler.x, sprinkler.y);
            const isSelected = this.selectedSprinklerHead === index;
            
            // Draw sprinkler head as a black filled circle with white outline
            const radius = isSelected ? 8 : 6;
            
            // Outer ring (selection indicator)
            if (isSelected) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(screen.x, screen.y, radius + 2, 0, Math.PI * 2);
                ctx.stroke();
            }
            
            // Main circle - black fill
            ctx.fillStyle = '#111';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Inner dot for visibility
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    hitTestSprinklerHead(worldX, worldY) {
        // Test global sprinkler heads
        for (let i = this.courseData.sprinklerHeads.length - 1; i >= 0; i--) {
            const sprinkler = this.courseData.sprinklerHeads[i];
            const dx = worldX - sprinkler.x;
            const dy = worldY - sprinkler.y;
            if (dx * dx + dy * dy < 4) { // 2 world unit radius
                return i;
            }
        }
        return -1;
    }
    
    drawMeasurePoints() {
        const ctx = this.ctx;
        
        // Draw all global measure points
        this.courseData.measurePoints.forEach((measure, index) => {
            const screen = this.worldToScreen(measure.x, measure.y);
            const isSelected = this.selectedMeasurePoint === index;
            
            // Draw measure point as a diamond shape
            const size = isSelected ? 8 : 6;
            
            // Outer ring (selection indicator)
            if (isSelected) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(screen.x, screen.y - size - 3);
                ctx.lineTo(screen.x + size + 3, screen.y);
                ctx.lineTo(screen.x, screen.y + size + 3);
                ctx.lineTo(screen.x - size - 3, screen.y);
                ctx.closePath();
                ctx.stroke();
            }
            
            // Main diamond - orange fill
            ctx.fillStyle = '#ff8c00';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(screen.x, screen.y - size);
            ctx.lineTo(screen.x + size, screen.y);
            ctx.lineTo(screen.x, screen.y + size);
            ctx.lineTo(screen.x - size, screen.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Inner dot for visibility
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    hitTestMeasurePoint(worldX, worldY) {
        // Test global measure points
        for (let i = this.courseData.measurePoints.length - 1; i >= 0; i--) {
            const measure = this.courseData.measurePoints[i];
            const dx = worldX - measure.x;
            const dy = worldY - measure.y;
            if (dx * dx + dy * dy < 4) { // 2 world unit radius
                return i;
            }
        }
        return -1;
    }
}
