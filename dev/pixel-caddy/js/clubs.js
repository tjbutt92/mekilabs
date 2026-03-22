// Club data - scratch golfer carry distances
import { gaussianRandom } from './utils.js';

export const clubs = [
    { name: 'Driver', yards: 280 },
    { name: '3 Wood', yards: 250 },
    { name: '5 Wood', yards: 230 },
    { name: '4 Iron', yards: 210 },
    { name: '5 Iron', yards: 195 },
    { name: '6 Iron', yards: 180 },
    { name: '7 Iron', yards: 165 },
    { name: '8 Iron', yards: 150 },
    { name: '9 Iron', yards: 135 },
    { name: 'PW', yards: 120 },
    { name: 'GW', yards: 105 },
    { name: 'SW', yards: 90 },
    { name: 'LW', yards: 70 },
    { name: 'Putter', yards: 0 }
];

// Clubs without putter (for shot history/yardage calculations)
export const shotClubs = clubs.filter(c => c.name !== 'Putter');

// Re-export gaussianRandom for backward compatibility
export { gaussianRandom };

export function rollMissType(missPattern) {
    const total = Object.values(missPattern).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (const [type, weight] of Object.entries(missPattern)) {
        roll -= weight;
        if (roll <= 0) return type;
    }
    return 'push';
}
