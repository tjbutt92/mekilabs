// UI module - modals and button handlers
import { clubs } from './clubs.js';
import { showYardageBook, setYardageBookWorld, setObjectsToHide, setYardageBookBall } from './yardagebook/index.js';
import { canInteract, getCurrentWindow, setTimingWindow, TimingWindow } from './caddySystem.js';

const shapes = ['Draw', 'Straight', 'Fade'];

// Club abbreviations for buttons (Requirement 9)
const clubAbbreviations = {
    'Driver': 'Dr',
    '3 Wood': '3W',
    '5 Wood': '5W',
    '4 Iron': '4i',
    '5 Iron': '5i',
    '6 Iron': '6i',
    '7 Iron': '7i',
    '8 Iron': '8i',
    '9 Iron': '9i',
    'PW': 'PW',
    'GW': 'GW',
    'SW': 'SW',
    'LW': 'LW',
    'Putter': 'Pt'
};

// Shape arrows for buttons (Requirement 9)
const shapeArrows = {
    'Hook': '←←',
    'Draw': '←',
    'Straight': '—',
    'Fade': '→',
    'Slice': '→→'
};

/**
 * Transition from StartOfHole to PreShot timing window when player starts shot setup
 * Called when player interacts with any shot setup control (club, power, shape, aim)
 * Validates: Requirements 2.1, 6.1-6.4
 */
function transitionToPreShotIfNeeded() {
    if (getCurrentWindow() === TimingWindow.StartOfHole) {
        setTimingWindow(TimingWindow.PreShot);
        updateSpeakButtonVisibility();
        console.log('Transitioned from StartOfHole to PreShot window');
    }
}

// Check if current club is putter
function isPutter(club) {
    return club && club.name === 'Putter';
}

// Club selector state
let clubSelectorElement = null;
let clubSelectorExpanded = false;

/**
 * Creates the club selector component - horizontal scrollable list with club symbols
 * Requirements: 13.1, 13.2, 13.3, 13.5
 */
function createClubSelector(gameState, updateButtons) {
    const container = document.createElement('div');
    container.className = 'club-selector collapsed';
    
    // Horizontal scroll container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'club-scroll';
    
    clubs.forEach((club, index) => {
        const item = document.createElement('div');
        item.className = 'club-selector-item';
        if (club.name === gameState.club.name) {
            item.classList.add('selected');
        }
        item.textContent = clubAbbreviations[club.name];
        item.dataset.club = club.name;
        item.dataset.index = index;
        item.title = club.name; // Tooltip for accessibility
        
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            // Transition from StartOfHole to PreShot when player starts shot setup
            // Validates: Requirements 2.1, 6.1-6.4
            transitionToPreShotIfNeeded();
            // Update game state
            gameState.club = clubs[index];
            // Update selection highlight
            scrollContainer.querySelectorAll('.club-selector-item').forEach(el => {
                el.classList.remove('selected');
            });
            item.classList.add('selected');
            // Update button text
            updateButtons();
            // Update simulate putt button visibility
            updateSimulatePuttButtonVisibility(gameState);
            // Collapse the selector after selection
            collapseClubSelector();
        });
        
        scrollContainer.appendChild(item);
    });
    
    container.appendChild(scrollContainer);
    return container;
}

/**
 * Expands the club selector from the left
 * Requirements: 13.1
 * Centers the scroll on the selected club (or as close as possible for edge clubs)
 */
