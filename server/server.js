// server/server.js

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Room } from './game/Room.js';
import { MessageType, CONSTANTS } from './game/ServerConstants.js';

const PORT = process.env.PORT || 3000;
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map(); // Map<roomId, Room>
const clients = new Map(); // Map<WebSocket, { roomId, playerId }>

console.log(`WebSocket server started on port ${PORT}`);

// --- Funções Auxiliares ---

function safeSend(ws, messageObject) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(messageObject));
            return true;
        } catch (error) {
            console.error(`SERVER: Failed to send message to client ${clients.get(ws)?.playerId}:`, error);
            return false;
        }
    } else {
        return false;
    }
}

function broadcastToRoom(roomId, messageObject, excludePlayerId = null) {
    if (typeof messageObject !== 'object' || !messageObject?.type) {
        console.error(`SERVER: Invalid broadcast message format for room ${roomId}:`, messageObject);
        return;
    }

    let messageString;
    try {
        messageString = JSON.stringify(messageObject);
    } catch (error) {
        console.error(`SERVER: Failed stringify broadcast message for ${roomId}:`, messageObject, error);
        return;
    }

    let recipientCount = 0;
    clients.forEach((clientInfo, ws) => {
        if (clientInfo.roomId === roomId && ws.readyState === WebSocket.OPEN) {
            if (!excludePlayerId || clientInfo.playerId !== excludePlayerId) {
                try {
                    ws.send(messageString);
                    recipientCount++;
                } catch (error) {
                    console.error(`SERVER: Failed broadcast ${messageObject.type} to ${clientInfo.playerId} in ${roomId}:`, error);
                }
            }
        }
    });
}

// --- Handler de Conexão ---

wss.on('connection', (ws) => {
    console.log('SERVER: Client connected');

    ws.on('message', (messageBuffer) => {
        let message;
        try {
            message = JSON.parse(messageBuffer.toString());
        } catch (e) {
            console.error('SERVER: Failed parse msg:', messageBuffer.toString(), e);
            safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Invalid message format.' } });
            return;
        }

        if (!message || !message.type) {
            console.warn('SERVER: Received msg without type:', message);
            safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Invalid message structure.' } });
            return;
        }

        const clientInfo = clients.get(ws);
        const room = clientInfo ? rooms.get(clientInfo.roomId) : null; // Room pode ser null aqui
        const clientIdLog = clientInfo ? `${clientInfo.playerId} (Nick: ${room?.players?.get(clientInfo.playerId)?.nickname || 'N/A'}) in ${clientInfo.roomId || 'NoRoom'}` : 'Unidentified';


        if (message.type !== MessageType.PLAYER_INPUT) {
            console.log(`SERVER: Rcvd ${message.type} from (${clientIdLog})`, message.payload ? `| Payload: ${JSON.stringify(message.payload).substring(0, 70)}...` : '');
        }

        try {
            switch (message.type) {
                case MessageType.CREATE_ROOM:
                    handleCreateRoom(ws, message.payload);
                    break;

                case MessageType.JOIN_ROOM:
                    handleJoinRoom(ws, message.payload);
                    break;

                case MessageType.PLAYER_INPUT:
                    handlePlayerInput(ws, message.payload);
                    break;

                case MessageType.REQUEST_START_GAME:
                    handleRequestStartGame(ws);
                    break;
                
                case MessageType.PLAYER_COLOR_CHOICE: // NOVO
                    handlePlayerColorChoice(ws, message.payload);
                    break;

                case MessageType.DEBUG_MAX_POWERUPS:
                    handleDebugPowerups(ws);
                    break;

                default:
                    console.log(`SERVER: Unhandled message type: "${message.type}" from client (${clientIdLog})`);
                    safeSend(ws, { type: MessageType.ERROR, payload: { message: `Unknown message type: ${message.type}` } });
            }
        } catch (error) {
             console.error(`SERVER: Error processing ${message.type} for ${clientIdLog}:`, error);
             safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Internal server error processing request.' }});
        }
    });

    ws.on('close', (code, reason) => {
        handleDisconnection(ws, code, reason);
    });

    ws.onerror = (error) => {
        const clientInfo = clients.get(ws);
        const errorPlayerId = clientInfo?.playerId || 'Unidentified';
        console.error(`SERVER: WebSocket error for client ${errorPlayerId}:`, error.message || error);
        if (ws && ws.readyState !== WebSocket.CLOSING && ws.readyState !== WebSocket.CLOSED) {
            console.log(`SERVER: Forcing WS close for ${errorPlayerId} after error.`);
            ws.close(1011, "WebSocket error detected");
        }
    };
});

