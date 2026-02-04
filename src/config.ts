import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export interface Config {
    solanaRpcUrl: string;
    priceApiKey?: string;
    pollingIntervalMs: number;
    ignoreMints: string[];
    windowSeconds: {
        short: number;
        long: number;
    };
    maxSignaturesPerFetch: number;
    concurrencyLimit: number;
}

interface ConfigFile {
    pollingIntervalMs: number;
    ignoreMints: string[];
    windowSeconds: {
        short: number;
        long: number;
    };
    maxSignaturesPerFetch: number;
    concurrencyLimit: number;
}

const configPath = path.join(__dirname, '..', 'config.json');

function loadConfigFile(): ConfigFile {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as ConfigFile;
}

export function loadConfig(): Config {
    const fileConfig = loadConfigFile();

    const solanaRpcUrl = process.env.SOLANA_RPC_URL;
    if (!solanaRpcUrl) {
        throw new Error('SOLANA_RPC_URL environment variable is required');
    }

    return {
        solanaRpcUrl,
        priceApiKey: process.env.PRICE_API_KEY || undefined,
        pollingIntervalMs: fileConfig.pollingIntervalMs,
        ignoreMints: fileConfig.ignoreMints,
        windowSeconds: fileConfig.windowSeconds,
        maxSignaturesPerFetch: fileConfig.maxSignaturesPerFetch,
        concurrencyLimit: fileConfig.concurrencyLimit,
    };
}

// Solana program addresses
export const MIGRATION_ACCOUNT = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';
export const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

// Known DEX programs for destination detection
export const DEX_PROGRAMS = {
    RAYDIUM_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    PUMPSWAP: 'PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP',
    PUMPSWAP_AMM: 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA',
};
