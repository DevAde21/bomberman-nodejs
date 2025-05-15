// client/js/components/ClientRenderer.js

import { CONSTANTS, TileType, PowerupType } from './ClientConstants.js';
import { hexToRgb, interpolateColor } from './ClientUtils.js';

export class ClientRenderer {
    constructor(ctx, canvasWidth, canvasHeight) {
        this.ctx = ctx;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        // Cache de cores RGB para interpolação
        this.COLOR_POWERUP_SPEED_RGB = hexToRgb(CONSTANTS.COLOR_POWERUP_SPEED);
        this.COLOR_AURA_SHIELD_BASE_RGB = hexToRgb(CONSTANTS.COLOR_AURA_SHIELD);

        // Variáveis para animações cliente
        this.globalPulse = 0;
        this.explosionTimers = new Map(); // Map<explosionId, startTime>
        this.playedExplosionSoundsForBombIds = new Set(); // Para controlar som de explosão por bomba
    }

    resetExplosionSounds() { // Método para resetar no fim do jogo ou desconexão
        this.playedExplosionSoundsForBombIds.clear();
        this.explosionTimers.clear(); // Também limpa timers de animação
    }

    render(gameState, localPlayerId, audioMgr) { // Adicionado audioMgr
        if (!gameState) {
            // Optionally draw a "Waiting for state..." message
            this.ctx.fillStyle = CONSTANTS.COLOR_BACKGROUND;
            this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
            this.drawText("Waiting for game state...", this.canvasWidth / 2, this.canvasHeight / 2, 20, CONSTANTS.COLOR_UI_TEXT, 'center', 'middle', null, 0);
            return;
        }

        // Limpa com a cor de fundo definida nas constantes
        this.ctx.fillStyle = CONSTANTS.COLOR_BACKGROUND;
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        this.globalPulse = Date.now();

        // Limpar IDs de bombas cujas explosões já terminaram do nosso Set de controle de som
        // Esta lógica é importante para permitir que o som de uma *nova* explosão da mesma bomba (se possível no futuro) toque novamente
        // Mas, com a lógica atual, uma bomba explode uma vez. Então é mais para limpar o Set.
        const currentBombIdsInActiveExplosions = new Set();
        if (gameState.explosions && gameState.explosions.length > 0) {
            gameState.explosions.forEach(exp => currentBombIdsInActiveExplosions.add(exp.bombId));
        }
        
        const bombIdsToRemoveFromSoundSet = [];
        this.playedExplosionSoundsForBombIds.forEach(bombId => {
            if (!currentBombIdsInActiveExplosions.has(bombId)) {
                // Se não há mais explosões ativas para este bombId, ele pode ser removido do set de sons tocados
                bombIdsToRemoveFromSoundSet.push(bombId);
            }
        });
        bombIdsToRemoveFromSoundSet.forEach(bombId => this.playedExplosionSoundsForBombIds.delete(bombId));


        this.drawMap(gameState.map);
        this.drawPowerups(gameState.powerups || []);
        this.drawBombs(gameState.bombs || []);
        this.drawExplosions(gameState.explosions || [], audioMgr); // Passa audioMgr
        this.drawPlayers(gameState.players || [], localPlayerId);
        this.drawCanvasUI(gameState, localPlayerId);
    }