function expandClubSelector() {
    if (clubSelectorElement && !clubSelectorExpanded) {
        const scrollContainer = clubSelectorElement.querySelector('.club-scroll');
        
        // Reset scroll position before expanding
        if (scrollContainer) {
            scrollContainer.scrollLeft = 0;
        }
        
        clubSelectorElement.classList.remove('collapsed');
        clubSelectorElement.classList.add('expanded');
        clubSelectorExpanded = true;
        
        // Center on selected club after expansion animation completes
        const selectedItem = clubSelectorElement.querySelector('.club-selector-item.selected');
        if (selectedItem && scrollContainer) {
            setTimeout(() => {
                const containerWidth = scrollContainer.clientWidth;
                const itemLeft = selectedItem.offsetLeft;
                const itemWidth = selectedItem.offsetWidth;
                
                // Calculate scroll position to center the selected item
                const scrollPos = itemLeft - (containerWidth / 2) + (itemWidth / 2);
                
                // Clamp to valid scroll range
                const maxScroll = scrollContainer.scrollWidth - containerWidth;
                scrollContainer.scrollLeft = Math.max(0, Math.min(scrollPos, maxScroll));
            }, 100);
        }
    }
}

/**
 * Collapses the club selector
 * Requirements: 13.4 (collapse after selection)
 */
function collapseClubSelector() {
    if (clubSelectorElement && clubSelectorExpanded) {
        clubSelectorElement.classList.remove('expanded');
        clubSelectorElement.classList.add('collapsed');
        clubSelectorExpanded = false;
    }
}

// Power slider state
let powerSliderElement = null;
let powerSliderExpanded = false;

/**
 * Creates the power slider component - horizontal slider with color gradient
 * Requirements: 14.1, 14.2, 14.3
 */
function createPowerSlider(gameState, updateButtons) {
    const container = document.createElement('div');
    container.className = 'power-slider-expandable collapsed';
    
    // Slider track container
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'power-slider-track';
    
    // The range input slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = 0;
    slider.max = 100;
    slider.value = gameState.power;
    slider.className = 'power-range-expandable';
    
    /**
     * Updates the slider color based on power value
     * Color gradient: blue (0%) → green (50%) → red (100%)
     * Uses HSL color space: 240 (blue) → 120 (green) → 0 (red)
     */
    function updateSliderColor(value) {
        let hue;
        if (value <= 50) {
            // Blue (240) to Green (120) for 0-50%
            hue = 240 - (value * 2.4); // 240 → 120
        } else {
            // Green (120) to Red (0) for 50-100%
            hue = 120 - ((value - 50) * 2.4); // 120 → 0
        }
        slider.style.setProperty('--power-color', `hsl(${hue}, 80%, 50%)`);
    }
    
    // Initialize color
    updateSliderColor(gameState.power);
    
    // Handle slider input
    slider.addEventListener('input', (e) => {
        e.stopPropagation();
        // Transition from StartOfHole to PreShot when player starts shot setup
        // Validates: Requirements 2.1, 6.1-6.4
        transitionToPreShotIfNeeded();
        const value = parseInt(slider.value);
        gameState.power = value;
        updateSliderColor(value);
        updateButtons();
    });
    
    // Prevent click propagation to avoid collapsing
    slider.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    /**
     * Collapse slider on release (when user stops dragging)
     * Requirements: 14.4
     */
    slider.addEventListener('mouseup', () => {
        // Small delay to allow the final value to be set
        setTimeout(() => {
            collapsePowerSlider();
        }, 150);
    });
    
    slider.addEventListener('touchend', () => {
        // Small delay to allow the final value to be set
        setTimeout(() => {
            collapsePowerSlider();
        }, 150);
    });
    
    // Also collapse on change event (for keyboard/accessibility)
    slider.addEventListener('change', () => {
        setTimeout(() => {
            collapsePowerSlider();
        }, 150);
    });
    
    sliderContainer.appendChild(slider);
    container.appendChild(sliderContainer);
    
    return container;
}

/**
 * Expands the power slider from the left
 * Requirements: 14.1
 */
function expandPowerSlider() {
    if (powerSliderElement && !powerSliderExpanded) {
        powerSliderElement.classList.remove('collapsed');
        powerSliderElement.classList.add('expanded');
        powerSliderExpanded = true;
    }
}

/**
 * Collapses the power slider
 * Requirements: 14.4 (collapse on release)
 */
