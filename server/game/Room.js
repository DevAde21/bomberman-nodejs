// server/game/Room.js

import { v4 as uuidv4 } from 'uuid';
import { CONSTANTS, MessageType, PowerupType, TileType, GameRoomState } from './ServerConstants.js';
import { Map as GameMapClass } from './Map.js';
import { Player } from './Player.js';
import { BombManager } from './Bomb.js';
import { PowerUpManager } from './PowerUps.js';
import { Deathmatch } from './Deathmatch.js';

export class Room {
    constructor(roomId, broadcastCallback) {
        this.id = roomId;
        this.broadcast = broadcastCallback;
        this.players = new Map(); // Map<playerId, Player>
        this.roomState = GameRoomState.LOBBY;
        this.gameLoopInterval = null;
        this.lastUpdateTime = 0;
        this.hostPlayerId = null;
        this.playerJoinOrder = []; // Mantém a ordem de entrada para fallback de cores e host
        this.gameStartedWithSinglePlayer = false;

        console.log(`Room ${this.id}: Constructor started.`);
        this.gameMap = new GameMapClass();
        this.powerUpManager = new PowerUpManager();
        this.bombManager = new BombManager(this.gameMap, this.players, this.powerUpManager);
        this.deathmatch = new Deathmatch(this.gameMap, this.players, this.bombManager, this.powerUpManager);
        console.log(`Room ${this.id}: Components initialized.`);
    }

    addPlayer(ws, nickname, preferredColor = 'random') { // Aceita nickname e preferredColor
        console.log(`Room ${this.id}: Attempting to add player "${nickname}" (Prefers: ${preferredColor}). Current Size: ${this.players.size}`);
        if (this.players.size >= CONSTANTS.MAX_PLAYERS_PER_ROOM) { return { success: false, reason: 'Room is full' }; }
        if (this.roomState !== GameRoomState.LOBBY) { return { success: false, reason: 'Game in progress' }; }

        const playerId = uuidv4();
        // O índice aqui é o índice de entrada no lobby, usado para fallback de cor.
        // O player.index final (0-3 para o jogo) será definido em startGame.
        const lobbyJoinIndex = this.playerJoinOrder.length;

        if (lobbyJoinIndex < 0 || lobbyJoinIndex >= CONSTANTS.MAX_PLAYERS_PER_ROOM ) {
             console.error(`ROOM ${this.id}: CRITICAL - Invalid lobby join index (${lobbyJoinIndex}) calculation.`);
             return { success: false, reason: 'Internal server error calculating player index.' };
        }

        // Passa nickname e preferredColor para o construtor do Player
        const player = new Player(playerId, lobbyJoinIndex, this.gameMap, this.bombManager, this.players, nickname, preferredColor);
        this.players.set(playerId, player);
        this.playerJoinOrder.push(playerId); // Adiciona à ordem de entrada

        // Tenta atribuir a cor preferida ou uma cor de fallback no lobby
        this._assignInitialLobbyColor(player);

        if (!this.hostPlayerId) {
            this.hostPlayerId = playerId;
            console.log(`Room ${this.id}: Player ${playerId} (Nick: ${player.nickname}) is now the HOST.`);
        }

        console.log(`Room ${this.id}: Player ${playerId} (Nick: ${player.nickname}, Lobby Color: ${player.color}) added. New size: ${this.players.size}. Host: ${this.hostPlayerId}`);

        // Informa a todos (exceto o que entrou) sobre o novo jogador (incluindo sua cor inicial no lobby)
        const joinPayload = {
             player: player.getState(),
             hostPlayerId: this.hostPlayerId
        };
        this.broadcastMessage({ type: MessageType.PLAYER_JOINED, payload: joinPayload }, playerId);

        return { success: true, playerId: playerId, hostPlayerId: this.hostPlayerId };
    }

