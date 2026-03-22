// Tree types and rendering for golf course
import * as THREE from 'three';
import { getElevationAt, getTerrainAt, TerrainType } from './terrain.js';
import { seededRandom } from './utils.js';
import { THEME_COLORS } from './theme-colors.js';

// Invalid terrain for tree placement
const INVALID_TREE_TERRAIN = [
    TerrainType.WATER,
    TerrainType.BUNKER,
    TerrainType.GREEN,
    TerrainType.TEE
];

// Filter trees to remove any in invalid terrain
export function validateTrees(hole) {
    if (!hole.trees) return [];
    
    return hole.trees.filter(tree => {
        const terrain = getTerrainAt(hole, tree.x, tree.y);
        if (INVALID_TREE_TERRAIN.includes(terrain)) {
            console.warn(`Tree at (${tree.x}, ${tree.y}) removed - invalid terrain: ${terrain}`);
            return false;
        }
        return true;
    });
}

// Tree varieties
export const TreeType = {
    // Tall pines - sparse foliage at top like longleaf/loblolly
    TALL_PINE_1: 'tall_pine_1',
    TALL_PINE_2: 'tall_pine_2', 
    TALL_PINE_3: 'tall_pine_3',
    // Bushy pines - shorter, fuller
    BUSHY_PINE_1: 'bushy_pine_1',
    BUSHY_PINE_2: 'bushy_pine_2',
    BUSHY_PINE_3: 'bushy_pine_3',
    // Deciduous - branching structure
    DECIDUOUS_1: 'deciduous_1',
    DECIDUOUS_2: 'deciduous_2',
    DECIDUOUS_3: 'deciduous_3'
};

// Color palettes using centralized theme colors
const PINE_GREENS = [THEME_COLORS.pineGreen1, THEME_COLORS.pineGreen2, THEME_COLORS.pineGreen3, THEME_COLORS.pineGreen4];
const DECIDUOUS_GREENS = [THEME_COLORS.deciduousGreen1, THEME_COLORS.deciduousGreen2, THEME_COLORS.deciduousGreen3, THEME_COLORS.deciduousGreen4];
const TRUNK_BROWNS = [THEME_COLORS.trunkBrown1, THEME_COLORS.trunkBrown2, THEME_COLORS.trunkBrown3, THEME_COLORS.trunkBrown4];

export const treeProperties = {
    // Tall pines - very tall, sparse crown at top
    [TreeType.TALL_PINE_1]: {
        name: 'Tall Pine 1', category: 'tall_pine',
        height: { min: 25, max: 35 }, canopyRadius: { min: 3, max: 5 },
        trunkRatio: 0.7, branchiness: 0.3
    },
    [TreeType.TALL_PINE_2]: {
        name: 'Tall Pine 2', category: 'tall_pine',
        height: { min: 28, max: 38 }, canopyRadius: { min: 4, max: 6 },
        trunkRatio: 0.65, branchiness: 0.4
    },
    [TreeType.TALL_PINE_3]: {
        name: 'Tall Pine 3', category: 'tall_pine',
        height: { min: 22, max: 32 }, canopyRadius: { min: 3, max: 5 },
        trunkRatio: 0.75, branchiness: 0.25
    },
    // Short pines - smaller version of tall pines, foliage lower to ground
    [TreeType.BUSHY_PINE_1]: {
        name: 'Short Pine 1', category: 'short_pine',
        height: { min: 12, max: 16 }, canopyRadius: { min: 3, max: 5 },
        trunkRatio: 0.35, branchiness: 0.5
    },
    [TreeType.BUSHY_PINE_2]: {
        name: 'Short Pine 2', category: 'short_pine',
        height: { min: 10, max: 14 }, canopyRadius: { min: 3, max: 4 },
        trunkRatio: 0.3, branchiness: 0.6
    },
    [TreeType.BUSHY_PINE_3]: {
        name: 'Short Pine 3', category: 'short_pine',
        height: { min: 14, max: 18 }, canopyRadius: { min: 3, max: 5 },
        trunkRatio: 0.4, branchiness: 0.45
    },
    // Deciduous - branching canopy (canopyRadius in YARDS; 10 yd radius = 20 yd diameter max)
    [TreeType.DECIDUOUS_1]: {
        name: 'Oak', category: 'deciduous',
        height: { min: 15, max: 22 }, canopyRadius: { min: 5, max: 10 },
        trunkRatio: 0.35, branchiness: 0.6
    },
    [TreeType.DECIDUOUS_2]: {
        name: 'Maple', category: 'deciduous',
        height: { min: 12, max: 18 }, canopyRadius: { min: 4, max: 9 },
        trunkRatio: 0.4, branchiness: 0.7
    },
    [TreeType.DECIDUOUS_3]: {
        name: 'Elm', category: 'deciduous',
        height: { min: 18, max: 25 }, canopyRadius: { min: 5, max: 10 },
        trunkRatio: 0.3, branchiness: 0.5
    }
};

