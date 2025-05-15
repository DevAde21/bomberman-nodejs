// server/game/Deathmatch.js

import { CONSTANTS, TileType } from './ServerConstants.js';
import { checkRectOverlap } from './ServerUtils.js';

export class Deathmatch {
    constructor(gameMapInstance, playersMapRef, bombManager, powerUpManager) {
        this.map = gameMapInstance;
        this.playersMap = playersMapRef;
        this.bombManager = bombManager;
        this.powerUpManager = powerUpManager;
        this.isActive = false;
        this.timerSeconds = CONSTANTS.DEATHMATCH_INITIAL_TIME_SECONDS;
        this.shrinkIntervalTimer = 0;
        this.shrinkPosition = { layer: 0, direction: 0, index: 0 };
        this.isShrinkingComplete = false;
        this.minCol = 1;
        this.maxCol = CONSTANTS.MAP_COLS - 2;
        this.minRow = 1;
        this.maxRow = CONSTANTS.MAP_ROWS - 2;

        console.log("Server Deathmatch component initialized.");
    }

    reset() {
        this.isActive = false;
        this.timerSeconds = CONSTANTS.DEATHMATCH_INITIAL_TIME_SECONDS;
        this.shrinkIntervalTimer = 0;
        this.shrinkPosition = { layer: 0, direction: 0, index: 0 };
        this.isShrinkingComplete = false;
        // Reset min/max col/row in case a game ended mid-shrink in a previous round
        this.minCol = 1;
        this.maxCol = CONSTANTS.MAP_COLS - 2;
        this.minRow = 1;
        this.maxRow = CONSTANTS.MAP_ROWS - 2;
        console.log("Server Deathmatch reset.");
    }

    _getCurrentPlayersList() {
        return Array.from(this.playersMap.values());
    }

    update(deltaTime) {
        let placedWallCoords = null; // Not currently used externally, but kept for structure
        let playersHitByWall = [];

        if (this.isActive) {
            if (!this.isShrinkingComplete) {
                this.shrinkIntervalTimer += deltaTime * 1000;
                while (this.shrinkIntervalTimer >= CONSTANTS.DEATHMATCH_SHRINK_INTERVAL_MS && !this.isShrinkingComplete) {
                    const result = this.placeNextShrinkBlock();
                    if (result.placed) {
                        placedWallCoords = { col: result.col, row: result.row }; // Keep for potential future use
                        playersHitByWall.push(...result.hitPlayerIds);
                    }
                    this.shrinkIntervalTimer -= CONSTANTS.DEATHMATCH_SHRINK_INTERVAL_MS;
                }
            }
        } else {
            if (this.timerSeconds > 0) {
                this.timerSeconds -= deltaTime;
                if (this.timerSeconds <= 0) {
                    this.timerSeconds = 0;
                    this.startDeathmatch();
                }
            }
        }
        playersHitByWall = [...new Set(playersHitByWall)];
        return { placedWallCoords, playersHitByWall };
    }

    startDeathmatch() {
        if (this.isActive) return;
        console.log("DEATHMATCH STARTING on Server!");
        this.isActive = true;
        this.shrinkIntervalTimer = 0;

        // Bug 3: Eliminar jogadores que estão respawnando
        this._getCurrentPlayersList().forEach(player => {
            if (player.isRespawning) {
                console.log(`Player ${player.id} was respawning at Deathmatch start. Eliminating.`);
                player.isAlive = false;
                player.isRespawning = false;
                player.lives = 0; // Garante que não tente respawnar mais
            }
        });
    }

