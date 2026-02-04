import { ParsedTransactionWithMeta, TokenBalance } from '@solana/web3.js';
import { PUMPFUN_PROGRAM, DEX_PROGRAMS, Config } from '../config';
import { ParsedMigration } from './types';

/**
 * Check if a transaction is a successful Pump.fun migration
 */
export function isMigrationTransaction(tx: ParsedTransactionWithMeta): boolean {
    // Must be a successful transaction (no errors)
    if (tx.meta?.err !== null) {
        return false;
    }

    const logMessages = tx.meta?.logMessages || [];

    // Must have "Instruction: Migrate" in logs
    const hasMigrateLog = logMessages.some(log =>
        log.includes('Instruction: Migrate')
    );

    if (!hasMigrateLog) {
        return false;
    }

    // Exclude "already migrated" transactions - these are just swaps, not actual migrations
    const isAlreadyMigrated = logMessages.some(log =>
        log.includes('Bonding curve already migrated')
    );

    if (isAlreadyMigrated) {
        return false;
    }

    // Check for actual successful migration (look for liquidity provision or pool creation)
    // A real migration will have logs from PumpSwap or Raydium creating a pool
    const hasDexInteraction = logMessages.some(log =>
        log.includes('Create') ||
        log.includes('Initialize') ||
        log.includes('AddLiquidity') ||
        log.includes('ProxyInitialize')
    );

    // Must have the Pump.fun program involved
    const accountKeys = getAccountKeys(tx);
    const hasPumpfun = accountKeys.includes(PUMPFUN_PROGRAM);

    return hasPumpfun;
}

/**
 * Extract the token mint from a migration transaction
 */
export function extractMint(
    tx: ParsedTransactionWithMeta,
    ignoreMints: string[]
): string | null {
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Get all unique mints from token balances
    const allMints = new Set<string>();
    for (const balance of [...preBalances, ...postBalances]) {
        if (balance.mint && !ignoreMints.includes(balance.mint)) {
            allMints.add(balance.mint);
        }
    }

    const candidateMints = Array.from(allMints);

    if (candidateMints.length === 0) {
        return null;
    }

    if (candidateMints.length === 1) {
        return candidateMints[0];
    }

    // Multiple candidates: pick the one with largest absolute balance change
    let bestMint: string | null = null;
    let maxChange = 0;

    for (const mint of candidateMints) {
        const change = calculateBalanceChange(mint, preBalances, postBalances);
        if (change > maxChange) {
            maxChange = change;
            bestMint = mint;
        }
    }

    return bestMint;
}

/**
 * Calculate the absolute balance change for a mint
 */
function calculateBalanceChange(
    mint: string,
    preBalances: TokenBalance[],
    postBalances: TokenBalance[]
): number {
    const getTotal = (balances: TokenBalance[]): number => {
        return balances
            .filter(b => b.mint === mint)
            .reduce((sum, b) => sum + (b.uiTokenAmount?.uiAmount || 0), 0);
    };

    const preTotalAmount = getTotal(preBalances);
    const postTotalAmount = getTotal(postBalances);

    return Math.abs(postTotalAmount - preTotalAmount);
}

/**
 * Detect the destination DEX from transaction
 */
export function detectDestination(tx: ParsedTransactionWithMeta): string | null {
    const accountKeys = getAccountKeys(tx);

    // Check for PumpSwap (both migration program and AMM)
    if (accountKeys.includes(DEX_PROGRAMS.PUMPSWAP) ||
        accountKeys.includes(DEX_PROGRAMS.PUMPSWAP_AMM)) {
        return 'pumpswap';
    }

    if (accountKeys.includes(DEX_PROGRAMS.RAYDIUM_AMM) ||
        accountKeys.includes(DEX_PROGRAMS.RAYDIUM_CLMM)) {
        return 'raydium';
    }

    return null;
}

/**
 * Get all account keys from a transaction
 */
function getAccountKeys(tx: ParsedTransactionWithMeta): string[] {
    const message = tx.transaction.message;

    // Handle both legacy and versioned transactions
    if ('accountKeys' in message) {
        return message.accountKeys.map(key =>
            typeof key === 'string' ? key : key.pubkey.toBase58()
        );
    }

    return [];
}

/**
 * Parse a migration transaction into structured data
 */
export function parseMigrationTransaction(
    signature: string,
    blockTime: number,
    tx: ParsedTransactionWithMeta,
    config: Config
): ParsedMigration | null {
    if (!isMigrationTransaction(tx)) {
        return null;
    }

    const mint = extractMint(tx, config.ignoreMints);
    if (!mint) {
        return null;
    }

    const destination = detectDestination(tx);

    return {
        signature,
        blockTime,
        mint,
        destination,
    };
}
