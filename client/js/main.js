// client/js/main.js

import { UIManager } from './components/UIManager.js';
import { ClientRenderer } from './components/ClientRenderer.js';
import { CONSTANTS, MessageType, ClientState, TileType } from './components/ClientConstants.js';
import { hexToRgb } from './components/ClientUtils.js';
import { AudioManager } from './components/AudioManager.js';

// --- Variáveis Globais ---
let ws = null;
let clientState = ClientState.INITIAL_MENU;
let localPlayerId = null;
let isHost = false;
let currentRoomId = null;
let gameState = null;
let renderer = null;
let inputState = { left: false, right: false, up: false, down: false, plantBomb: false };
let lastSentInputState = null;
let inputInterval = null;
let selectedPlayerColor = 'random';

// Canvas principal
let canvas = null;
let ctx = null;

// Canvas de Ícones
let livesIconCanvas = null;
let livesIconCtx = null;
let bombsIconCanvas = null;
let bombsIconCtx = null;

// Áudio e estado anterior
let audioManager = null;
let previousGameState = null;
let deathmatchWallSoundPlayedThisFrame = false;
let lastKnownPlayerStats = {};


// --- Inicialização ---
function initializeApp() {
    console.log("Initializing Bombama Online Client...");
    canvas = document.getElementById('gameCanvas');
    ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { console.error("Fatal Error: Canvas not found or context failed!"); return; }

    canvas.width = CONSTANTS.MAP_COLS * CONSTANTS.GRID_SIZE;
    canvas.height = CONSTANTS.MAP_ROWS * CONSTANTS.GRID_SIZE;
    renderer = new ClientRenderer(ctx, canvas.width, canvas.height);
    audioManager = new AudioManager();

    livesIconCanvas = document.getElementById('livesIconCanvas');
    livesIconCtx = livesIconCanvas?.getContext('2d');
    bombsIconCanvas = document.getElementById('bombsIconCanvas');
    bombsIconCtx = bombsIconCanvas?.getContext('2d');
    if (livesIconCtx && bombsIconCtx) {
        const iconDrawSize = CONSTANTS.ICON_CSS_SIZE * CONSTANTS.ICON_RESOLUTION_MULTIPLIER;
        livesIconCanvas.width = bombsIconCanvas.width = iconDrawSize;
        livesIconCanvas.height = bombsIconCanvas.height = iconDrawSize;
        drawStaticIcons();
    } else {
        console.warn("Could not get context for info panel icon canvases.");
    }

    const navigationEntries = performance.getEntriesByType("navigation");
    if (navigationEntries.length > 0 && navigationEntries[0].type === 'reload') {
        console.log("Page reloaded, clearing stored nickname and join room input from localStorage/field.");
        localStorage.removeItem('bombamaNickname');
        const joinInput = document.getElementById('joinRoomInput'); // Pega o campo diretamente
        if (joinInput) {
            joinInput.value = ''; // Limpa o valor do campo de ID da sala
        }
    }


    const elements = {
        initialMenuDiv: document.getElementById('initialMenu'),
        gameContainerDiv: document.getElementById('gameContainer'),
        canvasElement: canvas,
        rightPanelDiv: document.getElementById('rightPanel'),
        infoPanelDiv: document.getElementById('infoPanel'),
        powerupLegendPanelDiv: document.getElementById('powerupLegendPanel'),
        timerContainerDiv: document.getElementById('timerContainer'),
        lobbyInfoDiv: document.getElementById('lobbyInfo'),
        gameOverOverlayDiv: document.getElementById('gameOverOverlay'),
        statusMessageDiv: document.getElementById('statusMessage'),
        pauseMenuOverlayDiv: document.getElementById('pauseMenuOverlay'),
        nicknameInput: document.getElementById('nicknameInput'),
        hostGameBtn: document.getElementById('hostGameBtn'),
        copyRoomIdBtn: document.getElementById('copyRoomIdBtn'),
        joinRoomInput: document.getElementById('joinRoomInput'),
        submitJoinBtn: document.getElementById('submitJoinBtn'),
        returnToMenuBtn: document.getElementById('returnToMenuBtn'),
        startGameBtn: document.getElementById('startGameBtn'),
        resumeGameBtn: document.getElementById('resumeGameBtn'),
        pauseReturnToMenuBtn: document.getElementById('pauseReturnToMenuBtn'),
        exitLobbyBtn: document.getElementById('exitLobbyBtn'),
        lobbyRoomIdSpan: document.getElementById('lobbyRoomId'),
        lobbyPlayerListUl: document.getElementById('lobbyPlayerList'),
        gameOverTextSpan: document.getElementById('gameOverText'),
        timerDisplaySpan: document.getElementById('timerDisplay'),
        livesValueSpan: document.getElementById('livesValue'),
        bombsValueSpan: document.getElementById('bombsValue'),
        waitingForHostText: document.getElementById('waitingForHostText'),
    };

    const callbacks = {
        onCreateRoom: () => {
            const nickname = elements.nicknameInput.value.trim();
            if (!nickname) {
                UIManager.showStatusMessage("Please enter a nickname.", 3000, true);
                elements.nicknameInput.focus();
                return;
            }
            createRoom(nickname);
        },
        onJoinRoom: (roomId) => {
            const nickname = elements.nicknameInput.value.trim();
            if (!nickname) {
                UIManager.showStatusMessage("Please enter a nickname.", 3000, true);
                elements.nicknameInput.focus();
                return;
            }
            joinRoom(roomId, nickname);
        },
        onReturnToMainMenu: () => {
            handleReturnToMainMenu();
        },
        onStartGameRequest: () => {
            startGameRequest();
        },
        onColorSelected: (colorValue) => {
            handleColorSelection(colorValue);
        },
        onTogglePauseOverlay: (forceClose) => {
            togglePauseMenuOverlay(forceClose);
        }
    };

    try {
        UIManager.initialize(elements, callbacks, audioManager);
    } catch (error) {
        console.error("Failed to initialize UIManager:", error);
        elements.statusMessageDiv.textContent = "UI Initialization Error. Refresh.";
        elements.statusMessageDiv.style.display = 'block';
        elements.statusMessageDiv.style.color = CONSTANTS.COLOR_ERROR;
        return;
    }

    setupKeyboardListeners();
    changeState(ClientState.INITIAL_MENU);
    UIManager.showInitialMenu(); // Agora o showInitialMenu também limpará o joinRoomInput
    requestAnimationFrame(gameLoop);
    console.log("Client Initialized. Waiting for player action.");
    UIManager.hideStatusMessage();
}

