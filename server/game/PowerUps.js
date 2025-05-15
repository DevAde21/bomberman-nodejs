// server/game/PowerUps.js

import { CONSTANTS, PowerupType } from './ServerConstants.js';
import { checkRectOverlap } from './ServerUtils.js';

export class PowerUpManager {
    constructor() {
        this.activePowerups = []; 
        this.powerupIdCounter = 0;
    }

    reset() {
        this.activePowerups = [];
        this.powerupIdCounter = 0;
        console.log("Server PowerUp manager reset.");
    }

    spawnPowerup(col, row) {
        if (this.getPowerupAt(col, row)) {
            console.log(`Powerup spawn blocked at ${col},${row}: Already occupied.`);
            return null; 
        }

        // Lista dos tipos de powerups disponíveis
        const availablePowerupTypes = [
            PowerupType.RANGE,
            PowerupType.COUNT,
            PowerupType.SPEED,
            PowerupType.SHIELD,
            PowerupType.PIERCE
        ];

        // Seleciona aleatoriamente um tipo da lista
        const randomIndex = Math.floor(Math.random() * availablePowerupTypes.length);
        const powerupType = availablePowerupTypes[randomIndex];

        if (powerupType) {
            const powerupId = `p-${this.powerupIdCounter++}`;
            const newPowerup = {
                id: powerupId,
                type: powerupType,
                x: col * CONSTANTS.GRID_SIZE,
                y: row * CONSTANTS.GRID_SIZE,
                gridCol: col,
                gridRow: row,
                width: CONSTANTS.GRID_SIZE,
                height: CONSTANTS.GRID_SIZE,
            };
            this.activePowerups.push(newPowerup);
            console.log(`Spawned ${powerupType} (ID: ${powerupId}) at ${col},${row}`);
            return newPowerup; 
        }
        // Este caso não deveria acontecer se availablePowerupTypes não estiver vazio
        console.warn(`Powerup spawn failed at ${col},${row}: No powerupType selected.`);
        return null; 
    }

    checkCollection(player) {
        if (!player || !player.isAlive || player.isRespawning) return null;

        const playerRect = player.getRect();

        for (let i = this.activePowerups.length - 1; i >= 0; i--) {
            const powerup = this.activePowerups[i];
            const powerupRect = { x: powerup.x, y: powerup.y, width: powerup.width, height: powerup.height };

            if (checkRectOverlap(playerRect, powerupRect)) {
                const collectedPowerup = this.activePowerups.splice(i, 1)[0]; 
                console.log(`Player ${player.id} collected ${collectedPowerup.type} (ID: ${collectedPowerup.id})`);
                player.applyPowerupEffect(collectedPowerup.type);
                return collectedPowerup; 
            }
        }
        return null; 
    }

    checkExplosionCollision(explosionRect) {
        for (let i = this.activePowerups.length - 1; i >= 0; i--) {
            const powerup = this.activePowerups[i];
            const powerupRect = { x: powerup.x, y: powerup.y, width: powerup.width, height: powerup.height };

            if (checkRectOverlap(explosionRect, powerupRect)) {
                const destroyedPowerup = this.activePowerups.splice(i, 1)[0];
                console.log(`Explosion destroyed ${destroyedPowerup.type} (ID: ${destroyedPowerup.id})`);
                return destroyedPowerup;
            }
        }
        return null;
    }

    removePowerupAt(col, row) {
         for (let i = this.activePowerups.length - 1; i >= 0; i--) {
            const powerup = this.activePowerups[i];
            if (powerup.gridCol === col && powerup.gridRow === row) {
                 const removedPowerup = this.activePowerups.splice(i, 1)[0];
                 console.log(`Removed ${removedPowerup.type} (ID: ${removedPowerup.id}) at ${col},${row}`);
                 return removedPowerup;
            }
         }
         return null;
    }

    getPowerupAt(col, row) {
         return this.activePowerups.find(p => p.gridCol === col && p.gridRow === row);
    }

    getState() {
        return this.activePowerups.map(p => ({
            id: p.id,
            type: p.type,
            x: p.x,
            y: p.y,
        }));
    }
}