// client/js/components/UIManager.js
import { CONSTANTS, ClientState, PowerupType, SELECTABLE_PLAYER_COLORS } from './ClientConstants.js';
import { formatTime } from './ClientUtils.js';

// Referências aos elementos DOM
let initialMenuDiv = null;
let gameContainerDiv = null;
let canvasElement = null;
let rightPanelDiv = null;
let infoPanelDiv = null;
let powerupLegendPanelDiv = null;
let timerContainerDiv = null;
let lobbyInfoDiv = null;
let gameOverOverlayDiv = null;
let statusMessageDiv = null;
let pauseMenuOverlayDiv = null;

// Inputs
let nicknameInput = null;
let joinRoomInput = null; // Referência global ao input

// Botões
let hostGameBtn = null;
let submitJoinBtn = null;
let returnToMenuBtn = null;
let startGameBtn = null;
let copyRoomIdBtn = null;
let resumeGameBtn = null;
let pauseReturnToMenuBtn = null;
let exitLobbyBtn = null;

// Campos de Texto na UI
let lobbyRoomIdSpan = null;
let lobbyPlayerListUl = null;
let gameOverTextSpan = null;
let timerDisplaySpan = null;
let livesValueSpan = null;
let bombsValueSpan = null;
let waitingForHostText = null;

// Elementos do Seletor de Cores (agora parte do initialMenu)
let playerColorSelectorContainerDiv = null;
let playerColorOptionsDiv = null;

// Callbacks
let onCreateRoom = null;
let onJoinRoom = null;
let onReturnToMainMenu = null;
let onStartGameRequest = null;
let onColorSelectedCallback = null;
let onTogglePauseOverlay = null;

let UIAudioManager = null;