function handleColorSelection(colorValue) {
    console.log(`Main.js: Color selected via UIManager: ${colorValue}`);
    selectedPlayerColor = colorValue;
    localStorage.setItem('bombamaPlayerColor', colorValue);
}

function drawStaticIcons() {
    if (!livesIconCtx || !bombsIconCtx) return;
    const iconSize = livesIconCanvas.width;
    livesIconCtx.clearRect(0, 0, iconSize, iconSize);
    livesIconCtx.fillStyle = CONSTANTS.COLOR_HEART; // Use a cor de ClientConstants
    livesIconCtx.font = `${iconSize * 0.7}px 'Jersey 15', sans-serif`; // Usar Jersey 15
    livesIconCtx.textAlign = 'center';
    livesIconCtx.textBaseline = 'middle';
    livesIconCtx.fillText('♥', iconSize / 2, iconSize / 2 + iconSize * 0.05); // Ajuste vertical pode ser necessário

    bombsIconCtx.clearRect(0, 0, iconSize, iconSize);
    // Desenhar bomba (simplificado, ou pode usar uma imagem/ícone SVG futuramente)
    const bombCenterX = iconSize / 2;
    const bombCenterY = iconSize / 2 + iconSize * 0.05; // Pequeno ajuste para baixo
    const bombRadius = iconSize * 0.35;
    bombsIconCtx.fillStyle = CONSTANTS.COLOR_BOMB; // Use a cor de ClientConstants
    bombsIconCtx.beginPath();
    bombsIconCtx.arc(bombCenterX, bombCenterY, bombRadius, 0, Math.PI * 2);
    bombsIconCtx.fill();
    // Pavio
    const fuseHeight = bombRadius * 0.4;
    const fuseWidth = bombRadius * 0.2;
    bombsIconCtx.fillStyle = CONSTANTS.COLOR_BOMB_FUSE; // Use a cor de ClientConstants
    bombsIconCtx.fillRect(bombCenterX - fuseWidth / 2, bombCenterY - bombRadius - fuseHeight, fuseWidth, fuseHeight);
    // Faísca (opcional, pode ser muito pequeno para ícone)
    bombsIconCtx.fillStyle = CONSTANTS.COLOR_BOMB_SPARK_1; // Use a cor de ClientConstants
    bombsIconCtx.beginPath();
    bombsIconCtx.arc(bombCenterX, bombCenterY - bombRadius - fuseHeight, fuseWidth * 0.5, 0, Math.PI*2);
    bombsIconCtx.fill();
}