    _assignInitialLobbyColor(playerInstance) {
        const preferred = playerInstance.preferredColor;
        let assignedColor = null;
        const usedColors = Array.from(this.players.values()).map(p => p.color).filter(c => c !== null);

        if (preferred !== 'random' && CONSTANTS.PLAYER_SELECTABLE_COLORS.includes(preferred) && !usedColors.includes(preferred)) {
            assignedColor = preferred;
        } else {
            // Tenta cor de fallback baseada no índice de entrada no lobby
            for (let i = 0; i < CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX.length; i++) {
                const defaultColorForIndex = CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX[(playerInstance.index + i) % CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX.length]; // Tenta a cor do índice e as próximas
                if (!usedColors.includes(defaultColorForIndex)) {
                    assignedColor = defaultColorForIndex;
                    break;
                }
            }
            // Se todas as cores padrão já estiverem em uso (improvável com 4 jogadores e 4 cores padrão),
            // pega a primeira cor selecionável não usada, ou a primeira padrão se tudo falhar
            if (!assignedColor) {
                for (const selColor of CONSTANTS.PLAYER_SELECTABLE_COLORS) {
                    if (!usedColors.includes(selColor)) {
                        assignedColor = selColor;
                        break;
                    }
                }
                if (!assignedColor) assignedColor = CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX[0]; // Último recurso
            }
        }
        playerInstance.color = assignedColor; // Atribui a cor para o estado do lobby
    }


    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;

        const wasHost = (playerId === this.hostPlayerId);
        this.players.delete(playerId);
        this.playerJoinOrder = this.playerJoinOrder.filter(id => id !== playerId);

        console.log(`ROOM ${this.id}: Player ${playerId} (Nick: ${player.nickname}) removed. New size: ${this.players.size}`);

        let newHostId = this.hostPlayerId;
        let hostActuallyChanged = false;

        if (wasHost) {
            if (this.playerJoinOrder.length > 0) {
                newHostId = this.playerJoinOrder[0];
                this.hostPlayerId = newHostId;
            } else {
                newHostId = null;
                this.hostPlayerId = null;
            }
            hostActuallyChanged = true;
            const newHostNick = this.players.get(this.hostPlayerId)?.nickname || 'N/A';
            console.log(`ROOM ${this.id}: Host ${playerId} left. New host is ${this.hostPlayerId} (Nick: ${newHostNick}).`);
        }

        // Reavalia as cores dos jogadores restantes no lobby, se necessário
        if (this.roomState === GameRoomState.LOBBY) {
            this._reassignLobbyColors();
        }

        const leavePayload = { playerId: playerId };
        if (hostActuallyChanged) {
            leavePayload.newHostId = newHostId;
        }
        this.broadcastMessage({ type: MessageType.PLAYER_LEFT, payload: leavePayload });

        if (this.players.size > 0 && this.roomState === GameRoomState.LOBBY) {
             this.broadcastGameState(); // Envia o estado atualizado do lobby
        }


