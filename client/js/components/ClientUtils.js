// client/js/components/Utils.js

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

// --- Color functions (Úteis para efeitos visuais no cliente) ---
export function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

export function interpolateColor(color1HexOrRgb, color2HexOrRgb, t) {
    const rgb1 = typeof color1HexOrRgb === 'string' ? hexToRgb(color1HexOrRgb) : color1HexOrRgb;
    const rgb2 = typeof color2HexOrRgb === 'string' ? hexToRgb(color2HexOrRgb) : color2HexOrRgb;
    if (!rgb1 || !rgb2) return 'rgb(0,0,0)'; // Fallback

    t = Math.max(0, Math.min(1, t));
    const r = Math.round(rgb1.r * (1 - t) + rgb2.r * t);
    const g = Math.round(rgb1.g * (1 - t) + rgb2.g * t);
    const b = Math.round(rgb1.b * (1 - t) + rgb2.b * t);
    return `rgb(${r}, ${g}, ${b})`;
}

// Formata segundos para MM:SS
export function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}