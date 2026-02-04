import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

export interface HistoryData {
    processedSignatures: Set<string>;
}

interface HistoryFileData {
    processedSignatures: string[];
}

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

export function loadHistory(): HistoryData {
    ensureDataDir();

    if (!fs.existsSync(HISTORY_FILE)) {
        return {
            processedSignatures: new Set(),
        };
    }

    try {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
        const data = JSON.parse(raw) as HistoryFileData;
        return {
            processedSignatures: new Set(data.processedSignatures),
        };
    } catch (error) {
        console.warn('Failed to read history file, starting fresh:', error);
        return {
            processedSignatures: new Set(),
        };
    }
}

export function saveHistory(history: HistoryData): void {
    ensureDataDir();

    const data: HistoryFileData = {
        // Keep only the last 10000 signatures to prevent unbounded growth
        processedSignatures: Array.from(history.processedSignatures).slice(-10000),
    };

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

export function addToHistory(history: HistoryData, signatures: string[]): void {
    for (const sig of signatures) {
        history.processedSignatures.add(sig);
    }
}

export function isProcessed(history: HistoryData, signature: string): boolean {
    return history.processedSignatures.has(signature);
}