function connectWebSocket(callback) {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.warn("WebSocket connection already open or connecting.");
        if (ws.readyState === WebSocket.OPEN && callback) callback();
        return;
    }
    changeState(ClientState.CONNECTING);
    UIManager.showStatusMessage("Connecting to server...");
    try {
        ws = new WebSocket(CONSTANTS.SERVER_ADDRESS);
        ws.onopen = () => {
            console.log('WebSocket connection established.');
            UIManager.hideStatusMessage();
            audioManager.unlockAudioContext();
            if (callback) callback();
        };
        ws.onmessage = (event) => {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch (e) {
                console.error('Failed to parse message:', event.data, e);
                UIManager.showStatusMessage("Received invalid data from server.", 3000, true);
                return;
            }
            handleServerMessage(message);
        };
        ws.onclose = (event) => {
            console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
            const message = event.reason || `Connection closed (Code: ${event.code})`;
            if (UIManager.isPauseMenuOverlayVisible()) {
                UIManager.setPauseMenuOverlayVisibility(false);
            }
            handleDisconnection(message, event.code !== 1000 && event.code !== 1005);
        };
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            if (UIManager.isPauseMenuOverlayVisible()) {
                UIManager.setPauseMenuOverlayVisibility(false);
            }
            handleDisconnection('Connection error. Please try again later.', true);
        };
    } catch (error) {
         console.error("Failed to create WebSocket:", error);
         if (UIManager.isPauseMenuOverlayVisible()) {
            UIManager.setPauseMenuOverlayVisibility(false);
        }
         handleDisconnection("Failed to connect. Is the server running?", true);
    }
}