// Scale factor: world units to yards (same as world.js)
const WORLD_TO_YARDS = 4;

// Check if a point collides with any tree
// Returns collision info with hitType: 'trunk' or 'foliage'
export function checkTreeCollision(hole, x, y, ballHeight) {
    if (!hole.trees) return null;
    
    for (const tree of hole.trees) {
        const props = treeProperties[tree.type];
        if (!props) continue;
        
        const height = tree.height || (props.height.min + props.height.max) / 2;
        const canopyRadius = tree.canopyRadius || (props.canopyRadius.min + props.canopyRadius.max) / 2;
        const trunkRatio = props.trunkRatio;
        const trunkHeight = height * trunkRatio;
        
        const dx = x - tree.x;
        const dy = y - tree.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Trunk radius - very tight, just the actual trunk (~0.3 yards)
        const trunkRadiusNorm = 0.3 * (100 / hole.yards);
        // Foliage radius - tight, 40% of visual canopy
        const foliageRadiusNorm = canopyRadius * 0.4 * (100 / hole.yards);
        
        // Check trunk collision first (ball below canopy height, close to center)
        if (ballHeight < trunkHeight && dist < trunkRadiusNorm) {
            // Hit the trunk - solid hit, ball bounces off
            const dirX = dx / dist || 0;
            const dirY = dy / dist || 0;
            return {
                tree,
                hitType: 'trunk',
                deflection: {
                    x: dirX * 2,  // Modest deflection away from trunk
                    y: dirY * 2,
                    energyLoss: 0.8  // Trunk absorbs 80% momentum
                }
            };
        }
        
        // Check foliage collision (ball in canopy zone)
        const canopyBottom = trunkHeight * 0.8; // Foliage starts slightly below trunk top
        if (ballHeight >= canopyBottom && ballHeight < height && dist < foliageRadiusNorm) {
            // Hit foliage - soft hit, ball drops through
            const dirX = dx / dist || 0;
            const dirY = dy / dist || 0;
            return {
                tree,
                hitType: 'foliage',
                deflection: {
                    x: dirX * 0.3,  // Minimal deflection - ball mostly drops
                    y: dirY * 0.3,
                    energyLoss: 0.9  // Foliage absorbs 90% momentum
                }
            };
        }
    }
    return null;
}

// Create 3D tree mesh
export function createTree3D(tree, holeData, scene) {
    const props = treeProperties[tree.type];
    if (!props) return null;
    
    const seed = tree.x * 100 + tree.y;
    const height = tree.height || props.height.min + seededRandom(seed) * (props.height.max - props.height.min);
    const canopyRadius = tree.canopyRadius || props.canopyRadius.min + seededRandom(seed + 1) * (props.canopyRadius.max - props.canopyRadius.min);
    
    // Convert world coords to 3D (world 50,50 = 3D origin, scaled to yards)
    const x = (tree.x - 50) * WORLD_TO_YARDS;
    const z = (tree.y - 50) * WORLD_TO_YARDS;
    const groundY = getElevationAt(holeData, tree.x, tree.y) * 0.33;
    
    const group = new THREE.Group();
    // Tree heights are in yards (height prop is in yards already from treeProperties)
    const heightUnits = height;
    const canopyRadiusUnits = canopyRadius;
    
    const category = props.category;
    const foliageColor = category.includes('pine') ? 
        PINE_GREENS[Math.floor(seededRandom(seed + 2) * PINE_GREENS.length)] :
        DECIDUOUS_GREENS[Math.floor(seededRandom(seed + 2) * DECIDUOUS_GREENS.length)];
    const trunkColor = TRUNK_BROWNS[Math.floor(seededRandom(seed + 3) * TRUNK_BROWNS.length)];
    
    if (category === 'tall_pine') {
        createTallPine(group, heightUnits, canopyRadiusUnits, props, foliageColor, trunkColor, seed);
    } else if (category === 'short_pine') {
        createShortPine(group, heightUnits, canopyRadiusUnits, props, foliageColor, trunkColor, seed);
    } else {
        createDeciduousTree(group, heightUnits, canopyRadiusUnits, props, foliageColor, trunkColor, seed);
    }
    
    group.position.set(x, groundY, z);
    scene.add(group);
    
    // Return tree data for animation
    return {
        group,
        height: heightUnits,
        category,
        seed,
        // Sway properties - taller trees sway more, pines are stiffer
        swayAmount: category === 'deciduous' ? 0.04 : 0.025,
        swaySpeed: 0.8 + seededRandom(seed + 500) * 0.4  // Slight variation in sway speed
    };
}

