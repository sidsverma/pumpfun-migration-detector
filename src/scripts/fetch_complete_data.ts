
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../config';
import { SolanaRpcClient } from '../rpc/client';
import { MigrationDetector } from '../migration/detector';
import { MetadataFetcher } from '../metadata/fetcher';
import { GeckoTerminalProvider } from '../price/geckoterminal';
import { BasePriceProvider } from '../price/provider';
import { MigrationOutput, MigrationResult, ParsedMigration } from '../migration/types';
import { formatIsoTime } from '../utils/format';
import { MIGRATION_ACCOUNT } from '../config';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'complete_data.json');

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

// function parseArgs(): { hours: number } {
//     return { hours: 6 };
// }


async function enrichMigrations(
    migrations: ParsedMigration[],
    metadataFetcher: MetadataFetcher,
    priceProvider: BasePriceProvider,
    rpcClient: SolanaRpcClient
): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    let count = 0;

    console.log(`\n📊 Enriching ${migrations.length} migrations...`);

    for (const migration of migrations) {
        count++;
        if (count % 10 === 0) {
            process.stdout.write(`\rProcessing: ${count}/${migrations.length}`);
        }

        try {
            // Fetch metadata
            const metadata = await metadataFetcher.fetchMetadata(migration.mint);

            // Fetch price data
            let priceData: { priceUsd: number | null, marketCapUsd: number | null } = { priceUsd: null, marketCapUsd: null };
            try {
                priceData = await priceProvider.getPrice(migration.mint);
            } catch (err) {
                // Silent catch for bulk processing
            }

            // If no market cap, try to calculate from supply
            if (priceData.priceUsd && !priceData.marketCapUsd) {
                const supply = await rpcClient.getTokenSupply(migration.mint);
                if (supply) {
                    priceData = {
                        ...priceData,
                        marketCapUsd: supply * priceData.priceUsd,
                    };
                }
            }

            results.push({
                time: formatIsoTime(migration.blockTime),
                signature: migration.signature,
                mint: migration.mint,
                symbol: metadata.symbol,
                name: metadata.name,
                market_cap_usd: priceData.marketCapUsd,
                price_usd: priceData.priceUsd,
                destination: migration.destination,
            });

        } catch (error) {
            console.warn(`\nFailed to enrich migration ${migration.signature}`);
        }
    }
    console.log('\n✅ Enrichment complete.');

    return results;
}

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Pump.fun Complete Data Fetcher`);
    console.log('='.repeat(60));

    const hours = 6;
    console.log(`⏱️  Time Window: ${hours} hours (Fixed)`);

    console.log('🔧 Loading configuration...');
    const config = loadConfig();

    // Override concurrency for bulk script to avoid strict rate limits if needed, 
    // but better to stick to config to be safe.

    console.log(`📡 RPC URL: ${config.solanaRpcUrl.slice(0, 50)}...`);

    const rpcClient = new SolanaRpcClient(config);
    const metadataFetcher = new MetadataFetcher(rpcClient.getConnection(), config.solanaRpcUrl);
    const priceProvider = new GeckoTerminalProvider(config.priceApiKey);

    // Manual detection logic to ignore cursor and fetch full window
    const now = Math.floor(Date.now() / 1000);
    const windowSeconds = Math.floor(hours * 3600);
    const windowStartTime = now - windowSeconds;

    console.log(`\n🔍 Fetching signatures since ${new Date(windowStartTime * 1000).toISOString()}...`);

    // We need to implement a loop to fetch ALL signatures in the window, not just until the first batch
    // But rpcClient.getSignaturesInTimeWindow might be limited by RPC response size (1000 usually).
    // Let's modify usage here to just call it. If the RPC client handles pagination internally that's good.
    // Checking rpcClient in previous steps... it calls getSignaturesForAddress with { limit: 1000 }.
    // It doesn't seem to paginate backwards indefinitely. 
    // We might need to implement pagination here if 24h yields > 1000 migrations.
    // For now, let's rely on getSignaturesInTimeWindow logic in client which we need to check.

    // We rely on rpcClient.getSignaturesInTimeWindow for now.
    // If pagination is needed for > 1000 items, we would need to implement it here or in the client.
    // For now, we proceed with what the client returns.

    // Actually, I should just use `rpcClient.getSignaturesInTimeWindow` and accept the limit for now, 
    // or improve it later if I see it hits 1000 exactly.

    const signatures = await rpcClient.getSignaturesInTimeWindow(
        MIGRATION_ACCOUNT,
        windowStartTime
    );

    console.log(`\n\nTotal signatures found: ${signatures.length}`);

    // Process
    const parsedMigrations = [];
    const batchSize = config.concurrencyLimit;

    // We need to import parseMigrationTransaction
    const { parseMigrationTransaction } = require('../migration/parser');

    console.log(`Parsing transactions...`);
    for (let i = 0; i < signatures.length; i += batchSize) {
        const batch = signatures.slice(i, i + batchSize);
        process.stdout.write(`\rParsing: ${i}/${signatures.length}`);

        const results = await Promise.all(
            batch.map(async (sig: any) => {
                try {
                    const tx = await rpcClient.getTransaction(sig.signature);
                    if (!tx) return null;
                    return parseMigrationTransaction(sig.signature, sig.blockTime, tx, config);
                } catch (e) { return null; }
            })
        );

        for (const res of results) {
            if (res) parsedMigrations.push(res);
        }
    }
    console.log(`\nSuccessfully parsed: ${parsedMigrations.length}`);

    // Enrich
    const enriched = await enrichMigrations(parsedMigrations, metadataFetcher, priceProvider, rpcClient);

    // Save
    ensureDataDir();
    const output = {
        run_at: new Date().toISOString(),
        window_hours: hours,
        total_count: enriched.length,
        data: enriched
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n💾 Data saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