function handleServerMessage(message) {
    if (!message || !message.type) { console.warn("Received message without type:", message); return; }

    switch (message.type) {
        case MessageType.ASSIGN_PLAYER_ID:
            localPlayerId = message.payload.playerId;
            console.log(`Assigned Player ID: ${localPlayerId}`);
            break;

        case MessageType.ROOM_CREATED:
        case MessageType.ROOM_JOINED:
            console.log(`Joined Room ${message.payload.roomId}. My ID: ${message.payload.yourPlayerId}. Host ID: ${message.payload.hostPlayerId}`);
            localPlayerId = message.payload.yourPlayerId;
            currentRoomId = message.payload.roomId;
            isHost = (localPlayerId === message.payload.hostPlayerId);
            gameState = message.payload.initialState;
            previousGameState = JSON.parse(JSON.stringify(gameState));

            if (gameState?.roomState === 'lobby') {
                changeState(ClientState.LOBBY);
                UIManager.showLobby(gameState.roomId, gameState.players, isHost);
            } else {
                 console.warn("Joined room with unexpected initial state:", gameState?.roomState);
                 handleDisconnection("Room join error (invalid state).", true);
            }
            break;

        case MessageType.PLAYER_JOINED:
             if (gameState && clientState === ClientState.LOBBY) {
                const joiningPlayer = message.payload.player;
                const newHostId = message.payload.hostPlayerId;

                const playerIndex = gameState.players.findIndex(p => p.id === joiningPlayer.id);
                if (playerIndex === -1) {
                    gameState.players.push(joiningPlayer);
                } else {
                    gameState.players[playerIndex] = joiningPlayer;
                }

                if (newHostId !== undefined) {
                     gameState.hostPlayerId = newHostId;
                     isHost = (localPlayerId === gameState.hostPlayerId);
                }
                UIManager.updateLobbyPlayers(gameState.players);
            }
            break;

        case MessageType.PLAYER_LEFT:
            if (gameState) {
                const leavingPlayerId = message.payload.playerId;
                const newHostId = message.payload.newHostId;

                gameState.players = gameState.players.filter(p => p.id !== leavingPlayerId);
                delete lastKnownPlayerStats[leavingPlayerId];

                if (newHostId !== undefined) {
                    gameState.hostPlayerId = newHostId;
                    isHost = (localPlayerId === gameState.hostPlayerId);
                    console.log(`Host changed. New host: ${newHostId}. Am I host? ${isHost}`);
                    if (clientState === ClientState.LOBBY) {
                         UIManager.showLobby(currentRoomId, gameState.players, isHost);
                    }
                } else {
                    if (clientState === ClientState.LOBBY) {
                        UIManager.updateLobbyPlayers(gameState.players);
                    }
                }
            }
            break;

        case MessageType.HOST_CHANGED:
             if (gameState) {
                 gameState.hostPlayerId = message.payload.newHostId;
                 isHost = (localPlayerId === gameState.hostPlayerId);
                 console.log(`Received HOST_CHANGED. New host: ${gameState.hostPlayerId}. Am I host? ${isHost}`);
                 if (clientState === ClientState.LOBBY) {
                      UIManager.showLobby(currentRoomId, gameState.players, isHost);
                 }
             }
             break;

        case MessageType.GAME_START:
            console.log("Game Start message received!");
            gameState = message.payload;
            isHost = (localPlayerId === gameState.hostPlayerId);
            UIManager.setPauseMenuOverlayVisibility(false);
            changeState(ClientState.PLAYING);

            lastKnownPlayerStats = {};
            if (gameState && gameState.players) {
                gameState.players.forEach(p => {
                    if (p.id === localPlayerId) { // Only track local player for sound triggers
                        lastKnownPlayerStats[p.id] = {
                            maxBombs: p.maxBombs, bombRange: p.bombRange,
                            hasPiercingBombs: p.hasPiercingBombs, speedBoostActive: p.speedBoostActive,
                            shieldActive: p.shieldActive, isAlive: p.isAlive,
                            isRespawning: true
                        };
                    }
                });
            }
            previousGameState = JSON.parse(JSON.stringify(gameState));
            if (renderer) renderer.resetExplosionSounds();
            break;

        case MessageType.GAME_STATE:
            if (clientState === ClientState.PLAYING || clientState === ClientState.LOBBY) {
                gameState = message.payload;
                if (clientState === ClientState.LOBBY) {
                    const oldPlayersJSON = JSON.stringify(gameState.players.map(p => ({id: p.id, color: p.color, nickname: p.nickname})));
                    const newPlayersJSON = JSON.stringify(message.payload.players.map(p => ({id: p.id, color: p.color, nickname: p.nickname})));
                    if (oldPlayersJSON !== newPlayersJSON) {
                        UIManager.updateLobbyPlayers(message.payload.players);
                    }
                }
            }
            break;

        case MessageType.GAME_OVER:
            console.log("Game Over message received!");
            if (audioManager) audioManager.playSound('game_over');
            stopSendingInput();
            gameState = message.payload.finalState;
            isHost = (localPlayerId === gameState.hostPlayerId);
            UIManager.setPauseMenuOverlayVisibility(false);

            const gameOverDelay = CONSTANTS.GAME_OVER_MESSAGE_DELAY_MS;

            setTimeout(() => {
                changeState(ClientState.GAME_OVER);
                let winnerText = "It's a Draw!";
                const winnerId = message.payload.winnerId;
                if (winnerId && gameState?.players) {
                    const winner = gameState.players.find(p => p.id === winnerId);
                    winnerText = winner ? `${winner.nickname || 'Player ' + (winner.index + 1)} Wins!` : `Winner (ID: ${winnerId.substring(0,4)}) Wins!`;
                }
                UIManager.showGameOver(winnerText);
            }, gameOverDelay);
            lastKnownPlayerStats = {};
            previousGameState = null;
            if (renderer) renderer.resetExplosionSounds();
            break;

        case MessageType.ERROR:
            console.error('Server Error:', message.payload.message);
            UIManager.showStatusMessage(`Server Error: ${message.payload.message}`, 5000, true);
            break;

        default:
            console.log('Unhandled message type:', message.type);
    }
}