// Tall pine - long bare trunk with sparse branches at top
function createTallPine(group, height, canopyRadius, props, foliageColor, trunkColor, seed) {
    const trunkHeight = height * props.trunkRatio;
    const trunkRadius = 0.3 + seededRandom(seed + 10) * 0.15;
    
    // Main trunk - tapers toward top (low-poly for pixelated look)
    const trunkGeom = new THREE.CylinderGeometry(trunkRadius * 0.4, trunkRadius, height * 0.95, 4);
    const trunkMat = new THREE.MeshLambertMaterial({ color: trunkColor, flatShading: true });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = height * 0.475;
    trunk.castShadow = true;
    group.add(trunk);
    
    const foliageMat = new THREE.MeshLambertMaterial({ color: foliageColor, flatShading: true });
    
    // Sparse branches at top - irregular clusters
    const branchCount = 4 + Math.floor(seededRandom(seed + 20) * 4);
    const crownStart = trunkHeight;
    const crownHeight = height - trunkHeight;
    
    for (let i = 0; i < branchCount; i++) {
        const t = seededRandom(seed + 30 + i);
        const branchY = crownStart + t * crownHeight * 0.9;
        const angle = seededRandom(seed + 40 + i) * Math.PI * 2;
        const branchLength = canopyRadius * (0.5 + seededRandom(seed + 50 + i) * 0.8);
        const branchAngle = 0.2 + seededRandom(seed + 60 + i) * 0.4; // Slight upward angle
        
        // Branch stem (low-poly)
        const branchGeom = new THREE.CylinderGeometry(0.05, 0.1, branchLength, 3);
        const branch = new THREE.Mesh(branchGeom, trunkMat);
        branch.position.set(
            Math.cos(angle) * branchLength * 0.4,
            branchY,
            Math.sin(angle) * branchLength * 0.4
        );
        branch.rotation.z = -Math.cos(angle) * (Math.PI / 2 - branchAngle);
        branch.rotation.x = Math.sin(angle) * (Math.PI / 2 - branchAngle);
        group.add(branch);
        
        // Foliage cluster at branch end - low-poly for pixelated look
        const clusterCount = 2 + Math.floor(seededRandom(seed + 70 + i) * 3);
        for (let j = 0; j < clusterCount; j++) {
            const clusterSize = canopyRadius * (0.3 + seededRandom(seed + 80 + i * 10 + j) * 0.4);
            const clusterGeom = new THREE.IcosahedronGeometry(clusterSize, 0);
            const cluster = new THREE.Mesh(clusterGeom, foliageMat);
            cluster.position.set(
                Math.cos(angle) * branchLength * (0.7 + seededRandom(seed + 90 + i * 10 + j) * 0.4),
                branchY + seededRandom(seed + 100 + i * 10 + j) * clusterSize,
                Math.sin(angle) * branchLength * (0.7 + seededRandom(seed + 110 + i * 10 + j) * 0.4)
            );
            cluster.scale.y = 0.6 + seededRandom(seed + 120 + i * 10 + j) * 0.4;
            cluster.castShadow = true;
            group.add(cluster);
        }
    }
    
    // Top tuft with trunk extension (low-poly)
    const topSize = canopyRadius * 0.6;
    
    // Add trunk to top tuft
    const topTrunkGeom = new THREE.CylinderGeometry(0.03, 0.06, topSize * 1.5, 3);
    const topTrunk = new THREE.Mesh(topTrunkGeom, trunkMat);
    topTrunk.position.y = height - topSize * 0.8;
    group.add(topTrunk);
    
    const topGeom = new THREE.IcosahedronGeometry(topSize, 0);
    const topCluster = new THREE.Mesh(topGeom, foliageMat);
    topCluster.position.y = height - topSize * 0.3;
    topCluster.scale.y = 0.7;
    topCluster.castShadow = true;
    group.add(topCluster);
}

