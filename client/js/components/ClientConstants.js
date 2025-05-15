// client/js/components/ClientConstants.js

export const CONSTANTS = {
    GRID_SIZE: 40, MAP_COLS: 13, MAP_ROWS: 13,
    PLAYER_WIDTH_RATIO: 0.8, PLAYER_HEIGHT_RATIO: 0.8,
    BOMB_SPARK_CYCLE_DIVIDER: 6, BOMB_PULSE_SPEED: 0.05,
    BOMB_MAX_PULSE: 0.08, BOMB_DRAW_SIZE_RATIO: 1.0,
    EXPLOSION_DURATION_MS: 500,
    EXPLOSION_THICKNESS_RATIO: 0.8,
    POWERUP_DRAW_SIZE_RATIO: 0.6, // Powerup circle will be 60% of grid size
    POWERUP_ALPHA: 0.9, // Slightly more opaque
    DEATHMATCH_ANNOUNCEMENT_DURATION_MS: 3000,
    WALL_CORNER_RADIUS: 5, // New: Radius for wall corners
    GAME_OVER_MESSAGE_DELAY_MS: 10, // Delay para mostrar a mensagem de Game Over

    // --- Color Palette ---
    COLOR_BACKGROUND: '#282c34', // Dark grey-blue
    COLOR_UI_PANEL: '#3a3f4b', // Slightly lighter grey-blue
    COLOR_UI_BORDER: '#6c757d', // Muted grey border
    COLOR_UI_TEXT: '#e1e1e1', // Light grey text
    COLOR_BUTTON_BG: '#4a5261', // Button background
    COLOR_BUTTON_HOVER_BG: '#5e6878', // Button hover
    COLOR_BUTTON_BORDER: '#7a8491', // Button border
    COLOR_BUTTON_TEXT: '#ffffff', // Button text
    COLOR_BUTTON_START_BG: '#2ecc71', // Specific color for Start Game button (Green)
    COLOR_BUTTON_START_BORDER: '#57d78d',
    COLOR_BUTTON_START_HOVER_BG: '#40df85',
    COLOR_INPUT_BG: '#ffffff',
    COLOR_INPUT_TEXT: '#333333',
    COLOR_INPUT_BORDER: '#ced4da',
    COLOR_HIGHLIGHT: '#f0c040', // Yellowish highlight (e.g., room ID)
    COLOR_ERROR: '#e57373', // Softer red for errors
    COLOR_STATUS_TEXT: '#ffffff',

    COLOR_FLOOR: '#6c757d',    // Muted grey floor
    COLOR_WALL_SOFT: '#8795a1', // Slightly lighter grey for soft walls
    COLOR_WALL_HARD: '#586470', // Darker grey for hard walls
    COLOR_WALL_DEATHMATCH: '#3b424a', // Very dark grey for deathmatch walls
    COLOR_BOMB: '#343a40',      // Dark bomb color
    COLOR_BOMB_FUSE: '#adb5bd',  // Light grey fuse
    COLOR_BOMB_SPARK_1: '#ffcc80', // Pale orange spark
    COLOR_BOMB_SPARK_2: '#ffe0b3', // Lighter pale orange spark
    COLOR_EXPLOSION: '#ff8a65', // Muted orange explosion
    COLOR_HEART: '#e57373', // Same softer red as error
    COLOR_LOCAL_PLAYER_INDICATOR: 'rgba(255, 255, 255, 0.8)',

    COLOR_POWERUP_RANGE: '#ffd54f', // Amber/Yellow
    COLOR_POWERUP_COUNT: '#81c784', // Soft Green
    COLOR_POWERUP_SPEED: '#64b5f6', // Soft Blue
    COLOR_POWERUP_SHIELD: '#ba68c8', // Soft Purple
    COLOR_POWERUP_PIERCE: '#ff8a65', // Muted Orange

    COLOR_AURA_SHIELD: '#ba68c8',
    COLOR_AURA_SHIELD_RGBA: 'rgba(186, 104, 200, --OPACITY--)',

    COLOR_TEXT_RESPAWN: 'rgba(240, 240, 240, 0.75)',
    COLOR_TEXT_GAMEOVER_FILL: '#e57373',
    COLOR_TEXT_GAMEOVER_STROKE: '#282c34',
    COLOR_OVERLAY_GAMEOVER: 'rgba(40, 44, 52, 0.85)',
    COLOR_TIMER_TEXT: '#e1e1e1',
    COLOR_TEXT_DEFAULT: '#e1e1e1',
    COLOR_TEXT_ANNOUNCEMENT_FILL: '#ffffff',
    COLOR_TEXT_ANNOUNCEMENT_STROKE: '#282c34',
    COLOR_TEXT_DEATHMATCH_FILL: '#e57373',
    COLOR_TEXT_DEATHMATCH_STROKE: '#282c34',

    ICON_CSS_SIZE: 40,
    ICON_RESOLUTION_MULTIPLIER: 2,
    SERVER_ADDRESS: "ws://localhost:3000",
    INPUT_SEND_INTERVAL: 1000 / 30,
    BOMB_PULSE_CLIENT_SIDE_SPEED: 0.1
};

export const PowerupType = {
    RANGE: 'bomb_range',
    COUNT: 'extra_bomb',
    SPEED: 'speed_boost',
    SHIELD: 'shield',
    PIERCE: 'piercing_bomb'
};

export const TileType = {
    FLOOR: 0,
    WALL_SOFT: 1,
    WALL_HARD: 2,
    DEATHMATCH_WALL: 3,
    OUT_OF_BOUNDS: -1
};

export const MessageType = {
    // Client -> Server
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    PLAYER_INPUT: 'player_input',
    REQUEST_START_GAME: 'request_start_game',
    PLAYER_COLOR_CHOICE: 'player_color_choice', // Usado se a cor for mudada no lobby (manteremos por enquanto)
    DEBUG_MAX_POWERUPS: 'debug_max_powerups',

    // Server -> Client
    ROOM_CREATED: 'room_created',
    ROOM_JOINED: 'room_joined',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    GAME_STATE: 'game_state',
    GAME_START: 'game_start',
    GAME_OVER: 'game_over',
    ERROR: 'error',
    ASSIGN_PLAYER_ID: 'assign_player_id',
    HOST_CHANGED: 'host_changed'
};

export const ClientState = {
    INITIAL_MENU: 'initialMenu',
    LOBBY: 'lobby',
    PLAYING: 'playing',
    // PAUSED: 'paused', // REMOVIDO - O jogo não pausa, apenas mostra um overlay
    GAME_OVER: 'gameOver',
    CONNECTING: 'connecting',
    ERROR: 'error'
};

export const SELECTABLE_PLAYER_COLORS = [
    { name: 'Random', value: 'random', displayColor: '#7f8c8d' },
    { name: 'Red', value: '#e74c3c', displayColor: '#e74c3c' },
    { name: 'Blue', value: '#3498db', displayColor: '#3498db' },
    { name: 'Green', value: '#2ecc71', displayColor: '#2ecc71' },
    { name: 'Yellow', value: '#f1c40f', displayColor: '#f1c40f' },
    { name: 'Orange', value: '#e67e22', displayColor: '#e67e22' },
    { name: 'Brown', value: '#8c5016', displayColor: '#8c5016' },
    { name: 'Pink', value: '#ff79c6', displayColor: '#ff79c6' }
];