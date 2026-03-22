/**
 * Yardage Book Module - Main Entry Point
 * 
 * Provides the main entry point for the yardage book overlay with:
 * - Tab management (hole, green, golfer, clubs, course)
 * - Swipe handling for tab navigation and closing
 * - Smooth open/close animations
 * 
 * Validates: Requirements 5.1, 5.4
 */

import { renderHoleTab } from './hole-tab.js';
import { renderGreenTab } from './green-tab.js';
import { renderGolferTab } from './golfer-tab.js';
import { renderClubsTab } from './clubs-tab.js';
import { renderCourseTab } from './course-tab.js';

const TABS = ['course', 'hole', 'green', 'clubs', 'golfer'];
let currentTabIndex = 0;
let touchStartX = 0;
let touchStartY = 0;
let isAnimating = false; // Prevent multiple animations at once

// References for external modules to set
let worldInstance = null;
let objectsToHideList = [];
let ballInstance = null;

/**
 * Set the world instance for capturing views.
 * @param {Object} world - The Three.js world/scene instance
 */
export function setYardageBookWorld(world) {
    worldInstance = world;
}

/**
 * Get the world instance.
 * @returns {Object} The world instance
 */
export function getWorldInstance() {
    return worldInstance;
}

/**
 * Set objects to hide during capture (aim line, ball, etc.).
 * @param {Array} objects - Array of Three.js objects to hide
 */
export function setObjectsToHide(objects) {
    objectsToHideList = objects || [];
}

/**
 * Set the ball instance for position display.
 * @param {Object} ball - The ball object
 */
export function setYardageBookBall(ball) {
    ballInstance = ball;
}

/**
 * Get the ball instance.
 * @returns {Object} The ball instance
 */
export function getBallInstance() {
    return ballInstance;
}

/**
 * Show the yardage book overlay for a given hole.
 * Creates the overlay, renders the current tab, sets up swipe handlers,
 * and animates the overlay open.
 * 
 * @param {Object} hole - The hole data object
 */
export function showYardageBook(hole) {
    const overlay = createOverlay();
    renderCurrentTab(overlay, hole);
    setupSwipeHandlers(overlay, hole);
    setupTabClickHandlers(overlay, hole);
    animateOpen(overlay);
}

/**
 * Create the yardage book overlay element with tab bar and content area.
 * @returns {HTMLElement} The overlay element
 */
function createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'yardage-overlay';
    overlay.innerHTML = `
        <div class="yardage-tabs">
            ${TABS.map((tab, i) => `
                <button class="tab-btn ${i === currentTabIndex ? 'active' : ''}" 
                        data-tab="${tab}" data-index="${i}">${tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
            `).join('')}
            <button class="yardage-close-btn" id="close-btn">✕</button>
        </div>
        <div class="yardage-content"></div>
        <div class="swipe-indicator">↓ Swipe down to close</div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Set up click handlers for tab buttons.
 * Uses animated transitions for smooth tab switching.
 * 
 * @param {HTMLElement} overlay - The overlay element
 * @param {Object} hole - The hole data object
 */
function setupTabClickHandlers(overlay, hole) {
    // Tab button click handlers
    overlay.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index, 10);
            if (!isNaN(index) && index !== currentTabIndex && !isAnimating) {
                // Determine direction based on tab index
                const direction = index > currentTabIndex ? 'left' : 'right';
                animateTabTransition(overlay, hole, index, direction);
            }
        });
    });
    
    // Close button handler
    const closeBtn = overlay.querySelector('#close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeYardageBook(overlay);
        });
    }
}

/**
 * Set up swipe gesture handlers for tab navigation and closing.
 * - Horizontal swipe: Navigate between tabs with smooth animation
 * - Vertical swipe down: Close the yardage book
 * 
 * Validates: Requirements 5.5
 * 
 * @param {HTMLElement} overlay - The overlay element
 * @param {Object} hole - The hole data object
 */
function setupSwipeHandlers(overlay, hole) {
    const content = overlay.querySelector('.yardage-content');
    let touchMoveX = 0;
    
    content.addEventListener('touchstart', (e) => {
        if (isAnimating) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchMoveX = touchStartX;
        
        // Remove transition during drag for responsive feel
        content.style.transition = 'none';
    }, { passive: true });
    
    content.addEventListener('touchmove', (e) => {
        if (isAnimating) return;
        touchMoveX = e.touches[0].clientX;
        const deltaX = touchMoveX - touchStartX;
        const deltaY = e.touches[0].clientY - touchStartY;
        
        // Only apply horizontal drag if horizontal movement is dominant
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            // Limit drag distance and add resistance at edges
            let translateX = deltaX;
            
            // Add resistance when at first or last tab
            if ((currentTabIndex === 0 && deltaX > 0) || 
                (currentTabIndex === TABS.length - 1 && deltaX < 0)) {
                translateX = deltaX * 0.3; // Resistance factor
            }
            
            content.style.transform = `translateX(${translateX}px)`;
        }
    }, { passive: true });
    
    content.addEventListener('touchend', (e) => {
        if (isAnimating) return;
        
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        
        const SWIPE_THRESHOLD_X = 50;
        const SWIPE_THRESHOLD_Y = 100;
        
        // Reset transform with animation
        content.style.transition = 'transform 0.3s ease-out';
        content.style.transform = 'translateX(0)';
        
        // Horizontal swipe for tab change
        if (Math.abs(deltaX) > SWIPE_THRESHOLD_X && Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0 && currentTabIndex > 0) {
                // Swipe right - go to previous tab
                animateTabTransition(overlay, hole, currentTabIndex - 1, 'right');
            } else if (deltaX < 0 && currentTabIndex < TABS.length - 1) {
                // Swipe left - go to next tab
                animateTabTransition(overlay, hole, currentTabIndex + 1, 'left');
            }
        }
        
        // Vertical swipe down to close
        if (deltaY > SWIPE_THRESHOLD_Y && Math.abs(deltaY) > Math.abs(deltaX)) {
            closeYardageBook(overlay);
        }
    }, { passive: true });
    
    // Also allow clicking outside content to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeYardageBook(overlay);
        }
    });
}

/**
 * Animate the transition between tabs with a smooth slide effect.
 * 
 * Validates: Requirements 5.5
 * 
 * @param {HTMLElement} overlay - The overlay element
 * @param {Object} hole - The hole data object
 * @param {number} newIndex - The index of the tab to transition to
 * @param {string} direction - The direction of the swipe ('left' or 'right')
 */
function animateTabTransition(overlay, hole, newIndex, direction) {
    if (isAnimating || newIndex === currentTabIndex) return;
    if (newIndex < 0 || newIndex >= TABS.length) return;
    
    isAnimating = true;
    const content = overlay.querySelector('.yardage-content');
    
    // Determine slide direction
    const slideOutX = direction === 'left' ? '-100%' : '100%';
    const slideInX = direction === 'left' ? '100%' : '-100%';
    
    // Slide out current content
    content.style.transition = 'transform 0.25s ease-in, opacity 0.25s ease-in';
    content.style.transform = `translateX(${slideOutX})`;
    content.style.opacity = '0';
    
    // After slide out, update content and slide in
    setTimeout(() => {
        // Update tab index
        currentTabIndex = newIndex;
        
        // Update tab buttons active state
        overlay.querySelectorAll('.tab-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === currentTabIndex);
        });
        
        // Clear and render new content
        content.innerHTML = '';
        const tabName = TABS[currentTabIndex];
        
        switch (tabName) {
            case 'hole':
                renderHoleTab(content, hole);
                break;
            case 'green':
                renderGreenTab(content, hole);
                break;
            case 'golfer':
                renderGolferTab(content, hole);
                break;
            case 'clubs':
                renderClubsTab(content, hole);
                break;
            case 'course':
                renderCourseTab(content, hole);
                break;
        }
        
        // Position for slide in
        content.style.transition = 'none';
        content.style.transform = `translateX(${slideInX})`;
        content.style.opacity = '0';
        
        // Force reflow
        content.offsetHeight;
        
        // Slide in new content
        content.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
        content.style.transform = 'translateX(0)';
        content.style.opacity = '1';
        
        // Animation complete
        setTimeout(() => {
            isAnimating = false;
            content.style.transition = '';
            content.style.transform = '';
        }, 250);
    }, 250);
}

/**
 * Render the current tab content.
 * Updates tab button active states and renders the appropriate tab.
 * 
 * @param {HTMLElement} overlay - The overlay element
 * @param {Object} hole - The hole data object
 */
function renderCurrentTab(overlay, hole) {
    const content = overlay.querySelector('.yardage-content');
    const tabName = TABS[currentTabIndex];
    
    // Update tab buttons active state
    overlay.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === currentTabIndex);
    });
    
    // Clear content
    content.innerHTML = '';
    
    // Render tab content
    switch (tabName) {
        case 'hole':
            renderHoleTab(content, hole);
            break;
        case 'green':
            renderGreenTab(content, hole);
            break;
        case 'golfer':
            renderGolferTab(content, hole);
            break;
        case 'clubs':
            renderClubsTab(content, hole);
            break;
        case 'course':
            renderCourseTab(content, hole);
            break;
    }
}

/**
 * Animate the overlay opening with a slide-up effect.
 * @param {HTMLElement} overlay - The overlay element
 */
function animateOpen(overlay) {
    // Start from bottom
    overlay.style.transform = 'translateY(100%)';
    overlay.style.opacity = '0';
    
    // Force reflow
    overlay.offsetHeight;
    
    // Animate to visible
    overlay.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
    overlay.style.transform = 'translateY(0)';
    overlay.style.opacity = '1';
}

/**
 * Close the yardage book with a slide-down animation.
 * @param {HTMLElement} overlay - The overlay element
 */
function closeYardageBook(overlay) {
    overlay.style.transition = 'transform 0.3s ease-in, opacity 0.3s ease-in';
    overlay.style.transform = 'translateY(100%)';
    overlay.style.opacity = '0';
    
    // Remove after animation completes
    setTimeout(() => {
        overlay.remove();
    }, 300);
}