function collapsePowerSlider() {
    if (powerSliderElement && powerSliderExpanded) {
        powerSliderElement.classList.remove('expanded');
        powerSliderElement.classList.add('collapsed');
        powerSliderExpanded = false;
    }
}

/**
 * Toggles the power slider expand/collapse state
 */
function togglePowerSlider() {
    if (powerSliderExpanded) {
        collapsePowerSlider();
    } else {
        expandPowerSlider();
    }
}

/**
 * Updates the power slider value from game state
 */
function updatePowerSliderValue(gameState) {
    if (powerSliderElement) {
        const slider = powerSliderElement.querySelector('.power-range-expandable');
        if (slider) {
            slider.value = gameState.power;
            // Update color
            const value = gameState.power;
            let hue;
            if (value <= 50) {
                hue = 240 - (value * 2.4);
            } else {
                hue = 120 - ((value - 50) * 2.4);
            }
            slider.style.setProperty('--power-color', `hsl(${hue}, 80%, 50%)`);
        }
    }
}

/**
 * Toggles the club selector expand/collapse state
 */
function toggleClubSelector() {
    if (clubSelectorExpanded) {
        collapseClubSelector();
    } else {
        expandClubSelector();
    }
}

// Shape slider state
let shapeSliderElement = null;
let shapeSliderExpanded = false;

// Shape values mapping: slider value to shape name
const shapeValues = {
    '-2': 'Hook',
    '-1': 'Draw',
    '0': 'Straight',
    '1': 'Fade',
    '2': 'Slice'
};

/**
 * Creates the shape slider component - horizontal slider with curve symbols
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */
function createShapeSlider(gameState, updateButtons) {
    const container = document.createElement('div');
    container.className = 'shape-slider-expandable collapsed';
    
    // Slider track container
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'shape-slider-track';
    
    // Visual curve indicators showing expected ball flight path
    // Requirements: 15.2, 15.4
    const curveDisplay = document.createElement('div');
    curveDisplay.className = 'curve-display';
    curveDisplay.innerHTML = `
        <span class="curve-indicator curve-hook" data-value="-2" title="Hook">↩</span>
        <span class="curve-indicator curve-draw" data-value="-1" title="Draw">↰</span>
        <span class="curve-indicator curve-straight" data-value="0" title="Straight">↑</span>
        <span class="curve-indicator curve-fade" data-value="1" title="Fade">↱</span>
        <span class="curve-indicator curve-slice" data-value="2" title="Slice">↪</span>
    `;
    
    // The range input slider
    // Requirements: 15.3 - Range from hard hook (-2) to hard slice (2) with straight (0) in center
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = -2;  // Hard hook
    slider.max = 2;   // Hard slice
    slider.value = getShapeValue(gameState.shape); // Current shape
    slider.step = 1;
    slider.className = 'shape-range-expandable';
    
    /**
     * Updates the curve indicator highlights based on slider value
     */
    function updateCurveHighlight(value) {
        curveDisplay.querySelectorAll('.curve-indicator').forEach(indicator => {
            if (indicator.dataset.value === String(value)) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });
    }
    
    // Initialize highlight
    updateCurveHighlight(slider.value);
    
    // Handle slider input
    slider.addEventListener('input', (e) => {
        e.stopPropagation();
        // Transition from StartOfHole to PreShot when player starts shot setup
        // Validates: Requirements 2.1, 6.1-6.4
        transitionToPreShotIfNeeded();
        const value = parseInt(slider.value);
        gameState.shape = shapeValues[String(value)];
        updateCurveHighlight(value);
        updateButtons();
    });
    
    // Prevent click propagation to avoid collapsing
    slider.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Allow clicking on curve indicators to set value
    curveDisplay.querySelectorAll('.curve-indicator').forEach(indicator => {
        indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            // Transition from StartOfHole to PreShot when player starts shot setup
            // Validates: Requirements 2.1, 6.1-6.4
            transitionToPreShotIfNeeded();
            const value = parseInt(indicator.dataset.value);
            slider.value = value;
            gameState.shape = shapeValues[String(value)];
            updateCurveHighlight(value);
            updateButtons();
        });
    });
    
    /**
     * Collapse slider on release (when user stops dragging)
     * Requirements: 15.5 (collapse on release)
     */
    slider.addEventListener('mouseup', () => {
        // Small delay to allow the final value to be set
        setTimeout(() => {
            collapseShapeSlider();
        }, 150);
    });
    
    slider.addEventListener('touchend', () => {
        // Small delay to allow the final value to be set
        setTimeout(() => {
            collapseShapeSlider();
        }, 150);
    });
    
    // Also collapse on change event (for keyboard/accessibility)
    slider.addEventListener('change', () => {
        setTimeout(() => {
            collapseShapeSlider();
        }, 150);
    });
    
    sliderContainer.appendChild(curveDisplay);
    sliderContainer.appendChild(slider);
    container.appendChild(sliderContainer);
    
    return container;
}

