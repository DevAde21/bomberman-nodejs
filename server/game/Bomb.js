// server/game/Bomb.js

import { CONSTANTS, TileType } from './ServerConstants.js';
import { checkRectOverlap } from './ServerUtils.js';

export class BombManager {
    constructor(gameMapInstance, playersMapRef, powerUpManager) {
        this.map = gameMapInstance;
        this.playersMap = playersMapRef; 
        this.powerUpManager = powerUpManager;
        this.activeBombs = [];
        this.activeExplosions = [];
        this.bombIdCounter = 0;
        this.explosionIdCounter = 0;
    }

    reset() {
        this.activeBombs = [];
        this.activeExplosions = [];
        this.bombIdCounter = 0;
        this.explosionIdCounter = 0;
        console.log("Server Bomb manager reset.");
    }

    getActiveBombs() {
        return this.activeBombs;
    }

    getActiveBombCountForPlayer(playerId) {
        return this.activeBombs.filter(b => b.ownerId === playerId).length;
    }

    _getCurrentPlayersList() {
        return Array.from(this.playersMap.values());
    }

    getPlayerById(playerId) {
        return this.playersMap.get(playerId);
    }

    addBomb(gridCol, gridRow, range, isPiercing, ownerId) {
        const owner = this.getPlayerById(ownerId);
        if (!owner || !owner.isAlive) {
            return false;
        }
        if (this.getActiveBombCountForPlayer(ownerId) >= owner.maxBombs) {
             return false;
        }
        
        const targetTileRect = { 
            x: gridCol * CONSTANTS.GRID_SIZE, 
            y: gridRow * CONSTANTS.GRID_SIZE, 
            width: CONSTANTS.GRID_SIZE, 
            height: CONSTANTS.GRID_SIZE 
        };
        for (const player of this._getCurrentPlayersList()) {
            if (player.id !== ownerId && player.isAlive) {
                if (checkRectOverlap(player.getRect(), targetTileRect)) {
                    console.log(`Bomb placement by ${ownerId} at ${gridCol},${gridRow} blocked by player ${player.id}.`);
                    return false; 
                }
            }
        }

        if (this.map.getTileType(gridCol, gridRow) !== TileType.FLOOR || this.getBombAt(gridCol, gridRow)) {
            return false;
        }

        const newBombId = `b-${this.bombIdCounter++}`;
        const newBomb = {
            id: newBombId, ownerId: ownerId, x: gridCol * CONSTANTS.GRID_SIZE, y: gridRow * CONSTANTS.GRID_SIZE,
            gridCol: gridCol, gridRow: gridRow, timer: CONSTANTS.BOMB_FUSE_TIME_MS, range: range,
            isPiercing: isPiercing,
        };
        this.activeBombs.push(newBomb);
        console.log(`Bomb ${newBombId} placed by ${ownerId} at ${gridCol}, ${gridRow}.`);
        return true;
    }

    getBombAt(col, row) {
        return this.activeBombs.find(bomb => bomb.gridCol === col && bomb.gridRow === row);
    }

    removeBombAt(col, row, skipOwnerCheck = false) {
        for (let i = this.activeBombs.length - 1; i >= 0; i--) {
            const bomb = this.activeBombs[i];
            const bombCenterCol = Math.floor((bomb.x + CONSTANTS.GRID_SIZE / 2) / CONSTANTS.GRID_SIZE);
            const bombCenterRow = Math.floor((bomb.y + CONSTANTS.GRID_SIZE / 2) / CONSTANTS.GRID_SIZE);
            if ((bomb.gridCol === col && bomb.gridRow === row) || (bombCenterCol === col && bombCenterRow === row)) {
                const removedBomb = this.activeBombs.splice(i, 1)[0];
                if (!skipOwnerCheck) {
                    const owner = this.getPlayerById(removedBomb.ownerId);
                    if (owner?.exitingBombTile?.col === removedBomb.gridCol && owner.exitingBombTile?.row === removedBomb.gridRow) {
                        owner.exitingBombTile = null;
                    }
                }
                return true;
            }
        }
        return false;
    }