// Short pine - same style as tall pine but shorter with foliage starting lower
function createShortPine(group, height, canopyRadius, props, foliageColor, trunkColor, seed) {
    const trunkHeight = height * props.trunkRatio;
    const trunkRadius = 0.25 + seededRandom(seed + 10) * 0.1;
    
    // Main trunk - tapers toward top (low-poly)
    const trunkGeom = new THREE.CylinderGeometry(trunkRadius * 0.5, trunkRadius, height * 0.9, 4);
    const trunkMat = new THREE.MeshLambertMaterial({ color: trunkColor, flatShading: true });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = height * 0.45;
    trunk.castShadow = true;
    group.add(trunk);
    
    const foliageMat = new THREE.MeshLambertMaterial({ color: foliageColor, flatShading: true });
    
    // More branches starting lower on the tree
    const branchCount = 6 + Math.floor(seededRandom(seed + 20) * 4);
    const crownStart = trunkHeight;
    const crownHeight = height - trunkHeight;
    
    for (let i = 0; i < branchCount; i++) {
        const t = seededRandom(seed + 30 + i);
        const branchY = crownStart + t * crownHeight * 0.85;
        const angle = seededRandom(seed + 40 + i) * Math.PI * 2;
        const branchLength = canopyRadius * (0.5 + seededRandom(seed + 50 + i) * 0.7);
        const branchAngle = 0.15 + seededRandom(seed + 60 + i) * 0.35;
        
        // Branch stem (low-poly)
        const branchGeom = new THREE.CylinderGeometry(0.04, 0.08, branchLength, 3);
        const branch = new THREE.Mesh(branchGeom, trunkMat);
        branch.position.set(
            Math.cos(angle) * branchLength * 0.4,
            branchY,
            Math.sin(angle) * branchLength * 0.4
        );
        branch.rotation.z = -Math.cos(angle) * (Math.PI / 2 - branchAngle);
        branch.rotation.x = Math.sin(angle) * (Math.PI / 2 - branchAngle);
        group.add(branch);
        
        // Foliage clusters at branch end (low-poly)
        const clusterCount = 2 + Math.floor(seededRandom(seed + 70 + i) * 2);
        for (let j = 0; j < clusterCount; j++) {
            const clusterSize = canopyRadius * (0.3 + seededRandom(seed + 80 + i * 10 + j) * 0.35);
            const clusterGeom = new THREE.IcosahedronGeometry(clusterSize, 0);
            const cluster = new THREE.Mesh(clusterGeom, foliageMat);
            cluster.position.set(
                Math.cos(angle) * branchLength * (0.65 + seededRandom(seed + 90 + i * 10 + j) * 0.4),
                branchY + seededRandom(seed + 100 + i * 10 + j) * clusterSize * 0.8,
                Math.sin(angle) * branchLength * (0.65 + seededRandom(seed + 110 + i * 10 + j) * 0.4)
            );
            cluster.scale.y = 0.6 + seededRandom(seed + 120 + i * 10 + j) * 0.3;
            cluster.castShadow = true;
            group.add(cluster);
        }
    }
    
    // Top tuft with trunk extension (low-poly)
    const topSize = canopyRadius * 0.5;
    
    // Add trunk to top tuft
    const topTrunkGeom = new THREE.CylinderGeometry(0.03, 0.05, topSize * 1.2, 3);
    const topTrunk = new THREE.Mesh(topTrunkGeom, trunkMat);
    topTrunk.position.y = height - topSize * 0.9;
    group.add(topTrunk);
    
    const topGeom = new THREE.IcosahedronGeometry(topSize, 0);
    const topCluster = new THREE.Mesh(topGeom, foliageMat);
    topCluster.position.y = height - topSize * 0.4;
    topCluster.scale.y = 0.65;
    topCluster.castShadow = true;
    group.add(topCluster);
}