/**
 * Gets the numeric value for a shape name
 */
function getShapeValue(shapeName) {
    for (const [value, name] of Object.entries(shapeValues)) {
        if (name === shapeName) {
            return parseInt(value);
        }
    }
    return 0; // Default to straight
}

/**
 * Expands the shape slider from the left
 * Requirements: 15.1
 */
function expandShapeSlider() {
    if (shapeSliderElement && !shapeSliderExpanded) {
        shapeSliderElement.classList.remove('collapsed');
        shapeSliderElement.classList.add('expanded');
        shapeSliderExpanded = true;
    }
}

/**
 * Collapses the shape slider
 * Requirements: 15.5 (collapse on release)
 */
function collapseShapeSlider() {
    if (shapeSliderElement && shapeSliderExpanded) {
        shapeSliderElement.classList.remove('expanded');
        shapeSliderElement.classList.add('collapsed');
        shapeSliderExpanded = false;
    }
}

/**
 * Toggles the shape slider expand/collapse state
 */
function toggleShapeSlider() {
    if (shapeSliderExpanded) {
        collapseShapeSlider();
    } else {
        expandShapeSlider();
    }
}

/**
 * Updates the shape slider value from game state
 */
function updateShapeSliderValue(gameState) {
    if (shapeSliderElement) {
        const slider = shapeSliderElement.querySelector('.shape-range-expandable');
        const curveDisplay = shapeSliderElement.querySelector('.curve-display');
        if (slider && curveDisplay) {
            const value = getShapeValue(gameState.shape);
            slider.value = value;
            // Update curve highlight
            curveDisplay.querySelectorAll('.curve-indicator').forEach(indicator => {
                if (indicator.dataset.value === String(value)) {
                    indicator.classList.add('active');
                } else {
                    indicator.classList.remove('active');
                }
            });
        }
    }
}

/**
 * Updates the selected club highlight in the selector
 * Requirements: 13.5
 */