    drawMap(mapData) {
        if (!mapData || mapData.length === 0) return;
        const rows = mapData.length; const cols = mapData[0].length;
        const wallRadius = CONSTANTS.WALL_CORNER_RADIUS; // Pega o raio definido

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const tileType = mapData[row]?.[col];
                const x = col * CONSTANTS.GRID_SIZE;
                const y = row * CONSTANTS.GRID_SIZE;
                let color;
                let useRoundRect = false; // Flag para usar roundRect

                switch (tileType) {
                    case TileType.FLOOR:
                        color = CONSTANTS.COLOR_FLOOR;
                        break;
                    case TileType.WALL_SOFT:
                        color = CONSTANTS.COLOR_WALL_SOFT;
                        useRoundRect = true; // Arredondar soft walls
                        break;
                    case TileType.WALL_HARD:
                        color = CONSTANTS.COLOR_WALL_HARD;
                        useRoundRect = true; // Arredondar hard walls
                        break;
                    case TileType.DEATHMATCH_WALL:
                        color = CONSTANTS.COLOR_WALL_DEATHMATCH;
                        useRoundRect = true; // Arredondar deathmatch walls
                        break;
                    default: // Inclui OUT_OF_BOUNDS ou tipos inesperados
                        color = CONSTANTS.COLOR_BACKGROUND; // Pinta como fundo
                        break;
                }

                this.ctx.fillStyle = color;
                const drawX = x + 1; // Adiciona padding
                const drawY = y + 1;
                const drawWidth = CONSTANTS.GRID_SIZE - 2; // Ajusta tamanho pelo padding
                const drawHeight = CONSTANTS.GRID_SIZE - 2;

                if (useRoundRect && drawWidth > 0 && drawHeight > 0) {
                    this.ctx.beginPath();
                    // Garante que o raio não seja maior que metade da menor dimensão
                    const actualRadius = Math.min(wallRadius, drawWidth / 2, drawHeight / 2);
                    this.ctx.roundRect(drawX, drawY, drawWidth, drawHeight, actualRadius);
                    this.ctx.fill();
                } else if (tileType === TileType.FLOOR) {
                    // Usa fillRect para o chão (sem arredondamento)
                    this.ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
                }
                 // Não desenha nada para OUT_OF_BOUNDS ou outros tipos
            }
        }
    }

    drawPowerups(powerups) {
        this.ctx.save();
        this.ctx.globalAlpha = CONSTANTS.POWERUP_ALPHA; // Aplica alpha global para powerups

        for (const powerup of powerups) {
            const centerX = powerup.x + CONSTANTS.GRID_SIZE / 2;
            const centerY = powerup.y + CONSTANTS.GRID_SIZE / 2;
            const radius = (CONSTANTS.GRID_SIZE * CONSTANTS.POWERUP_DRAW_SIZE_RATIO) / 2;

            let color = CONSTANTS.COLOR_UI_PANEL; // Cor padrão (cinza) para tipo desconhecido

            switch (powerup.type) {
                case PowerupType.RANGE: color = CONSTANTS.COLOR_POWERUP_RANGE; break;
                case PowerupType.COUNT: color = CONSTANTS.COLOR_POWERUP_COUNT; break;
                case PowerupType.SPEED: color = CONSTANTS.COLOR_POWERUP_SPEED; break;
                case PowerupType.SHIELD: color = CONSTANTS.COLOR_POWERUP_SHIELD; break;
                case PowerupType.PIERCE: color = CONSTANTS.COLOR_POWERUP_PIERCE; break;
                default:
                     // console.warn(`ClientRenderer: Unknown powerup type: ${powerup.type}`);
                     continue; // Não desenha se o tipo for inválido/desconhecido
            }

            // Desenha o círculo colorido
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Adiciona uma pequena borda interna ou brilho para destaque (opcional)
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
        }
        this.ctx.restore(); // Restaura globalAlpha
    }


    drawBombs(bombs) {
        for (const bomb of bombs) {
            const x = bomb.x; const y = bomb.y;
            const drawSize = CONSTANTS.GRID_SIZE * CONSTANTS.BOMB_DRAW_SIZE_RATIO;
            const centerX = x + CONSTANTS.GRID_SIZE / 2; const centerY = y + CONSTANTS.GRID_SIZE / 2;
            // Usa globalPulse e uma constante para a velocidade do pulso no cliente
            const pulseFactor = 1 + Math.sin(this.globalPulse * CONSTANTS.BOMB_PULSE_CLIENT_SIDE_SPEED * 0.001) * CONSTANTS.BOMB_MAX_PULSE;
            const baseRadius = drawSize * 0.4; const currentRadius = baseRadius * pulseFactor;
            // Desenha corpo da bomba
            this.ctx.fillStyle = CONSTANTS.COLOR_BOMB; this.ctx.beginPath(); this.ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2); this.ctx.fill();
             // Adiciona uma pequena borda clara para definição
             this.ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)'; this.ctx.lineWidth = 1; this.ctx.stroke();
            // Desenha pavio
            const fuseHeight = drawSize * 0.15; const fuseWidth = drawSize * 0.08;
            const fuseBaseX = centerX; const fuseBaseY = centerY - currentRadius; // Base do pavio no topo da bomba
            this.ctx.fillStyle = CONSTANTS.COLOR_BOMB_FUSE; this.ctx.fillRect(fuseBaseX - fuseWidth / 2, fuseBaseY - fuseHeight, fuseWidth, fuseHeight);
            // Desenha faísca
            const sparkCycle = 1000 / CONSTANTS.BOMB_SPARK_CYCLE_DIVIDER; const sparkProgress = (this.globalPulse % sparkCycle) / sparkCycle;
            const sparkSize = Math.max(1, (1 - Math.abs(sparkProgress - 0.5) * 2) * (drawSize * 0.1)); // Spark diminui e aumenta
            if (sparkSize > 1) {
                 this.ctx.fillStyle = (this.globalPulse % (sparkCycle / 2) < sparkCycle / 4) ? CONSTANTS.COLOR_BOMB_SPARK_1 : CONSTANTS.COLOR_BOMB_SPARK_2;
                 this.ctx.beginPath(); this.ctx.arc(fuseBaseX, fuseBaseY - fuseHeight, sparkSize, 0, Math.PI * 2); this.ctx.fill();
            }
        }
    }

    drawExplosions(explosions, audioMgr) { // Adicionado audioMgr
        this.ctx.save();
        this.ctx.fillStyle = CONSTANTS.COLOR_EXPLOSION;

        const now = Date.now();
        const currentExplosionComponentIdsOnScreen = new Set(explosions.map(e => e.id));

        // Limpa timers de explosões que não existem mais
        this.explosionTimers.forEach((startTime, id) => {
            if (!currentExplosionComponentIdsOnScreen.has(id)) {
                this.explosionTimers.delete(id);
            }
        });

        for (const exp of explosions) {
            // Registra o tempo de início se for uma nova explosão (componente)
            if (!this.explosionTimers.has(exp.id)) {
                 this.explosionTimers.set(exp.id, now);
                 // Tocar som se este é o primeiro componente de uma nova bomba explodindo 
                 // E o som ainda não foi tocado para este bombId específico
                 if (audioMgr && !this.playedExplosionSoundsForBombIds.has(exp.bombId)) {
                     audioMgr.playSound('bomb_explosion');
                     this.playedExplosionSoundsForBombIds.add(exp.bombId); // Marca que o som para esta bomba já tocou
                 }
            }

            const startTime = this.explosionTimers.get(exp.id);
            const elapsedTime = now - startTime;
            const duration = CONSTANTS.EXPLOSION_DURATION_MS;

            // Calcula o fator de encolhimento (1 no início, 0 no fim)
            const shrinkFactor = Math.max(0, 1 - (elapsedTime / duration));

            if (shrinkFactor <= 0) {
                 // this.explosionTimers.delete(exp.id); // Não precisa deletar aqui, a limpeza no início do loop faz isso.
                 continue; // Não desenha mais
            }

            const baseSize = exp.width; // Usa a largura como tamanho base (eram quadrados)
            const currentDiameter = baseSize * shrinkFactor;

            if (currentDiameter < 1) continue;

            // Centro do componente de explosão
            const compCenterX = exp.x + exp.width / 2;
            const compCenterY = exp.y + exp.height / 2;

            // Alpha diminui junto com o tamanho para fade out
            this.ctx.globalAlpha = Math.max(0, Math.min(1, shrinkFactor * 1.5)); // Multiplicador para começar mais opaco
            this.ctx.beginPath();
            this.ctx.arc(compCenterX, compCenterY, currentDiameter / 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.restore(); // Restaura alpha global
    }

    drawPlayers(players, localPlayerId) {
        for (const player of players) {
             if (!player.isAlive || player.isRespawning) continue; // Não desenha se morto ou respawnando (msg de respawn é separada)

            const x = player.x; const y = player.y;
            const width = CONSTANTS.GRID_SIZE * CONSTANTS.PLAYER_WIDTH_RATIO;
            const height = CONSTANTS.GRID_SIZE * CONSTANTS.PLAYER_HEIGHT_RATIO;
            const playerCornerRadius = 5; // Cantos arredondados para players

            // 1. Desenha Aura de Escudo (se ativo)
            if (player.shieldActive && this.COLOR_AURA_SHIELD_BASE_RGB) {
                 const auraThickness = 4;
                 // Pulso mais suave para a aura
                 const shieldPulseAlpha = (Math.sin(this.globalPulse * 0.008) + 1) / 2 * 0.2 + 0.6; // 0.6 a 0.8 alpha
                 const shieldColor = CONSTANTS.COLOR_AURA_SHIELD_RGBA.replace('--OPACITY--', shieldPulseAlpha.toFixed(2));
                 this.ctx.fillStyle = shieldColor; this.ctx.beginPath(); const shieldRadius = playerCornerRadius + auraThickness / 2;
                 this.ctx.roundRect( x - auraThickness / 2, y - auraThickness / 2, width + auraThickness, height + auraThickness, shieldRadius ); this.ctx.fill();
            }

            // 2. Desenha Corpo do Jogador
            let playerDrawColor = player.color; const playerBaseColorRgb = hexToRgb(player.color);
             // Efeito de pulso de cor para speed boost
             if (player.speedBoostActive && playerBaseColorRgb && this.COLOR_POWERUP_SPEED_RGB) {
                 const t = (Math.sin(this.globalPulse * 0.025) + 1) / 2; // Velocidade do pulso de cor
                 playerDrawColor = interpolateColor(playerBaseColorRgb, this.COLOR_POWERUP_SPEED_RGB, t * 0.6); // Interpola só um pouco (60%) para não ficar totalmente azul
             }
             this.ctx.fillStyle = playerDrawColor; this.ctx.beginPath(); this.ctx.roundRect(x, y, width, height, playerCornerRadius); this.ctx.fill();

             // 3. Desenha Indicador de Jogador Local (se aplicável)
             if (player.id === localPlayerId) {
                 this.ctx.fillStyle = CONSTANTS.COLOR_LOCAL_PLAYER_INDICATOR;
                 this.ctx.beginPath();
                 const indicatorBaseY = y - 5; // Posição do indicador
                 const indicatorHeight = 8;
                 const indicatorWidth = 10;
                 this.ctx.moveTo(x + width / 2, indicatorBaseY - indicatorHeight); // Ponto de cima
                 this.ctx.lineTo(x + width / 2 - indicatorWidth / 2, indicatorBaseY); // Base esquerda
                 this.ctx.lineTo(x + width / 2 + indicatorWidth / 2, indicatorBaseY); // Base direita
                 this.ctx.closePath();
                 this.ctx.fill();
             }
        }
    }

    drawCanvasUI(gameState, localPlayerId) {
        const player = gameState?.players?.find(p => p.id === localPlayerId);

         // Mensagem de Respawn - REMOVIDO
         /*
         if (player?.isRespawning) {
             this.drawText("RESPAWNING", this.canvasWidth / 2, this.canvasHeight / 2 - 30, 36, CONSTANTS.COLOR_TEXT_RESPAWN, 'center', 'middle', 'rgba(0,0,0,0.5)', 2);
         }
         */

        // Mensagem de Anúncio do Deathmatch - REMOVIDO
        /*
        if (gameState?.deathmatch?.isActive && !gameState?.deathmatch?.isShrinkingComplete) {
            const deathmatchStartTime = gameState.deathmatch.activationTime; // Precisa ser enviado pelo servidor
            const timeSinceStart = Date.now() - (deathmatchStartTime || Date.now()); // Precisa do activationTime

             if (!deathmatchStartTime || timeSinceStart < CONSTANTS.DEATHMATCH_ANNOUNCEMENT_DURATION_MS) {
                 this.drawText("DEATHMATCH!", this.canvasWidth / 2, 40, 40, CONSTANTS.COLOR_TEXT_DEATHMATCH_FILL, 'center', 'middle', CONSTANTS.COLOR_TEXT_DEATHMATCH_STROKE, 4);
             }
        }
        */
    }

    // Função helper para desenhar texto centralizado com stroke
    drawText(text, x, y, size = 30, fillStyle = '#FFF', textAlign = 'center', textBaseline = 'middle', strokeStyle = null, lineWidth = 3) {
        this.ctx.font = `bold ${size}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`; // Usa a mesma fonte do body
        this.ctx.fillStyle = fillStyle;
        this.ctx.textAlign = textAlign;
        this.ctx.textBaseline = textBaseline;

        if (strokeStyle && lineWidth > 0) {
            this.ctx.strokeStyle = strokeStyle;
            this.ctx.lineWidth = lineWidth;
            this.ctx.lineJoin = 'round'; // Melhora aparência dos cantos do stroke
            this.ctx.strokeText(text, x, y);
        }
        this.ctx.fillText(text, x, y);
    }
}