    update(deltaTime) {
        const deltaMs = deltaTime * 1000;
        const newlyExplodedBombs = [];
        const playersHit = new Set();
        const wallsDestroyedResult = [];
        const powerupsSpawned = [];

        this.updateBombTimers(deltaMs, newlyExplodedBombs);
        const { hitPlayerIds: explosionHits, triggeredBombIds: chainReactionIds } = this.updateExplosions(deltaMs);
        explosionHits.forEach(id => playersHit.add(id));
        this.triggerChainReactions(chainReactionIds, newlyExplodedBombs);

        for (const bomb of newlyExplodedBombs) {
             const { hitPlayerIdsImmediate, destroyedWallData, triggeredBombIdsImmediate } = this.createExplosion(bomb);
             hitPlayerIdsImmediate.forEach(id => playersHit.add(id));
             wallsDestroyedResult.push(...destroyedWallData);
             this.triggerChainReactions(triggeredBombIdsImmediate, newlyExplodedBombs);
        }

        for (const wall of wallsDestroyedResult) {
            if (wall.shouldSpawnPowerup) {
                const spawned = this.powerUpManager.spawnPowerup(wall.col, wall.row);
                if (spawned) {
                    powerupsSpawned.push(spawned);
                }
            }
        }

        this.activeBombs = this.activeBombs.filter(bomb => !newlyExplodedBombs.some(exploded => exploded.id === bomb.id));

        return {
            playersHit: Array.from(playersHit),
            wallsDestroyed: wallsDestroyedResult.map(w => ({ col: w.col, row: w.row })),
            powerupsSpawned: powerupsSpawned
        };
    }

    updateBombTimers(deltaMs, newlyExplodedBombs) {
         for (let i = this.activeBombs.length - 1; i >= 0; i--) {
            const bomb = this.activeBombs[i];
            bomb.timer -= deltaMs;
            if (bomb.timer <= 0) {
                if (!newlyExplodedBombs.some(b => b.id === bomb.id)) {
                    newlyExplodedBombs.push(bomb);
                }
                bomb.timer = 0; 
            }
        }
    }

    updateExplosions(deltaMs) {
        const hitPlayerIds = new Set();
        const triggeredBombIds = new Set();
        for (let i = this.activeExplosions.length - 1; i >= 0; i--) {
            const exp = this.activeExplosions[i];
            exp.timer -= deltaMs;
            if (exp.timer <= 0) {
                this.activeExplosions.splice(i, 1); continue;
            }
            const explosionRect = { x: exp.x, y: exp.y, width: exp.width, height: exp.height };
            const expCol = exp.gridCol; const expRow = exp.gridRow;
            const currentPlayers = this._getCurrentPlayersList();
            for (const player of currentPlayers) {
                if (player.isAlive && !player.isRespawning) { 
                    if (checkRectOverlap(player.getRect(), explosionRect)) { hitPlayerIds.add(player.id); }
                }
            }
            for (const bomb of this.activeBombs) {
                if (bomb.gridCol === expCol && bomb.gridRow === expRow && bomb.timer > 1 ) { 
                    if (!triggeredBombIds.has(bomb.id)) {
                        console.log(`Chain reaction: Exp ${exp.id} -> Bomb ${bomb.id}`);
                        bomb.timer = 1; triggeredBombIds.add(bomb.id);
                    }
                }
            }
        }
        return { hitPlayerIds, triggeredBombIds };
    }

    triggerChainReactions(bombIdsToTrigger, newlyExplodedBombs) {
         if (bombIdsToTrigger.size === 0) return;
         for (const bombId of bombIdsToTrigger) {
             const bomb = this.activeBombs.find(b => b.id === bombId);
             if (bomb && !newlyExplodedBombs.some(b => b.id === bombId)) {
                 bomb.timer = 1; newlyExplodedBombs.push(bomb);
             }
         }
    }