function updateClubSelectorHighlight(gameState) {
    if (clubSelectorElement) {
        clubSelectorElement.querySelectorAll('.club-selector-item').forEach(item => {
            if (item.dataset.club === gameState.club.name) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
}

/**
 * Calculates the distance from ball to hole in yards
 * @param {Object} ballPos - Ball position {x, y}
 * @param {Object} holePos - Hole position {x, y}
 * @returns {number} Distance in yards
 */
function calculateYardageToHole(ballPos, holePos) {
    if (!ballPos || !holePos) return 0;
    const dx = holePos.x - ballPos.x;
    const dy = holePos.y - ballPos.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Updates the yardage indicator strip - always shows "Yardage Book"
 * @param {Object} gameState - Current game state with currentHole
 * @param {Object} ball - Ball object with getPosition()
 */
export function updateYardageIndicator(gameState, ball) {
    const yardageIndicator = document.getElementById('yardage-indicator');
    if (!yardageIndicator) return;
    
    const textElement = yardageIndicator.querySelector('.yardage-indicator-text');
    if (!textElement) return;
    
    // Always show "Yardage Book" - no distance display
    textElement.textContent = 'Yardage Book';
}

export function setupUI(gameState, aimLine, ball, onHitShot, world = null, objectsToHide = []) {
    // Pass world reference to yardage book for capturing
    if (world) {
        setYardageBookWorld(world);
    }
    // Pass objects to hide during capture (like aim line)
    setObjectsToHide(objectsToHide);
    // Pass ball reference for position display on green map
    if (ball) {
        setYardageBookBall(ball);
    }
    const btnClub = document.getElementById('btn-club');
    const btnPower = document.getElementById('btn-power');
    const btnShape = document.getElementById('btn-shape');
    const btnAim = document.getElementById('btn-aim');
    const btnYardage = document.getElementById('btn-yardage');
    const yardageIndicator = document.getElementById('yardage-indicator');
    
    // Setup yardage indicator strip at bottom
    // Requirements: 11.3, 11.5 - Yardage indicator shows current yardage and opens yardage book on tap
    if (yardageIndicator) {
        // Tap to open yardage book
        yardageIndicator.addEventListener('click', () => {
            // Collapse any open sliders
            collapseClubSelector();
            collapsePowerSlider();
            collapseShapeSlider();
            showYardageBook(gameState.currentHole);
        });
        
        // Swipe-up gesture detection for opening yardage book
        // Requirements: 11.1 - When user swipes up from the bottom area, open yardage book as full-screen overlay
        let yardageTouchStartY = 0;
        let yardageTouchStartX = 0;
        const SWIPE_UP_THRESHOLD = 50; // Minimum upward movement in pixels to trigger swipe
        
        yardageIndicator.addEventListener('touchstart', (e) => {
            yardageTouchStartY = e.touches[0].clientY;
            yardageTouchStartX = e.touches[0].clientX;
        }, { passive: true });
        
        yardageIndicator.addEventListener('touchend', (e) => {
            const touchEndY = e.changedTouches[0].clientY;
            const touchEndX = e.changedTouches[0].clientX;
            const deltaY = yardageTouchStartY - touchEndY; // Positive when swiping up
            const deltaX = Math.abs(touchEndX - yardageTouchStartX);
            
            // Check for swipe up: upward movement exceeds threshold and is more vertical than horizontal
            if (deltaY > SWIPE_UP_THRESHOLD && deltaY > deltaX) {
                // Collapse any open sliders
                collapseClubSelector();
                collapsePowerSlider();
                collapseShapeSlider();
                showYardageBook(gameState.currentHole);
            }
        }, { passive: true });
        
        // Initial yardage update
        updateYardageIndicator(gameState, ball);
    }

    // Initialize putter distance if not set
    if (!gameState.putterDistance) {
        gameState.putterDistance = 30; // Default 30 ft putt
    }
    
    // Create and attach club selector to the left controls
    const leftControls = document.querySelector('.left-controls');
    if (leftControls && !clubSelectorElement) {
        clubSelectorElement = createClubSelector(gameState, updateButtons);
        // Insert after the club button
        btnClub.parentNode.insertBefore(clubSelectorElement, btnClub.nextSibling);
    }
    
    // Create and attach power slider to the left controls
    if (leftControls && !powerSliderElement) {
        powerSliderElement = createPowerSlider(gameState, updateButtons);
        // Insert after the power button
        btnPower.parentNode.insertBefore(powerSliderElement, btnPower.nextSibling);
    }
    
    // Create and attach shape slider to the left controls
    if (leftControls && !shapeSliderElement) {
        shapeSliderElement = createShapeSlider(gameState, updateButtons);
        // Insert after the shape button
        btnShape.parentNode.insertBefore(shapeSliderElement, btnShape.nextSibling);
    }
    
    updateButtons();

    // Club button now toggles the expandable selector
    btnClub.addEventListener('click', () => {
        // Collapse power slider and shape slider if open
        collapsePowerSlider();
        collapseShapeSlider();
        // Transition from StartOfHole to PreShot when player starts shot setup
        // Validates: Requirements 2.1, 6.1-6.4
        transitionToPreShotIfNeeded();
        toggleClubSelector();
    });
    
    // Power button toggles the expandable slider (or shows modal for putter)
    btnPower.addEventListener('click', () => {
        // Collapse club selector and shape slider if open
        collapseClubSelector();
        collapseShapeSlider();
        // Transition from StartOfHole to PreShot when player starts shot setup
        // Validates: Requirements 2.1, 6.1-6.4
        transitionToPreShotIfNeeded();
        if (isPutter(gameState.club)) {
            // Putter uses modal for distance selection
            collapsePowerSlider();
            showPutterDistanceModal();
        } else {
            // Regular clubs use expandable slider
            togglePowerSlider();
        }
    });
    btnShape.addEventListener('click', () => {
        // Collapse club selector and power slider if open
        collapseClubSelector();
        collapsePowerSlider();
        // Transition from StartOfHole to PreShot when player starts shot setup
        // Validates: Requirements 2.1, 6.1-6.4
        transitionToPreShotIfNeeded();
        // No shot shape for putter - use expandable slider for other clubs
        if (!isPutter(gameState.club)) {
            toggleShapeSlider();
        }
    });
    btnAim.addEventListener('click', () => {
        // Collapse club selector, power slider, and shape slider if open
        collapseClubSelector();
        collapsePowerSlider();
        collapseShapeSlider();
        // Transition from StartOfHole to PreShot when player starts shot setup
        // Validates: Requirements 2.1, 6.1-6.4
        transitionToPreShotIfNeeded();
        const isActive = aimLine.toggleAimMode();
        // Crosshairs symbol: ⊕ when inactive, ✓ when setting aim
        btnAim.textContent = isActive ? '✓' : '⊕';
        // Toggle active class for visual highlighting
        // Requirements: 16.2 - Aim button shall be visually highlighted when aim mode is active
        if (isActive) {
            btnAim.classList.add('active');
        } else {
            btnAim.classList.remove('active');
        }
    });

    if (btnYardage) {
        btnYardage.addEventListener('click', () => {
            // Collapse club selector, power slider, and shape slider if open
            collapseClubSelector();
            collapsePowerSlider();
            collapseShapeSlider();
            showYardageBook(gameState.currentHole);
        });
    }
    
    // Double-tap/click on the golf hole to hit shot
    // Requirements: 16.3, 16.4, 16.5 - Shot execution works regardless of aim mode
    // The shot uses the current aim angle (aimLine.getAngle() is called in hitShot())
    // Note: Shot is disabled while in aim mode to prevent accidental shots
    const golfHole = document.querySelector('.golf-hole');
    golfHole.addEventListener('dblclick', (e) => {
        // Don't allow shots while in aim mode
        if (aimLine.isAimMode) {
            return;
        }
        onHitShot();
    });
    
    // Click elsewhere to collapse club selector, power slider, and shape slider
    document.addEventListener('click', (e) => {
        // Check if click is outside the club selector and club button
        if (clubSelectorExpanded && 
            !e.target.closest('.club-selector') && 
            !e.target.closest('#btn-club')) {
            collapseClubSelector();
        }
        // Check if click is outside the power slider and power button
        if (powerSliderExpanded && 
            !e.target.closest('.power-slider-expandable') && 
            !e.target.closest('#btn-power')) {
            collapsePowerSlider();
        }
        // Check if click is outside the shape slider and shape button
        if (shapeSliderExpanded && 
            !e.target.closest('.shape-slider-expandable') && 
            !e.target.closest('#btn-shape')) {
            collapseShapeSlider();
        }
    });

    function updateButtons() {
        // Use abbreviated club names (Requirement 9)
        btnClub.textContent = clubAbbreviations[gameState.club.name] || gameState.club.name;
        
        // Show ft for putter, % for other clubs
        if (isPutter(gameState.club)) {
            btnPower.textContent = gameState.putterDistance + ' ft';
            btnShape.textContent = '-';
            btnShape.classList.add('disabled');
        } else {
            btnPower.textContent = gameState.power + '%';
            // Use arrow symbols for shape (Requirement 9)
            btnShape.textContent = shapeArrows[gameState.shape] || gameState.shape;
            btnShape.classList.remove('disabled');
        }
    }

    function showModal(content) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = content;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        
        return { overlay, modal };
    }

    function showClubModal() {
        let html = '<div class="modal-title">Select Club</div><div class="club-list">';
        clubs.forEach((club, i) => {
            const selected = club.name === gameState.club.name ? ' selected' : '';
            html += `<div class="club-item${selected}" data-index="${i}">
                <span class="club-name">${club.name}</span>
            </div>`;
        });
        html += '</div>';
        
        const { overlay, modal } = showModal(html);
        modal.querySelectorAll('.club-item').forEach(item => {
            item.addEventListener('click', () => {
                gameState.club = clubs[item.dataset.index];
                updateButtons();
                overlay.remove();
            });
        });
    }

    function showPowerModal() {
        const html = `
            <div class="modal-title">Power</div>
            <div class="power-display">${gameState.power}%</div>
            <input type="range" class="power-slider" min="0" max="100" value="${gameState.power}">
            <div class="power-labels"><span>0%</span><span>50%</span><span>100%</span></div>
        `;
        
        const { overlay, modal } = showModal(html);
        const slider = modal.querySelector('.power-slider');
        const display = modal.querySelector('.power-display');
        
        slider.addEventListener('input', () => {
            gameState.power = parseInt(slider.value);
            display.textContent = gameState.power + '%';
            updateButtons();
        });
    }

    function showPutterDistanceModal() {
        const html = `
            <div class="modal-title">Putt Distance</div>
            <div class="power-display">${gameState.putterDistance} ft</div>
            <input type="range" class="power-slider" min="1" max="100" value="${gameState.putterDistance}">
            <div class="power-labels"><span>1 ft</span><span>50 ft</span><span>100 ft</span></div>
        `;
        
        const { overlay, modal } = showModal(html);
        const slider = modal.querySelector('.power-slider');
        const display = modal.querySelector('.power-display');
        
        slider.addEventListener('input', () => {
            gameState.putterDistance = parseInt(slider.value);
            display.textContent = gameState.putterDistance + ' ft';
            updateButtons();
        });
    }

    function showShapeModal() {
        let html = '<div class="modal-title">Shot Shape</div><div class="shape-list">';
        shapes.forEach(shape => {
            const selected = shape === gameState.shape ? ' selected' : '';
            html += `<div class="shape-item${selected}" data-shape="${shape}">${shape}</div>`;
        });
        html += '</div>';
        
        const { overlay, modal } = showModal(html);
        modal.querySelectorAll('.shape-item').forEach(item => {
            item.addEventListener('click', () => {
                gameState.shape = item.dataset.shape;
                updateButtons();
                overlay.remove();
            });
        });
    }
}


// Simulate putt button state
let simulatePuttBtn = null;
let simulatePuttCallback = null;
let simulatePuttDisabled = false;

/**
 * Creates and manages the floating simulate putt button
 * Only visible when putter is selected
 */
export function createSimulatePuttButton(container, gameState, onSimulate) {
    simulatePuttCallback = onSimulate;
    
    // Create button if it doesn't exist
    if (!simulatePuttBtn) {
        simulatePuttBtn = document.createElement('button');
        simulatePuttBtn.className = 'control-btn simulate-putt-btn hidden';
        simulatePuttBtn.textContent = 'Read';
        simulatePuttBtn.addEventListener('click', () => {
            if (!simulatePuttDisabled && simulatePuttCallback) {
                simulatePuttCallback();
            }
        });
        
        // Find the speak button and insert before it, or at beginning if not found
        const speakBtn = container.querySelector('.speak-btn');
        if (speakBtn) {
            container.insertBefore(simulatePuttBtn, speakBtn);
        } else {
            container.insertBefore(simulatePuttBtn, container.firstChild);
        }
    }
    
    // Update visibility based on current club
    updateSimulatePuttButtonVisibility(gameState);
}

/**
 * Updates the simulate button visibility based on club selection
 */
export function updateSimulatePuttButtonVisibility(gameState) {
    if (!simulatePuttBtn) return;
    
    if (isPutter(gameState.club)) {
        simulatePuttBtn.classList.remove('hidden');
        if (simulatePuttDisabled) {
            simulatePuttBtn.classList.add('disabled');
        } else {
            simulatePuttBtn.classList.remove('disabled');
        }
    } else {
        simulatePuttBtn.classList.add('hidden');
    }
}

/**
 * Disables the simulate button (after use)
 */
export function disableSimulatePuttButton() {
    simulatePuttDisabled = true;
    if (simulatePuttBtn) {
        simulatePuttBtn.classList.add('disabled');
        simulatePuttBtn.textContent = 'Used';
    }
}

/**
 * Sets the button to simulating state
 */
export function setSimulatePuttButtonSimulating(isSimulating) {
    if (simulatePuttBtn) {
        if (isSimulating) {
            simulatePuttBtn.classList.add('simulating');
            simulatePuttBtn.textContent = '...';
        } else {
            simulatePuttBtn.classList.remove('simulating');
            simulatePuttBtn.textContent = simulatePuttDisabled ? 'Used' : 'Read';
        }
    }
}

/**
 * Re-enables the simulate button (for next shot)
 */
export function resetSimulatePuttButton() {
    simulatePuttDisabled = false;
    if (simulatePuttBtn) {
        simulatePuttBtn.classList.remove('disabled');
        simulatePuttBtn.classList.remove('simulating');
        simulatePuttBtn.textContent = 'Read';
    }
}


// Speak button state
// Requirements: 4.1, 4.2 - Speak button for caddy interaction
let speakBtn = null;
let speakBtnCallback = null;

/**
 * Creates the Speak button for caddy interaction
 * Square button with speech bubble icon, positioned above aim button on right side
 * Requirements: 4.1, 4.2
 * @param {HTMLElement} container - The container to append the button to (right-controls)
 * @param {Function} onClick - Callback when button is clicked
 */
export function createSpeakButton(container, onClick) {
    speakBtnCallback = onClick;
    
    // Create button if it doesn't exist
    if (!speakBtn) {
        speakBtn = document.createElement('button');
        speakBtn.className = 'control-btn speak-btn hidden';
        speakBtn.id = 'btn-speak';
        speakBtn.textContent = '💬'; // Speech bubble emoji icon
        speakBtn.title = 'Speak to golfer';
        
        speakBtn.addEventListener('click', () => {
            if (speakBtnCallback && canInteract()) {
                speakBtnCallback();
            }
        });
        
        // Insert at the beginning of container (above aim button)
        container.insertBefore(speakBtn, container.firstChild);
    }
    
    // Update visibility based on timing window
    updateSpeakButtonVisibility();
}

/**
 * Shows the Speak button
 * Requirements: 4.1
 */
export function showSpeakButton() {
    if (speakBtn) {
        speakBtn.classList.remove('hidden');
    }
}

/**
 * Hides the Speak button
 * Requirements: 4.1
 */
export function hideSpeakButton() {
    if (speakBtn) {
        speakBtn.classList.add('hidden');
    }
}

/**
 * Updates Speak button visibility based on timing window availability
 * Shows the button when interaction is allowed (canInteract() returns true)
 * Requirements: 4.1, 4.2
 */
export function updateSpeakButtonVisibility() {
    if (!speakBtn) return;
    
    if (canInteract()) {
        showSpeakButton();
    } else {
        hideSpeakButton();
    }
}