function handleDisconnection(reason = "Connection closed.", isError = false) {
    stopSendingInput();
    if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, "Client requested disconnect");
        }
        ws = null;
    }
    resetGame();
    UIManager.setPauseMenuOverlayVisibility(false);
    changeState(ClientState.INITIAL_MENU);
    UIManager.showInitialMenu(); // Esta chamada agora limpará o joinRoomInput via UIManager
    UIManager.showStatusMessage(reason, isError ? 0 : 5000, isError);
    lastKnownPlayerStats = {};
    previousGameState = null;
    if (renderer) renderer.resetExplosionSounds();
}

function changeState(newState) {
    if (clientState !== newState) {
        console.log(`Client state changing: ${clientState} -> ${newState}`);
        clientState = newState;

        if (newState === ClientState.PLAYING) {
            startSendingInput();
            UIManager.showGame();
        } else {
            stopSendingInput();
            if (newState === ClientState.LOBBY) {
                UIManager.showLobby(currentRoomId, gameState?.players || [], isHost);
            } else if (newState === ClientState.GAME_OVER) {
                // UIManager.showGameOver é chamado no setTimeout dentro de handleServerMessage
            } else if (newState === ClientState.INITIAL_MENU) {
                UIManager.showInitialMenu(); // Esta chamada agora limpará o joinRoomInput via UIManager
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                }
            }
        }
    }
}

function resetGame() {
     gameState = null;
     localPlayerId = null;
     isHost = false;
     currentRoomId = null;
     inputState = { left: false, right: false, up: false, down: false, plantBomb: false };
     lastSentInputState = null;
     stopSendingInput();
     previousGameState = null;
     lastKnownPlayerStats = {};
     if (renderer) renderer.resetExplosionSounds();
}

function createRoom(nickname) {
    console.log(`Attempting to create room with nickname: ${nickname}, color: ${selectedPlayerColor}`);
    UIManager.setPauseMenuOverlayVisibility(false);
    connectWebSocket(() => {
        sendMessage(MessageType.CREATE_ROOM, { nickname, preferredColor: selectedPlayerColor });
        UIManager.showStatusMessage("Creating room...");
    });
}

function joinRoom(roomId, nickname) {
    console.log(`Attempting to join room: ${roomId} with nickname: ${nickname}, color: ${selectedPlayerColor}`);
    UIManager.setPauseMenuOverlayVisibility(false);
    connectWebSocket(() => {
        sendMessage(MessageType.JOIN_ROOM, { roomId, nickname, preferredColor: selectedPlayerColor });
        UIManager.showStatusMessage(`Joining room ${roomId}...`);
    });
}

function startGameRequest() {
    if (clientState === ClientState.LOBBY && isHost) {
        console.log("Host requesting game start...");
        UIManager.setPauseMenuOverlayVisibility(false);
        sendMessage(MessageType.REQUEST_START_GAME);
    } else {
        console.warn("Start game request ignored (not in lobby or not host).");
    }
}