export const UIManager = {
    initialize(elements, callbacks, audioManagerInstance) {
        UIAudioManager = audioManagerInstance;

        initialMenuDiv = elements.initialMenuDiv;
        gameContainerDiv = elements.gameContainerDiv;
        canvasElement = elements.canvasElement;
        rightPanelDiv = elements.rightPanelDiv;
        infoPanelDiv = elements.infoPanelDiv;
        powerupLegendPanelDiv = elements.powerupLegendPanelDiv;
        timerContainerDiv = elements.timerContainerDiv;
        lobbyInfoDiv = elements.lobbyInfoDiv;
        gameOverOverlayDiv = elements.gameOverOverlayDiv;
        statusMessageDiv = elements.statusMessageDiv;
        pauseMenuOverlayDiv = elements.pauseMenuOverlayDiv;

        nicknameInput = elements.nicknameInput;
        joinRoomInput = elements.joinRoomInput; // Atribuído à variável global

        hostGameBtn = elements.hostGameBtn;
        submitJoinBtn = elements.submitJoinBtn;
        returnToMenuBtn = elements.returnToMenuBtn;
        startGameBtn = elements.startGameBtn;
        copyRoomIdBtn = elements.copyRoomIdBtn;
        resumeGameBtn = elements.resumeGameBtn;
        pauseReturnToMenuBtn = elements.pauseReturnToMenuBtn;
        exitLobbyBtn = elements.exitLobbyBtn;


        lobbyRoomIdSpan = elements.lobbyRoomIdSpan;
        lobbyPlayerListUl = elements.lobbyPlayerListUl;
        gameOverTextSpan = elements.gameOverTextSpan;
        timerDisplaySpan = elements.timerDisplaySpan;
        livesValueSpan = elements.livesValueSpan;
        bombsValueSpan = elements.bombsValueSpan;
        waitingForHostText = elements.waitingForHostText;

        playerColorSelectorContainerDiv = document.getElementById('playerColorSelectorContainer');
        playerColorOptionsDiv = document.getElementById('playerColorOptions');

        onCreateRoom = callbacks.onCreateRoom;
        onJoinRoom = callbacks.onJoinRoom;
        onReturnToMainMenu = callbacks.onReturnToMainMenu;
        onStartGameRequest = callbacks.onStartGameRequest;
        onColorSelectedCallback = callbacks.onColorSelected;
        onTogglePauseOverlay = callbacks.onTogglePauseOverlay;

        hostGameBtn.addEventListener('click', () => {
            onCreateRoom();
        });
        submitJoinBtn.addEventListener('click', () => {
            this.submitJoinRoom();
        });
        joinRoomInput.addEventListener('keypress', (e) => { // Mantém este, pois joinRoomInput ainda existe
            if (e.key === 'Enter') {
                this.submitJoinRoom();
            }
        });

        returnToMenuBtn.addEventListener('click', () => {
            onReturnToMainMenu();
        });

        startGameBtn.addEventListener('click', () => {
            onStartGameRequest();
        });
        copyRoomIdBtn.addEventListener('click', () => {
            this.copyRoomIdToClipboard();
        });

        resumeGameBtn.addEventListener('click', () => {
            onTogglePauseOverlay(false);
        });
        pauseReturnToMenuBtn.addEventListener('click', () => {
            onReturnToMainMenu();
        });
        
        if (exitLobbyBtn) {
            exitLobbyBtn.addEventListener('click', () => {
                onReturnToMainMenu();
            });
        }


        this.hideAllOverlays();
        this.showElement(initialMenuDiv);


        this.hideElement(gameContainerDiv);
        this.hideElement(timerContainerDiv);
        this.hideElement(rightPanelDiv);
        this.hideElement(startGameBtn);
        this.hideElement(waitingForHostText);
        this.hideElement(copyRoomIdBtn);
        if (exitLobbyBtn) this.hideElement(exitLobbyBtn);


        if (joinRoomInput) joinRoomInput.style.display = 'inline-block';
        if (submitJoinBtn) submitJoinBtn.style.display = 'inline-block';


        this.populatePowerupLegend();
        this.populateColorSelector();
        this.loadAndApplySavedColorSelection();

        console.log("UIManager Initialized");
    },

    populateColorSelector() {
        if (!playerColorOptionsDiv) return;
        playerColorOptionsDiv.innerHTML = '';

        SELECTABLE_PLAYER_COLORS.forEach(colorInfo => {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'color-option';
            colorDiv.style.backgroundColor = colorInfo.displayColor;
            colorDiv.dataset.colorValue = colorInfo.value;
            colorDiv.title = colorInfo.name;

            if (colorInfo.value === 'random') {
                colorDiv.classList.add('random-icon');
            }

            colorDiv.addEventListener('click', () => {
                const currentSelected = playerColorOptionsDiv.querySelector('.selected');
                if (currentSelected) {
                    currentSelected.classList.remove('selected');
                }
                colorDiv.classList.add('selected');
                if (onColorSelectedCallback) {
                    onColorSelectedCallback(colorInfo.value);
                }
            });
            playerColorOptionsDiv.appendChild(colorDiv);
        });
    },

    loadAndApplySavedColorSelection() {
        const lastSelectedColor = localStorage.getItem('bombamaPlayerColor') || 'random';
        const colorOptionToSelect = playerColorOptionsDiv.querySelector(`[data-color-value="${lastSelectedColor}"]`);

        const currentSelected = playerColorOptionsDiv.querySelector('.selected');
        if (currentSelected) currentSelected.classList.remove('selected');

        if (colorOptionToSelect) {
            colorOptionToSelect.classList.add('selected');
        } else {
            const randomDefault = playerColorOptionsDiv.querySelector('[data-color-value="random"]');
            if (randomDefault) randomDefault.classList.add('selected');
        }
        if (onColorSelectedCallback) {
            const finalLoadedColor = colorOptionToSelect ? lastSelectedColor : 'random';
            onColorSelectedCallback(finalLoadedColor);
        }
    },

    submitJoinRoom() {
        const roomId = joinRoomInput.value.trim().toLowerCase(); // joinRoomInput é a referência global
        if (roomId && roomId.length === 6) {
            onJoinRoom(roomId);
        } else {
            this.showStatusMessage("Please enter a valid 6-character Room ID.", 3000, true);
            if (joinRoomInput) joinRoomInput.focus();
        }
    },

    copyRoomIdToClipboard() {
        const roomId = lobbyRoomIdSpan.textContent;
        if (roomId && roomId !== '------' && navigator.clipboard) {
            navigator.clipboard.writeText(roomId).then(() => {
                const originalText = copyRoomIdBtn.textContent;
                copyRoomIdBtn.textContent = 'Copied!';
                UIManager.showStatusMessage(`Room ID "${roomId}" copied!`, 2000, false);
                setTimeout(() => {
                    copyRoomIdBtn.textContent = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy Room ID: ', err);
                UIManager.showStatusMessage('Failed to copy ID.', 2000, true);
            });
        } else if (!navigator.clipboard) {
            UIManager.showStatusMessage('Clipboard API not available.', 3000, true);
        }
    },

    hideAllOverlays() {
        [initialMenuDiv, lobbyInfoDiv, gameOverOverlayDiv, statusMessageDiv, pauseMenuOverlayDiv].forEach(el => {
            if (el) el.style.display = 'none';
        });
        if(startGameBtn) startGameBtn.style.display = 'none';
        if(waitingForHostText) waitingForHostText.style.display = 'none';
        if(copyRoomIdBtn) copyRoomIdBtn.style.display = 'none';
        if (exitLobbyBtn) exitLobbyBtn.style.display = 'none';
    },

    showElement(element, displayType = 'flex') {
         if(element) {
            if (element.tagName === 'BUTTON' && element.parentElement && element.parentElement.classList.contains('menu-overlay')) {
                 displayType = 'block';
            }
            element.style.display = displayType;
         }
    },

    hideElement(element) {
        if(element) element.style.display = 'none';
    },

    showInitialMenu() {
        this.hideAllOverlays();
        this.showElement(initialMenuDiv);
        if (joinRoomInput) { // joinRoomInput é a referência global
            joinRoomInput.style.display = 'inline-block';
            joinRoomInput.value = ''; // LIMPAR O CAMPO AO MOSTRAR O MENU INICIAL
        }
        if (submitJoinBtn) submitJoinBtn.style.display = 'inline-block';

        this.hideElement(gameContainerDiv);
        this.hideElement(timerContainerDiv);
        this.hideElement(rightPanelDiv);
        if (nicknameInput) {
            nicknameInput.value = localStorage.getItem('bombamaNickname') || '';
        }
        this.loadAndApplySavedColorSelection();
    },

    showLobby(roomId, players = [], isLocalPlayerHost = false) {
        this.hideAllOverlays();
        this.showElement(lobbyInfoDiv);
        this.hideElement(gameContainerDiv);
        this.hideElement(timerContainerDiv);
        this.hideElement(rightPanelDiv);

        if (lobbyRoomIdSpan) lobbyRoomIdSpan.textContent = roomId || '------';
        this.updateLobbyPlayers(players);

        if (roomId && roomId !== '------') {
            this.showElement(copyRoomIdBtn, 'inline-block');
        } else {
            this.hideElement(copyRoomIdBtn);
        }

        if (isLocalPlayerHost) {
            this.showElement(startGameBtn, 'block');
            this.hideElement(waitingForHostText);
            startGameBtn.disabled = !(players && players.length > 0);
            startGameBtn.title = startGameBtn.disabled ? "Waiting for at least one player..." : "Start the game";
        } else {
            this.hideElement(startGameBtn);
            this.showElement(waitingForHostText, 'block');
        }
        
        if (exitLobbyBtn) this.showElement(exitLobbyBtn, 'block');

        if (nicknameInput && nicknameInput.value.trim()) {
            localStorage.setItem('bombamaNickname', nicknameInput.value.trim());
        }
        this.showStatusMessage(`Joined Room: ${roomId}. ${isLocalPlayerHost ? 'You are the host.' : ''}`, 4000);
    },

    showGame() {
        this.hideAllOverlays();
        this.showElement(gameContainerDiv, 'flex');
        this.showElement(timerContainerDiv, 'block');
        this.showElement(rightPanelDiv, 'flex');
        this.showElement(infoPanelDiv, 'flex');
        this.showElement(powerupLegendPanelDiv, 'flex');
        this.hideStatusMessage();
        console.log("Showing Game Area");
    },

    showGameOver(winnerInfo = "Draw!") {
        this.hideAllOverlays();
        this.showElement(gameOverOverlayDiv);
        this.showElement(gameContainerDiv, 'flex');
        this.showElement(timerContainerDiv, 'block');
        this.showElement(rightPanelDiv, 'flex');
        if (gameOverTextSpan) gameOverTextSpan.textContent = winnerInfo;
    },

    setPauseMenuOverlayVisibility(visible) {
        if (visible) {
            this.hideStatusMessage();
            this.showElement(pauseMenuOverlayDiv);
            this.showElement(gameContainerDiv, 'flex');
            this.showElement(timerContainerDiv, 'block');
            this.showElement(rightPanelDiv, 'flex');
        } else {
            this.hideElement(pauseMenuOverlayDiv);
        }
    },

    isPauseMenuOverlayVisible() {
        return pauseMenuOverlayDiv && pauseMenuOverlayDiv.style.display !== 'none';
    },

    updateLobbyPlayers(players = []) {
        if (!lobbyPlayerListUl) return;
        lobbyPlayerListUl.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.nickname || `Player ${player.index + 1}`;
            li.style.color = player.color || '#FFFFFF';
            li.dataset.playerId = player.id;
            lobbyPlayerListUl.appendChild(li);
        });
        if (startGameBtn && startGameBtn.style.display !== 'none') {
            startGameBtn.disabled = !(players && players.length > 0);
            startGameBtn.title = startGameBtn.disabled ? "Waiting for at least one player..." : "Start the game";
        }
    },

    updateGameUI(gameState, localPlayerId) {
        const localPlayer = gameState.players.find(p => p.id === localPlayerId);
        if (localPlayer) {
             if (livesValueSpan) livesValueSpan.textContent = localPlayer.lives;
             const localBombsCount = gameState.bombs.filter(b => b.ownerId === localPlayerId).length;
             const availableBombs = localPlayer.maxBombs - localBombsCount;
             if (bombsValueSpan) bombsValueSpan.textContent = Math.max(0, availableBombs);
        } else {
             if (livesValueSpan) livesValueSpan.textContent = '0';
             if (bombsValueSpan) bombsValueSpan.textContent = '0';
        }
        if (timerDisplaySpan && gameState.deathmatch) {
            timerDisplaySpan.textContent = formatTime(gameState.deathmatch.timerSeconds);
        }
    },

    populatePowerupLegend() {
        if (!powerupLegendPanelDiv) return;
        const header = powerupLegendPanelDiv.querySelector('h3');
        powerupLegendPanelDiv.innerHTML = '';
        if (header) powerupLegendPanelDiv.appendChild(header);

        const powerupInfo = [
            { type: PowerupType.RANGE, name: 'Bomb Range +', class: 'range' },
            { type: PowerupType.COUNT, name: 'Bomb Count +', class: 'count' },
            { type: PowerupType.SPEED, name: 'Speed Boost', class: 'speed' },
            { type: PowerupType.SHIELD, name: 'Shield', class: 'shield' },
            { type: PowerupType.PIERCE, name: 'Piercing Bomb', class: 'pierce' },
        ];
        powerupInfo.forEach(info => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'legend-item';
            const dotSpan = document.createElement('span');
            dotSpan.className = `legend-color-dot ${info.class}`;
            const textSpan = document.createElement('span');
            textSpan.textContent = info.name;
            itemDiv.appendChild(dotSpan);
            itemDiv.appendChild(textSpan);
            powerupLegendPanelDiv.appendChild(itemDiv);
        });
    },

    showStatusMessage(message, duration = 3000, isError = false) {
        if (!statusMessageDiv) return;
        statusMessageDiv.textContent = message;
        statusMessageDiv.style.backgroundColor = isError ? 'rgba(229, 115, 115, 0.85)' : 'rgba(40, 44, 52, 0.8)';
        statusMessageDiv.style.color = CONSTANTS.COLOR_STATUS_TEXT;
        statusMessageDiv.style.borderColor = isError ? CONSTANTS.COLOR_ERROR : '#4a5261';
        statusMessageDiv.style.display = 'block';

        if (statusMessageDiv.timerId) { clearTimeout(statusMessageDiv.timerId); }
        if (duration > 0) {
            statusMessageDiv.timerId = setTimeout(() => {
                 if(statusMessageDiv.textContent === message) { this.hideStatusMessage(); }
            }, duration);
        }
    },

    hideStatusMessage() {
        if (statusMessageDiv) {
            if (statusMessageDiv.timerId) { clearTimeout(statusMessageDiv.timerId); statusMessageDiv.timerId = null; }
            statusMessageDiv.style.display = 'none';
        }
    }
};