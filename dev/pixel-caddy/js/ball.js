// Ball entity - stores ball position state (3D rendering handled by game.js)

export class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.height = 0; // Height above ground in pixels
        this.element = null;
        this.shadowElement = null;
        // Roll state for putting (radians and axis in world XZ for 3D)
        this.rollAngle = 0;
        this.rollAxisX = 0;
        this.rollAxisZ = 1;
    }

    init(container) {
        // Create shadow element (rendered first, below ball)
        this.shadowElement = document.createElement('div');
        this.shadowElement.className = 'ball-shadow';
        container.appendChild(this.shadowElement);
        
        // Create ball element
        this.element = document.createElement('div');
        this.element.className = 'ball';
        this.element.id = 'ball';
        container.appendChild(this.element);
        
        this.render();
    }

    setPosition(x, y, height = 0) {
        this.x = x;
        this.y = y;
        this.height = height;
        this.render();
    }

    render() {
        // 2D rendering disabled - 3D renderer handles ball display
    }

    // Get position in world coordinates
    getPosition() {
        return { x: this.x, y: this.y };
    }
    
    getHeight() {
        return this.height;
    }

    /** Set roll for putting: angle in radians, movement direction (world dx, dy) for roll axis */
    setRoll(angleRad, moveDirX = 0, moveDirY = 0) {
        this.rollAngle = angleRad;
        const len = Math.sqrt(moveDirX * moveDirX + moveDirY * moveDirY) || 1;
        // Roll axis is perpendicular to movement in XZ: (-moveDirY, 0, moveDirX) in 3D (world x->x, world y->z)
        this.rollAxisX = -moveDirY / len;
        this.rollAxisZ = moveDirX / len;
    }

    getRoll() {
        return { angle: this.rollAngle, axisX: this.rollAxisX, axisZ: this.rollAxisZ };
    }
}
