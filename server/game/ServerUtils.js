// server/game/Utils.js

// Checks if two rectangles overlap
export function checkRectOverlap(rect1, rect2) {
    // Assumes rect = { x, y, width, height }
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Convert world coordinates to grid coordinates
export function getGridCoords(worldX, worldY, gridSize) {
    return {
        col: Math.floor(worldX / gridSize),
        row: Math.floor(worldY / gridSize)
    };
}
