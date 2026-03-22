// UI Manager - Handles UI updates and interactions
export class UIManager {
    constructor(editor) {
        this.editor = editor;
    }
    
    updateHoleSelect() {
        const select = document.getElementById('hole-select');
        select.innerHTML = '';
        
        this.editor.courseData.holes.forEach((hole, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Hole ${hole.number}`;
            select.appendChild(option);
        });
    }
    
    updateHoleProperties() {
        const hole = this.editor.courseData.getHole(this.editor.currentHoleIndex);
        if (!hole) return;
        
        document.getElementById('hole-par').value = hole.par;
        document.getElementById('hole-name').value = hole.name;
        
        // Calculate length from centreline
        const yards = this.calculateHoleLength(hole);
        document.getElementById('hole-yards-display').textContent = `${yards} yards`;
    }
    
    calculateHoleLength(hole) {
        const WORLD_TO_YARDS = 4;
        
        // If centreline exists, use it
        if (hole.centreline && hole.centreline.length >= 2) {
            let totalDist = 0;
            for (let i = 1; i < hole.centreline.length; i++) {
                const p1 = hole.centreline[i - 1];
                const p2 = hole.centreline[i];
                const dx = p2[0] - p1[0];
                const dy = p2[1] - p1[1];
                totalDist += Math.sqrt(dx * dx + dy * dy);
            }
            return Math.round(totalDist * WORLD_TO_YARDS);
        }
        
        // Fallback: straight line from tee to hole
        if (hole.tee && hole.hole) {
            const dx = hole.hole.x - hole.tee.x;
            const dy = hole.hole.y - hole.tee.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            return Math.round(dist * WORLD_TO_YARDS);
        }
        
        return 0;
    }
}
