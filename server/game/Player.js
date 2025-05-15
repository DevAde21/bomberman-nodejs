// server/game/Player.js
import { CONSTANTS, PowerupType, TileType } from './ServerConstants.js';
import { checkRectOverlap } from './ServerUtils.js';

export class Player {
    constructor(playerId, playerIndex, gameMapInstance, bombManager, playersMapRef, nickname = "Bomber", preferredColor = 'random') { // Adicionado preferredColor
        this.id = playerId;
        this.index = playerIndex; // Este é o índice de entrada/ordem no lobby, pode mudar para o índice de cor final.
        this.nickname = (nickname || `P${playerIndex + 1}`).substring(0, 15);
        this.map = gameMapInstance;
        this.bombManager = bombManager;
        this.playersMap = playersMapRef; // Referência ao Map de todos os jogadores na sala

        console.log(`PLAYER ${this.id} (Nick: ${this.nickname}, Index: ${this.index}): Creating. Preferred Color: ${preferredColor}`);

        this.inputs = { left: false, right: false, up: false, down: false, plantBomb: false };
        this.lastInputSequence = -1; this.spaceJustPressed = false;
        this.x = 0; this.y = 0;
        this.width = CONSTANTS.GRID_SIZE * CONSTANTS.PLAYER_WIDTH_RATIO;
        this.height = CONSTANTS.GRID_SIZE * CONSTANTS.PLAYER_HEIGHT_RATIO;

        this.color = CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX[0]; // Cor temporária antes da atribuição final
        this.preferredColor = preferredColor; // Armazena a cor preferida

        this.lives = CONSTANTS.PLAYER_START_LIVES;
        this.maxBombs = CONSTANTS.PLAYER_START_MAX_BOMBS;
        this.bombRange = CONSTANTS.BOMB_DEFAULT_RANGE;
        this.baseSpeed = CONSTANTS.BASE_PLAYER_SPEED; this.currentSpeed = this.baseSpeed;
        this.hasPiercingBombs = false;
        this.isAlive = true; this.exitingBombTile = null;
        this.speedBoostTimer = 0; this.shieldTimer = 0;
        this.lastNonZeroDirection = { dx: 1, dy: 0 };
        this.isRespawning = false; this.respawnTimer = 0;

        this.reset(); // reset() irá chamar updateColorBasedOnIndex()
    }

