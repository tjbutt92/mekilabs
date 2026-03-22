// World Creation System
// Builds 3D world from course data: elevation grid, terrain features, trees, and hole setup

import * as THREE from 'three';
import { TerrainType, terrainProperties, setCourse, getElevationAt, findGreenFront } from './terrain.js';
import { TreeType, treeProperties, createTree3D } from './trees.js';
import { 
    isPointInPolygon, 
    distanceToSegment, 
    distanceToPolygon, 
    smoothstep,
    yardsToWorld,
    findCircleCentrelineIntersection,
    findPointAtYardageFromRef
} from './utils.js';
import { TERRAIN_COLORS, SKY, CONVERSION } from './constants.js';
import { getWindForVisuals } from './wind.js';

// Use WORLD_SCALE from CONVERSION for backward compatibility
const WORLD_SCALE = CONVERSION.WORLD_SCALE;

export class World {
    constructor(scene) {
        this.scene = scene;
        this.course = null;
        this.currentHole = null;
        this.terrainMesh = null;
        this.terrainOverlays = [];
        this.trees = [];
        this.holeMarker = null;
        this.teeMarker = null;
        
        // Sky elements
        this.sunMesh = null;
        this.sunGlow = null;
        this.clouds = [];
        this.sunPosition = new THREE.Vector3();
    }

    // Load a course and build the world
    loadCourse(course) {
        this.course = course;
        setCourse(course);
        this.clear();
        this.waterBodies = []; // Reset water bodies
        this.calculateSunPosition(); // Calculate sun position first for shadows
        this.buildSky();       // Add sun and clouds
        this.buildTerrain();   // Terrain texture includes tree shadows
        this.buildWaterPlanes(); // Add flat water surfaces
        this.buildTrees();
        this.buildSprinklerHeads(); // Add sprinkler head markers
    }

    // Set the active hole (tee and hole positions)
    setHole(holeNumber) {
        const hole = this.course.holes.find(h => h.number === holeNumber);
        if (!hole) {
            console.warn(`Hole ${holeNumber} not found`);
            return null;
        }
        this.currentHole = hole;
        this.updateHoleMarkers();
        return hole;
    }

    // Clear all world objects
    clear() {
        if (this.terrainMesh) {
            this.scene.remove(this.terrainMesh);
            this.terrainMesh.geometry.dispose();
            this.terrainMesh.material.dispose();
            this.terrainMesh = null;
        }

        this.terrainOverlays.forEach(overlay => {
            this.scene.remove(overlay);
            overlay.geometry.dispose();
            overlay.material.dispose();
        });
        this.terrainOverlays = [];

        this.trees.forEach(tree => {
            this.scene.remove(tree.group);
        });
        this.trees = [];
        
        // Clear sprinkler heads
        if (this.sprinklerHeadMarkers) {
            this.sprinklerHeadMarkers.forEach(marker => {
                this.scene.remove(marker);
                marker.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            });
        }
        this.sprinklerHeadMarkers = [];
        
        // Clear sky elements
        if (this.sunMesh) {
            this.scene.remove(this.sunMesh);
            this.sunMesh.geometry.dispose();
            this.sunMesh.material.dispose();
            this.sunMesh = null;
        }
        if (this.sunGlow) {
            this.scene.remove(this.sunGlow);
            this.sunGlow.geometry.dispose();
            this.sunGlow.material.dispose();
            this.sunGlow = null;
        }
        this.clouds.forEach(cloud => {
            this.scene.remove(cloud.group);
            cloud.group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        });
        this.clouds = [];

        if (this.holeMarker) {
            this.scene.remove(this.holeMarker);
            this.holeMarker = null;
        }
        if (this.teeMarker) {
            this.scene.remove(this.teeMarker);
            this.teeMarker = null;
        }
    }


    // Build the base terrain mesh with a generated texture for terrain colors
    buildTerrain() {
        if (!this.course || !this.course.elevationGrid) return;

        const grid = this.course.elevationGrid;
        const bounds = this.course.bounds;
        
        // Modify elevation for bunkers and water
        this.modifyTerrainForFeatures(grid, bounds);
        
        // Create terrain color texture with slope shading
        const textureSize = 4096; // Higher resolution for crisp terrain boundaries
        const texture = this.createTerrainTexture(textureSize, bounds);
        
        // Create geometry from elevation grid
        const geometry = new THREE.PlaneGeometry(
            (bounds.maxX - bounds.minX) * WORLD_SCALE,
            (bounds.maxY - bounds.minY) * WORLD_SCALE,
            grid.cols - 1,
            grid.rows - 1
        );

        // Apply elevation to vertices
        const positions = geometry.attributes.position.array;
        for (let row = 0; row < grid.rows; row++) {
            for (let col = 0; col < grid.cols; col++) {
                const idx = (row * grid.cols + col) * 3;
                const elevation = grid.data[row][col];
                positions[idx + 2] = elevation * 0.33;
            }
        }
        geometry.computeVertexNormals();

        // Use MeshStandardMaterial for better lighting response
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0.0
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.rotation.x = -Math.PI / 2;
        this.terrainMesh.receiveShadow = true;

        // Center the terrain
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        this.terrainMesh.position.set(
            (centerX - 50) * WORLD_SCALE,
            0,
            (centerY - 50) * WORLD_SCALE
        );

        this.scene.add(this.terrainMesh);
    }

