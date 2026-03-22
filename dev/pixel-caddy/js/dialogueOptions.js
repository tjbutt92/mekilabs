// Dialogue Options Database
// Defines all dialogue options for the caddy system with base effects and scaling rules
// Validates: Requirements 6.1-6.4, 7.1-7.11, 8.1-8.10, 9.1-9.4

import { ShotOutcome, Trend } from './resultState.js';

/**
 * Start-of-hole dialogue options
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */
export const startOfHoleOptions = [
    {
        id: 'lets_go',
        text: "Let's go, you got this",
        baseEffects: { confidence: 15, pressure: 5, trust: 3 },
        scalingRules: [
            { condition: (state) => state.trend === Trend.Hot, stat: 'confidence', bonus: 5 },
            { condition: (state) => state.trend === Trend.Cold, stat: 'confidence', scale: 1.33 }
        ],
        effectType: 'encouragement'
    },
    {
        id: 'steady_start',
        text: "Steady start",
        baseEffects: { focus: 12, pressure: -10, trust: 4 },
        scalingRules: [
            { condition: (state) => state.previousHoleScore > 0, stat: 'focus', scale: 1.25 }
        ],
        effectType: 'calming'
    },
    {
        id: 'chill_out_start',
        text: "Chill out",
        baseEffects: { pressure: -15, focus: 8 },
        scalingRules: [
            { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.33 },
            { condition: (state) => state.trend === Trend.Hot, stat: 'pressure', scale: 0.67 }
        ],
        effectType: 'calming'
    },
    {
        id: 'keep_momentum',
        text: "Keep the momentum",
        baseEffects: { confidence: 10, focus: 5, trust: 2 },
        scalingRules: [
            { condition: (state) => state.trend === Trend.Hot, stat: 'confidence', scale: 1.5 },
            { condition: (state) => state.trend === Trend.Hot, stat: 'focus', scale: 1.5 },
            { condition: (state) => state.trend === Trend.Hot, stat: 'trust', scale: 1.5 },
            { condition: (state) => state.trend === Trend.Cold, stat: 'confidence', scale: 0.5 },
            { condition: (state) => state.trend === Trend.Cold, stat: 'focus', scale: 0.5 },
            { condition: (state) => state.trend === Trend.Cold, stat: 'trust', scale: 0.5 }
        ],
        effectType: 'momentum'
    }
];


/**
 * Pre-shot dialogue options
 * Validates: Requirements 7.1-7.11
 */
export const preShotOptions = [
    {
        id: 'what_think',
        text: "What do you think?",
        action: 'runSimulation',
        baseEffects: { trust: 6 },  // Applied on accept
        overrideEffects: { trust: -10 },  // Applied on override with worse result
        scalingRules: [],
        effectType: 'consultation'
    },
    {
        id: 'what_concerns',
        text: "What concerns you?",
        action: 'flagHazards',
        baseEffects: { trust: 5 },  // Applied on adjustment
        ignoreEffects: { trust: -4, pressure: 5 },  // Applied on ignore
        scalingRules: [],
        effectType: 'consultation'
    },
    {
        id: 'lets_go_preshot',
        text: "Let's go",
        baseEffects: { confidence: 8, pressure: 3 },
        scalingRules: [
            { condition: (state) => state.trend === Trend.Hot, stat: 'confidence', scale: 1.5 }
        ],
        effectType: 'encouragement'
    },
    {
        id: 'chill_out_preshot',
        text: "Chill out",
        baseEffects: { pressure: -10, focus: 5 },
        scalingRules: [
            { condition: (state) => state.pressure > 70, stat: 'pressure', scale: 1.3 },
            { condition: (state) => state.pressure > 70, stat: 'focus', scale: 1.3 }
        ],
        effectType: 'calming'
    },
    {
        id: 'play_safe',
        text: "Play safe",
        baseEffects: { pressure: -8, focus: 8, confidence: -3 },
        scalingRules: [
            { 
                condition: (state) => [
                    ShotOutcome.HazardBunker, 
                    ShotOutcome.HazardWater
                ].includes(state.previousShotOutcome), 
                stat: 'pressure', 
                scale: 1.5 
            }
        ],
        effectType: 'calming'
    }
];


/**
 * Post-shot dialogue options keyed by shot outcome
 * Validates: Requirements 8.1-8.10
 */
