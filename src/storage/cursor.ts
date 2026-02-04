import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CURSOR_FILE = path.join(DATA_DIR, 'cursor.json');

export interface CursorData {
    newestSignature: string | null;
    newestBlockTime: number | null;
    lastRunAt: string | null;
}

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

export function loadCursor(): CursorData {
    ensureDataDir();

    if (!fs.existsSync(CURSOR_FILE)) {
        return {
            newestSignature: null,
            newestBlockTime: null,
            lastRunAt: null,
        };
    }

    try {
        const raw = fs.readFileSync(CURSOR_FILE, 'utf-8');
        return JSON.parse(raw) as CursorData;
    } catch (error) {
        console.warn('Failed to read cursor file, starting fresh:', error);
        return {
            newestSignature: null,
            newestBlockTime: null,
            lastRunAt: null,
        };
    }
}

export function saveCursor(cursor: CursorData): void {
    ensureDataDir();
    fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursor, null, 2));
}