    // Build sky with sun and clouds
    buildSky() {
        // Sun position already calculated in calculateSunPosition()
        
        // Create sun disc (low-poly for pixelated look)
        const sunGeometry = new THREE.CircleGeometry(SKY.SUN_SIZE, 8);
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: SKY.SUN_COLOR,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0
        });
        this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
        this.sunMesh.position.copy(this.sunPosition);
        this.sunMesh.lookAt(0, 0, 0);
        this.scene.add(this.sunMesh);
        
        // Create sun glow (low-poly)
        const glowGeometry = new THREE.CircleGeometry(SKY.SUN_SIZE * 2.5, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xfffacd,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });
        this.sunGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.sunGlow.position.copy(this.sunPosition);
        this.sunGlow.lookAt(0, 0, 0);
        this.scene.add(this.sunGlow);
        
        // Create clouds
        this.createClouds();
    }
    
    // Calculate sun position (called before terrain for shadow baking)
    calculateSunPosition() {
        // Convert degrees to radians
        const elevationRad = (SKY.SUN_ELEVATION * Math.PI) / 180;
        const azimuthRad = (SKY.SUN_AZIMUTH * Math.PI) / 180;
        
        // Calculate sun position
        // At 90° elevation, sun is directly overhead (Y = distance, X = Z = 0)
        // At 0° elevation, sun is on horizon
        this.sunPosition.set(
            Math.cos(azimuthRad) * Math.cos(elevationRad) * SKY.SUN_DISTANCE,
            Math.sin(elevationRad) * SKY.SUN_DISTANCE,
            Math.sin(azimuthRad) * Math.cos(elevationRad) * SKY.SUN_DISTANCE
        );
        
        // Store shadow length multiplier based on sun elevation
        // tan(elevation) gives the ratio: higher sun = shorter shadows
        // At 60°, shadows are ~0.58x tree height
        // At 30°, shadows are ~1.73x tree height
        // At 45°, shadows are 1x tree height
        this.shadowLengthMultiplier = 1 / Math.tan(elevationRad);
    }
    
    // Create fluffy cloud groups
    createClouds() {
        for (let i = 0; i < SKY.CLOUD_COUNT; i++) {
            const cloud = this.createCloudGroup();
            
            // Random position in sky
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * SKY.CLOUD_SPREAD;
            const height = SKY.CLOUD_MIN_HEIGHT + Math.random() * (SKY.CLOUD_MAX_HEIGHT - SKY.CLOUD_MIN_HEIGHT);
            
            cloud.group.position.set(
                Math.cos(angle) * distance,
                height,
                Math.sin(angle) * distance
            );
            
            // Random rotation
            cloud.group.rotation.y = Math.random() * Math.PI * 2;
            
            // Random scale
            const scale = 0.5 + Math.random() * 1.0;
            cloud.group.scale.set(scale, scale * 0.6, scale);
            
            this.clouds.push(cloud);
            this.scene.add(cloud.group);
        }
    }
    
    // Create a single cloud group made of multiple low-poly shapes
    createCloudGroup() {
        const group = new THREE.Group();
        
        const cloudMaterial = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            flatShading: true
        });
        
        // Create cloud puffs (low-poly for pixelated look)
        const puffCount = 5 + Math.floor(Math.random() * 5);
        for (let i = 0; i < puffCount; i++) {
            const size = 20 + Math.random() * 40;
            // Use icosahedron with 0 subdivisions for chunky look
            const puffGeometry = new THREE.IcosahedronGeometry(size, 0);
            const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
            
            // Position puffs to form cloud shape
            puff.position.set(
                (Math.random() - 0.5) * 80,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 40
            );
            
            // Flatten slightly
            puff.scale.y = 0.6 + Math.random() * 0.3;
            
            group.add(puff);
        }
        
        return {
            group,
            speed: 0.3 + Math.random() * 0.4,
            drift: (Math.random() - 0.5) * 0.1
        };
    }

    // Create a texture with terrain colors and crisp boundaries
    createTerrainTexture(size, bounds) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        // Fill with rough color as base - darker green
        ctx.fillStyle = '#1a3d18';
        ctx.fillRect(0, 0, size, size);
        
        // Draw terrain features in order (back to front)
        const terrain = this.course.terrain;
        
        // Helper to convert world coords to canvas coords
        const toCanvas = (worldX, worldY) => {
            const x = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * size;
            const y = ((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * size;
            return { x, y };
        };
        
        // Scale factor for world to canvas
        const worldWidth = bounds.maxX - bounds.minX;
        const scale = size / worldWidth;
        
        // Draw polygon on canvas
        const drawPolygon = (points, color) => {
            if (!points || points.length < 3) return;
            ctx.fillStyle = color;
            ctx.beginPath();
            const start = toCanvas(points[0][0], points[0][1]);
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < points.length; i++) {
                const p = toCanvas(points[i][0], points[i][1]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fill();
        };
        
        // Draw polygon outline for crisp edge
        const drawPolygonOutline = (points, outlineColor, lineWidth) => {
            if (!points || points.length < 3) return;
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = lineWidth * scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const start = toCanvas(points[0][0], points[0][1]);
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < points.length; i++) {
                const p = toCanvas(points[i][0], points[i][1]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.stroke();
        };
        
        // Draw rectangle on canvas
        const drawRect = (zone, color) => {
            ctx.fillStyle = color;
            const tl = toCanvas(zone.x, zone.y);
            const br = toCanvas(zone.x + zone.width, zone.y + zone.height);
            ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        };
        
        // Draw line/path on canvas
        const drawLine = (points, color, width) => {
            if (!points || points.length < 2) return;
            ctx.strokeStyle = color;
            ctx.lineWidth = (width || 3) * scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            const start = toCanvas(points[0][0], points[0][1]);
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < points.length; i++) {
                const p = toCanvas(points[i][0], points[i][1]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        };
        
        // Draw any shape
        const drawShape = (zone, color) => {
            if (zone.shape === 'polygon') {
                drawPolygon(zone.points, color);
            } else if (zone.shape === 'rect') {
                drawRect(zone, color);
            } else if (zone.shape === 'line') {
                drawLine(zone.points, color, zone.width);
            }
        };
        
        // Draw shape outline
        const drawShapeOutline = (zone, outlineColor, lineWidth) => {
            if (zone.shape === 'polygon') {
                drawPolygonOutline(zone.points, outlineColor, lineWidth);
            }
        };
        
        // Draw in render order - skip water since it's a separate flat plane
        if (terrain.outOfBounds) {
            terrain.outOfBounds.forEach(f => drawShape(f, '#1a1a1a'));
        }
        if (terrain.fairway) {
            terrain.fairway.forEach(f => drawShape(f, '#4a8c40'));
            // Add crisp edge outline (darker green)
            terrain.fairway.forEach(f => drawShapeOutline(f, '#2a4d26', 0.4));
        }
        
        // Add mowing stripes to fairway (before bunkers so they don't affect sand)
        this.addMowingStripes(ctx, size, bounds, terrain.fairway);
        
        // Draw bunkers after stripes to ensure clean sand
        if (terrain.bunker) {
            terrain.bunker.forEach(f => drawShape(f, '#f5e6c8'));
            // Add crisp edge outline (darker sand/brown)
            terrain.bunker.forEach(f => drawShapeOutline(f, '#8b7355', 0.3));
        }
        // Water is rendered as separate flat plane, but draw dark color for underwater terrain
        if (terrain.water) {
            terrain.water.forEach(f => drawShape(f, '#1a3d4d'));
        }
        if (terrain.green) {
            terrain.green.forEach(f => drawShape(f, '#6dd66d'));
            // Add crisp edge outline (slightly darker)
            terrain.green.forEach(f => drawShapeOutline(f, '#4a9a4a', 0.3));
        }
        if (terrain.teeBox) {
            terrain.teeBox.forEach(f => drawShape(f, '#5a9c50'));
            terrain.teeBox.forEach(f => drawShapeOutline(f, '#3a6233', 0.3));
        }
        if (terrain.path) {
            terrain.path.forEach(f => drawShape(f, '#8b7355'));
        }
        
        // Apply slope shading overlay
        this.applySlopeShading(ctx, size, bounds);
        
        // Bake tree shadows into texture
        this.bakeTreeShadows(ctx, size, bounds);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        // Use nearest filtering for crisp terrain boundaries
        texture.minFilter = THREE.NearestMipmapLinearFilter;
        texture.magFilter = THREE.NearestFilter;
        texture.anisotropy = 16; // Sharper at angles
        
        return texture;
    }
    
    // Bake tree shadows onto the terrain texture
    bakeTreeShadows(ctx, size, bounds) {
        if (!this.course.trees || this.course.trees.length === 0) return;
        
        // Get sun direction for shadow projection (horizontal direction only)
        const azimuthRad = (SKY.SUN_AZIMUTH * Math.PI) / 180;
        
        // Shadow direction is opposite to sun's horizontal direction
        // shadowLengthMultiplier already accounts for sun elevation
        const shadowDirX = -Math.cos(azimuthRad) * this.shadowLengthMultiplier;
        const shadowDirZ = -Math.sin(azimuthRad) * this.shadowLengthMultiplier;
        
        // Helper to convert world coords to canvas coords
        const toCanvas = (worldX, worldY) => {
            const x = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * size;
            const y = ((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * size;
            return { x, y };
        };
        
        // Scale factor for world to canvas
        const worldWidth = bounds.maxX - bounds.minX;
        const scale = size / worldWidth;
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        
        this.course.trees.forEach(tree => {
            const props = treeProperties[tree.type];
            if (!props) return;
            
            const treeX = tree.x;
            const treeY = tree.y;
            const height = tree.height || (props.height.min + props.height.max) / 2;
            const canopyRadius = tree.canopyRadius || (props.canopyRadius.min + props.canopyRadius.max) / 2;
            const trunkRatio = props.trunkRatio;
            const category = props.category;
            
            // Draw shadow shape based on tree type
            ctx.beginPath();
            
            if (category === 'tall_pine' || category === 'short_pine') {
                // Pine shadow: trunk line + foliage clusters at top
                this.drawPineShadow(ctx, toCanvas, treeX, treeY, height, canopyRadius, trunkRatio, shadowDirX, shadowDirZ, scale);
            } else {
                // Deciduous shadow: broad canopy shape
                this.drawDeciduousShadow(ctx, toCanvas, treeX, treeY, height, canopyRadius, trunkRatio, shadowDirX, shadowDirZ, scale);
            }
        });
        
        ctx.restore();
    }
    
    // Draw pine tree shadow (trunk + sparse foliage clusters)
    drawPineShadow(ctx, toCanvas, treeX, treeY, height, canopyRadius, trunkRatio, shadowDirX, shadowDirZ, scale) {
        const trunkHeight = height * trunkRatio;
        const crownHeight = height - trunkHeight;
        
        // Trunk shadow (thin rectangle)
        const trunkWidth = 0.4;
        const trunkBasePos = toCanvas(treeX, treeY);
        const trunkTopShadowX = treeX + trunkHeight * shadowDirX;
        const trunkTopShadowY = treeY + trunkHeight * shadowDirZ;
        const trunkTopPos = toCanvas(trunkTopShadowX, trunkTopShadowY);
        
        // Draw trunk as thin quad
        const perpX = -shadowDirZ;
        const perpY = shadowDirX;
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
        const normPerpX = (perpX / perpLen) * trunkWidth * 0.5;
        const normPerpY = (perpY / perpLen) * trunkWidth * 0.5;
        
        ctx.beginPath();
        const tb1 = toCanvas(treeX - normPerpX, treeY - normPerpY);
        const tb2 = toCanvas(treeX + normPerpX, treeY + normPerpY);
        const tt1 = toCanvas(trunkTopShadowX - normPerpX * 0.5, trunkTopShadowY - normPerpY * 0.5);
        const tt2 = toCanvas(trunkTopShadowX + normPerpX * 0.5, trunkTopShadowY + normPerpY * 0.5);
        ctx.moveTo(tb1.x, tb1.y);
        ctx.lineTo(tb2.x, tb2.y);
        ctx.lineTo(tt2.x, tt2.y);
        ctx.lineTo(tt1.x, tt1.y);
        ctx.closePath();
        ctx.fill();
        
        // Foliage cluster shadows at various heights
        const clusterCount = 5;
        for (let i = 0; i < clusterCount; i++) {
            const t = 0.2 + (i / clusterCount) * 0.8; // 20% to 100% up the crown
            const clusterHeight = trunkHeight + t * crownHeight;
            const clusterRadius = canopyRadius * (0.4 + Math.random() * 0.4);
            
            // Random offset from trunk
            const angle = (i / clusterCount) * Math.PI * 2 + i * 1.3;
            const offsetDist = canopyRadius * 0.6;
            const clusterWorldX = treeX + Math.cos(angle) * offsetDist;
            const clusterWorldY = treeY + Math.sin(angle) * offsetDist;
            
            // Project to shadow position
            const shadowX = clusterWorldX + clusterHeight * shadowDirX;
            const shadowY = clusterWorldY + clusterHeight * shadowDirZ;
            const shadowPos = toCanvas(shadowX, shadowY);
            
            // Draw elliptical shadow for cluster
            ctx.beginPath();
            ctx.ellipse(
                shadowPos.x, 
                shadowPos.y, 
                clusterRadius * scale * 1.2, 
                clusterRadius * scale * 0.8, 
                Math.atan2(shadowDirZ, shadowDirX), 
                0, 
                Math.PI * 2
            );
            ctx.fill();
        }
        
        // Top tuft shadow
        const topShadowX = treeX + height * shadowDirX;
        const topShadowY = treeY + height * shadowDirZ;
        const topPos = toCanvas(topShadowX, topShadowY);
        ctx.beginPath();
        ctx.ellipse(
            topPos.x, 
            topPos.y, 
            canopyRadius * scale * 0.8, 
            canopyRadius * scale * 0.5, 
            Math.atan2(shadowDirZ, shadowDirX), 
            0, 
            Math.PI * 2
        );
        ctx.fill();
    }
    
    // Draw deciduous tree shadow (broad canopy)
    drawDeciduousShadow(ctx, toCanvas, treeX, treeY, height, canopyRadius, trunkRatio, shadowDirX, shadowDirZ, scale) {
        const trunkHeight = height * trunkRatio;
        
        // Trunk shadow
        const trunkWidth = 0.5;
        const trunkTopShadowX = treeX + trunkHeight * shadowDirX;
        const trunkTopShadowY = treeY + trunkHeight * shadowDirZ;
        
        const perpX = -shadowDirZ;
        const perpY = shadowDirX;
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
        const normPerpX = (perpX / perpLen) * trunkWidth * 0.5;
        const normPerpY = (perpY / perpLen) * trunkWidth * 0.5;
        
        ctx.beginPath();
        const tb1 = toCanvas(treeX - normPerpX, treeY - normPerpY);
        const tb2 = toCanvas(treeX + normPerpX, treeY + normPerpY);
        const tt1 = toCanvas(trunkTopShadowX - normPerpX * 0.6, trunkTopShadowY - normPerpY * 0.6);
        const tt2 = toCanvas(trunkTopShadowX + normPerpX * 0.6, trunkTopShadowY + normPerpY * 0.6);
        ctx.moveTo(tb1.x, tb1.y);
        ctx.lineTo(tb2.x, tb2.y);
        ctx.lineTo(tt2.x, tt2.y);
        ctx.lineTo(tt1.x, tt1.y);
        ctx.closePath();
        ctx.fill();
        
        // Main canopy shadow - large irregular shape
        const canopyHeight = trunkHeight + (height - trunkHeight) * 0.5; // Center of canopy
        const canopyShadowX = treeX + canopyHeight * shadowDirX;
        const canopyShadowY = treeY + canopyHeight * shadowDirZ;
        
        // Draw main canopy as overlapping ellipses for organic shape
        const lobeCount = 4;
        for (let i = 0; i < lobeCount; i++) {
            const angle = (i / lobeCount) * Math.PI * 2;
            const lobeOffsetX = Math.cos(angle) * canopyRadius * 0.5;
            const lobeOffsetY = Math.sin(angle) * canopyRadius * 0.5;
            const lobeHeight = canopyHeight + (Math.random() - 0.5) * canopyRadius;
            
            const lobeShadowX = treeX + lobeOffsetX + lobeHeight * shadowDirX;
            const lobeShadowY = treeY + lobeOffsetY + lobeHeight * shadowDirZ;
            const lobePos = toCanvas(lobeShadowX, lobeShadowY);
            
            ctx.beginPath();
            ctx.ellipse(
                lobePos.x, 
                lobePos.y, 
                canopyRadius * scale * (0.6 + Math.random() * 0.3), 
                canopyRadius * scale * (0.4 + Math.random() * 0.2), 
                Math.atan2(shadowDirZ, shadowDirX) + (Math.random() - 0.5) * 0.3, 
                0, 
                Math.PI * 2
            );
            ctx.fill();
        }
        
        // Central shadow blob
        const centerPos = toCanvas(canopyShadowX, canopyShadowY);
        ctx.beginPath();
        ctx.ellipse(
            centerPos.x, 
            centerPos.y, 
            canopyRadius * scale * 1.0, 
            canopyRadius * scale * 0.7, 
            Math.atan2(shadowDirZ, shadowDirX), 
            0, 
            Math.PI * 2
        );
        ctx.fill();
    }
    
    // Apply slope-based shading to the terrain texture
    applySlopeShading(ctx, size, bounds) {
        const grid = this.course.elevationGrid;
        if (!grid) return;
        
        // Create an overlay for slope shading
        const imageData = ctx.getImageData(0, 0, size, size);
        const data = imageData.data;
        
        // Sun direction for lighting (normalized, pointing toward sun)
        const sunDir = { x: 0.5, y: 0.7, z: 0.5 };
        const sunLen = Math.sqrt(sunDir.x * sunDir.x + sunDir.y * sunDir.y + sunDir.z * sunDir.z);
        sunDir.x /= sunLen;
        sunDir.y /= sunLen;
        sunDir.z /= sunLen;
        
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        
        // Pre-calculate grid sampling parameters
        const gridScaleX = (grid.cols - 1) / worldWidth;
        const gridScaleY = (grid.rows - 1) / worldHeight;
        const pixelToWorldX = worldWidth / size;
        const pixelToWorldY = worldHeight / size;
        const delta = 0.5; // Sample distance in world units
        
        // Pre-generate noise array for performance (seeded random)
        const noiseSize = 256;
        const noise = new Float32Array(noiseSize * noiseSize);
        for (let i = 0; i < noise.length; i++) {
            noise[i] = 0.9 + Math.random() * 0.2;
        }
        
        // Get green zones for enhanced slope shading
        const greenZones = this.course.terrain?.green || [];
        
        // Apply shading to every pixel using bilinear interpolation (faster than bicubic)
        for (let py = 0; py < size; py++) {
            const worldY = bounds.minY + py * pixelToWorldY;
            const rowOffset = py * size * 4;
            
            for (let px = 0; px < size; px++) {
                const worldX = bounds.minX + px * pixelToWorldX;
                
                // Calculate normal using fast bilinear elevation sampling
                const normal = this.calculateTerrainNormalFast(grid, bounds, worldX, worldY, delta, gridScaleX, gridScaleY);
                
                // Calculate lighting (dot product with sun direction)
                const dot = normal.x * sunDir.x + normal.y * sunDir.y + normal.z * sunDir.z;
                
                // Check if this pixel is on a green - apply much stronger slope shading
                const onGreen = this.isPointOnGreen(worldX, worldY, greenZones);
                
                // Map dot product to brightness adjustment
                // Greens get 4x stronger slope effect for better readability
                // Normal terrain: 0.5 + dot * 0.3 (range 0.2 to 0.8)
                // Greens: 0.5 + dot * 1.2 (range -0.7 to 1.7, clamped)
                let brightness;
                if (onGreen) {
                    // Much stronger contrast on greens to show slopes clearly
                    brightness = 0.5 + dot * 1.2;
                    // Clamp to reasonable range but allow more extreme values
                    brightness = Math.max(0.15, Math.min(1.4, brightness));
                } else {
                    brightness = 0.5 + dot * 0.3;
                }
                
                // Use pre-generated noise (tiled) - less noise on greens for cleaner look
                const noiseIdx = ((py & (noiseSize - 1)) * noiseSize + (px & (noiseSize - 1)));
                const noiseValue = onGreen ? (0.95 + (noise[noiseIdx] - 0.9) * 0.5) : noise[noiseIdx];
                const finalBrightness = brightness * noiseValue;
                
                const idx = rowOffset + px * 4;
                data[idx] = Math.min(255, Math.max(0, data[idx] * finalBrightness)) | 0;
                data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] * finalBrightness)) | 0;
                data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] * finalBrightness)) | 0;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    // Add mowing stripes to fairway for visual depth cues
    addMowingStripes(ctx, size, bounds, fairwayZones) {
        if (!fairwayZones || fairwayZones.length === 0) return;
        
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        
        // Helper to convert world coords to canvas coords
        const toCanvas = (worldX, worldY) => {
            const x = ((worldX - bounds.minX) / worldWidth) * size;
            const y = ((worldY - bounds.minY) / worldHeight) * size;
            return { x, y };
        };
        
        // Stripe width in world units (about 3 yards = narrower mower stripes)
        const stripeWidth = 3;
        const stripeWidthCanvas = (stripeWidth / worldWidth) * size;
        
        // Use hole direction for stripe orientation (tee to hole)
        const hole = this.currentHole;
        let stripeAngle = 0;
        if (hole && hole.tee && hole.hole) {
            stripeAngle = Math.atan2(hole.hole.x - hole.tee.x, hole.hole.y - hole.tee.y);
        }
        
        ctx.save();
        
        // Create clipping path from all fairway zones
        ctx.beginPath();
        for (const zone of fairwayZones) {
            if (zone.shape === 'polygon' && zone.points && zone.points.length >= 3) {
                const start = toCanvas(zone.points[0][0], zone.points[0][1]);
                ctx.moveTo(start.x, start.y);
                for (let i = 1; i < zone.points.length; i++) {
                    const p = toCanvas(zone.points[i][0], zone.points[i][1]);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.closePath();
            }
        }
        ctx.clip();
        
        // Draw alternating stripes across the entire canvas (clipped to fairway)
        ctx.globalCompositeOperation = 'multiply';
        
        // Rotate around canvas center
        const centerX = size / 2;
        const centerY = size / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(-stripeAngle);
        ctx.translate(-centerX, -centerY);
        
        // Draw stripes covering the rotated area (need extra coverage for rotation)
        const diagonal = Math.sqrt(2) * size;
        const numStripes = Math.ceil(diagonal / stripeWidthCanvas) + 2;
        const startOffset = -diagonal / 2;
        
        for (let i = 0; i < numStripes; i++) {
            if (i % 2 === 0) {
                // Lighter stripe
                ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
            } else {
                // Darker stripe
                ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
            }
            const x = startOffset + i * stripeWidthCanvas;
            ctx.fillRect(x, -diagonal / 2, stripeWidthCanvas, diagonal * 2);
        }
        
        ctx.restore();
    }
    
    // Check if a point is on any green zone
    isPointOnGreen(x, y, greenZones) {
        for (const zone of greenZones) {
            if (zone.shape === 'polygon' && zone.points) {
                if (isPointInPolygon(x, y, zone.points)) return true;
            } else if (zone.shape === 'ellipse') {
                const dx = (x - zone.cx) / zone.rx;
                const dy = (y - zone.cy) / zone.ry;
                if (dx * dx + dy * dy <= 1) return true;
            } else if (zone.shape === 'rect') {
                if (x >= zone.x && x <= zone.x + zone.width &&
                    y >= zone.y && y <= zone.y + zone.height) return true;
            }
        }
        return false;
    }
    
    // Fast terrain normal calculation using bilinear interpolation
    calculateTerrainNormalFast(grid, bounds, worldX, worldY, delta, gridScaleX, gridScaleY) {
        // Get elevations using fast bilinear interpolation
        const elevRight = this.getElevationBilinear(grid, bounds, worldX + delta, worldY);
        const elevLeft = this.getElevationBilinear(grid, bounds, worldX - delta, worldY);
        const elevUp = this.getElevationBilinear(grid, bounds, worldX, worldY + delta);
        const elevDown = this.getElevationBilinear(grid, bounds, worldX, worldY - delta);
        
        // Calculate gradient
        const dzdx = (elevRight - elevLeft) / (2 * delta);
        const dzdy = (elevUp - elevDown) / (2 * delta);
        
        // Normal from gradient: (-dz/dx, 1, -dz/dy) normalized
        const nx = -dzdx;
        const ny = 1;
        const nz = -dzdy;
        
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        return {
            x: nx / len,
            y: ny / len,
            z: nz / len
        };
    }
    
    // Fast bilinear interpolation for elevation sampling
    getElevationBilinear(grid, bounds, worldX, worldY) {
        // Convert world to grid coordinates
        const gx = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * (grid.cols - 1);
        const gy = ((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * (grid.rows - 1);
        
        const xi = Math.floor(gx);
        const yi = Math.floor(gy);
        const xf = gx - xi;
        const yf = gy - yi;
        
        // Clamp indices
        const x0 = Math.max(0, Math.min(grid.cols - 1, xi));
        const x1 = Math.max(0, Math.min(grid.cols - 1, xi + 1));
        const y0 = Math.max(0, Math.min(grid.rows - 1, yi));
        const y1 = Math.max(0, Math.min(grid.rows - 1, yi + 1));
        
        // Bilinear interpolation (4 lookups instead of 16)
        const v00 = grid.data[y0][x0];
        const v10 = grid.data[y0][x1];
        const v01 = grid.data[y1][x0];
        const v11 = grid.data[y1][x1];
        
        const v0 = v00 + (v10 - v00) * xf;
        const v1 = v01 + (v11 - v01) * xf;
        
        return v0 + (v1 - v0) * yf;
    }
    
    // Calculate terrain normal at a world position (used by other code)
    calculateTerrainNormal(worldX, worldY, bounds) {
        const grid = this.course.elevationGrid;
        return this.calculateTerrainNormalFast(grid, bounds, worldX, worldY, 0.5, 
            (grid.cols - 1) / (bounds.maxX - bounds.minX),
            (grid.rows - 1) / (bounds.maxY - bounds.minY));
    }

    // No longer needed - terrain colors are in texture now
    drapeTerrainFeatures() {
    }

    // Modify elevation grid for bunkers (depress) and water (carve out basin)
    modifyTerrainForFeatures(grid, bounds) {
        const terrain = this.course.terrain;
        if (!terrain) return;

        // Process water - carve terrain below water level, we'll add flat water plane separately
        if (terrain.water) {
            terrain.water.forEach(feature => {
                if (feature.shape === 'polygon' && feature.points) {
                    this.carveWaterBasin(grid, bounds, feature.points);
                }
            });
        }

        // Process bunkers - create realistic depressions with flat floor and steep walls
        if (terrain.bunker) {
            terrain.bunker.forEach((feature) => {
                if (feature.shape === 'polygon' && feature.points) {
                    // depth in elevation units: 5 = typical bunker, 8 = deep pot bunker
                    this.depressBunker(grid, bounds, feature.points, feature.depth || 5);
                }
            });
        }
    }

    // Carve terrain below water level - water plane added separately
    carveWaterBasin(grid, bounds, points) {
        // Find lowest elevation along the polygon edge - this is water level
        let waterLevel = Infinity;
        for (const p of points) {
            const elev = this.getGridElevation(grid, bounds, p[0], p[1]);
            if (elev < waterLevel) waterLevel = elev;
        }

        // Store water level for creating flat plane later
        if (!this.waterBodies) this.waterBodies = [];
        this.waterBodies.push({ points, waterLevel });

        // Find bounding box of polygon to limit iteration
        let polyMinX = Infinity, polyMaxX = -Infinity;
        let polyMinY = Infinity, polyMaxY = -Infinity;
        for (const p of points) {
            polyMinX = Math.min(polyMinX, p[0]);
            polyMaxX = Math.max(polyMaxX, p[0]);
            polyMinY = Math.min(polyMinY, p[1]);
            polyMaxY = Math.max(polyMaxY, p[1]);
        }
        
        // Add transition distance to bounding box
        const transitionDist = 5;
        polyMinX -= transitionDist;
        polyMaxX += transitionDist;
        polyMinY -= transitionDist;
        polyMaxY += transitionDist;
        
        // Convert to grid indices
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        const startCol = Math.max(0, Math.floor((polyMinX - bounds.minX) / worldWidth * (grid.cols - 1)));
        const endCol = Math.min(grid.cols - 1, Math.ceil((polyMaxX - bounds.minX) / worldWidth * (grid.cols - 1)));
        const startRow = Math.max(0, Math.floor((polyMinY - bounds.minY) / worldHeight * (grid.rows - 1)));
        const endRow = Math.min(grid.rows - 1, Math.ceil((polyMaxY - bounds.minY) / worldHeight * (grid.rows - 1)));

        // Carve terrain inside water to be below water surface
        const waterDepth = 2; // How deep below surface
        
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const worldX = bounds.minX + (col / (grid.cols - 1)) * worldWidth;
                const worldY = bounds.minY + (row / (grid.rows - 1)) * worldHeight;
                
                if (isPointInPolygon(worldX, worldY, points)) {
                    // Set terrain below water level
                    grid.data[row][col] = waterLevel - waterDepth;
                } else {
                    // Check for transition zone
                    const dist = distanceToPolygon(worldX, worldY, points);
                    if (dist < transitionDist) {
                        const currentElev = grid.data[row][col];
                        if (currentElev > waterLevel) {
                            const t = dist / transitionDist;
                            grid.data[row][col] = waterLevel + (currentElev - waterLevel) * smoothstep(t);
                        }
                    }
                }
            }
        }
    }

    // Create flat water planes after terrain is built
    buildWaterPlanes() {
        if (!this.waterBodies) return;

        for (const water of this.waterBodies) {
            this.createWaterPlane(water.points, water.waterLevel);
        }
    }

    // Create a flat water plane for a water body
    createWaterPlane(points, waterLevel) {
        // Create shape from points
        const shape = new THREE.Shape();
        const firstPt = points[0];
        shape.moveTo((firstPt[0] - 50) * WORLD_SCALE, (firstPt[1] - 50) * WORLD_SCALE);
        
        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            shape.lineTo((p[0] - 50) * WORLD_SCALE, (p[1] - 50) * WORLD_SCALE);
        }
        shape.closePath();

        const geometry = new THREE.ShapeGeometry(shape);
        
        // Use Phong material for specular highlights on water
        const material = new THREE.MeshPhongMaterial({
            color: 0x2980b9,        // Deeper, more vibrant blue
            specular: 0x88ccff,     // Light blue specular highlight
            shininess: 100,         // Very shiny surface
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = waterLevel * 0.33; // Same scale as terrain elevation
        
        this.scene.add(mesh);
        this.terrainOverlays.push(mesh);
    }

    // Create realistic bunker depression with flat floor, steep flash face, and raised lip
    // Models real golf bunker characteristics:
    // - Flat sandy floor (not a smooth bowl)
    // - Steep "flash" face toward green (60-80 degrees)
    // - Gentler entry slope from fairway side
    // - Raised lip around edges (especially on green side)
    depressBunker(grid, bounds, points, depth) {
        // Deep bunkers for dramatic effect
        // Default depth of 15 units creates a very pronounced depression
        const bunkerDepth = depth || 15;
        
        // Find centroid and bounding box of bunker
        let cx = 0, cy = 0;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (const p of points) {
            cx += p[0];
            cy += p[1];
            minX = Math.min(minX, p[0]);
            maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]);
            maxY = Math.max(maxY, p[1]);
        }
        cx /= points.length;
        cy /= points.length;
        
        const radiusX = (maxX - minX) / 2;
        const radiusY = (maxY - minY) / 2;
        const avgRadius = (radiusX + radiusY) / 2;
        
        // Get tee and green positions for flash face orientation
        let teePos = { x: 0, y: 0 };
        let greenPos = { x: 0, y: 0 };
        
        if (this.course && this.course.holes && this.course.holes.length > 0) {
            const hole = this.course.holes[0];
            if (hole.tee) teePos = hole.tee;
            if (hole.hole) greenPos = hole.hole;
        }
        
        // Calculate distances from bunker to tee and green
        const distToTee = Math.sqrt((cx - teePos.x) ** 2 + (cy - teePos.y) ** 2);
        const distToGreen = Math.sqrt((cx - greenPos.x) ** 2 + (cy - greenPos.y) ** 2);
        const isGreensideBunker = distToGreen < distToTee;
        
        // Determine flash face direction based on bunker location:
        // - Fairway bunkers (closer to tee): flash face points TOWARD green (away from tee)
        // - Greenside bunkers (closer to green): flash face points TOWARD green
        // Both cases: flash face direction is toward green
        let flashDirX = greenPos.x - cx;
        let flashDirY = greenPos.y - cy;
        const flashDirMag = Math.sqrt(flashDirX ** 2 + flashDirY ** 2) || 1;
        flashDirX /= flashDirMag;
        flashDirY /= flashDirMag;

        // Convert bounding box to grid indices with generous padding
        const worldWidth = bounds.maxX - bounds.minX;
        const worldHeight = bounds.maxY - bounds.minY;
        const cellWidth = worldWidth / (grid.cols - 1);
        const cellHeight = worldHeight / (grid.rows - 1);
        
        // Expand bounds by lip extent plus one cell for safety
        const lipExtent = avgRadius * 0.5;
        const padding = Math.max(lipExtent, cellWidth, cellHeight);
        
        const startCol = Math.max(0, Math.floor((minX - padding - bounds.minX) / worldWidth * (grid.cols - 1)));
        const endCol = Math.min(grid.cols - 1, Math.ceil((maxX + padding - bounds.minX) / worldWidth * (grid.cols - 1)));
        const startRow = Math.max(0, Math.floor((minY - padding - bounds.minY) / worldHeight * (grid.rows - 1)));
        const endRow = Math.min(grid.rows - 1, Math.ceil((maxY + padding - bounds.minY) / worldHeight * (grid.rows - 1)));

        // Bunker profile parameters
        const floorRadius = 0.45;      // Inner 45% is flat floor
        const transitionStart = 0.45;  // Wall transition starts here
        const transitionEnd = 1.0;     // Wall ends at bunker edge
        const lipHeight = bunkerDepth * 0.5; // Lip is 50% of depth for visibility
        const lipWidth = 0.35;         // Lip extends 35% beyond edge

        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const worldX = bounds.minX + (col / (grid.cols - 1)) * worldWidth;
                const worldY = bounds.minY + (row / (grid.rows - 1)) * worldHeight;
                
                // Calculate signed distance to bunker (negative = inside, positive = outside)
                const distToBunker = distanceToPolygon(worldX, worldY, points);
                const insideBunker = isPointInPolygon(worldX, worldY, points);
                const signedDist = insideBunker ? -distToBunker : distToBunker;
                
                // Calculate normalized distance from center (for shape profile)
                const dx = (worldX - cx) / radiusX;
                const dy = (worldY - cy) / radiusY;
                const distFromCenter = Math.sqrt(dx * dx + dy * dy);
                
                // Calculate direction from center for asymmetry
                const offsetX = worldX - cx;
                const offsetY = worldY - cy;
                const offsetMag = Math.sqrt(offsetX ** 2 + offsetY ** 2) || 1;
                
                // Dot product with flash face direction
                // Positive = toward flash face (steep side)
                // Negative = toward entry side (gentle slope)
                const towardFlashFace = (offsetX * flashDirX + offsetY * flashDirY) / offsetMag;
                
                // Use a blend zone at the bunker edge for smoother transitions
                const edgeBlendWidth = Math.max(cellWidth, cellHeight) * 0.5;
                
                if (signedDist < edgeBlendWidth) {
                    // Inside bunker or in edge blend zone
                    let elevationChange = 0;
                    
                    // Calculate blend factor (1 = fully inside, 0 = at edge of blend zone)
                    const blendFactor = signedDist < 0 ? 1.0 : 1.0 - (signedDist / edgeBlendWidth);
                    
                    if (distFromCenter <= floorRadius) {
                        // Flat floor zone - full depth with slight variation for realism
                        const floorVariation = 0.03 * Math.sin(worldX * 2) * Math.cos(worldY * 2);
                        elevationChange = -bunkerDepth * (1 + floorVariation);
                    } else if (distFromCenter < transitionEnd) {
                        // Wall transition zone with strong asymmetry
                        const wallProgress = (distFromCenter - transitionStart) / (transitionEnd - transitionStart);
                        const clampedProgress = Math.max(0, Math.min(1, wallProgress));
                        
                        // Very asymmetric wall steepness:
                        // - Flash face: extremely steep (power 0.15 = nearly vertical)
                        // - Entry side: gentle slope (power 2.0 = gradual ramp)
                        const flashFaceSteepness = 0.15;  // Lower = steeper (nearly vertical)
                        const entrySteepness = 2.5;       // Higher = gentler slope
                        
                        // Interpolate steepness based on direction toward flash face
                        let steepnessFactor;
                        if (towardFlashFace > 0) {
                            // On flash face side - interpolate toward steep
                            steepnessFactor = 1 - towardFlashFace * (1 - flashFaceSteepness);
                        } else {
                            // On entry side - interpolate toward gentle
                            steepnessFactor = 1 + (-towardFlashFace) * (entrySteepness - 1);
                        }
                        
                        const wallCurve = Math.pow(clampedProgress, steepnessFactor);
                        elevationChange = -bunkerDepth * (1 - wallCurve);
                    } else {
                        // Beyond transition but in blend zone - apply partial depth
                        elevationChange = -bunkerDepth * 0.1;
                    }
                    
                    grid.data[row][col] += elevationChange * blendFactor;
                    
                } else if (signedDist < avgRadius * lipWidth) {
                    // Lip zone - raised edge outside bunker
                    const lipProgress = signedDist / (avgRadius * lipWidth);
                    const clampedLipProgress = Math.max(0, Math.min(1, lipProgress));
                    
                    // Lip is much more pronounced on flash face side
                    const lipMultiplier = towardFlashFace > 0 
                        ? 1 + towardFlashFace * 1.0  // Up to 2x on flash face
                        : Math.max(0.3, 1 + towardFlashFace * 0.7); // Down to 0.3x on entry
                    
                    // Smooth lip profile (rises then falls)
                    const lipProfile = Math.sin((1 - clampedLipProgress) * Math.PI);
                    const lipElevation = lipHeight * lipProfile * lipMultiplier;
                    
                    grid.data[row][col] += lipElevation;
                }
            }
        }
    }

    // Get elevation from grid at world position
    getGridElevation(grid, bounds, worldX, worldY) {
        const col = ((worldX - bounds.minX) / (bounds.maxX - bounds.minX)) * (grid.cols - 1);
        const row = ((worldY - bounds.minY) / (bounds.maxY - bounds.minY)) * (grid.rows - 1);
        
        const c = Math.floor(Math.max(0, Math.min(grid.cols - 1, col)));
        const r = Math.floor(Math.max(0, Math.min(grid.rows - 1, row)));
        
        return grid.data[r][c];
    }

    // Build trees from course data
    buildTrees() {
        if (!this.course || !this.course.trees) return;

        this.course.trees.forEach(treeData => {
            const tree = createTree3D(treeData, this.course, this.scene);
            if (tree) {
                this.trees.push(tree);
            }
        });
    }
    
    // Build sprinkler head markers from course data
    // These are black circles on the ground that caddies use for yardage reference
    buildSprinklerHeads() {
        if (!this.course || !this.course.sprinklerHeads) return;
        
        this.sprinklerHeadMarkers = [];
        
        this.course.sprinklerHeads.forEach(sprinklerData => {
            const marker = this.createSprinklerHeadMarker(sprinklerData.x, sprinklerData.y);
            if (marker) {
                this.sprinklerHeadMarkers.push(marker);
            }
        });
    }
    
    // Create a sprinkler head marker at position (low-poly for pixelated look)
    // Rendered as a black circle on the ground, visible above terrain
    createSprinklerHeadMarker(worldX, worldY) {
        const group = new THREE.Group();
        
        const elevation = getElevationAt(this.course, worldX, worldY);
        const x = (worldX - 50) * WORLD_SCALE;
        const z = (worldY - 50) * WORLD_SCALE;
        const y = elevation * 0.33 + 0.05; // Slightly above terrain to be visible
        
        // Create a flat black disc for the sprinkler head (low-poly)
        // Make it fairly large (about 1 yard diameter) so caddies can see it
        const radius = 0.5; // 0.5 yards radius = 1 yard diameter
        
        // Main disc - black with slight gray center (low-poly)
        const discGeom = new THREE.CircleGeometry(radius, 6);
        const discMat = new THREE.MeshBasicMaterial({ 
            color: 0x111111,
            side: THREE.DoubleSide,
            depthWrite: true
        });
        const disc = new THREE.Mesh(discGeom, discMat);
        disc.rotation.x = -Math.PI / 2; // Lay flat on ground
        group.add(disc);
        
        // Inner ring for visibility (low-poly)
        const innerRingGeom = new THREE.RingGeometry(radius * 0.3, radius * 0.5, 6);
        const innerRingMat = new THREE.MeshBasicMaterial({ 
            color: 0x333333,
            side: THREE.DoubleSide
        });
        const innerRing = new THREE.Mesh(innerRingGeom, innerRingMat);
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.position.y = 0.01; // Slightly above main disc
        group.add(innerRing);
        
        // Center dot (low-poly)
        const centerGeom = new THREE.CircleGeometry(radius * 0.15, 4);
        const centerMat = new THREE.MeshBasicMaterial({ 
            color: 0x444444,
            side: THREE.DoubleSide
        });
        const center = new THREE.Mesh(centerGeom, centerMat);
        center.rotation.x = -Math.PI / 2;
        center.position.y = 0.02; // Above inner ring
        group.add(center);
        
        group.position.set(x, y, z);
        group.renderOrder = 1; // Render above terrain
        this.scene.add(group);
        
        return group;
    }

    // Update hole and tee markers for current hole
    updateHoleMarkers() {
        // Remove existing markers
        if (this.holeMarker) {
            this.scene.remove(this.holeMarker);
        }
        if (this.teeMarker) {
            this.scene.remove(this.teeMarker);
        }
        // Remove existing yardage markers
        if (this.yardageMarkers) {
            this.yardageMarkers.forEach(marker => {
                this.scene.remove(marker);
            });
        }
        this.yardageMarkers = [];

        if (!this.currentHole) return;

        // Create hole marker (flag)
        this.holeMarker = this.createFlagMarker(
            this.currentHole.hole.x,
            this.currentHole.hole.y,
            0xff0000
        );

        // Create tee marker
        if (this.currentHole.tee) {
            this.teeMarker = this.createTeeMarker(
                this.currentHole.tee.x,
                this.currentHole.tee.y
            );
        }
        
        // Create yardage markers (100, 150, 200 yards from green)
        this.createYardageMarkers();
    }
    
    // Create yardage markers at 100, 150, 200 yards from the green along centreline
    createYardageMarkers() {
        if (!this.currentHole || !this.currentHole.centreline) return;
        
        const centreline = this.currentHole.centreline;
        const greenFront = this.findGreenFrontPosition();
        if (!greenFront) return;
        
        const yardages = [100, 150, 200];
        const colors = [0xff0000, 0xffffff, 0x0066ff]; // Red, White, Blue
        
        yardages.forEach((yards, index) => {
            // Find where the circle at this yardage intersects the centreline
            const radiusWorld = yardsToWorld(yards);
            const markerPos = findCircleCentrelineIntersection(centreline, greenFront, radiusWorld);
            if (markerPos) {
                const marker = this.createYardageMarker(markerPos.x, markerPos.y, yards, colors[index]);
                if (marker) {
                    this.yardageMarkers.push(marker);
                }
            }
        });
    }
    
    // Find the front of green position (uses shared utility from terrain.js)
    findGreenFrontPosition() {
        if (!this.currentHole) return null;
        return findGreenFront(this.currentHole);
    }
    
    // Find a point along the centreline at a specific yardage from the green
    // Uses shared utility from utils.js
    findPointAtYardageFromGreen(centreline, greenFront, yards) {
        return findPointAtYardageFromRef(centreline, greenFront, yards);
    }
    
    // Create a yardage marker post at position (low-poly for pixelated look)
    createYardageMarker(worldX, worldY, yards, color) {
        const group = new THREE.Group();
        
        const elevation = getElevationAt(this.course, worldX, worldY);
        const x = (worldX - 50) * WORLD_SCALE;
        const z = (worldY - 50) * WORLD_SCALE;
        const y = elevation * 0.33;
        
        // Create a stake/post marker
        const postHeight = 1.2;
        const postRadius = 0.15;
        
        // Main post (low-poly)
        const postGeom = new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 4);
        const postMat = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
        const post = new THREE.Mesh(postGeom, postMat);
        post.position.y = postHeight / 2;
        post.castShadow = true;
        group.add(post);
        
        // Top cap (low-poly box instead of cylinder)
        const capGeom = new THREE.BoxGeometry(postRadius * 3, 0.1, postRadius * 3);
        const capMat = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
        const cap = new THREE.Mesh(capGeom, capMat);
        cap.position.y = postHeight + 0.05;
        group.add(cap);
        
        group.position.set(x, y, z);
        this.scene.add(group);
        return group;
    }


    // Create a flag marker at position (low-poly for pixelated look)
    createFlagMarker(worldX, worldY, color) {
        const group = new THREE.Group();
        
        const elevation = getElevationAt(this.course, worldX, worldY);
        const x = (worldX - 50) * WORLD_SCALE;
        const z = (worldY - 50) * WORLD_SCALE;
        const y = elevation * 0.33;

        // Flagstick dimensions - realistic proportions
        // Real flagstick: ~7 feet tall, ~0.5 inch diameter pole
        const poleHeight = 2.3;  // ~7 feet in yards
        const poleRadius = 0.014; // ~0.5 inch in yards (realistic thin pole)
        
        // Pole (low-poly) - bright white with emissive for visibility
        const poleGeom = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 6);
        const poleMat = new THREE.MeshLambertMaterial({ 
            color: 0xffffff, 
            emissive: 0x444444,
            flatShading: true 
        });
        const pole = new THREE.Mesh(poleGeom, poleMat);
        pole.position.y = poleHeight / 2;
        group.add(pole);

        // Flag cloth - sized for visibility
        const flagWidth = 0.6;  // ~2 feet
        const flagHeight = 0.4; // ~1.3 feet
        const flagGeom = new THREE.PlaneGeometry(flagWidth, flagHeight, 4, 2);
        
        // Shift geometry so left edge is at origin (pivot at pole)
        const posAttr = flagGeom.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            posAttr.setX(i, posAttr.getX(i) + flagWidth / 2);
        }
        posAttr.needsUpdate = true;
        
        // Primary red with emissive glow to stand out against fog
        const flagMat = new THREE.MeshLambertMaterial({ 
            color: 0xff0000, 
            emissive: 0x660000,
            side: THREE.DoubleSide,
            flatShading: true
        });
        const flag = new THREE.Mesh(flagGeom, flagMat);
        flag.position.set(poleRadius, poleHeight - flagHeight / 2 - 0.05, 0);
        group.add(flag);
        
        // Store flag mesh and original positions for animation
        this.flagMesh = flag;
        this.flagGeometry = flagGeom;
        this.flagOriginalPositions = flagGeom.attributes.position.array.slice();
        
        // Store reference to flag group for distance-based scaling
        this.flagGroup = group;

        // Hole cup - 4.25" diameter = 0.118 yards diameter = 0.059 yards radius
        // Ball is 1.68" diameter = 0.047 yards diameter, so ball fits in hole
        // Scale by WORLD_SCALE (4) then reduce to 60% for visual balance
        const cupRadiusYards = 0.059;
        const cupRadius = cupRadiusYards * WORLD_SCALE * 0.60;
        
        // Create a filled dark circle for the hole (not just a ring)
        const cupGeom = new THREE.CircleGeometry(cupRadius, 16);
        const cupMat = new THREE.MeshBasicMaterial({ 
            color: 0x000000,  // Pure black for visibility
            side: THREE.DoubleSide 
        });
        const cup = new THREE.Mesh(cupGeom, cupMat);
        cup.rotation.x = -Math.PI / 2; // Lay flat on ground
        cup.position.y = 0.005; // Just above terrain to prevent z-fighting
        group.add(cup);
        
        // Add a subtle rim/edge around the hole for definition
        const rimGeom = new THREE.RingGeometry(cupRadius, cupRadius + 0.008 * WORLD_SCALE * 0.60, 16);
        const rimMat = new THREE.MeshBasicMaterial({ 
            color: 0x222222, 
            side: THREE.DoubleSide 
        });
        const rim = new THREE.Mesh(rimGeom, rimMat);
        rim.rotation.x = -Math.PI / 2;
        rim.position.y = 0.006;
        group.add(rim);

        group.position.set(x, y, z);
        this.scene.add(group);
        return group;
    }
    
    // Update flag scale based on camera distance - ensures minimum visible size at distance
    // but stays at normal size when close
    updateFlagScale() {
        if (!this.flagGroup || !this.camera) return;
        
        const flagPos = this.flagGroup.position;
        const camPos = this.camera.position;
        const distance = flagPos.distanceTo(camPos);
        
        // When close (< 20 units), use normal scale (1.0)
        // When far, scale up slightly to maintain visibility
        // This keeps the flag realistic when putting but visible from tee
        const nearDistance = 20;
        const farDistance = 200;
        const minScale = 1.0;
        const maxScale = 2.5;
        
        let scale;
        if (distance <= nearDistance) {
            scale = minScale;
        } else if (distance >= farDistance) {
            scale = maxScale;
        } else {
            // Linear interpolation between near and far
            const t = (distance - nearDistance) / (farDistance - nearDistance);
            scale = minScale + t * (maxScale - minScale);
        }
        
        this.flagGroup.scale.set(scale, scale, scale);
    }
    
    // Update flag animation based on wind
    updateFlagAnimation(time) {
        if (!this.flagMesh || !this.flagGeometry || !this.flagOriginalPositions) return;
        
        const positions = this.flagGeometry.attributes.position.array;
        const original = this.flagOriginalPositions;
        
        // Get wind data from unified wind system
        const wind = getWindForVisuals();
        const windSpeed = wind.speed;
        const windDirDeg = wind.direction;
        
        // Flag angle based on wind speed (max 90 degrees)
        const flagAngleDeg = Math.min(windSpeed * 4, 90);
        const flagAngleRad = (flagAngleDeg * Math.PI) / 180;
        const windIntensity = Math.min(windSpeed / 20, 1);
        
        // Wave parameters (scaled for flag)
        const waveAmplitude = 0.005 + windIntensity * 0.02;
        const waveFrequency = 6 + windIntensity * 4;
        const waveSpeed = 4 + windIntensity * 3;
        const flagWidth = 0.6;  // Match the actual flag width
        
        const horizontalFactor = Math.sin(flagAngleRad);
        const verticalFactor = Math.cos(flagAngleRad);
        
        for (let i = 0; i < positions.length; i += 3) {
            const origX = original[i];
            const origY = original[i + 1];
            const origZ = original[i + 2];
            
            const distFromPole = origX / flagWidth;
            const newX = origX * horizontalFactor;
            const dropY = -origX * verticalFactor;
            
            const waveStrength = distFromPole * distFromPole;
            const wave1 = Math.sin(time * waveSpeed + distFromPole * waveFrequency) * waveAmplitude * waveStrength;
            const wave2 = Math.sin(time * waveSpeed * 1.3 + distFromPole * waveFrequency * 0.7 + origY * 2) * waveAmplitude * 0.5 * waveStrength;
            const flutter = wave1 + wave2;
            
            positions[i] = newX;
            positions[i + 1] = origY + dropY;
            positions[i + 2] = origZ + flutter;
        }
        
        this.flagGeometry.attributes.position.needsUpdate = true;
        this.flagGeometry.computeVertexNormals();
        
        // Rotate flag to point in wind direction (where wind blows TO)
        // wind.direction is where wind comes FROM, so flag points opposite
        // Three.js rotation.y: 0 = +Z (south), π/2 = +X (east), π = -Z (north)
        // Game angles: 0° = north, 90° = east, 180° = south
        // Wind from north (0°) blows south → flag points +Z → rotation.y = 0
        const windDirRad = -windDirDeg * Math.PI / 180;
        this.flagMesh.rotation.y = windDirRad;
    }

    // Create tee marker (low-poly boxes for pixelated look)
    createTeeMarker(worldX, worldY) {
        const group = new THREE.Group();
        
        const elevation = getElevationAt(this.course, worldX, worldY);
        const x = (worldX - 50) * WORLD_SCALE;
        const z = (worldY - 50) * WORLD_SCALE;
        const y = elevation * 0.33;

        // Tee markers (two small posts) - 5x wider spacing
        const markerGeom = new THREE.BoxGeometry(0.3, 0.8, 0.3);
        const markerMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
        
        const marker1 = new THREE.Mesh(markerGeom, markerMat);
        marker1.position.set(-7.5, 0.4, 0);
        group.add(marker1);

        const marker2 = new THREE.Mesh(markerGeom, markerMat);
        marker2.position.set(7.5, 0.4, 0);
        group.add(marker2);

        group.position.set(x, y, z);
        this.scene.add(group);
        return group;
    }

    // Get ball start position for current hole
    getBallStartPosition() {
        if (!this.currentHole) return { x: 0, y: 0, z: 0 };
        
        const tee = this.currentHole.tee;
        const elevation = getElevationAt(this.course, tee.x, tee.y);
        
        return {
            x: (tee.x - 50) * WORLD_SCALE,
            y: elevation * 0.33 + 0.2, // Slightly above ground
            z: (tee.y - 50) * WORLD_SCALE
        };
    }

    // Get hole position for current hole
    getHolePosition() {
        if (!this.currentHole) return { x: 0, y: 0, z: 0 };
        
        const hole = this.currentHole.hole;
        const elevation = getElevationAt(this.course, hole.x, hole.y);
        
        return {
            x: (hole.x - 50) * WORLD_SCALE,
            y: elevation * 0.33,
            z: (hole.y - 50) * WORLD_SCALE
        };
    }

    // Convert world coordinates to 3D position
    worldTo3D(worldX, worldY) {
        const elevation = getElevationAt(this.course, worldX, worldY);
        return {
            x: (worldX - 50) * WORLD_SCALE,
            y: elevation * 0.33,
            z: (worldY - 50) * WORLD_SCALE
        };
    }

    // Convert 3D position to world coordinates
    threeDToWorld(x, z) {
        return {
            x: x / WORLD_SCALE + 50,
            y: z / WORLD_SCALE + 50
        };
    }

    // Animate trees, flag, and clouds (sway in wind)
    update(time) {
        // Get wind data from unified wind system
        const wind = getWindForVisuals();
        const windSpeed = wind.speed;
        // Wind direction where wind blows TO (opposite of where it comes FROM)
        // wind.direction is where wind comes FROM, so negate to get blow direction
        // Three.js: 0 rad = +Z (south), π/2 = +X (east)
        const windDirRad = -(wind.direction * Math.PI / 180);
        
        // Tree sway based on wind
        this.trees.forEach(tree => {
            const phase = tree.seed * 0.1;
            
            // Base sway amount (gentle movement even in calm conditions)
            const baseSway = tree.swayAmount * 0.15;
            
            // Wind-induced lean: starts at 8mph, maxes out around 15mph
            // Below 8mph: no wind lean, just gentle sway
            // 8-15mph: increasing lean
            // Above 15mph: trees are well bent over
            let windLean = 0;
            if (windSpeed >= 8) {
                // Ramp from 0 at 8mph to moderate lean at 15mph+
                const leanFactor = Math.min((windSpeed - 8) / 7, 1); // 0 to 1 over 8-15mph range
                // Gentler lean - about 5 degrees at 15mph
                const maxLeanAngle = 0.04 + leanFactor * 0.04;
                windLean = maxLeanAngle * leanFactor;
                // Above 15mph, gradually increase bend
                if (windSpeed > 15) {
                    windLean += (windSpeed - 15) / 30 * 0.08;
                }
            }
            
            // Sway oscillates from vertical (0) toward wind direction (positive values only)
            // Use (1 + sin) / 2 to get 0-1 range instead of -1 to 1
            const swayOscillation = (1 + Math.sin(time * tree.swaySpeed + phase)) / 2;
            const swayOscillationZ = (1 + Math.sin(time * tree.swaySpeed * 0.7 + phase + 1)) / 2;
            
            // Sway amount increases with wind speed
            // Calm: gentle sway, Strong wind: bigger sway motion
            const windSwayMultiplier = 1 + Math.min(windSpeed / 10, 2); // 1x at 0mph, up to 3x at 20mph+
            const swayAmount = tree.swayAmount * 0.25 * windSwayMultiplier;
            
            // Total lean = constant wind lean + oscillating sway (both in wind direction)
            const totalLeanX = windLean + swayOscillation * swayAmount;
            const totalLeanZ = windLean + swayOscillationZ * swayAmount * 0.6;
            
            // Apply lean in wind direction
            // cos(windDirRad) gives Z component, sin(windDirRad) gives X component
            const leanX = Math.sin(windDirRad) * totalLeanX;
            const leanZ = Math.cos(windDirRad) * totalLeanZ;
            
            tree.group.rotation.x = leanZ;   // Z-axis lean from rotation around X
            tree.group.rotation.z = -leanX;  // X-axis lean from rotation around Z (negated)
        });
        
        // Flag animation
        this.updateFlagAnimation(time);
        
        // Update flag scale based on camera distance
        this.updateFlagScale();
        
        // Cloud animation - drift in wind direction at wind-relative speed
        this.clouds.forEach((cloud, i) => {
            // Base cloud speed scaled by wind speed
            // At 0 wind: very slow drift (0.1), at 15mph: moderate drift, at 25mph: fast drift
            const baseCloudSpeed = 0.1 + (windSpeed / 25) * 0.4; // 0.1 to 0.5 based on wind
            const cloudMoveSpeed = baseCloudSpeed * cloud.speed;
            
            // Move clouds in wind direction (wind blows FROM direction, so clouds move opposite)
            // windDirRad already accounts for this (negated in the calculation above)
            cloud.group.position.x += Math.sin(windDirRad) * cloudMoveSpeed;
            cloud.group.position.z += Math.cos(windDirRad) * cloudMoveSpeed;
            
            // Add subtle perpendicular wobble for natural movement
            const wobbleAmount = 0.02 * cloud.speed;
            cloud.group.position.x += Math.cos(time * 0.1 + i) * wobbleAmount;
            cloud.group.position.z += Math.sin(time * 0.15 + i * 0.7) * wobbleAmount;
            
            // Wrap clouds around when they drift too far
            const maxDist = SKY.CLOUD_SPREAD * 1.5;
            const dist = Math.sqrt(cloud.group.position.x ** 2 + cloud.group.position.z ** 2);
            if (dist > maxDist) {
                // Reset to opposite side (upwind)
                cloud.group.position.x = -Math.sin(windDirRad) * SKY.CLOUD_SPREAD * 0.8;
                cloud.group.position.z = -Math.cos(windDirRad) * SKY.CLOUD_SPREAD * 0.8;
                // Add some randomness to the reset position
                const perpAngle = windDirRad + Math.PI / 2;
                const perpOffset = (Math.random() - 0.5) * SKY.CLOUD_SPREAD;
                cloud.group.position.x += Math.sin(perpAngle) * perpOffset;
                cloud.group.position.z += Math.cos(perpAngle) * perpOffset;
            }
            
            // Subtle vertical bob
            cloud.group.position.y = SKY.CLOUD_MIN_HEIGHT + 
                (SKY.CLOUD_MAX_HEIGHT - SKY.CLOUD_MIN_HEIGHT) * 0.5 +
                Math.sin(time * 0.2 + i * 0.5) * 10;
        });
    }

    // Capture a top-down view of the hole for yardage book
    // Returns a canvas with the hole rotated so tee is at bottom, hole at top
    captureYardageBookView(hole, width = 600, height = 800, objectsToHide = []) {
        if (!this.course || !hole) return null;
        
        // Hide objects that shouldn't appear in yardage book (like aim line)
        const hiddenObjects = [];
        objectsToHide.forEach(obj => {
            if (obj && obj.visible) {
                obj.visible = false;
                hiddenObjects.push(obj);
            }
        });
        
        // Hide clouds
        this.clouds.forEach(cloud => {
            if (cloud.group && cloud.group.visible) {
                cloud.group.visible = false;
                hiddenObjects.push(cloud.group);
            }
        });
        
        // Hide sun and glow
        if (this.sunMesh && this.sunMesh.visible) {
            this.sunMesh.visible = false;
            hiddenObjects.push(this.sunMesh);
        }
        if (this.sunGlow && this.sunGlow.visible) {
            this.sunGlow.visible = false;
            hiddenObjects.push(this.sunGlow);
        }
        
        // Hide trees (we'll draw SVG markers instead)
        this.trees.forEach(tree => {
            if (tree.group && tree.group.visible) {
                tree.group.visible = false;
                hiddenObjects.push(tree.group);
            }
        });
        
        // Calculate bounds for the hole
        const bounds = this.calculateHoleBounds(hole);
        
        // Calculate rotation angle to orient tee at bottom, hole at top
        const teePos = hole.tee;
        const holePos = hole.hole;
        const dx = holePos.x - teePos.x;
        const dy = holePos.y - teePos.y;
        const rotationAngle = Math.atan2(dx, -dy); // Angle to rotate so tee->hole points up
        
        // Create an offscreen renderer with shadows disabled
        const offscreenRenderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            preserveDrawingBuffer: true,
            alpha: true
        });
        offscreenRenderer.setSize(width, height);
        offscreenRenderer.shadowMap.enabled = false; // Disable shadows for yardage book
        
        // Create orthographic camera for top-down view
        const aspect = width / height;
        const boundsWidth = bounds.maxX - bounds.minX;
        const boundsHeight = bounds.maxY - bounds.minY;
        
        // Determine view size based on bounds, maintaining aspect ratio
        let viewWidth, viewHeight;
        if (boundsWidth / boundsHeight > aspect) {
            viewWidth = boundsWidth * WORLD_SCALE * 1.1;
            viewHeight = viewWidth / aspect;
        } else {
            viewHeight = boundsHeight * WORLD_SCALE * 1.1;
            viewWidth = viewHeight * aspect;
        }
        
        const orthoCamera = new THREE.OrthographicCamera(
            -viewWidth / 2, viewWidth / 2,
            viewHeight / 2, -viewHeight / 2,
            0.1, 5000
        );
        
        // Position camera above the center of the hole, looking down
        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const center3D = this.worldTo3D(centerX, centerY);
        
        orthoCamera.position.set(center3D.x, 500, center3D.z);
        orthoCamera.lookAt(center3D.x, 0, center3D.z);
        
        // Rotate camera around Z axis to orient tee at bottom
        orthoCamera.rotation.z = -rotationAngle;
        
        // Render the scene
        offscreenRenderer.render(this.scene, orthoCamera);
        
        // Restore hidden objects
        hiddenObjects.forEach(obj => {
            obj.visible = true;
        });
        
        // Get the canvas
        const canvas = offscreenRenderer.domElement;
        
        // Create a new canvas to return (copy the data)
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = width;
        resultCanvas.height = height;
        const ctx = resultCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        
        // Store metadata for overlays - use 3D center position
        resultCanvas.holeBounds = bounds;
        resultCanvas.rotationAngle = rotationAngle;
        resultCanvas.center3D = center3D;
        resultCanvas.centerWorld = { x: centerX, y: centerY };
        resultCanvas.viewWidth = viewWidth;
        resultCanvas.viewHeight = viewHeight;
        
        // Clean up
        offscreenRenderer.dispose();
        
        return resultCanvas;
    }
    
    // Capture a top-down view focused on the green area
    // Returns a canvas with the green rotated so tee is at bottom, hole at top
    captureGreenView(hole, greenBounds, width = 400, height = 500, objectsToHide = []) {
        if (!this.course || !hole) return null;
        
        // Hide objects that shouldn't appear in yardage book (like aim line)
        const hiddenObjects = [];
        objectsToHide.forEach(obj => {
            if (obj && obj.visible) {
                obj.visible = false;
                hiddenObjects.push(obj);
            }
        });
        
        // Hide clouds
        this.clouds.forEach(cloud => {
            if (cloud.group && cloud.group.visible) {
                cloud.group.visible = false;
                hiddenObjects.push(cloud.group);
            }
        });
        
        // Hide sun and glow
        if (this.sunMesh && this.sunMesh.visible) {
            this.sunMesh.visible = false;
            hiddenObjects.push(this.sunMesh);
        }
        if (this.sunGlow && this.sunGlow.visible) {
            this.sunGlow.visible = false;
            hiddenObjects.push(this.sunGlow);
        }
        
        // Hide trees (we'll draw SVG markers instead)
        this.trees.forEach(tree => {
            if (tree.group && tree.group.visible) {
                tree.group.visible = false;
                hiddenObjects.push(tree.group);
            }
        });
        
        // Calculate rotation angle to orient tee at bottom, hole at top
        const teePos = hole.tee;
        const holePos = hole.hole;
        const dx = holePos.x - teePos.x;
        const dy = holePos.y - teePos.y;
        const rotationAngle = Math.atan2(dx, -dy);
        
        // Create an offscreen renderer with shadows disabled
        const offscreenRenderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            preserveDrawingBuffer: true,
            alpha: true
        });
        offscreenRenderer.setSize(width, height);
        offscreenRenderer.shadowMap.enabled = false; // Disable shadows for yardage book
        
        // Create orthographic camera for top-down view
        const aspect = width / height;
        const boundsWidth = greenBounds.maxX - greenBounds.minX;
        const boundsHeight = greenBounds.maxY - greenBounds.minY;
        
        // Determine view size based on bounds, maintaining aspect ratio
        let viewWidth, viewHeight;
        if (boundsWidth / boundsHeight > aspect) {
            viewWidth = boundsWidth * WORLD_SCALE * 1.1;
            viewHeight = viewWidth / aspect;
        } else {
            viewHeight = boundsHeight * WORLD_SCALE * 1.1;
            viewWidth = viewHeight * aspect;
        }
        
        const orthoCamera = new THREE.OrthographicCamera(
            -viewWidth / 2, viewWidth / 2,
            viewHeight / 2, -viewHeight / 2,
            0.1, 5000
        );
        
        // Position camera above the center of the green, looking down
        const centerX = (greenBounds.minX + greenBounds.maxX) / 2;
        const centerY = (greenBounds.minY + greenBounds.maxY) / 2;
        const center3D = this.worldTo3D(centerX, centerY);
        
        orthoCamera.position.set(center3D.x, 500, center3D.z);
        orthoCamera.lookAt(center3D.x, 0, center3D.z);
        
        // Rotate camera around Z axis to orient tee at bottom
        orthoCamera.rotation.z = -rotationAngle;
        
        // Render the scene
        offscreenRenderer.render(this.scene, orthoCamera);
        
        // Restore hidden objects
        hiddenObjects.forEach(obj => {
            obj.visible = true;
        });
        
        // Get the canvas
        const canvas = offscreenRenderer.domElement;
        
        // Create a new canvas to return (copy the data)
        const resultCanvas = document.createElement('canvas');
        resultCanvas.width = width;
        resultCanvas.height = height;
        const ctx = resultCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, 0);
        
        // Store metadata for overlays
        resultCanvas.greenBounds = greenBounds;
        resultCanvas.rotationAngle = rotationAngle;
        resultCanvas.center3D = center3D;
        resultCanvas.centerWorld = { x: centerX, y: centerY };
        resultCanvas.viewWidth = viewWidth;
        resultCanvas.viewHeight = viewHeight;
        
        // Clean up
        offscreenRenderer.dispose();
        
        return resultCanvas;
    }
    
    // Calculate bounding box for a hole
    calculateHoleBounds(hole, padding = 15) {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        // Include tee and hole positions
        if (hole.tee) {
            minX = Math.min(minX, hole.tee.x);
            maxX = Math.max(maxX, hole.tee.x);
            minY = Math.min(minY, hole.tee.y);
            maxY = Math.max(maxY, hole.tee.y);
        }
        
        if (hole.hole) {
            minX = Math.min(minX, hole.hole.x);
            maxX = Math.max(maxX, hole.hole.x);
            minY = Math.min(minY, hole.hole.y);
            maxY = Math.max(maxY, hole.hole.y);
        }
        
        // Include all zones
        if (hole.zones) {
            hole.zones.forEach(zone => {
                if (zone.shape === 'rect') {
                    minX = Math.min(minX, zone.x);
                    maxX = Math.max(maxX, zone.x + zone.width);
                    minY = Math.min(minY, zone.y);
                    maxY = Math.max(maxY, zone.y + zone.height);
                } else if (zone.shape === 'ellipse') {
                    minX = Math.min(minX, zone.cx - zone.rx);
                    maxX = Math.max(maxX, zone.cx + zone.rx);
                    minY = Math.min(minY, zone.cy - zone.ry);
                    maxY = Math.max(maxY, zone.cy + zone.ry);
                } else if (zone.shape === 'polygon' && zone.points) {
                    zone.points.forEach(p => {
                        minX = Math.min(minX, p[0]);
                        maxX = Math.max(maxX, p[0]);
                        minY = Math.min(minY, p[1]);
                        maxY = Math.max(maxY, p[1]);
                    });
                }
            });
        }
        
        // Include trees
        if (hole.trees) {
            hole.trees.forEach(tree => {
                minX = Math.min(minX, tree.x - 5);
                maxX = Math.max(maxX, tree.x + 5);
                minY = Math.min(minY, tree.y - 5);
                maxY = Math.max(maxY, tree.y + 5);
            });
        }
        
        // Fallback
        if (minX === Infinity) {
            minX = 0; maxX = 100; minY = 0; maxY = 100;
        }
        
        // Add padding
        minX -= padding;
        maxX += padding;
        minY -= padding;
        maxY += padding;
        
        return { minX, maxX, minY, maxY };
    }
}

// Create and export world instance factory
export function createWorld(scene) {
    return new World(scene);
}