    placeNextShrinkBlock() {
        const result = { placed: false, col: -1, row: -1, hitPlayerIds: [] };
        if (this.isShrinkingComplete) return result;

        const { layer, direction } = this.shrinkPosition;
        let { index } = this.shrinkPosition;
        
        // Define os limites atuais da arena jogável.
        // Note que estes são os limites *antes* da parede atual ser colocada.
        const arenaMinCol = this.minCol + layer;
        const arenaMaxCol = this.maxCol - layer;
        const arenaMinRow = this.minRow + layer;
        const arenaMaxRow = this.maxRow - layer;

        // Se a próxima camada for encolher para nada ou cruzar, o encolhimento está completo.
        if (arenaMinCol > arenaMaxCol || arenaMinRow > arenaMaxRow) {
            this.isShrinkingComplete = true;
            console.log("Deathmatch shrinking complete.");
            return result;
        }
        
        let targetCol = -1; 
        let targetRow = -1;
        let nextDirection = direction; 
        let nextLayer = layer; 
        let nextIndex = index + 1;

        switch (direction) {
            // Top row, left to right
            case 0: 
                targetCol = arenaMinCol + index; 
                targetRow = arenaMinRow; 
                if (targetCol >= arenaMaxCol) { nextDirection = 1; nextIndex = 1; targetCol = arenaMaxCol; } 
                break;
            // Right column, top to bottom
            case 1: 
                targetCol = arenaMaxCol; 
                targetRow = arenaMinRow + index; 
                if (targetRow >= arenaMaxRow) { nextDirection = 2; nextIndex = 1; targetRow = arenaMaxRow; } 
                break;
            // Bottom row, right to left
            case 2: 
                targetCol = arenaMaxCol - index; 
                targetRow = arenaMaxRow; 
                if (targetCol <= arenaMinCol) { nextDirection = 3; nextIndex = 1; targetCol = arenaMinCol; } 
                break;
            // Left column, bottom to top
            case 3: 
                targetCol = arenaMinCol; 
                targetRow = arenaMaxRow - index; 
                if (targetRow <= arenaMinRow) { // Chegou ao canto superior esquerdo da camada atual
                    nextDirection = 0;         // Volta para a direção de cima
                    nextLayer = layer + 1;     // Próxima camada interna
                    nextIndex = 0;             // Começa do início da linha/coluna
                    targetRow = arenaMinRow;   // Garante que não coloque uma parede fora do limite na transição
                } 
                break;
        }

        // Verifica se a targetCol/Row ainda está dentro dos limites *gerais* do mapa (1 a MAP_COLS-2)
        // e não apenas da arena atual.
        if (targetCol >= this.minCol && targetCol <= this.maxCol &&
            targetRow >= this.minRow && targetRow <= this.maxRow)
        {
            // Verifica se o tile já é uma parede de deathmatch (pode acontecer na última parede de uma linha/coluna)
            if (this.map.getTileType(targetCol, targetRow) === TileType.DEATHMATCH_WALL) {
                // Já é uma parede de deathmatch, não precisa fazer nada, apenas avança a posição.
                // Não marcamos como `placed: true` porque a parede já estava lá.
            } else {
                this.powerUpManager.removePowerupAt(targetCol, targetRow);
                this.bombManager.removeBombAt(targetCol, targetRow, true); // true = skipOwnerCheck

                const wallTileRect = { x: targetCol * CONSTANTS.GRID_SIZE, y: targetRow * CONSTANTS.GRID_SIZE, width: CONSTANTS.GRID_SIZE, height: CONSTANTS.GRID_SIZE };
                const currentPlayers = this._getCurrentPlayersList();
                for (const player of currentPlayers) {
                    // Jogadores são atingidos se estiverem vivos (não respawnando) e colidirem com a nova parede
                    if (player.isAlive && !player.isRespawning && checkRectOverlap(player.getRect(), wallTileRect)) {
                        result.hitPlayerIds.push(player.id); // O dano/morte será tratado no gameLoop pela Room
                    }
                }

                const wallPlaced = this.map.placeHardWall(targetCol, targetRow);
                if (wallPlaced) {
                    result.placed = true; result.col = targetCol; result.row = targetRow;
                } else {
                    // Isso não deveria acontecer se a lógica de targetCol/Row estiver correta.
                    // console.warn(`Deathmatch: Failed to place wall at ${targetCol}, ${targetRow} that should be valid.`);
                }
            }
        } else {
            // Se targetCol/Row estiver fora dos limites do mapa (algo deu errado na lógica de shrinkPosition)
            // ou se a arena se tornou inválida (min > max), considera o encolhimento completo.
            this.isShrinkingComplete = true;
            console.log("Deathmatch shrinking considered complete due to boundary conditions.");
        }

        this.shrinkPosition = { layer: nextLayer, direction: nextDirection, index: nextIndex };
        return result;
    }


    isDeathmatchActive() {
        return this.isActive;
    }

    getState() {
        return {
            isActive: this.isActive,
            timerSeconds: this.timerSeconds,
            isShrinkingComplete: this.isShrinkingComplete,
        };
    }
}