export const postShotOptions = {
    // Distance miss options (short or long)
    // Validates: Requirement 8.1
    [ShotOutcome.MissDistanceShort]: [
        {
            id: 'shake_off_distance_short',
            text: "Shake it off - distance was off",
            baseEffects: { pressure: -12, focus: 5 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.5 }
            ],
            silenceEffects: { pressure: 6 },  // Validates: Requirement 8.2
            silenceScalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.67 }
            ],
            effectType: 'encouragement'
        }
    ],
    [ShotOutcome.MissDistanceLong]: [
        {
            id: 'shake_off_distance_long',
            text: "Shake it off - distance was off",
            baseEffects: { pressure: -12, focus: 5 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.5 }
            ],
            silenceEffects: { pressure: 6 },
            silenceScalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.67 }
            ],
            effectType: 'encouragement'
        }
    ],
    
    // Direction miss options
    // Validates: Requirement 8.3
    [ShotOutcome.MissDirectionLeft]: [
        {
            id: 'trust_shape_left',
            text: "Trust the shape next time",
            baseEffects: { trust: 4 },
            nextShotModifier: { dispersionTightening: 0.9 },  // 10% tighter dispersion
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'trust', scale: 1.5 }
            ],
            effectType: 'encouragement'
        }
    ],
    [ShotOutcome.MissDirectionRight]: [
        {
            id: 'trust_shape_right',
            text: "Trust the shape next time",
            baseEffects: { trust: 4 },
            nextShotModifier: { dispersionTightening: 0.9 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'trust', scale: 1.5 }
            ],
            effectType: 'encouragement'
        }
    ],
    
    // Bunker hazard options
    // Validates: Requirement 8.4
    [ShotOutcome.HazardBunker]: [
        {
            id: 'good_save_position',
            text: "Good save position",
            baseEffects: { confidence: 10, trust: 5 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'confidence', scale: 1.5 }
            ],
            effectType: 'encouragement'
        }
    ],
    
    // Water hazard options - caddy decides how to resolve (drop vs replay)
    // Validates: Requirements 8.5, 8.6
    [ShotOutcome.HazardWater]: [
        {
            id: 'water_drop_crossing',
            text: "Drop where it crossed – one penalty stroke",
            action: 'waterDropCrossing',
            baseEffects: { pressure: -18, trust: 6 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.39 }
            ],
            silenceEffects: { pressure: 12 },
            silenceScalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.5 }
            ],
            effectType: 'calming'
        },
        {
            id: 'water_replay',
            text: "Play again from previous spot – one penalty stroke",
            action: 'waterReplay',
            baseEffects: { pressure: -15, focus: 8 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.33 }
            ],
            effectType: 'calming'
        },
        {
            id: 'water_reset',
            text: "Water happens – reset (drop where it crossed)",
            action: 'waterDropCrossing',
            baseEffects: { pressure: -18, trust: 6 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.39 }
            ],
            effectType: 'calming'
        }
    ],
    
    // Bad luck options
    // Validates: Requirements 8.7, 8.8
    [ShotOutcome.BadLuck]: [
        {
            id: 'bad_luck',
            text: "That was just bad luck",
            baseEffects: { focus: 8, trust: 3 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'focus', scale: 1.5 }
            ],
            silenceEffects: { confidence: -5 },
            silenceScalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'confidence', scale: 1.6 }
            ],
            effectType: 'encouragement'
        }
    ],
    
    // Perfect/Good shot options
    // Validates: Requirement 8.9
    [ShotOutcome.Perfect]: [
        {
            id: 'repeat_perfect',
            text: "You've got this - repeat",
            baseEffects: { confidence: 15, trust: 3 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Hot, stat: 'confidence', scale: 1.33 }
            ],
            effectType: 'momentum'
        }
    ],
    [ShotOutcome.Good]: [
        {
            id: 'repeat_good',
            text: "You've got this - repeat",
            baseEffects: { confidence: 15, trust: 3 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Hot, stat: 'confidence', scale: 1.33 }
            ],
            effectType: 'momentum'
        }
    ],
    
    // Acceptable shot - no specific dialogue needed, but include for completeness
    [ShotOutcome.Acceptable]: [
        {
            id: 'acceptable_shot',
            text: "Solid shot",
            baseEffects: { confidence: 5, trust: 1 },
            scalingRules: [],
            effectType: 'encouragement'
        }
    ],
    
    // Disaster shot
    [ShotOutcome.Disaster]: [
        {
            id: 'disaster_reset',
            text: "Let's reset and focus",
            baseEffects: { pressure: -15, focus: 10, trust: 4 },
            scalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.5 },
                { condition: (state) => state.trend === Trend.Cold, stat: 'focus', scale: 1.25 }
            ],
            silenceEffects: { pressure: 15, confidence: -10 },
            silenceScalingRules: [
                { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.5 },
                { condition: (state) => state.trend === Trend.Cold, stat: 'confidence', scale: 1.5 }
            ],
            effectType: 'calming'
        }
    ]
};