// Deciduous tree with branching structure
function createDeciduousTree(group, height, canopyRadius, props, foliageColor, trunkColor, seed) {
    const trunkHeight = height * props.trunkRatio;
    const trunkRadius = 0.4 + seededRandom(seed + 10) * 0.2;
    
    const trunkMat = new THREE.MeshLambertMaterial({ color: trunkColor, flatShading: true });
    const foliageMat = new THREE.MeshLambertMaterial({ color: foliageColor, flatShading: true });
    
    // Main trunk (low-poly)
    const trunkGeom = new THREE.CylinderGeometry(trunkRadius * 0.7, trunkRadius, trunkHeight, 4);
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    group.add(trunk);
    
    // Main branches from trunk
    const mainBranchCount = 3 + Math.floor(seededRandom(seed + 20) * 3);
    const canopyBase = trunkHeight * 0.8;
    
    for (let i = 0; i < mainBranchCount; i++) {
        const angle = (i / mainBranchCount) * Math.PI * 2 + seededRandom(seed + 30 + i) * 0.8;
        const branchY = canopyBase + seededRandom(seed + 40 + i) * trunkHeight * 0.3;
        const branchLen = canopyRadius * (0.6 + seededRandom(seed + 50 + i) * 0.5);
        const upAngle = 0.4 + seededRandom(seed + 60 + i) * 0.4;
        
        // Main branch (low-poly)
        const branchGeom = new THREE.CylinderGeometry(trunkRadius * 0.2, trunkRadius * 0.4, branchLen, 3);
        const branch = new THREE.Mesh(branchGeom, trunkMat);
        const bx = Math.cos(angle) * branchLen * 0.4;
        const bz = Math.sin(angle) * branchLen * 0.4;
        const by = branchY + Math.sin(upAngle) * branchLen * 0.3;
        branch.position.set(bx, by, bz);
        branch.rotation.z = -Math.cos(angle) * (Math.PI / 2 - upAngle);
        branch.rotation.x = Math.sin(angle) * (Math.PI / 2 - upAngle);
        group.add(branch);
        
        // Sub-branches
        const subCount = 2 + Math.floor(seededRandom(seed + 70 + i) * 3);
        for (let j = 0; j < subCount; j++) {
            const subAngle = angle + (seededRandom(seed + 80 + i * 10 + j) - 0.5) * 1.2;
            const subLen = branchLen * (0.3 + seededRandom(seed + 90 + i * 10 + j) * 0.4);
            const subY = by + seededRandom(seed + 100 + i * 10 + j) * branchLen * 0.4;
            const subUp = 0.2 + seededRandom(seed + 110 + i * 10 + j) * 0.5;
            
            const subGeom = new THREE.CylinderGeometry(trunkRadius * 0.08, trunkRadius * 0.15, subLen, 3);
            const sub = new THREE.Mesh(subGeom, trunkMat);
            const sx = bx + Math.cos(subAngle) * subLen * 0.4;
            const sz = bz + Math.sin(subAngle) * subLen * 0.4;
            sub.position.set(sx, subY, sz);
            sub.rotation.z = -Math.cos(subAngle) * (Math.PI / 2 - subUp);
            sub.rotation.x = Math.sin(subAngle) * (Math.PI / 2 - subUp);
            group.add(sub);
            
            // Foliage cluster at sub-branch end (low-poly)
            const clusterSize = canopyRadius * (0.35 + seededRandom(seed + 120 + i * 10 + j) * 0.3);
            const clusterGeom = new THREE.IcosahedronGeometry(clusterSize, 0);
            const cluster = new THREE.Mesh(clusterGeom, foliageMat);
            cluster.position.set(
                sx + Math.cos(subAngle) * subLen * 0.5,
                subY + subLen * 0.3 + clusterSize * 0.3,
                sz + Math.sin(subAngle) * subLen * 0.5
            );
            cluster.scale.set(
                1 + seededRandom(seed + 130 + i * 10 + j) * 0.3,
                0.7 + seededRandom(seed + 140 + i * 10 + j) * 0.3,
                1 + seededRandom(seed + 150 + i * 10 + j) * 0.3
            );
            cluster.castShadow = true;
            group.add(cluster);
        }
        
        // Main foliage cluster at branch end (low-poly)
        const mainClusterSize = canopyRadius * (0.5 + seededRandom(seed + 160 + i) * 0.3);
        const mainClusterGeom = new THREE.IcosahedronGeometry(mainClusterSize, 0);
        const mainCluster = new THREE.Mesh(mainClusterGeom, foliageMat);
        mainCluster.position.set(
            Math.cos(angle) * branchLen * 0.85,
            by + branchLen * 0.4,
            Math.sin(angle) * branchLen * 0.85
        );
        mainCluster.scale.y = 0.75;
        mainCluster.castShadow = true;
        group.add(mainCluster);
    }
    
    // Central top cluster with trunk extension (low-poly)
    const topSize = canopyRadius * 0.6;
    
    // Add trunk extension to top
    const topTrunkGeom = new THREE.CylinderGeometry(trunkRadius * 0.3, trunkRadius * 0.5, height - trunkHeight, 4);
    const topTrunk = new THREE.Mesh(topTrunkGeom, trunkMat);
    topTrunk.position.y = trunkHeight + (height - trunkHeight) / 2;
    topTrunk.castShadow = true;
    group.add(topTrunk);
    
    const topGeom = new THREE.IcosahedronGeometry(topSize, 0);
    const topCluster = new THREE.Mesh(topGeom, foliageMat);
    topCluster.position.y = height - topSize * 0.5;
    topCluster.scale.y = 0.8;
    topCluster.castShadow = true;
    group.add(topCluster);
}


