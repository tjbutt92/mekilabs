// Golf Course Editor - Main Entry Point
import { EditorCanvas } from './canvas.js';
import { ToolManager } from './tools.js';
import { CourseData } from './courseData.js';
import { CodeGenerator } from './codeGenerator.js';
import { UIManager } from './ui.js';

class CourseEditor {
    constructor() {
        this.canvas = null;
        this.tools = null;
        this.courseData = null;
        this.codeGen = null;
        this.ui = null;
        
        this.currentHoleIndex = 0;
        this.init();
    }
    
    init() {
        // Initialize course data
        this.courseData = new CourseData();
        
        // Initialize canvas
        const container = document.getElementById('canvas-container');
        const canvasEl = document.getElementById('editor-canvas');
        this.canvas = new EditorCanvas(canvasEl, container, this.courseData);
        
        // Initialize tools
        this.tools = new ToolManager(this.canvas, this.courseData);
        
        // Initialize code generator
        this.codeGen = new CodeGenerator(this.courseData);
        
        // Initialize UI
        this.ui = new UIManager(this);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Try to load test course from localStorage, otherwise start fresh
        this.tryLoadSavedCourse();
        
        // Initial render
        this.canvas.render();
        
        console.log('Course Editor initialized');
    }
    
    tryLoadSavedCourse() {
        // Try to load from localStorage
        const savedData = localStorage.getItem('golf_course_Test Course');
        if (savedData) {
            try {
                this.courseData.import(JSON.parse(savedData));
                this.ui.updateHoleSelect();
                this.ui.updateHoleProperties();
                document.getElementById('course-name').value = this.courseData.name;
                console.log('Loaded saved course from localStorage');
            } catch (e) {
                console.error('Failed to load saved course:', e);
            }
        }
    }
    