    createExplosion(bomb) {
        const { id: bombId, gridCol: bombCol, gridRow: bombRow, range, isPiercing, ownerId } = bomb;
        const tempExplosionComponents = []; // Store components for this bomb only, to manage 'isEnd' correctly
        const hitPlayerIdsImmediate = new Set();
        const destroyedWallData = [];
        const triggeredBombIdsImmediate = new Set();
        const currentPlayers = this._getCurrentPlayersList();

        const addExplosionComponent = (col, row, isEndOfChain) => {
            const explosionId = `e-${this.explosionIdCounter++}`;
            const thickness = CONSTANTS.GRID_SIZE * CONSTANTS.EXPLOSION_THICKNESS_RATIO;
            const centerX = col * CONSTANTS.GRID_SIZE + CONSTANTS.GRID_SIZE / 2;
            const centerY = row * CONSTANTS.GRID_SIZE + CONSTANTS.GRID_SIZE / 2;
            tempExplosionComponents.push({
                id: explosionId, bombId: bombId, ownerId: ownerId,
                x: centerX - thickness / 2, y: centerY - thickness / 2,
                width: thickness, height: thickness, gridCol: col, gridRow: row,
                timer: CONSTANTS.EXPLOSION_DURATION_MS, isEnd: isEndOfChain 
            });
        };
        
        // Função interna para lidar com cada tile da explosão.
        // Retorna: { stopPropagation: boolean, explosionDrawn: boolean }
        const checkAndProcessTile = (col, row) => {
            const tileType = this.map.getTileType(col, row);
            const tileRect = { x: col * CONSTANTS.GRID_SIZE, y: row * CONSTANTS.GRID_SIZE, width: CONSTANTS.GRID_SIZE, height: CONSTANTS.GRID_SIZE };

            if (tileType !== TileType.OUT_OF_BOUNDS) {
                for (const player of currentPlayers) {
                    if (player.isAlive && !player.isRespawning && checkRectOverlap(player.getRect(), tileRect)) {
                        hitPlayerIdsImmediate.add(player.id);
                    }
                }
                const bombInTile = this.activeBombs.find(b => b.gridCol === col && b.gridRow === row && b.id !== bombId && b.timer > 1);
                if (bombInTile && !triggeredBombIdsImmediate.has(bombInTile.id)) {
                    triggeredBombIdsImmediate.add(bombInTile.id);
                }
            }

            if (tileType === TileType.WALL_SOFT) {
                const result = this.map.destroySoftWall(col, row);
                if (result.destroyed) {
                    destroyedWallData.push({ col: col, row: row, shouldSpawnPowerup: result.spawnPowerup });
                    return { stopPropagation: !isPiercing, explosionDrawn: true }; // Explosion drawn, stops if not piercing
                } else { // Should not happen if getTileType was WALL_SOFT but good to be safe
                    return { stopPropagation: false, explosionDrawn: true }; // Treat as floor
                }
            } else if (tileType === TileType.WALL_HARD || tileType === TileType.DEATHMATCH_WALL) {
                return { stopPropagation: true, explosionDrawn: false }; // Stops, no explosion drawn here
            } else if (tileType === TileType.OUT_OF_BOUNDS) {
                return { stopPropagation: true, explosionDrawn: false }; // Stops, no explosion drawn here
            } else { // FLOOR or unexpected (treat as FLOOR)
                return { stopPropagation: false, explosionDrawn: true }; // Continues, explosion drawn
            }
        };

        // Processa o tile central (onde a bomba estava)
        // isEnd for center tile is true only if range is 0.
        // If range > 0, the tips of the branches will be 'isEnd'.
        const centerTileResult = checkAndProcessTile(bombCol, bombRow);
        if (centerTileResult.explosionDrawn) {
            addExplosionComponent(bombCol, bombRow, range === 0);
        }
        // Even if center tile is WALL_HARD (e.g. bomb placed by hack), we stop propagation.
        if(centerTileResult.stopPropagation && range > 0) {
             this.activeExplosions.push(...tempExplosionComponents);
             return { hitPlayerIdsImmediate, destroyedWallData, triggeredBombIdsImmediate };
        }


        const directions = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
        for (const dir of directions) {
            for (let i = 1; i <= range; i++) {
                const currentCol = bombCol + dir.dc * i;
                const currentRow = bombRow + dir.dr * i;

                const tileProcessingResult = checkAndProcessTile(currentCol, currentRow);

                if (tileProcessingResult.explosionDrawn) {
                    const isLastTileInBranch = (i === range) || tileProcessingResult.stopPropagation;
                    addExplosionComponent(currentCol, currentRow, isLastTileInBranch);
                }

                if (tileProcessingResult.stopPropagation) {
                    break; 
                }
            }
        }
        
        this.activeExplosions.push(...tempExplosionComponents);
        return { hitPlayerIdsImmediate, destroyedWallData, triggeredBombIdsImmediate };
    }

    getState() {
        const bombsState = this.activeBombs.map(bomb => ({
            id: bomb.id, ownerId: bomb.ownerId, x: bomb.x, y: bomb.y,
            gridCol: bomb.gridCol, gridRow: bomb.gridRow, 
        }));
        const explosionsState = this.activeExplosions.map(exp => ({
            id: exp.id, bombId: exp.bombId, x: exp.x, y: exp.y,
            width: exp.width, height: exp.height, gridCol: exp.gridCol, gridRow: exp.gridRow,
            isEnd: exp.isEnd,
        }));
        return { bombs: bombsState, explosions: explosionsState };
    }
}