// --- Handlers de Mensagens Específicas ---

function handleCreateRoom(ws, payload) {
    if (clients.has(ws)) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Already in a room.' } });
        return;
    }

    const nickname = payload?.nickname?.trim();
    const preferredColor = payload?.preferredColor || 'random'; // Pega preferredColor

    if (!nickname || nickname.length < 1 || nickname.length > 15) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Invalid nickname (1-15 chars required).' } });
        return;
    }
    if (preferredColor !== 'random' && !CONSTANTS.PLAYER_SELECTABLE_COLORS.includes(preferredColor)) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Invalid preferred color.'}});
        return;
    }


    let attempts = 0;
    let newRoomId;
    do {
        newRoomId = uuidv4().substring(0, 6).toLowerCase();
        attempts++;
    } while (rooms.has(newRoomId) && attempts < 10);

    if (rooms.has(newRoomId)) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Server busy, could not create room ID. Try again.' } });
        return;
    }

    console.log(`SERVER: Creating room ${newRoomId} for ${nickname} (Color: ${preferredColor})...`);
    const room = new Room(newRoomId, broadcastToRoom);
    rooms.set(newRoomId, room);

    const { success, playerId, hostPlayerId, reason } = room.addPlayer(ws, nickname, preferredColor); // Passa nickname e preferredColor

    if (success && playerId) {
        clients.set(ws, { roomId: newRoomId, playerId: playerId });
        console.log(`SERVER: Host ${playerId} (Nick: ${nickname}) created Room ${newRoomId}. Clients: ${clients.size}`);

        safeSend(ws, { type: MessageType.ASSIGN_PLAYER_ID, payload: { playerId: playerId } });
        const initialState = room.getFullGameState(); // Já inclui a cor inicial do jogador
        safeSend(ws, { type: MessageType.ROOM_CREATED, payload: { roomId: newRoomId, yourPlayerId: playerId, hostPlayerId: hostPlayerId, initialState: initialState } });

    } else {
        console.error(`SERVER: Failed addPlayer for host ${nickname} in ${newRoomId}. Reason: ${reason || 'Unknown'}`);
        if (rooms.has(newRoomId)) rooms.delete(newRoomId);
        safeSend(ws, { type: MessageType.ERROR, payload: { message: `Failed to initialize room: ${reason || 'Server error'}` } });
    }
}

function handleJoinRoom(ws, payload) {
    if (clients.has(ws)) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Already in a room.' } });
        return;
    }

    const nickname = payload?.nickname?.trim();
    const preferredColor = payload?.preferredColor || 'random'; // Pega preferredColor
    const roomIdToJoin = payload?.roomId?.trim().toLowerCase();

    if (!nickname || nickname.length < 1 || nickname.length > 15) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Invalid nickname (1-15 chars required).' } });
        return;
    }
    if (!roomIdToJoin || roomIdToJoin.length !== 6) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Invalid Room ID format.' } });
        return;
    }
     if (preferredColor !== 'random' && !CONSTANTS.PLAYER_SELECTABLE_COLORS.includes(preferredColor)) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Invalid preferred color.'}});
        return;
    }

    const roomToJoin = rooms.get(roomIdToJoin);
    if (!roomToJoin) {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: `Room '${roomIdToJoin}' not found.` } });
        return;
    }

    const { success, playerId, hostPlayerId, reason } = roomToJoin.addPlayer(ws, nickname, preferredColor); // Passa nickname e preferredColor

    if (success && playerId) {
        clients.set(ws, { roomId: roomIdToJoin, playerId: playerId });
        console.log(`SERVER: Player ${playerId} (Nick: ${nickname}, Color: ${preferredColor}) joined ${roomIdToJoin}. Clients: ${clients.size}`);

        safeSend(ws, { type: MessageType.ASSIGN_PLAYER_ID, payload: { playerId: playerId } });
        const initialState = roomToJoin.getFullGameState(); // Já inclui a cor inicial do jogador
        safeSend(ws, { type: MessageType.ROOM_JOINED, payload: { roomId: roomIdToJoin, yourPlayerId: playerId, hostPlayerId: hostPlayerId, initialState: initialState } });

    } else {
        safeSend(ws, { type: MessageType.ERROR, payload: { message: `Failed to join ${roomIdToJoin}: ${reason || 'Server error'}` } });
    }
}