// Render tree on yardage book map - birds eye view
export function renderTreeOnMap(tree, container, worldToPercentFn) {
    const props = treeProperties[tree.type];
    if (!props) return null;
    
    const seed = tree.x * 100 + tree.y;
    const canopyRadius = tree.canopyRadius || props.canopyRadius.min + seededRandom(seed + 1) * (props.canopyRadius.max - props.canopyRadius.min);
    const category = props.category;
    
    // Get position using the coordinate transform function if provided
    let posX, posY;
    if (worldToPercentFn) {
        const pos = worldToPercentFn(tree.x, tree.y);
        posX = pos.x;
        posY = pos.y;
    } else {
        posX = tree.x;
        posY = tree.y;
    }
    
    const el = document.createElement('div');
    el.className = `yardage-map-tree tree-${category}`;
    
    // Size based on canopy radius - birds eye view shows the full canopy spread
    const sizePercent = canopyRadius * 1.2;
    el.style.cssText = `
        position: absolute;
        left: ${posX}%;
        top: ${posY}%;
        width: ${sizePercent}%;
        height: ${sizePercent}%;
        transform: translate(-50%, -50%);
        pointer-events: none;
    `;
    
    // Generate consistent random offsets for leaf clusters
    const r1 = seededRandom(seed + 10);
    const r2 = seededRandom(seed + 20);
    const r3 = seededRandom(seed + 30);
    const r4 = seededRandom(seed + 40);
    const r5 = seededRandom(seed + 50);
    
    if (category === 'tall_pine') {
        // Tall pine birds eye - sparse irregular clusters around small trunk
        el.innerHTML = `<svg viewBox="0 0 40 40" style="width:100%;height:100%;">
            <circle cx="20" cy="20" r="2" fill="${THEME_COLORS.trunkBrown2}"/>
            <ellipse cx="${14 + r1 * 6}" cy="${10 + r2 * 5}" rx="${5 + r3 * 2}" ry="${4 + r4 * 2}" fill="${THEME_COLORS.pineGreen1}" opacity="0.9"/>
            <ellipse cx="${24 + r2 * 4}" cy="${12 + r1 * 4}" rx="${4 + r4 * 2}" ry="${5 + r3 * 2}" fill="${THEME_COLORS.pineGreen2}" opacity="0.9"/>
            <ellipse cx="${26 + r3 * 4}" cy="${26 + r4 * 4}" rx="${5 + r1 * 2}" ry="${4 + r2 * 2}" fill="${THEME_COLORS.pineGreen3}" opacity="0.9"/>
            <ellipse cx="${10 + r4 * 4}" cy="${25 + r3 * 5}" rx="${4 + r2 * 2}" ry="${5 + r1 * 2}" fill="${THEME_COLORS.pineGreen4}" opacity="0.9"/>
            <ellipse cx="20" cy="20" rx="${6 + r5 * 2}" ry="${5 + r1 * 2}" fill="${THEME_COLORS.pineGreen1}" opacity="0.85"/>
        </svg>`;
    } else if (category === 'short_pine') {
        // Short pine birds eye - denser, more overlapping clusters
        el.innerHTML = `<svg viewBox="0 0 40 40" style="width:100%;height:100%;">
            <circle cx="20" cy="20" r="1.5" fill="${THEME_COLORS.trunkBrown2}"/>
            <ellipse cx="${12 + r1 * 4}" cy="${12 + r2 * 4}" rx="${6 + r3 * 2}" ry="${5 + r4 * 2}" fill="${THEME_COLORS.pineGreen1}" opacity="0.85"/>
            <ellipse cx="${26 + r2 * 3}" cy="${13 + r1 * 3}" rx="${5 + r4 * 2}" ry="${6 + r3 * 2}" fill="${THEME_COLORS.pineGreen2}" opacity="0.85"/>
            <ellipse cx="${27 + r3 * 3}" cy="${26 + r4 * 3}" rx="${6 + r1 * 2}" ry="${5 + r2 * 2}" fill="${THEME_COLORS.pineGreen3}" opacity="0.85"/>
            <ellipse cx="${11 + r4 * 3}" cy="${27 + r3 * 3}" rx="${5 + r2 * 2}" ry="${6 + r1 * 2}" fill="${THEME_COLORS.pineGreen4}" opacity="0.85"/>
            <ellipse cx="${16 + r5 * 3}" cy="${18 + r1 * 3}" rx="${5 + r2 * 1.5}" ry="${4 + r3 * 1.5}" fill="${THEME_COLORS.pineGreen1}" opacity="0.9"/>
            <ellipse cx="${24 + r1 * 3}" cy="${22 + r5 * 3}" rx="${4 + r3 * 1.5}" ry="${5 + r4 * 1.5}" fill="${THEME_COLORS.pineGreen2}" opacity="0.9"/>
            <ellipse cx="20" cy="20" rx="${7 + r4 * 2}" ry="${7 + r5 * 2}" fill="${THEME_COLORS.pineGreen3}" opacity="0.8"/>
        </svg>`;
    } else {
        // Deciduous birds eye - large rounded canopy with visible branch structure underneath
        el.innerHTML = `<svg viewBox="0 0 40 40" style="width:100%;height:100%;">
            <line x1="20" y1="20" x2="${8 + r1 * 4}" y2="${10 + r2 * 4}" stroke="${THEME_COLORS.trunkBrown2}" stroke-width="1.5" opacity="0.4"/>
            <line x1="20" y1="20" x2="${30 + r2 * 3}" y2="${12 + r1 * 3}" stroke="${THEME_COLORS.trunkBrown2}" stroke-width="1.5" opacity="0.4"/>
            <line x1="20" y1="20" x2="${28 + r3 * 4}" y2="${28 + r4 * 4}" stroke="${THEME_COLORS.trunkBrown2}" stroke-width="1.5" opacity="0.4"/>
            <line x1="20" y1="20" x2="${10 + r4 * 3}" y2="${30 + r3 * 3}" stroke="${THEME_COLORS.trunkBrown2}" stroke-width="1.5" opacity="0.4"/>
            <circle cx="20" cy="20" r="2" fill="${THEME_COLORS.trunkBrown2}"/>
            <ellipse cx="${10 + r1 * 4}" cy="${11 + r2 * 4}" rx="${7 + r3 * 2}" ry="${6 + r4 * 2}" fill="${THEME_COLORS.deciduousGreen1}" opacity="0.85"/>
            <ellipse cx="${29 + r2 * 3}" cy="${13 + r1 * 3}" rx="${6 + r4 * 2}" ry="${7 + r3 * 2}" fill="${THEME_COLORS.deciduousGreen2}" opacity="0.85"/>
            <ellipse cx="${28 + r3 * 3}" cy="${28 + r4 * 3}" rx="${7 + r1 * 2}" ry="${6 + r2 * 2}" fill="${THEME_COLORS.deciduousGreen3}" opacity="0.85"/>
            <ellipse cx="${11 + r4 * 3}" cy="${29 + r3 * 3}" rx="${6 + r2 * 2}" ry="${7 + r1 * 2}" fill="${THEME_COLORS.deciduousGreen4}" opacity="0.85"/>
            <ellipse cx="20" cy="20" rx="${9 + r5 * 2}" ry="${9 + r1 * 2}" fill="${THEME_COLORS.deciduousGreen2}" opacity="0.8"/>
            <ellipse cx="${16 + r1 * 2}" cy="${16 + r2 * 2}" rx="${4 + r3}" ry="${4 + r4}" fill="${THEME_COLORS.deciduousGreen3}" opacity="0.7"/>
            <ellipse cx="${24 + r3 * 2}" cy="${24 + r4 * 2}" rx="${4 + r5}" ry="${4 + r1}" fill="${THEME_COLORS.deciduousGreen1}" opacity="0.7"/>
        </svg>`;
    }
    
    container.appendChild(el);
    return el;
}
