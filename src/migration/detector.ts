import { SolanaRpcClient } from '../rpc/client';
import { Config, MIGRATION_ACCOUNT } from '../config';
import { loadCursor, saveCursor, CursorData } from '../storage/cursor';
import { loadHistory, saveHistory, addToHistory, isProcessed, HistoryData } from '../storage/history';
import { parseMigrationTransaction } from './parser';
import { ParsedMigration } from './types';

export class MigrationDetector {
    private rpcClient: SolanaRpcClient;
    private config: Config;
    private history: HistoryData;

    constructor(rpcClient: SolanaRpcClient, config: Config) {
        this.rpcClient = rpcClient;
        this.config = config;
        this.history = loadHistory();
    }

    /**
     * Detect migrations within a time window
     */
    async detectMigrations(windowSeconds: number): Promise<{
        migrations: ParsedMigration[];
        cursor: CursorData;
    }> {
        const cursor = loadCursor();
        const now = Math.floor(Date.now() / 1000);
        const windowStartTime = now - windowSeconds;

        console.log(`\n🔍 Scanning for migrations in the last ${windowSeconds / 60} minutes...`);
        console.log(`   Time window: ${new Date(windowStartTime * 1000).toISOString()} - ${new Date(now * 1000).toISOString()}`);

        // Get all signatures in the time window
        const signatures = await this.rpcClient.getSignaturesInTimeWindow(
            MIGRATION_ACCOUNT,
            windowStartTime,
            cursor.newestSignature || undefined
        );

        console.log(`   Found ${signatures.length} candidate transaction(s)`);

        // Filter out already-processed signatures
        const newSignatures = signatures.filter(sig => !isProcessed(this.history, sig.signature));
        console.log(`   ${newSignatures.length} new transaction(s) to process`);

        if (newSignatures.length === 0) {
            return { migrations: [], cursor };
        }

        // Process transactions with concurrency limit
        const migrations: ParsedMigration[] = [];
        const batchSize = this.config.concurrencyLimit;

        for (let i = 0; i < newSignatures.length; i += batchSize) {
            const batch = newSignatures.slice(i, i + batchSize);

            const results = await Promise.all(
                batch.map(async (sig) => {
                    try {
                        const tx = await this.rpcClient.getTransaction(sig.signature);
                        if (!tx) {
                            return null;
                        }
                        return parseMigrationTransaction(
                            sig.signature,
                            sig.blockTime,
                            tx,
                            this.config
                        );
                    } catch (error) {
                        console.warn(`Failed to process ${sig.signature}:`, error);
                        return null;
                    }
                })
            );

            for (const result of results) {
                if (result) {
                    migrations.push(result);
                }
            }
        }

        // Update history with all processed signatures
        addToHistory(this.history, newSignatures.map(s => s.signature));
        saveHistory(this.history);

        // Update cursor
        const newestSig = newSignatures[0];
        const newCursor: CursorData = {
            newestSignature: newestSig?.signature || cursor.newestSignature,
            newestBlockTime: newestSig?.blockTime || cursor.newestBlockTime,
            lastRunAt: new Date().toISOString(),
        };
        saveCursor(newCursor);

        console.log(`   ✅ Found ${migrations.length} migration(s)`);

        return { migrations, cursor: newCursor };
    }
}
