// server/game/ServerConstants.js

export const CONSTANTS = {
    // --- Grid & Map ---
    MAP_COLS: 13,
    MAP_ROWS: 13,
    GRID_SIZE: 40,

    // --- Player ---
    BASE_PLAYER_SPEED: 2,
    PLAYER_START_POSITIONS: [ /* Recalculado abaixo */ ],
    PLAYER_START_LIVES: 3,
    PLAYER_START_MAX_BOMBS: 1,
    PLAYER_WIDTH_RATIO: 0.8,
    PLAYER_HEIGHT_RATIO: 0.8,
    PLAYER_RESPAWN_DELAY: 1500, // ms
    PLAYER_MAX_BOMB_RANGE: 10,
    PLAYER_MAX_BOMBS_COUNT: 5,


    // --- Bomb ---
    BOMB_DEFAULT_RANGE: 1,
    BOMB_FUSE_TIME_MS: 3000,
    BOMB_HITBOX_RATIO: 0.9,

    // --- Explosion ---
    EXPLOSION_DURATION_MS: 500,
    EXPLOSION_THICKNESS_RATIO: 0.8,

    // --- Powerups ---
    POWERUP_SPAWN_CHANCE: 0.45,
    POWERUP_SPEED_BOOST_MULTIPLIER: 1.5,
    POWERUP_SPEED_BOOST_DURATION_MS: 7000,
    POWERUP_SHIELD_DURATION_MS: 5000,

    // --- Deathmatch ---
    DEATHMATCH_INITIAL_TIME_SECONDS: 90,
    DEATHMATCH_SHRINK_INTERVAL_MS: 500,
    DEATHMATCH_ANNOUNCEMENT_DURATION_MS: 3000,

    // --- Server Specific ---
    SERVER_TICK_RATE: 1000 / 60,
    MAX_PLAYERS_PER_ROOM: 4,

    // --- Player Colors ---
    // Estas são as cores *padrão* por índice, usadas se o jogador escolher 'random' ou se a cor escolhida não estiver disponível.
    PLAYER_DEFAULT_COLORS_BY_INDEX: [
        '#3498db', // Blue
        '#e74c3c', // Red
        '#2ecc71', // Green
        '#f1c40f'  // Yellow
    ],
    // NOVO: Cores que um jogador pode selecionar (o valor 'random' é tratado especialmente)
    PLAYER_SELECTABLE_COLORS: [
        '#e74c3c', // Red
        '#3498db', // Blue
        '#2ecc71', // Green
        '#f1c40f', // Yellow
        '#e67e22', // Orange
        '#8c5016', // Brown
        '#ff79c6'  // Pink
    ]
};

// Recalcula posições iniciais com base nas constantes do mapa
CONSTANTS.PLAYER_START_POSITIONS = [
    { x: 1, y: 1 },
    { x: CONSTANTS.MAP_COLS - 2, y: 1 },
    { x: 1, y: CONSTANTS.MAP_ROWS - 2 },
    { x: CONSTANTS.MAP_COLS - 2, y: CONSTANTS.MAP_ROWS - 2 }
];

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

export const GameRoomState = {
    LOBBY: 'lobby',
    PLAYING: 'playing',
    FINISHED: 'finished'
};

export const MessageType = {
    // Client -> Server
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    PLAYER_INPUT: 'player_input',
    REQUEST_START_GAME: 'request_start_game',
    PLAYER_COLOR_CHOICE: 'player_color_choice', // Já existe no client, confirmado aqui
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