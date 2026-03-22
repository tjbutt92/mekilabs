// Aim line entity - stores aim angle state and handles input (3D rendering handled by game.js)

export class AimLine {
    constructor() {
        this.angle = 0; // degrees, 0 = straight up
        this.element = null;
        this.ball = null;
        this.container = null;
        this.isAimMode = false;
        this.isDragging = false;
        this.onAngleChange = null; // Callback for angle changes
        this.onAimModeChange = null; // Callback for aim mode toggle
    }

    init(container, ball) {
        this.container = container;
        this.ball = ball;
        
        this.element = document.createElement('div');
        this.element.className = 'aim-line';
        this.element.id = 'aim-line';
        container.appendChild(this.element);
        
        this.setupEvents();
        this.render();
    }

    setAngle(angle) {
        this.angle = angle;
        this.render();
        this.notifyAngleChange();
    }

    getAngle() {
        return this.angle;
    }
    
    setOnAngleChange(callback) {
        this.onAngleChange = callback;
    }
    
    setOnAimModeChange(callback) {
        this.onAimModeChange = callback;
    }
    
    notifyAngleChange() {
        if (this.onAngleChange && this.ball) {
            const pos = this.ball.getPosition();
            this.onAngleChange(pos.x, pos.y, this.angle);
        }
    }

    toggleAimMode() {
        this.isAimMode = !this.isAimMode;
        document.body.classList.toggle('aim-mode', this.isAimMode);
        if (this.onAimModeChange) {
            this.onAimModeChange(this.isAimMode);
        }
        return this.isAimMode;
    }

    render() {
        // 2D rendering disabled - 3D renderer handles aim line display
    }

    calculateAngleFromPoint(clientX, clientY) {
        // If we have a 3D projection callback, use it
        if (this.projectBallToScreen) {
            const ballScreen = this.projectBallToScreen();
            if (ballScreen) {
                const dx = clientX - ballScreen.x;
                const dy = ballScreen.y - clientY;
                return Math.atan2(dx, dy) * (180 / Math.PI);
            }
        }
        
        // Fallback - shouldn't reach here in 3D mode
        return this.angle;
    }
    
    setProjectBallToScreen(callback) {
        this.projectBallToScreen = callback;
    }
    
    setScreenToGroundPoint(callback) {
        this.screenToGroundPoint = callback;
    }
    
    setAimAtPoint(callback) {
        this.aimAtPointCallback = callback;
    }

    setupEvents() {
        // Mouse events
        this.container.addEventListener('mousedown', (e) => {
            // Ignore clicks on UI elements (buttons, controls)
            if (e.target.closest('.control-btn, .left-controls, .right-controls, .yardage-indicator')) {
                return;
            }
            if (this.isAimMode) {
                this.isDragging = true;
                this.handleAimInput(e.clientX, e.clientY);
            }
        });

        this.container.addEventListener('mousemove', (e) => {
            if (this.isAimMode && this.isDragging) {
                this.handleAimInput(e.clientX, e.clientY);
            }
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Touch events
        this.container.addEventListener('touchstart', (e) => {
            // Ignore touches on UI elements (buttons, controls)
            if (e.target.closest('.control-btn, .left-controls, .right-controls, .yardage-indicator')) {
                return;
            }
            if (this.isAimMode) {
                this.isDragging = true;
                const touch = e.touches[0];
                this.handleAimInput(touch.clientX, touch.clientY);
            }
        });

        this.container.addEventListener('touchmove', (e) => {
            if (this.isAimMode && this.isDragging) {
                e.preventDefault();
                const touch = e.touches[0];
                this.handleAimInput(touch.clientX, touch.clientY);
            }
        });

        this.container.addEventListener('touchend', () => {
            this.isDragging = false;
        });

        window.addEventListener('resize', () => this.render());
    }
    
    handleAimInput(clientX, clientY) {
        // Use 3D ground raycasting if available
        if (this.screenToGroundPoint && this.aimAtPointCallback) {
            const groundPoint = this.screenToGroundPoint(clientX, clientY);
            if (groundPoint) {
                this.aimAtPointCallback(groundPoint);
                return;
            }
        }
        
        // Fallback to 2D calculation
        this.angle = this.calculateAngleFromPoint(clientX, clientY);
        this.render();
        this.notifyAngleChange();
    }
}