/**
 * End-of-hole dialogue options
 * Validates: Requirements 9.1-9.4
 */
export const endOfHoleOptions = [
    // Par or better option
    // Validates: Requirement 9.1
    {
        id: 'solid_par',
        text: "Solid par - momentum!",
        baseEffects: { confidence: 12, trust: 4 },
        carryover: true,
        scalingRules: [
            { condition: (state) => state.trend === Trend.Hot, stat: 'confidence', scale: 1.5 }
        ],
        available: (state) => state.previousHoleScore <= 0,  // Par or better
        effectType: 'momentum'
    },
    
    // Over par option
    // Validates: Requirement 9.2
    {
        id: 'chill_out_end',
        text: "Chill out",
        baseEffects: { pressure: -10 },
        carryover: true,
        scalingRules: [
            { condition: (state) => state.trend === Trend.Cold, stat: 'pressure', scale: 1.5 }
        ],
        available: (state) => state.previousHoleScore > 0,  // Over par
        effectType: 'calming'
    },
    
    // Reflection option - always available
    // Validates: Requirement 9.3
    {
        id: 'what_happened',
        text: "What do you think happened?",
        baseEffects: { trust: 5, focus: 5 },
        carryover: false,  // Focus applies to next hole
        nextHoleEffects: { focus: 5 },
        scalingRules: [
            { condition: (state) => state.previousHoleScore > 0, stat: 'trust', scale: 1.6 }
        ],
        available: () => true,  // Always available
        effectType: 'consultation'
    },
    
    // Zone option - always available
    // Validates: Requirement 9.4
    {
        id: 'in_the_zone',
        text: "You're in the zone",
        baseEffects: { confidence: 8, focus: 5 },
        carryover: true,
        scalingRules: [
            { condition: (state) => state.trend === Trend.Hot, stat: 'confidence', scale: 1.5 },
            { condition: (state) => state.trend === Trend.Hot, stat: 'focus', scale: 1.5 },
            { condition: (state) => state.trend === Trend.Cold, stat: 'confidence', scale: 0.5 },
            { condition: (state) => state.trend === Trend.Cold, stat: 'focus', scale: 0.5 }
        ],
        available: () => true,  // Always available
        effectType: 'momentum'
    }
];

/**
 * Golfer-initiated conversation response options
 * Contextual responses based on what the golfer says
 * Each trigger type has specific response options that make sense for that situation
 */