function handlePlayerInput(ws, payload) {
    const clientInfo = clients.get(ws);
    if (!clientInfo) return;

    const room = rooms.get(clientInfo.roomId);
    if (room) {
        room.handlePlayerInput(clientInfo.playerId, payload);
    } else {
        console.warn(`SERVER: Received input from ${clientInfo.playerId} for non-existent room ${clientInfo.roomId}. Closing WS.`);
        clients.delete(ws);
        ws.close(1011, "Room not found");
    }
}

function handleRequestStartGame(ws) {
    const clientInfo = clients.get(ws);
    if (!clientInfo) {
         console.warn("SERVER: REQUEST_START_GAME from unmapped client.");
         return;
    }

    const { roomId, playerId } = clientInfo;
    const room = rooms.get(roomId);

    if (room) {
        const started = room.requestStartGame(playerId);
        if (!started) {
            console.log(`Room ${roomId} start request by ${playerId} was denied by room logic.`);
        } else {
             console.log(`Room ${roomId} start request by ${playerId} was accepted.`);
        }
    } else {
        console.warn(`SERVER: REQUEST_START_GAME from ${playerId} for non-existent room ${roomId}. Closing WS.`);
        clients.delete(ws);
        ws.close(1011, "Room not found");
    }
}

// NOVO: Handler para PLAYER_COLOR_CHOICE
function handlePlayerColorChoice(ws, payload) {
    const clientInfo = clients.get(ws);
    if (!clientInfo) {
        console.warn("SERVER: PLAYER_COLOR_CHOICE from unmapped client.");
        return;
    }
    const { roomId, playerId } = clientInfo;
    const room = rooms.get(roomId);

    if (room) {
        const chosenColor = payload?.color;
        if (chosenColor && (chosenColor === 'random' || CONSTANTS.PLAYER_SELECTABLE_COLORS.includes(chosenColor))) {
            room.handlePlayerColorChoice(playerId, chosenColor);
        } else {
            console.warn(`SERVER: Invalid color choice "${chosenColor}" from ${playerId} in room ${roomId}.`);
            safeSend(ws, { type: MessageType.ERROR, payload: { message: 'Invalid color choice.' } });
        }
    } else {
        console.warn(`SERVER: PLAYER_COLOR_CHOICE from ${playerId} for non-existent room ${roomId}. Closing WS.`);
        clients.delete(ws);
        ws.close(1011, "Room not found");
    }
}


function handleDebugPowerups(ws) {
    const clientInfo = clients.get(ws);
     if (clientInfo) {
        const { roomId, playerId } = clientInfo;
        const room = rooms.get(roomId);
        if (room) {
            console.log(`SERVER: Player ${playerId} in room ${roomId} triggered DEBUG_MAX_POWERUPS.`);
            room.applyMaxPowerupsToPlayer(playerId);
        } else {
            console.warn(`SERVER: DEBUG_MAX_POWERUPS for non-existent room ${roomId} from ${playerId}.`);
        }
    } else {
         console.warn("SERVER: DEBUG_MAX_POWERUPS from unmapped client. Discarding.");
    }
}

function handleDisconnection(ws, code, reason) {
    const clientInfo = clients.get(ws);
    const reasonString = reason?.toString() || '<No Reason>';
    const leavingPlayerId = clientInfo?.playerId || 'Unidentified';
    const roomForLog = clientInfo ? rooms.get(clientInfo.roomId) : null;
    const nicknameForLog = roomForLog && clientInfo && roomForLog.players.has(clientInfo.playerId)
        ? roomForLog.players.get(clientInfo.playerId).nickname
        : 'N/A';


    console.log(`SERVER: Client ${leavingPlayerId} (Nick: ${nicknameForLog}) disconnected. Code: ${code}, Reason: "${reasonString}"`);

    if (clientInfo) {
        const { roomId, playerId } = clientInfo;
        clients.delete(ws);

        const room = rooms.get(roomId);
        if (room) {
            room.removePlayer(playerId);

            if (room.isEmpty()) {
                room.stopGameLoop();
                rooms.delete(roomId);
                console.log(`SERVER: Room ${roomId} deleted (empty).`);
            }
        } else {
             console.log(`SERVER: Room ${roomId} for disconnected client ${playerId} was already gone.`);
        }
        console.log(`SERVER: Cleaned up client ${playerId}. Clients: ${clients.size}, Rooms: ${rooms.size}`);
    } else {
        console.log("SERVER: Disconnected client was not mapped (already cleaned up or never fully joined).");
    }
}

// --- Inicialização ---
console.log("Server setup complete. Waiting for connections...");