    setupEventListeners() {
        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = btn.dataset.tool;
                const terrain = btn.dataset.terrain;
                this.tools.setTool(tool, terrain);
                
                // Update active state
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Show/hide tree type panel
                const treePanel = document.getElementById('tree-type-panel');
                treePanel.style.display = tool === 'tree' ? 'block' : 'none';
                
                // Show/hide centreline panel
                const centrelinePanel = document.getElementById('centreline-panel');
                centrelinePanel.style.display = tool === 'centreline' ? 'block' : 'none';
            });
        });
        
        // Zoom slider
        document.getElementById('zoom-slider').addEventListener('input', (e) => {
            const zoom = parseFloat(e.target.value);
            this.canvas.setZoom(zoom);
            document.getElementById('zoom-display').textContent = Math.round(zoom * 100) + '%';
        });
        
        // Layer toggles
        ['grid', 'elevation', 'terrain', 'trees', 'markers', 'sprinklers', 'measurePoints', 'centreline', 'nodes'].forEach(layer => {
            document.getElementById(`layer-${layer}`).addEventListener('change', (e) => {
                this.canvas.setLayerVisible(layer, e.target.checked);
            });
        });
        
        // Hole selection
        document.getElementById('hole-select').addEventListener('change', (e) => {
            this.currentHoleIndex = parseInt(e.target.value);
            this.canvas.setCurrentHole(this.currentHoleIndex);
            this.ui.updateHoleProperties();
        });
        
        // Add hole button
        document.getElementById('btn-add-hole').addEventListener('click', () => {
            this.courseData.addHole();
            this.ui.updateHoleSelect();
            this.currentHoleIndex = this.courseData.holes.length - 1;
            document.getElementById('hole-select').value = this.currentHoleIndex;
            this.canvas.setCurrentHole(this.currentHoleIndex);
        });
        
        // Delete selected
        document.getElementById('btn-delete').addEventListener('click', () => {
            this.canvas.deleteSelected();
        });
        
        // Clear centreline
        document.getElementById('btn-clear-centreline').addEventListener('click', () => {
            if (confirm('Clear the centreline for this hole?')) {
                this.tools.clearCentreline();
            }
        });
        
        // Generate code
        document.getElementById('btn-generate').addEventListener('click', () => {
            const code = this.codeGen.generate();
            document.getElementById('code-output').value = code;
            // Auto-expand the output panel
            document.getElementById('output-panel').classList.add('expanded');
            document.getElementById('btn-toggle-output').textContent = 'Collapse ▼';
        });
        
        // Copy to clipboard
        document.getElementById('btn-copy').addEventListener('click', () => {
            const output = document.getElementById('code-output');
            if (!output.value) {
                alert('Generate code first!');
                return;
            }
            // Use modern clipboard API
            navigator.clipboard.writeText(output.value).then(() => {
                const btn = document.getElementById('btn-copy');
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                btn.style.background = '#5cb85c';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '';
                }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                output.select();
                document.execCommand('copy');
                alert('Code copied to clipboard!');
            });
        });
        
        // Toggle output panel
        document.getElementById('btn-toggle-output').addEventListener('click', () => {
            const panel = document.getElementById('output-panel');
            const btn = document.getElementById('btn-toggle-output');
            panel.classList.toggle('expanded');
            btn.textContent = panel.classList.contains('expanded') ? 'Collapse ▼' : 'Expand ▲';
        });
        
        // Hole properties
        ['hole-par', 'hole-name'].forEach(id => {
            document.getElementById(id).addEventListener('change', (e) => {
                const hole = this.courseData.holes[this.currentHoleIndex];
                if (id === 'hole-par') hole.par = parseInt(e.target.value);
                if (id === 'hole-name') hole.name = e.target.value;
            });
        });
        
        // Smoothing options
        document.getElementById('opt-smooth').addEventListener('change', (e) => {
            this.tools.setSmoothingEnabled(e.target.checked);
        });
        
        document.getElementById('smooth-amount').addEventListener('change', (e) => {
            this.tools.setSmoothingAmount(parseInt(e.target.value));
        });
        
        // Grid snap
        document.getElementById('opt-snap').addEventListener('change', (e) => {
            this.tools.setSnapEnabled(e.target.checked);
        });
        
        document.getElementById('grid-size').addEventListener('change', (e) => {
            this.tools.setGridSize(parseInt(e.target.value));
        });
        
        // Tree type selection
        document.getElementById('tree-type').addEventListener('change', (e) => {
            this.tools.setTreeType(e.target.value);
        });
        
        // Elevation brush controls
        document.getElementById('elev-brush-size').addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            this.tools.setElevationBrushSize(size);
            document.getElementById('elev-brush-display').textContent = size;
        });
        
        document.getElementById('elev-strength').addEventListener('input', (e) => {
            const strength = parseInt(e.target.value);
            this.tools.setElevationStrength(strength);
            document.getElementById('elev-strength-display').textContent = strength;
        });
        
        // Course name
        document.getElementById('course-name').addEventListener('change', (e) => {
            this.courseData.name = e.target.value;
        });
        
        // Save/Load (placeholder for now)
        document.getElementById('btn-save').addEventListener('click', () => {
            this.saveCourse();
        });
        
        document.getElementById('btn-load').addEventListener('click', () => {
            this.loadCourse();
        });
        
        // Import JS file
        document.getElementById('btn-import').addEventListener('click', () => {
            document.getElementById('file-import').click();
        });
        
        document.getElementById('file-import').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importCourseFile(file);
            }
        });
        
        // Course file dropdown
        document.getElementById('course-file-select').addEventListener('change', (e) => {
            const path = e.target.value;
            if (path) {
                this.loadCourseFromPath(path);
            }
        });
    }
    
    saveCourse() {
        const data = JSON.stringify(this.courseData.export());
        localStorage.setItem('golf_course_' + this.courseData.name, data);
        alert('Course saved to local storage!');
    }
    
    loadCourse() {
        const name = document.getElementById('course-name').value;
        const data = localStorage.getItem('golf_course_' + name);
        if (data) {
            this.courseData.import(JSON.parse(data));
            this.ui.updateHoleSelect();
            this.canvas.render();
            alert('Course loaded!');
        } else {
            alert('No saved course found with that name.');
        }
    }
    
    importCourseFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const courseData = this.parseCourseJS(content);
                if (courseData) {
                    this.courseData.import(courseData);
                    this.ui.updateHoleSelect();
                    this.ui.updateHoleProperties();
                    document.getElementById('course-name').value = this.courseData.name;
                    this.canvas.render();
                    alert('Course imported successfully!');
                }
            } catch (err) {
                console.error('Import error:', err);
                alert('Failed to import course file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }
    
    parseCourseJS(content) {
        // Extract the course object from the JS file
        // Remove import statements
        let cleaned = content.replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '');
        
        // Remove export statements at the end like "export const hole1 = ..."
        cleaned = cleaned.replace(/export\s+const\s+hole\d+\s*=.*?;/g, '');
        
        // Define mock TerrainType and TreeType objects
        const TerrainType = {
            TEE: 'teeBox',
            TEEBOX: 'teeBox',
            FAIRWAY: 'fairway',
            ROUGH: 'rough',
            GREEN: 'green',
            BUNKER: 'bunker',
            WATER: 'water',
            OUT_OF_BOUNDS: 'outOfBounds',
            OOB: 'outOfBounds',
            PATH: 'path'
        };
        
        const TreeType = {
            TALL_PINE_1: 'TALL_PINE_1',
            TALL_PINE_2: 'TALL_PINE_2',
            TALL_PINE_3: 'TALL_PINE_3',
            BUSHY_PINE_1: 'BUSHY_PINE_1',
            BUSHY_PINE_2: 'BUSHY_PINE_2',
            BUSHY_PINE_3: 'BUSHY_PINE_3',
            DECIDUOUS_1: 'DECIDUOUS_1',
            DECIDUOUS_2: 'DECIDUOUS_2',
            DECIDUOUS_3: 'DECIDUOUS_3'
        };
        
        // Find and extract just the course object definition
        const courseMatch = cleaned.match(/(?:export\s+)?const\s+course\s*=\s*(\{[\s\S]*\});?\s*$/m);
        if (!courseMatch) {
            throw new Error('Could not find course object in file');
        }
        
        let courseObjStr = courseMatch[1];
        
        // Use Function constructor to safely evaluate (safer than eval)
        try {
            const fn = new Function('TerrainType', 'TreeType', `return ${courseObjStr};`);
            const course = fn(TerrainType, TreeType);
            
            // Ensure all holes have centreline array
            if (course.holes) {
                course.holes.forEach(hole => {
                    if (!hole.centreline) hole.centreline = [];
                });
            }
            
            // Ensure terrain dictionary exists
            if (!course.terrain) {
                course.terrain = {
                    fairway: [],
                    rough: [],
                    bunker: [],
                    water: [],
                    green: [],
                    teeBox: [],
                    outOfBounds: [],
                    path: []
                };
            }
            
            // Ensure trees array exists
            if (!course.trees) {
                course.trees = [];
            }
            
            // Ensure sprinkler heads array exists
            if (!course.sprinklerHeads) {
                course.sprinklerHeads = [];
            }
            
            // Ensure measure points array exists
            if (!course.measurePoints) {
                course.measurePoints = [];
            }
            
            return course;
        } catch (parseErr) {
            console.error('Parse error:', parseErr);
            throw new Error('Failed to parse course data: ' + parseErr.message);
        }
    }
    
    async loadCourseFromPath(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${path}: ${response.status}`);
            }
            const content = await response.text();
            const courseData = this.parseCourseJS(content);
            if (courseData) {
                this.courseData.import(courseData);
                this.ui.updateHoleSelect();
                this.ui.updateHoleProperties();
                document.getElementById('course-name').value = this.courseData.name;
                this.canvas.render();
                console.log(`Loaded course from ${path}`);
            }
        } catch (err) {
            console.error('Load error:', err);
            alert('Failed to load course file: ' + err.message);
        }
        // Reset dropdown
        document.getElementById('course-file-select').value = '';
    }
}

// Initialize editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.editor = new CourseEditor();
});
