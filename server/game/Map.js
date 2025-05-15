// server/game/Map.js

// Removemos importações de cores, mantemos TileType e CONSTANTS
import { CONSTANTS, TileType } from './ServerConstants.js';
// BombManager será passado na instanciação da Sala (Room)
// import { BombManager } from './Bomb.js'; // Não precisa importar aqui

export class Map {
    // constructor(bombManager) { // O bombManager será gerenciado pela Sala
    constructor() {
        this.mapData = [];
        // this.bombManager = bombManager; // Removido
        this.initializeMap(); // Renomeado para clareza
    }

    // Renomeado e simplificado - lógica de criação apenas
    initializeMap() {
        this.mapData.length = 0;
        for (let row = 0; row < CONSTANTS.MAP_ROWS; row++) {
            this.mapData[row] = [];
            for (let col = 0; col < CONSTANTS.MAP_COLS; col++) {
                // Hard walls nas bordas e no padrão xadrez interno
                if (row === 0 || row === CONSTANTS.MAP_ROWS - 1 || col === 0 || col === CONSTANTS.MAP_COLS - 1 || (row % 2 === 0 && col % 2 === 0)) {
                    this.mapData[row][col] = TileType.WALL_HARD;
                } else {
                    this.mapData[row][col] = TileType.FLOOR;
                }
            }
        }

        // Lista das posições iniciais dos jogadores e seus arredores imediatos (1 tile)
        const spawnAreas = new Set();
        CONSTANTS.PLAYER_START_POSITIONS.forEach(pos => {
            for (let rOffset = -1; rOffset <= 1; rOffset++) {
                for (let cOffset = -1; cOffset <= 1; cOffset++) {
                    const r = pos.y + rOffset;
                    const c = pos.x + cOffset;
                    if (r > 0 && r < CONSTANTS.MAP_ROWS - 1 && c > 0 && c < CONSTANTS.MAP_COLS - 1) {
                         spawnAreas.add(`${c},${r}`);
                    }
                }
            }
        });


        // Preenche com Soft Walls aleatoriamente, evitando áreas de spawn
        for (let row = 1; row < CONSTANTS.MAP_ROWS - 1; row++) {
            for (let col = 1; col < CONSTANTS.MAP_COLS - 1; col++) {
                // Pula se já for uma Hard Wall
                if (this.mapData[row][col] === TileType.WALL_HARD) continue;

                const isSpawn = spawnAreas.has(`${col},${row}`);

                // Coloca Soft Wall se não for área de spawn e passar na chance
                if (!isSpawn && Math.random() < 0.75) { // 75% de chance
                    this.mapData[row][col] = TileType.WALL_SOFT;
                }
            }
        }


        // Garante que as posições iniciais EXATAS sejam FLOOR
        CONSTANTS.PLAYER_START_POSITIONS.forEach(pos => {
             if (this.mapData[pos.y]?.[pos.x] !== undefined) {
                this.mapData[pos.y][pos.x] = TileType.FLOOR;
             }
             // Limpa adjacentes (opcional, mas bom para início)
             const adjacent = [ {r: pos.y+1, c: pos.x}, {r: pos.y-1, c: pos.x}, {r: pos.y, c: pos.x+1}, {r: pos.y, c: pos.x-1} ];
             adjacent.forEach(adj => {
                 if (this.mapData[adj.r]?.[adj.c] === TileType.WALL_SOFT) {
                     this.mapData[adj.r][adj.c] = TileType.FLOOR;
                 }
             })
        });


        console.log("Server Map initialized.");
    }

    getTileType(col, row) {
        if (row < 0 || row >= CONSTANTS.MAP_ROWS || col < 0 || col >= CONSTANTS.MAP_COLS) {
            return TileType.OUT_OF_BOUNDS;
        }
        // Garante que retorna FLOOR se for indefinido (deve ser raro)
        return this.mapData[row]?.[col] ?? TileType.FLOOR;
    }

    // Retorna dados do tile e se um powerup deve ser spawnado
    destroySoftWall(col, row) {
        if (this.getTileType(col, row) === TileType.WALL_SOFT) {
            this.mapData[row][col] = TileType.FLOOR;
            console.log(`Soft wall destroyed at ${col}, ${row}`);
            // Decide aqui se um power-up deve spawnar (lógica movida do PowerUpManager.trySpawn)
            const shouldSpawnPowerup = Math.random() <= CONSTANTS.POWERUP_SPAWN_CHANCE; // CONSTANTS.POWERUP_SPAWN_CHANCE foi atualizado para 0.25
            return { destroyed: true, spawnPowerup: shouldSpawnPowerup };
        }
        return { destroyed: false, spawnPowerup: false };
    }

    // Verifica se o movimento é bloqueado
    isTileMovementBlocked(col, row) {
        const tileType = this.getTileType(col, row);
        return tileType === TileType.WALL_SOFT ||
               tileType === TileType.WALL_HARD ||
               tileType === TileType.DEATHMATCH_WALL;
    }

    // Coloca a parede de Deathmatch
    placeHardWall(col, row) {
        if (row >= 0 && row < CONSTANTS.MAP_ROWS && col >= 0 && col < CONSTANTS.MAP_COLS) {
            if (this.mapData[row][col] !== TileType.DEATHMATCH_WALL) { 
                console.log(`Placing deathmatch wall at ${col}, ${row}`);
                this.mapData[row][col] = TileType.DEATHMATCH_WALL;
                return true; 
            }
        } else {
            console.warn(`Attempted to place deathmatch wall out of bounds: ${col}, ${row}`);
        }
        return false; 
    }

    getState() {
        return this.mapData;
    }
}