export const golferInitiatedOptions = {
    // First tee - golfer says things like "Let's do this", "Here we go"
    FIRST_TEE: [
        {
            id: 'first_tee_ready',
            text: "Let's have a good one.",
            baseEffects: { confidence: 8, trust: 5 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'first_tee_focused',
            text: "One shot at a time.",
            baseEffects: { focus: 10, pressure: -5 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'first_tee_confident',
            text: "You're swinging well. Trust it.",
            baseEffects: { confidence: 12, trust: 3 },
            scalingRules: [],
            effectType: 'encouragement'
        }
    ],
    
    // High pressure - golfer says "Big moment here", "Lot riding on this"
    HIGH_PRESSURE: [
        {
            id: 'pressure_routine',
            text: "Stick to your routine.",
            baseEffects: { focus: 12, pressure: -8 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'pressure_breathe',
            text: "Take a breath. You've hit this shot before.",
            baseEffects: { pressure: -15, confidence: 5 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'pressure_trust',
            text: "Trust your swing.",
            baseEffects: { confidence: 10, trust: 4 },
            scalingRules: [],
            effectType: 'encouragement'
        }
    ],
    
    // Low confidence - golfer says "Not feeling it", "Can't find my swing"
    LOW_CONFIDENCE: [
        {
            id: 'confidence_smooth',
            text: "Smooth tempo. That's all you need.",
            baseEffects: { confidence: 10, focus: 8 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'confidence_simple',
            text: "Keep it simple. Pick a target.",
            baseEffects: { focus: 12, pressure: -5 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'confidence_trust_me',
            text: "I've seen you hit great shots. You've got this.",
            baseEffects: { confidence: 15, trust: 5 },
            scalingRules: [],
            effectType: 'encouragement'
        }
    ],
    
    // Low trust - golfer says "You sure about that club?", "I'm thinking different"
    LOW_TRUST: [
        {
            id: 'trust_explain',
            text: "Here's my thinking...",
            baseEffects: { trust: 10, focus: 5 },
            scalingRules: [],
            effectType: 'consultation'
        },
        {
            id: 'trust_your_call',
            text: "It's your call. What feels right?",
            baseEffects: { trust: 8, confidence: 5 },
            scalingRules: [],
            effectType: 'consultation'
        },
        {
            id: 'trust_go_with_gut',
            text: "Go with your gut.",
            baseEffects: { confidence: 8, trust: 3 },
            scalingRules: [],
            effectType: 'encouragement'
        }
    ],
    
    // Perfect shot - golfer says "That's the one!", "Pure!", "Flushed it!"
    PERFECT_SHOT: [
        {
            id: 'perfect_thats_it',
            text: "That's the swing right there.",
            baseEffects: { confidence: 12, trust: 4 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'perfect_more',
            text: "More of that.",
            baseEffects: { confidence: 10, focus: 5 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'perfect_feeling',
            text: "Remember that feeling.",
            baseEffects: { confidence: 8, focus: 8 },
            scalingRules: [],
            effectType: 'momentum'
        }
    ],
    
    // Hit green - golfer says "On the dance floor", "Found the green"
    HIT_GREEN: [
        {
            id: 'green_good_shot',
            text: "Good ball.",
            baseEffects: { confidence: 6, trust: 3 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'green_makeable',
            text: "Makeable putt coming up.",
            baseEffects: { confidence: 8, focus: 5 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'green_read_it',
            text: "Let's get a good read on this.",
            baseEffects: { focus: 10, trust: 4 },
            scalingRules: [],
            effectType: 'consultation'
        }
    ],
    
    // Hit fairway - golfer says "Good start", "In the short stuff"
    HIT_FAIRWAY: [
        {
            id: 'fairway_nice',
            text: "Nice drive.",
            baseEffects: { confidence: 5, trust: 2 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'fairway_good_position',
            text: "Good angle from there.",
            baseEffects: { confidence: 6, focus: 4 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'fairway_attack',
            text: "Can attack from here.",
            baseEffects: { confidence: 8, trust: 3 },
            scalingRules: [],
            effectType: 'momentum'
        }
    ],
    
    // Water hazard - golfer says "Wet", "In the drink", "Gone"
    WATER_HAZARD: [
        {
            id: 'water_forget_it',
            text: "Forget that one. Next shot.",
            baseEffects: { pressure: -12, focus: 8 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'water_happens',
            text: "Happens to everyone. Reset.",
            baseEffects: { pressure: -15, trust: 5 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'water_good_drop',
            text: "Good drop spot. Let's save par.",
            baseEffects: { confidence: 8, focus: 10 },
            scalingRules: [],
            effectType: 'encouragement'
        }
    ],
    
    // In bunker - golfer says "Beach time", "Sandy", "In the trap"
    IN_BUNKER: [
        {
            id: 'bunker_good_lie',
            text: "Lie looks decent. You've got this.",
            baseEffects: { confidence: 10, trust: 4 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'bunker_up_and_down',
            text: "Up and down from here.",
            baseEffects: { confidence: 8, focus: 8 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'bunker_splash',
            text: "Nice splash shot. Trust the bounce.",
            baseEffects: { confidence: 6, trust: 6 },
            scalingRules: [],
            effectType: 'consultation'
        }
    ],
    
    // In rough - golfer says "In the thick stuff", "Deep rough"
    IN_ROUGH: [
        {
            id: 'rough_club_up',
            text: "Might need to club up from here.",
            baseEffects: { trust: 6, focus: 8 },
            scalingRules: [],
            effectType: 'consultation'
        },
        {
            id: 'rough_manageable',
            text: "It's manageable. Commit to the shot.",
            baseEffects: { confidence: 8, focus: 6 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'rough_play_smart',
            text: "Play smart. Get it back in play.",
            baseEffects: { focus: 10, pressure: -5 },
            scalingRules: [],
            effectType: 'calming'
        }
    ],
    
    // Hit tree - golfer says "Hit a tree", "Timber", "Unlucky bounce"
    HIT_TREE: [
        {
            id: 'tree_bad_break',
            text: "Bad break. Nothing you could do.",
            baseEffects: { pressure: -10, trust: 5 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'tree_still_ok',
            text: "Still in play. Could be worse.",
            baseEffects: { confidence: 5, focus: 8 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'tree_scramble',
            text: "Time to scramble. You're good at this.",
            baseEffects: { confidence: 8, trust: 4 },
            scalingRules: [],
            effectType: 'encouragement'
        }
    ],
    
    // Consecutive bad shots - golfer says "Nothing's working", "All over the place"
    CONSECUTIVE_BAD_SHOTS: [
        {
            id: 'bad_shots_reset',
            text: "Fresh start. This shot only.",
            baseEffects: { focus: 12, pressure: -10 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'bad_shots_tempo',
            text: "Slow it down. Find your tempo.",
            baseEffects: { focus: 10, confidence: 5 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'bad_shots_target',
            text: "Pick a small target. Commit.",
            baseEffects: { focus: 15, trust: 3 },
            scalingRules: [],
            effectType: 'consultation'
        }
    ],
    
    // Difficult hole - golfer says "This one's a beast", "Tough hole"
    DIFFICULT_HOLE: [
        {
            id: 'difficult_smart_play',
            text: "Smart play here. No hero shots.",
            baseEffects: { focus: 10, pressure: -8 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'difficult_game_plan',
            text: "Stick to the game plan.",
            baseEffects: { focus: 8, trust: 6 },
            scalingRules: [],
            effectType: 'consultation'
        },
        {
            id: 'difficult_par_good',
            text: "Par is a good score here.",
            baseEffects: { pressure: -10, focus: 5 },
            scalingRules: [],
            effectType: 'calming'
        }
    ],
    
    // Long putt made - golfer says "Get in!", "Drained it!", "From downtown!"
    LONG_PUTT_MADE: [
        {
            id: 'long_putt_great_read',
            text: "Great read. Great stroke.",
            baseEffects: { confidence: 12, trust: 6 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'long_putt_clutch',
            text: "Clutch putt.",
            baseEffects: { confidence: 15, pressure: -5 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'long_putt_rolling',
            text: "Now you're rolling.",
            baseEffects: { confidence: 10, focus: 5 },
            scalingRules: [],
            effectType: 'momentum'
        }
    ],
    
    // Missed short putt - golfer says "How did that miss?", "Should've made that"
    MISSED_SHORT_PUTT: [
        {
            id: 'short_putt_next',
            text: "Next one's going in.",
            baseEffects: { confidence: 8, pressure: -8 },
            scalingRules: [],
            effectType: 'encouragement'
        },
        {
            id: 'short_putt_lip',
            text: "Lip outs happen. Stroke was good.",
            baseEffects: { confidence: 6, trust: 5 },
            scalingRules: [],
            effectType: 'calming'
        },
        {
            id: 'short_putt_move_on',
            text: "Shake it off. Long day ahead.",
            baseEffects: { pressure: -12, focus: 6 },
            scalingRules: [],
            effectType: 'calming'
        }
    ],
    
    // Great recovery - golfer says "Saved it!", "Nice escape"
    GREAT_RECOVERY: [
        {
            id: 'recovery_nice_save',
            text: "Great save.",
            baseEffects: { confidence: 10, trust: 5 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'recovery_thats_golf',
            text: "That's championship golf.",
            baseEffects: { confidence: 12, trust: 4 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'recovery_momentum',
            text: "Build on that.",
            baseEffects: { confidence: 8, focus: 6 },
            scalingRules: [],
            effectType: 'momentum'
        }
    ],
    
    // Close to pin - golfer says "That's tight!", "Stuck it!", "Birdie look!"
    CLOSE_TO_PIN: [
        {
            id: 'close_pin_nice',
            text: "Beautiful shot.",
            baseEffects: { confidence: 10, trust: 4 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'close_pin_make_it',
            text: "Let's make this one.",
            baseEffects: { confidence: 8, focus: 8 },
            scalingRules: [],
            effectType: 'momentum'
        },
        {
            id: 'close_pin_tap_in',
            text: "Tap-in range. Nice work.",
            baseEffects: { confidence: 6, pressure: -5 },
            scalingRules: [],
            effectType: 'encouragement'
        }
    ]
};

/**
 * Get response options for a golfer-initiated trigger
 * @param {string} trigger - GolferTrigger value
 * @returns {Array} - Available response options for that trigger
 */
export function getGolferInitiatedOptions(trigger) {
    return golferInitiatedOptions[trigger] || [];
}

/**
 * Cold trend scaling multiplier for positive effects
 * Validates: Requirement 8.10
 */
export const COLD_TREND_POSITIVE_SCALING = 1.25;

/**
 * Get dialogue options for a specific timing window
 * @param {string} window - TimingWindow value
 * @param {Object} state - Current result state
 * @returns {Array} - Available dialogue options
 */
export function getOptionsForWindow(window, state = {}) {
    switch (window) {
        case 'StartOfHole':
            return startOfHoleOptions;
        case 'PreShot':
            return preShotOptions;
        case 'PostShot':
            return getPostShotOptions();
        case 'EndOfHole':
            return getEndOfHoleOptions(state);
        default:
            return [];
    }
}

/**
 * Get all post-shot options (not filtered by outcome)
 * Caddy should not know the shot outcome when choosing response
 * @returns {Array} - All unique post-shot dialogue options
 */
export function getPostShotOptions() {
    // Collect all unique options from all outcomes
    const allOptions = [];
    const seenTexts = new Set();
    
    Object.values(postShotOptions).forEach(options => {
        options.forEach(option => {
            // Deduplicate by text (some options have same text for different outcomes)
            if (!seenTexts.has(option.text)) {
                seenTexts.add(option.text);
                allOptions.push(option);
            }
        });
    });
    
    return allOptions;
}

/**
 * Get end-of-hole options filtered by availability
 * @param {Object} state - Current result state
 * @returns {Array} - Available dialogue options
 */
export function getEndOfHoleOptions(state) {
    return endOfHoleOptions.filter(option => {
        if (typeof option.available === 'function') {
            return option.available(state);
        }
        return true;
    });
}

/**
 * Calculate the final effect value after applying scaling rules
 * @param {Object} option - Dialogue option
 * @param {string} stat - Stat name to calculate
 * @param {Object} state - Current result state
 * @returns {number} - Final effect value
 */
export function calculateScaledEffect(option, stat, state) {
    const baseValue = option.baseEffects[stat] || 0;
    if (baseValue === 0) return 0;
    
    let finalValue = baseValue;
    
    // Apply scaling rules
    for (const rule of option.scalingRules || []) {
        if (rule.stat === stat && rule.condition(state)) {
            if (rule.bonus !== undefined) {
                finalValue += rule.bonus;
            }
            if (rule.scale !== undefined) {
                finalValue = baseValue * rule.scale;
            }
        }
    }
    
    // Apply cold trend positive scaling for encouragement effects
    // Validates: Requirement 8.10
    if (state.trend === Trend.Cold && 
        option.effectType === 'encouragement' && 
        baseValue > 0) {
        finalValue *= COLD_TREND_POSITIVE_SCALING;
    }
    
    return Math.round(finalValue);
}

/**
 * Calculate all scaled effects for a dialogue option
 * @param {Object} option - Dialogue option
 * @param {Object} state - Current result state
 * @returns {Object} - Object with all scaled effect values
 */
export function calculateAllScaledEffects(option, state) {
    const effects = {};
    const stats = ['confidence', 'pressure', 'focus', 'trust'];
    
    for (const stat of stats) {
        const value = calculateScaledEffect(option, stat, state);
        if (value !== 0) {
            effects[stat] = value;
        }
    }
    
    // Include carryover flag if present
    if (option.carryover) {
        effects.carryover = true;
    }
    
    // Include next shot modifier if present
    if (option.nextShotModifier) {
        effects.nextShotModifier = option.nextShotModifier;
    }
    
    // Include next hole effects if present
    if (option.nextHoleEffects) {
        effects.nextHoleEffects = option.nextHoleEffects;
    }
    
    return effects;
}

/**
 * The complete dialogue options database
 */
export const dialogueOptions = {
    startOfHole: startOfHoleOptions,
    preShot: preShotOptions,
    postShot: postShotOptions,
    endOfHole: endOfHoleOptions,
    golferInitiated: golferInitiatedOptions
};

export default dialogueOptions;