    // updateColorBasedOnIndex agora é chamado por Room para atribuir a cor final
    // baseada na disponibilidade e preferência.
    // O Player.index aqui deve ser o índice final do jogador (0-3).
    assignFinalColor(finalPlayerIndex, chosenColor) {
        this.index = finalPlayerIndex; // Atualiza para o índice final do jogo
        this.color = chosenColor;
        console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Final color assigned: ${this.color}, Final Index: ${this.index}`);
    }


    reset() {
        console.log(`PLAYER ${this.id} (Nick: ${this.nickname}, Original Lobby Index ${this.index}): Attempting reset...`);
        // A cor será definida/atualizada pela Room antes do início do jogo ou quando a cor é escolhida.
        // Não chamamos updateColorBasedOnIndex diretamente aqui para evitar conflito com a lógica da Room.

        const startPositions = CONSTANTS.PLAYER_START_POSITIONS;
        // Usa this.index que pode ser o índice de lobby ou o índice final de jogo, dependendo de quando reset é chamado.
        // Para o posicionamento inicial do jogo, this.index DEVE ser o finalPlayerIndex (0-3).
        const playerGameIndex = (typeof this.index === 'number' && this.index >= 0 && this.index < startPositions.length) ? this.index : 0;

        if (!startPositions || playerGameIndex >= startPositions.length) {
            console.error(`PLAYER ${this.id} (Nick: ${this.nickname}): CRITICAL ERROR - Invalid player game index (${playerGameIndex}) for start position. Defaulting.`);
            this.x = CONSTANTS.GRID_SIZE + (CONSTANTS.GRID_SIZE - this.width) / 2;
            this.y = CONSTANTS.GRID_SIZE + (CONSTANTS.GRID_SIZE - this.height) / 2;
        } else {
            const startPos = startPositions[playerGameIndex];
            this.x = startPos.x * CONSTANTS.GRID_SIZE + (CONSTANTS.GRID_SIZE - this.width) / 2;
            this.y = startPos.y * CONSTANTS.GRID_SIZE + (CONSTANTS.GRID_SIZE - this.height) / 2;
        }

        this.isAlive = true; this.isRespawning = false; this.respawnTimer = 0;
        
        this.maxBombs = CONSTANTS.PLAYER_START_MAX_BOMBS;
        this.bombRange = CONSTANTS.BOMB_DEFAULT_RANGE;
        this.currentSpeed = this.baseSpeed;
        this.hasPiercingBombs = false;
        this.speedBoostTimer = 0;
        this.shieldTimer = 0;
        this.exitingBombTile = null;
        this.lastNonZeroDirection = { dx: 1, dy: 0 };
        this.inputs = { left: false, right: false, up: false, down: false, plantBomb: false };
        this.spaceJustPressed = false;
        console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Reset complete. Pos: (${this.x.toFixed(1)},${this.y.toFixed(1)}), Lives: ${this.lives}, Current Color (may change): ${this.color}`);
    }

    resetForNewGame() {
        this.lives = CONSTANTS.PLAYER_START_LIVES;
        // A cor já terá sido atribuída pela Room. reset() vai cuidar do resto.
        this.reset();
        console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Reset FOR NEW GAME. Lives set to ${this.lives}. Final Color: ${this.color}`);
    }


    applyInput(inputData) {
        const previousPlantBomb = this.inputs.plantBomb;
        this.inputs = inputData;
        this.spaceJustPressed = this.inputs.plantBomb && !previousPlantBomb;
    }

    update(deltaTime, isDeathmatchActive = false) {
        const deltaMs = deltaTime * 1000;
        if (this.isRespawning) {
            if (isDeathmatchActive) {
                console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Was respawning when Deathmatch started. Eliminating.`);
                this.isAlive = false;
                this.isRespawning = false;
                this.lives = 0;
                return;
            }
            this.respawnTimer -= deltaMs;
            if (this.respawnTimer <= 0) { this.finishRespawn(isDeathmatchActive); }
            else { return; }
        }
        if (!this.isAlive) { return; }
        this.updateTimers(deltaMs);
        this.checkExitingBombTile();
        this.handleMovement(deltaTime);
        this.handleBombPlacement();
        this.clampPosition();
        this.spaceJustPressed = false;
    }

    updateTimers(deltaMs) {
        if (this.speedBoostTimer > 0) {
            this.speedBoostTimer -= deltaMs;
            if (this.speedBoostTimer <= 0) { this.speedBoostTimer = 0; this.currentSpeed = this.baseSpeed; }
        }
        if (this.shieldTimer > 0) {
            this.shieldTimer -= deltaMs;
            if (this.shieldTimer <= 0) { this.shieldTimer = 0; }
        }
    }

    checkExitingBombTile() {
        if (!this.exitingBombTile) return;
        const bombCellRect = {
            x: this.exitingBombTile.col * CONSTANTS.GRID_SIZE, y: this.exitingBombTile.row * CONSTANTS.GRID_SIZE,
            width: CONSTANTS.GRID_SIZE, height: CONSTANTS.GRID_SIZE
        };
        if (!checkRectOverlap(this.getRect(), bombCellRect)) { this.exitingBombTile = null; }
    }

    handleMovement(deltaTime) {
        let dx = 0, dy = 0;
        if (this.inputs.up) dy -= 1; if (this.inputs.down) dy += 1;
        if (this.inputs.left) dx -= 1; if (this.inputs.right) dx += 1;

        if (dx !== 0 || dy !== 0) {
            if (dx !== 0 && dy === 0) this.lastNonZeroDirection = { dx: Math.sign(dx), dy: 0 };
            else if (dy !== 0 && dx === 0) this.lastNonZeroDirection = { dx: 0, dy: Math.sign(dy) };
        }
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        let moveDirX = 0, moveDirY = 0;
        if (magnitude > 0) { moveDirX = dx / magnitude; moveDirY = dy / magnitude; }
        
        let intendedMoveX = moveDirX * this.currentSpeed;
        let intendedMoveY = moveDirY * this.currentSpeed;
        
        let finalMoveX = 0;
        let finalMoveY = 0;
        
        const collisionXY = this.checkCollision(this.x + intendedMoveX, this.y + intendedMoveY);

        if (!collisionXY) {
            finalMoveX = intendedMoveX;
            finalMoveY = intendedMoveY;
        } else {
            if (intendedMoveX !== 0) {
                const collisionX = this.checkCollision(this.x + intendedMoveX, this.y);
                if (!collisionX) { finalMoveX = intendedMoveX; }
            }
            if (intendedMoveY !== 0) {
                const collisionY = this.checkCollision(this.x, this.y + intendedMoveY);
                if (!collisionY) { finalMoveY = intendedMoveY; }
            }
        }
        
        this.x += finalMoveX;
        this.y += finalMoveY;
    }

    checkCollision(futureX, futureY) {
        const playerFutureRect = { x: futureX, y: futureY, width: this.width, height: this.height };
        const minCol = Math.floor(futureX / CONSTANTS.GRID_SIZE);
        const maxCol = Math.floor((futureX + this.width) / CONSTANTS.GRID_SIZE);
        const minRow = Math.floor(futureY / CONSTANTS.GRID_SIZE);
        const maxRow = Math.floor((futureY + this.height) / CONSTANTS.GRID_SIZE);

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                if (this.map.isTileMovementBlocked(col, row)) {
                    const wallRect = { x: col * CONSTANTS.GRID_SIZE, y: row * CONSTANTS.GRID_SIZE, width: CONSTANTS.GRID_SIZE, height: CONSTANTS.GRID_SIZE };
                    if (checkRectOverlap(playerFutureRect, wallRect)) {
                        return { type: 'wall' };
                    }
                }
            }
        }

        const bombsToCheck = this.bombManager.getActiveBombs();
        for (const bomb of bombsToCheck) {
            if (this.exitingBombTile && bomb.gridCol === this.exitingBombTile.col && bomb.gridRow === this.exitingBombTile.row) {
                continue;
            }
            const bombRect = { x: bomb.x, y: bomb.y, width: CONSTANTS.GRID_SIZE, height: CONSTANTS.GRID_SIZE };
            if (checkRectOverlap(playerFutureRect, bombRect)) {
                 return { type: 'bomb' };
            }
        }
        
        if (this.playersMap) {
            for (const otherPlayer of this.playersMap.values()) {
                if (otherPlayer.id === this.id || !otherPlayer.isAlive) {
                    continue;
                }
                const otherPlayerRect = otherPlayer.getRect();
                if (checkRectOverlap(playerFutureRect, otherPlayerRect)) {
                    return { type: 'player', collidedWithPlayerId: otherPlayer.id };
                }
            }
        }
        return null;
    }

    handleBombPlacement() {
        if (this.inputs.plantBomb && this.spaceJustPressed && this.exitingBombTile === null) {
             const gridCol = Math.floor((this.x + this.width / 2) / CONSTANTS.GRID_SIZE);
             const gridRow = Math.floor((this.y + this.height / 2) / CONSTANTS.GRID_SIZE);
             
             if (this.map.getTileType(gridCol, gridRow) === TileType.FLOOR) {
                 if (this.bombManager.addBomb(gridCol, gridRow, this.bombRange, this.hasPiercingBombs, this.id)) {
                     this.exitingBombTile = { col: gridCol, row: gridRow };
                 }
             }
        }
    }

    applyPowerupEffect(type) {
        if (!this.isAlive) return;
        console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Applying powerup ${type}`);
        switch (type) {
            case PowerupType.RANGE: this.bombRange = Math.min(this.bombRange + 1, CONSTANTS.PLAYER_MAX_BOMB_RANGE); break;
            case PowerupType.COUNT: this.maxBombs = Math.min(this.maxBombs + 1, CONSTANTS.PLAYER_MAX_BOMBS_COUNT); break;
            case PowerupType.SPEED: this.currentSpeed = this.baseSpeed * CONSTANTS.POWERUP_SPEED_BOOST_MULTIPLIER; this.speedBoostTimer = CONSTANTS.POWERUP_SPEED_BOOST_DURATION_MS; break;
            case PowerupType.SHIELD: this.shieldTimer = CONSTANTS.POWERUP_SHIELD_DURATION_MS; break;
            case PowerupType.PIERCE: this.hasPiercingBombs = true; break;
        }
    }

    applyMaxPowerupsDebug() {
        if (!this.isAlive) return;
        console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): DEBUG - Applying MAX powerups.`);
        this.bombRange = CONSTANTS.PLAYER_MAX_BOMB_RANGE;
        this.maxBombs = CONSTANTS.PLAYER_MAX_BOMBS_COUNT;
        this.currentSpeed = this.baseSpeed * CONSTANTS.POWERUP_SPEED_BOOST_MULTIPLIER;
        this.speedBoostTimer = 999999;
        this.shieldTimer = 999999;
        this.hasPiercingBombs = true;
    }

    takeHit(isDuringDeathmatch = false) {
        if (!this.isAlive || this.isRespawning) return false;

        if (!isDuringDeathmatch && this.shieldTimer > 0) {
            this.shieldTimer = 0;
            console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Shield used!`);
            return false;
        }

        if (isDuringDeathmatch) {
            this.lives = 0;
        } else {
            this.lives--;
        }
        
        this.isAlive = false;
        this.exitingBombTile = null;
        this.speedBoostTimer = 0;
        this.currentSpeed = this.baseSpeed;
        this.inputs = { left: false, right: false, up: false, down: false, plantBomb: false };
        this.spaceJustPressed = false;
        
        console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Took hit. Lives: ${this.lives}. Deathmatch hit: ${isDuringDeathmatch}`);
        
        if (this.lives > 0) {
            this.isRespawning = true;
            this.respawnTimer = CONSTANTS.PLAYER_RESPAWN_DELAY;
            console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Respawning... (${this.respawnTimer}ms)`);
        } else {
            this.isRespawning = false;
            console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Eliminated (0 lives).`);
        }
        return true;
    }

    finishRespawn(isDeathmatchActive = false) {
         console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Finishing respawn.`);

         if (isDeathmatchActive) {
             console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Deathmatch active during respawn. Eliminating.`);
             this.isAlive = false;
             this.isRespawning = false;
             this.lives = 0;
             return;
         }
         
         const currentLivesBeforeReset = this.lives;
         this.reset(); // reset() já não mexe na cor, e o índice já é o final
         this.lives = currentLivesBeforeReset;
         
         this.isAlive = true;
         this.isRespawning = false;

         this.shieldTimer = CONSTANTS.POWERUP_SHIELD_DURATION_MS / 2;
         console.log(`PLAYER ${this.id} (Nick: ${this.nickname}): Respawn complete, granted shield. Lives: ${this.lives}. Color: ${this.color}`);
    }

    clampPosition() {
        const mapWidth = CONSTANTS.MAP_COLS * CONSTANTS.GRID_SIZE;
        const mapHeight = CONSTANTS.MAP_ROWS * CONSTANTS.GRID_SIZE;
        this.x = Math.max(0, Math.min(mapWidth - this.width, this.x));
        this.y = Math.max(0, Math.min(mapHeight - this.height, this.y));
    }

    getRect() { return { x: this.x, y: this.y, width: this.width, height: this.height }; }

    getState() {
        return {
            id: this.id,
            index: this.index, // Será o índice final do jogo (0-3)
            nickname: this.nickname,
            x: this.x,
            y: this.y,
            color: this.color, // Cor final atribuída
            lives: this.lives,
            maxBombs: this.maxBombs,
            bombRange: this.bombRange,
            hasPiercingBombs: this.hasPiercingBombs,
            isAlive: this.isAlive,
            isRespawning: this.isRespawning,
            shieldActive: this.shieldTimer > 0,
            speedBoostActive: this.speedBoostTimer > 0,
        };
    }
}