function togglePauseMenuOverlay(forceClose = false) {
    if (clientState !== ClientState.PLAYING) {
        if (forceClose && UIManager.isPauseMenuOverlayVisible()) {
            UIManager.setPauseMenuOverlayVisibility(false);
        }
        return;
    }

    const isCurrentlyVisible = UIManager.isPauseMenuOverlayVisible();
    const newVisibility = forceClose ? false : !isCurrentlyVisible;

    UIManager.setPauseMenuOverlayVisibility(newVisibility);
    console.log(`Pause menu overlay ${newVisibility ? 'shown' : 'hidden'}`);
}


function handleReturnToMainMenu() {
    console.log("Return to Main Menu chosen.");
    handleDisconnection("Returned to menu.", false);
}

function setupKeyboardListeners() {
    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();

        if (key === 'escape') {
            event.preventDefault();
            if (clientState === ClientState.PLAYING) {
                togglePauseMenuOverlay();
            }
            return;
        }

        if (UIManager.isPauseMenuOverlayVisible()) {
            return;
        }

        if (clientState !== ClientState.PLAYING) {
             return;
        }

        let inputChanged = false;
        switch (key) {
            case 'arrowup': case 'w': if (!inputState.up) { inputState.up = true; inputChanged = true; } break;
            case 'arrowdown': case 's': if (!inputState.down) { inputState.down = true; inputChanged = true; } break;
            case 'arrowleft': case 'a': if (!inputState.left) { inputState.left = true; inputChanged = true; } break;
            case 'arrowright': case 'd': if (!inputState.right) { inputState.right = true; inputChanged = true; } break;
            case ' ': if (!inputState.plantBomb) { inputState.plantBomb = true; inputChanged = true; } break;
            case 'p':
                 console.log("DEBUG: Sending Max Powerups Request");
                 sendMessage(MessageType.DEBUG_MAX_POWERUPS);
                 break;
        }
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
             event.preventDefault();
        }
    });

    document.addEventListener('keyup', (event) => {
        if (UIManager.isPauseMenuOverlayVisible()) {
            return;
        }

        if (clientState !== ClientState.PLAYING) {
            return;
        }

        const key = event.key.toLowerCase();
        switch (key) {
            case 'arrowup': case 'w': if (inputState.up) { inputState.up = false; } break;
            case 'arrowdown': case 's': if (inputState.down) { inputState.down = false; } break;
            case 'arrowleft': case 'a': if (inputState.left) { inputState.left = false; } break;
            case 'arrowright': case 'd': if (inputState.right) { inputState.right = false; } break;
            case ' ': if (inputState.plantBomb) { inputState.plantBomb = false; } break;
        }
    });
}


function startSendingInput() {
    if (inputInterval) return;
    if (clientState !== ClientState.PLAYING) return;

    console.log("Starting input sending interval.");
    lastSentInputState = JSON.stringify(inputState);
    inputInterval = setInterval(sendInput, CONSTANTS.INPUT_SEND_INTERVAL);
}

function stopSendingInput() {
    if (inputInterval) {
        console.log("Stopping input sending interval.");
        clearInterval(inputInterval);
        inputInterval = null;
    }
}

function sendInput() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket not open, cannot send input. Stopping interval.");
        stopSendingInput();
        return;
    }

    if (UIManager.isPauseMenuOverlayVisible()) {
        return;
    }

    const currentStateString = JSON.stringify(inputState);
    if (currentStateString !== lastSentInputState) {
        sendMessage(MessageType.PLAYER_INPUT, inputState);
        lastSentInputState = currentStateString;
    }
}

function sendMessage(type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify({ type, payload }));
        } catch (error) {
            console.error(`Failed to send message type ${type}:`, error);
        }
    } else {
        console.warn(`Attempted to send message type ${type} but WebSocket is not open.`);
    }
}