        if (this.roomState === GameRoomState.PLAYING) {
            this.checkGameOverCondition();
        } else if (this.roomState === GameRoomState.LOBBY && this.players.size === 0) {
            console.log(`ROOM ${this.id}: Lobby empty.`);
        }
    }

    handlePlayerColorChoice(playerId, chosenColor) {
        if (this.roomState !== GameRoomState.LOBBY) {
            console.warn(`ROOM ${this.id}: Player ${playerId} tried to change color, but not in LOBBY state.`);
            return;
        }
        const player = this.players.get(playerId);
        if (!player) {
            console.warn(`ROOM ${this.id}: Player ${playerId} not found for color choice.`);
            return;
        }

        console.log(`ROOM ${this.id}: Player ${playerId} (Nick: ${player.nickname}) chose color ${chosenColor}.`);
        player.preferredColor = chosenColor; // Atualiza a preferência
        this._reassignLobbyColors(); // Reavalia as cores de todos no lobby

        this.broadcastGameState(); // Envia o novo estado com cores atualizadas
    }

    _reassignLobbyColors() {
        if (this.roomState !== GameRoomState.LOBBY) return;

        const currentPlayers = Array.from(this.players.values()).sort((a,b) => this.playerJoinOrder.indexOf(a.id) - this.playerJoinOrder.indexOf(b.id));
        let usedColors = [];

        // Primeira passagem: tenta satisfazer as preferências não-'random'
        for (const p of currentPlayers) {
            if (p.preferredColor !== 'random' && CONSTANTS.PLAYER_SELECTABLE_COLORS.includes(p.preferredColor) && !usedColors.includes(p.preferredColor)) {
                p.color = p.preferredColor;
                usedColors.push(p.color);
            } else {
                p.color = null; // Marca para atribuição na segunda passagem
            }
        }

        // Segunda passagem: atribui cores para 'random' ou preferências não satisfeitas
        for (const p of currentPlayers) {
            if (p.color === null) { // Se ainda não tem cor
                let foundColor = false;
                // Se a preferência era 'random' ou não pôde ser atendida, tenta cores padrão por índice de entrada
                for (let i = 0; i < CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX.length; i++) {
                    const lobbyIndex = this.playerJoinOrder.indexOf(p.id);
                    const colorTry = CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX[(lobbyIndex + i) % CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX.length];
                    if (!usedColors.includes(colorTry)) {
                        p.color = colorTry;
                        usedColors.push(p.color);
                        foundColor = true;
                        break;
                    }
                }
                // Se ainda não encontrou (todas as padrão do índice em uso), tenta qualquer selecionável livre
                if (!foundColor) {
                    for (const selColor of CONSTANTS.PLAYER_SELECTABLE_COLORS) {
                        if (!usedColors.includes(selColor)) {
                            p.color = selColor;
                            usedColors.push(p.color);
                            foundColor = true;
                            break;
                        }
                    }
                }
                // Último recurso (não deveria acontecer com 4 slots e >4 cores)
                if (!foundColor) {
                    p.color = CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX[0]; // Garante uma cor
                    // Não adiciona a usedColors aqui pois pode ser duplicada, mas é melhor que null.
                    console.warn(`ROOM ${this.id}: Could not assign unique color for ${p.nickname}, fallback to default.`)
                }
            }
        }
        console.log(`ROOM ${this.id}: Lobby colors reassigned. Players: ${currentPlayers.map(p=> ({n:p.nickname, c:p.color}))}`);
    }


    requestStartGame(requestingPlayerId) {
        const requestingPlayerNick = this.players.get(requestingPlayerId)?.nickname || 'N/A';
        console.log(`ROOM ${this.id}: Rcvd start game req from ${requestingPlayerId} (Nick: ${requestingPlayerNick}). Host: ${this.hostPlayerId}. State: ${this.roomState}`);

        if (this.roomState !== GameRoomState.LOBBY) {
            console.warn(`ROOM ${this.id}: Start req denied. Not in LOBBY.`); return false;
        }
        if (requestingPlayerId !== this.hostPlayerId) {
            console.warn(`ROOM ${this.id}: Start req denied. ${requestingPlayerId} not host.`); return false;
        }
        if (this.players.size < 1) {
            console.warn(`ROOM ${this.id}: Start req denied. Not enough players (0).`); return false;
        }

        console.log(`ROOM ${this.id}: Start req APPROVED from host ${this.hostPlayerId} (Nick: ${requestingPlayerNick}).`);
        this.startGame();
        return true;
    }

    handlePlayerInput(playerId, inputData) {
        if (this.roomState !== GameRoomState.PLAYING) return;
        const player = this.players.get(playerId);
        if (player?.isAlive && !player.isRespawning) { player.applyInput(inputData); }
    }

    applyMaxPowerupsToPlayer(playerId) {
        if (this.roomState !== GameRoomState.PLAYING) {
            console.log(`ROOM ${this.id}: Cannot apply debug powerups, game not in PLAYING state.`);
            return;
        }
        const player = this.players.get(playerId);
        if (player && player.isAlive) {
            player.applyMaxPowerupsDebug();
            const playerNick = player.nickname || 'N/A';
            console.log(`ROOM ${this.id}: Applied MAX powerups (debug) to player ${playerId} (Nick: ${playerNick}).`);
            this.broadcastGameState();
        } else {
            console.log(`ROOM ${this.id}: Could not apply debug powerups to player ${playerId} (not found or not alive).`);
        }
    }

    startGame() {
        if (this.roomState !== GameRoomState.LOBBY) {
             console.warn(`ROOM ${this.id}: Tried startGame() but state is ${this.roomState}. Aborting.`);
             return;
        }
        console.log(`ROOM ${this.id}: >>> Executing startGame() for ${this.players.size} players! <<<`);
        
        this.gameMap.initializeMap();
        this.powerUpManager.reset();
        this.bombManager.reset();
        this.deathmatch.reset();

        console.log(`ROOM ${this.id}: Assigning final game indices and colors...`);
        // Usa playerJoinOrder para determinar o índice final no jogo (0, 1, 2, 3)
        // Isso garante que os jogadores que entraram primeiro tenham prioridade nas cores padrão se houver conflitos.
        let finalPlayersInGameOrder = [];
        this.playerJoinOrder.forEach(pId => {
            const player = this.players.get(pId);
            if (player) finalPlayersInGameOrder.push(player);
        });

        let usedColorsFinal = [];
        let playerFinalGameIndex = 0;

        finalPlayersInGameOrder.forEach(player => {
            let chosenColor = null;
            // 1. Tenta a cor preferida se não for 'random' e estiver disponível
            if (player.preferredColor !== 'random' && CONSTANTS.PLAYER_SELECTABLE_COLORS.includes(player.preferredColor) && !usedColorsFinal.includes(player.preferredColor)) {
                chosenColor = player.preferredColor;
            } else {
                // 2. Tenta cor padrão baseada no índice FINAL de jogo
                for (let i = 0; i < CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX.length; i++) {
                    const defaultColorForSlot = CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX[(playerFinalGameIndex + i) % CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX.length];
                    if (!usedColorsFinal.includes(defaultColorForSlot)) {
                        chosenColor = defaultColorForSlot;
                        break;
                    }
                }
                // 3. Se ainda não tem cor (cores padrão já usadas), pega a próxima selecionável livre
                if (!chosenColor) {
                    for (const selColor of CONSTANTS.PLAYER_SELECTABLE_COLORS) {
                        if (!usedColorsFinal.includes(selColor)) {
                            chosenColor = selColor;
                            break;
                        }
                    }
                }
                // 4. Último recurso (não deveria acontecer com 4 jogadores)
                if (!chosenColor) {
                     chosenColor = CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX[playerFinalGameIndex % CONSTANTS.PLAYER_DEFAULT_COLORS_BY_INDEX.length]; // Pegar uma cor, mesmo que repetida
                     console.warn(`ROOM ${this.id}: Player ${player.nickname} had to take a potentially non-unique color ${chosenColor}`);
                }
            }
            
            usedColorsFinal.push(chosenColor);
            player.assignFinalColor(playerFinalGameIndex, chosenColor); // Player atualiza seu índice e cor
            player.resetForNewGame(); // Player reseta suas props de jogo usando o índice final
            console.log(`Room ${this.id}: Player ${player.id} (Nick: ${player.nickname}) starts game with final index ${player.index} and color ${player.color}.`);
            playerFinalGameIndex++;
        });

        this.roomState = GameRoomState.PLAYING;
        this.gameStartedWithSinglePlayer = (this.players.size === 1);
        console.log(`Room ${this.id}: Game started with single player: ${this.gameStartedWithSinglePlayer}`);

        console.log(`ROOM ${this.id}: Broadcasting GAME_START...`);
        this.broadcastMessage({ type: MessageType.GAME_START, payload: this.getFullGameState() });
        this.lastUpdateTime = Date.now();
        if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);
        this.gameLoopInterval = setInterval(() => this.gameLoop(), CONSTANTS.SERVER_TICK_RATE);
        console.log(`ROOM ${this.id}: Game loop started (Interval ID: ${this.gameLoopInterval}).`);
    }

    gameLoop() {
        try {
            if (this.roomState !== GameRoomState.PLAYING) { this.stopGameLoop(); return; }
            const now = Date.now();
            const delta = (now - this.lastUpdateTime) / 1000.0;
            this.lastUpdateTime = now;

            if (delta <= 0 || delta > 0.8) {
                 if (delta > 0.8 || delta < 0) console.warn(`ROOM ${this.id}: Unusual delta: ${delta.toFixed(3)}s. Loop skip.`);
                return;
            }

            const isDeathmatchActive = this.deathmatch.isDeathmatchActive();

            const dmResult = this.deathmatch.update(delta);
            const bombResult = this.bombManager.update(delta);

            this.players.forEach(p => {
                if (p.isAlive || p.isRespawning) {
                    p.update(delta, isDeathmatchActive);
                    if (p.isAlive && !p.isRespawning) {
                        this.powerUpManager.checkCollection(p);
                    }
                }
            });

            const hitPlayersByExplosionOrWall = new Set([...bombResult.playersHit, ...dmResult.playersHitByWall]);

            hitPlayersByExplosionOrWall.forEach(id => {
                const p = this.players.get(id);
                if (p?.isAlive && !p.isRespawning) {
                    p.takeHit(isDeathmatchActive);
                }
            });

            if (!this.checkGameOverCondition()) {
                this.broadcastGameState();
            }

        } catch (e) {
            console.error(`ROOM ${this.id}: Loop Error:`, e);
            this.stopGameLoop();
            this.broadcastMessage({type: MessageType.ERROR, payload: {message: "Game loop error"}});
        }
    }

    checkGameOverCondition() {
        if (this.roomState !== GameRoomState.PLAYING) return false;

        const currentPlayersInRoom = Array.from(this.players.values());

        if (currentPlayersInRoom.length === 0) {
            console.log(`Room ${this.id}: Game ending because room is empty mid-game.`);
            this.endGame(null);
            return true;
        }

        const playersWithLivesRemaining = currentPlayersInRoom.filter(p => p.lives > 0);

        if (this.gameStartedWithSinglePlayer) {
            if (currentPlayersInRoom.length === 1) {
                if (playersWithLivesRemaining.length === 0) {
                    const playerNick = currentPlayersInRoom[0]?.nickname || 'N/A';
                    console.log(`Room ${this.id}: Single player game over. Player ${playerNick} lost all lives. Draw.`);
                    this.endGame(null);
                    return true;
                }
                return false;
            } else {
                 this.gameStartedWithSinglePlayer = false;
                  if (playersWithLivesRemaining.length <= 1) {
                       const winner = playersWithLivesRemaining.length === 1 ? playersWithLivesRemaining[0] : null;
                       const winnerNick = winner?.nickname || 'N/A';
                       console.log(`Room ${this.id}: Game (originally single-player, now multi/zero state) over. Winner: ${winner ? winnerNick : 'Draw'}`);
                       this.endGame(winner);
                       return true;
                  }
                  return false;
            }
        } else {
            if (playersWithLivesRemaining.length <= 1) {
                const winner = playersWithLivesRemaining.length === 1 ? playersWithLivesRemaining[0] : null;
                const winnerNick = winner?.nickname || 'N/A';
                if (winner) {
                    console.log(`Room ${this.id}: Multi-player game over. Winner is ${winnerNick} (ID: ${winner.id}) with ${winner.lives} lives.`);
                } else {
                    console.log(`Room ${this.id}: Multi-player game over. It's a Draw (0 players with lives remaining).`);
                }
                this.endGame(winner);
                return true;
            }
        }

        return false;
    }

    endGame(winner) {
         if (this.roomState === GameRoomState.FINISHED) return;
         this.stopGameLoop();
         const winnerNick = winner?.nickname || 'N/A';
         console.log(`ROOM ${this.id}: >>> GAME OVER! Winner: ${winner ? `Player ${winner.index + 1} (Nick: ${winnerNick}, ID: ${winner.id})` : 'Draw'} <<<`);
         this.roomState = GameRoomState.FINISHED;
         this.gameStartedWithSinglePlayer = false;
         const finalState = this.getFullGameState();

         const payload = {
             winnerId: winner?.id,
             winnerIndex: winner?.index, // O índice aqui já é o final (0-3)
             finalState
         };
         this.broadcastMessage({ type: MessageType.GAME_OVER, payload: payload });
    }

    stopGameLoop() {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
            console.log(`ROOM ${this.id}: Game loop stopped.`);
        }
    }

    getFullGameState() {
        return {
            roomId: this.id,
            roomState: this.roomState,
            hostPlayerId: this.hostPlayerId,
            map: this.gameMap.getState(),
            players: Array.from(this.players.values()).map(p => p.getState()),
            bombs: this.bombManager.getState().bombs,
            explosions: this.bombManager.getState().explosions,
            powerups: this.powerUpManager.getState(),
            deathmatch: this.deathmatch.getState(),
        };
    }

    broadcastGameState() {
        if (this.roomState === GameRoomState.PLAYING || this.roomState === GameRoomState.LOBBY) { // Também envia no lobby para atualizar cores
            this.broadcastMessage({ type: MessageType.GAME_STATE, payload: this.getFullGameState() });
        }
    }

    broadcastMessage(message, excludePlayerId = null) {
        this.broadcast(this.id, message, excludePlayerId);
    }

    isEmpty() {
        return this.players.size === 0;
    }
}