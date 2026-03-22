// Centralized constants module for Golf Caddy game
// Extracted from physics.js, world.js, game.js, shot.js

// Physical constants for ball flight simulation
export const PHYSICS = {
    GRAVITY: 9.81,                              // m/s²
    AIR_DENSITY: 1.225,                         // kg/m³ at sea level
    BALL_MASS: 0.0459,                          // kg (45.9g)
    BALL_RADIUS: 0.02135,                       // m (42.7mm diameter)
    BALL_AREA: Math.PI * 0.02135 * 0.02135,     // m² (cross-sectional area)
    KINEMATIC_VISCOSITY: 1.48e-5                // m²/s for air at ~15°C
};

// Unit conversion factors
export const CONVERSION = {
    MPH_TO_MS: 0.44704,
    MS_TO_MPH: 2.23694,
    YARDS_TO_METERS: 0.9144,
    METERS_TO_YARDS: 1.09361,
    RPM_TO_RADS: Math.PI / 30,
    WORLD_SCALE: 4,                             // 1 world unit = 4 yards
    YARDS_TO_WORLD: 0.25,                       // 1 yard = 0.25 world units
    BALL_RADIUS_WORLD: 0.047 * 0.25             // ball radius in world units (for roll angle)
};

// Camera configuration
export const CAMERA = {
    HEIGHT: 1.7,                                // yards above ball (caddy eye level)
    BEHIND_DISTANCE: 8,                         // yards behind ball
    SIDE_OFFSET: 0,                             // centered behind ball (directly behind aim line)
    FOV: 48,                                    // field of view in degrees (tighter for natural perspective)
    NEAR: 0.1,                                  // near clipping plane
    FAR: 12000,                                 // far clipping plane
    // Putting camera - low to read the green
    PUTT_HEIGHT: 0.4,                           // yards above green (almost ground level)
    PUTT_BEHIND_DISTANCE: 3,                    // yards behind ball
    PUTT_SIDE_OFFSET: 0,                        // centered behind for putting line
    PUTT_MIN_CAMERA_Y_OFFSET: 1.2,              // min camera height above hole (stops camera dropping in depressions)
};

// Animation timing constants (milliseconds)
export const TIMING = {
    SHOT_TRACER_MIN: 1500,                      // minimum flight animation duration
    SHOT_TRACER_MAX: 2500,                      // maximum flight animation duration
    CAMERA_FLY_MIN: 1800,                       // minimum camera fly-along duration
    CAMERA_FLY_MAX: 3500,                       // maximum camera fly-along duration
    BOUNCE_DURATION: 300,                       // ball bounce animation duration
    ROLL_DURATION: 500,                         // ball roll animation duration
    OVERLAY_FADE: 500                           // UI overlay fade duration
};

// Terrain colors for 3D rendering (hex values)
export const TERRAIN_COLORS = {
    FAIRWAY: 0x4a8c40,      // Brighter, more manicured green
    ROUGH: 0x022906,        // Darker, wilder green
    GREEN: 0x6dd66d,        // Vibrant putting green
    BUNKER: 0xf5e6c8,       // Lighter, whiter sand
    WATER: 0x3498db,
    TEE: 0x5a9c50,          // Slightly different from fairway
    OUT_OF_BOUNDS: 0x1a1a1a
};

// Hole/cup configuration
export const HOLE = {
    DIAMETER_INCHES: 4.25,                      // regulation hole diameter
    RADIUS_YARDS: 0.059,                        // 4.25" / 2 / 36" = 0.059 yards
    RADIUS_WORLD: 0.059 * 0.60,                 // in world units, scaled to match visual (60% of full scale)
    DEPTH_INCHES: 4,                            // minimum hole depth
    // Ball capture physics
    MAX_CAPTURE_SPEED: 0.04,                    // max speed (world units/frame) to fall in - increased for better capture
    LIP_OUT_CHANCE: 0.3,                        // chance to lip out at edge speeds
    EDGE_TOLERANCE: 1.0                         // multiplier for edge detection (ball center must be inside hole)
};

// Sky and sun configuration
export const SKY = {
    SUN_COLOR: 0xfffacd,                        // warm sun color
    SUN_SIZE: 80,                               // sun disc size
    SUN_DISTANCE: 3000,                         // distance from origin
    SUN_ELEVATION: 80,                          // degrees (0=horizon, 90=overhead)
    SUN_AZIMUTH: 30,                            // degrees (direction around horizon)
    CLOUD_COUNT: 15,                            // number of cloud groups
    CLOUD_MIN_HEIGHT: 400,                      // minimum cloud height
    CLOUD_MAX_HEIGHT: 600,                      // maximum cloud height
    CLOUD_SPREAD: 2000,                         // how far clouds spread from center
    CLOUD_SPEED: 0.5                            // cloud movement speed
};