function gameLoop(timestamp) {
    if (gameState && (clientState === ClientState.PLAYING || clientState === ClientState.GAME_OVER)) {
        UIManager.updateGameUI(gameState, localPlayerId);

        if (clientState === ClientState.PLAYING && previousGameState && localPlayerId && audioManager) {
            const prevPlayer = previousGameState.players.find(p => p.id === localPlayerId);
            const currentPlayer = gameState.players.find(p => p.id === localPlayerId);

            const currentLocalPlayerBombs = gameState.bombs.filter(b => b.ownerId === localPlayerId);
            const prevLocalPlayerBombs = previousGameState.bombs.filter(b => b.ownerId === localPlayerId);

            if (currentLocalPlayerBombs.length > prevLocalPlayerBombs.length) {
                const newBomb = currentLocalPlayerBombs.find(cb => !prevLocalPlayerBombs.some(pb => pb.id === cb.id));
                if (newBomb) {
                    audioManager.playSound('create_bomb');
                }
            }


            if (prevPlayer && currentPlayer && currentPlayer.isAlive) {
                const playerKey = currentPlayer.id;
                const lastStats = lastKnownPlayerStats[playerKey] || { ...prevPlayer, isRespawning: true };

                let collectedPowerUpSound = false;
                if (currentPlayer.maxBombs > lastStats.maxBombs) collectedPowerUpSound = true;
                if (currentPlayer.bombRange > lastStats.bombRange) collectedPowerUpSound = true;
                if (currentPlayer.hasPiercingBombs && !lastStats.hasPiercingBombs) collectedPowerUpSound = true;
                if (currentPlayer.speedBoostActive && !lastStats.speedBoostActive) collectedPowerUpSound = true;

                const justRespawned = lastStats.isRespawning && !currentPlayer.isRespawning;
                if (currentPlayer.shieldActive && !lastStats.shieldActive && !justRespawned) {
                    collectedPowerUpSound = true;
                }

                if (collectedPowerUpSound) {
                    audioManager.playSound('powerup');
                }
                lastKnownPlayerStats[playerKey] = { ...currentPlayer };
            }

            if (prevPlayer && currentPlayer) {
                if (prevPlayer.isAlive && !currentPlayer.isAlive) {
                    audioManager.playSound('death');
                }
            }

            if (gameState.map && previousGameState.map && gameState.deathmatch?.isActive) {
                let newDeathmatchWallFoundThisFrame = false;
                if (!deathmatchWallSoundPlayedThisFrame) {
                    for (let r = 0; r < CONSTANTS.MAP_ROWS; r++) {
                        for (let c = 0; c < CONSTANTS.MAP_COLS; c++) {
                            if ((previousGameState.map[r]?.[c] !== TileType.DEATHMATCH_WALL && previousGameState.map[r]?.[c] !== TileType.WALL_HARD) &&
                                gameState.map[r]?.[c] === TileType.DEATHMATCH_WALL) {
                                newDeathmatchWallFoundThisFrame = true;
                                break;
                            }
                        }
                        if (newDeathmatchWallFoundThisFrame) break;
                    }
                    if (newDeathmatchWallFoundThisFrame) {
                        audioManager.playSound('deathmatch_wall');
                        deathmatchWallSoundPlayedThisFrame = true;
                    }
                }
            }
        }
    }

    if (renderer && gameState && ctx) {
        if (clientState === ClientState.PLAYING) {
            renderer.render(gameState, localPlayerId, audioManager);
        } else if (clientState === ClientState.INITIAL_MENU && !gameState) {
            ctx.fillStyle = CONSTANTS.COLOR_BACKGROUND;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    } else if (clientState === ClientState.INITIAL_MENU && ctx && !gameState && canvas) {
        ctx.fillStyle = CONSTANTS.COLOR_BACKGROUND;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (clientState === ClientState.PLAYING && gameState) {
        previousGameState = JSON.parse(JSON.stringify(gameState));
    } else if (clientState !== ClientState.PLAYING) {
        previousGameState = null;
    }
    deathmatchWallSoundPlayedThisFrame = false;

    requestAnimationFrame(gameLoop);
}

document.addEventListener('DOMContentLoaded', initializeApp);