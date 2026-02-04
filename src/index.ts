import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, Config } from './config';
import { SolanaRpcClient } from './rpc/client';
import { MigrationDetector } from './migration/detector';
import { MetadataFetcher } from './metadata/fetcher';
import { GeckoTerminalProvider, NullPriceProvider } from './price/geckoterminal';
import { BasePriceProvider } from './price/provider';
import { MigrationOutput, MigrationResult, ParsedMigration } from './migration/types';
import { formatMigrationsTable, formatIsoTime } from './utils/format';
import { sleep } from './utils/retry';

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'migrations_latest.json');

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function parseArgs(): { windowSeconds: number; continuous: boolean } {
    const args = process.argv.slice(2);
    let windowSeconds = 300; // Default: 5 minutes
    let continuous = true;

    for (const arg of args) {
        if (arg === '--window=6h') {
            windowSeconds = 21600; // 6 hours
        } else if (arg === '--window=3h') {
            windowSeconds = 10800; // 3 hours
        } else if (arg === '--window=1h' || arg === '--window=60m') {
            windowSeconds = 3600;
        } else if (arg === '--window=30m') {
            windowSeconds = 1800;
        } else if (arg === '--window=5m') {
            windowSeconds = 300;
        } else if (arg === '--once') {
            continuous = false;
        }
    }

    return { windowSeconds, continuous };
}

async function enrichMigrations(
    migrations: ParsedMigration[],
    metadataFetcher: MetadataFetcher,
    priceProvider: BasePriceProvider,
    rpcClient: SolanaRpcClient
): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];

    for (const migration of migrations) {
        try {
            // Fetch metadata
            const metadata = await metadataFetcher.fetchMetadata(migration.mint);

            // Fetch price data
            let priceData: { priceUsd: number | null, marketCapUsd: number | null } = { priceUsd: null, marketCapUsd: null };
            try {
                priceData = await priceProvider.getPrice(migration.mint);
            } catch (err) {
                console.warn(`⚠️ Price fetch failed for ${migration.mint}, skipping price data.`);
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

            // Filter by Market Cap (Minimum $20k)
            if (priceData.marketCapUsd && priceData.marketCapUsd >= 20000) {
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
            } else {
                // Optional: log dropped low cap coins
                // console.log(`Skipping ${metadata.symbol || migration.mint} (MC: $${priceData.marketCapUsd?.toFixed(2) || 'N/A'})`);
            }
        } catch (error) {
            console.warn(`Failed to enrich migration ${migration.signature}:`, error);
            // Still include the migration with basic data
            // Skip if enrichment failed (since we can't verify >25k cap)
            console.warn(`Skipping due to enrichment failure: ${migration.signature}`);
        }
    }

    return results;
}

function saveOutput(output: MigrationOutput): void {
    ensureDataDir();
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`📁 Output saved to ${OUTPUT_FILE}`);
}

async function runDetection(
    config: Config,
    windowSeconds: number,
    detector: MigrationDetector,
    metadataFetcher: MetadataFetcher,
    priceProvider: BasePriceProvider,
    rpcClient: SolanaRpcClient
): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Pump.fun Migration Detector - ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    try {
        // Detect migrations
        const { migrations } = await detector.detectMigrations(windowSeconds);

        // Enrich with metadata and price data
        console.log('\n📊 Enriching migration data...');
        const enrichedMigrations = await enrichMigrations(
            migrations,
            metadataFetcher,
            priceProvider,
            rpcClient
        );

        // Sort by market cap (highest first)
        enrichedMigrations.sort((a, b) =>
            (b.market_cap_usd || 0) - (a.market_cap_usd || 0)
        );

        // Output to console
        formatMigrationsTable(enrichedMigrations);

        // Save to file
        const output: MigrationOutput = {
            run_at: new Date().toISOString(),
            window_seconds: windowSeconds,
            migrations: enrichedMigrations,
        };
        saveOutput(output);

    } catch (error) {
        console.error('❌ Error during detection:', error);
    }
}

async function main(): Promise<void> {
    const { windowSeconds, continuous } = parseArgs();

    console.log('🔧 Loading configuration...');
    const config = loadConfig();

    console.log(`📡 RPC URL: ${config.solanaRpcUrl.slice(0, 50)}...`);
    console.log(`⏱️  Window: ${windowSeconds / 60} minutes`);
    console.log(`🔄 Mode: ${continuous ? 'Continuous polling' : 'Single run'}`);

    // Initialize components
    const rpcClient = new SolanaRpcClient(config);
    const detector = new MigrationDetector(rpcClient, config);
    const metadataFetcher = new MetadataFetcher(rpcClient.getConnection(), config.solanaRpcUrl);

    // Use GeckoTerminal by default, fallback to null provider on repeated failures
    const priceProvider = new GeckoTerminalProvider(config.priceApiKey);

    // Initial run
    await runDetection(config, windowSeconds, detector, metadataFetcher, priceProvider, rpcClient);

    // Continuous polling
    if (continuous) {
        console.log(`\n⏰ Polling every ${config.pollingIntervalMs / 1000 / 60} minutes. Press Ctrl+C to stop.\n`);

        while (true) {
            await sleep(config.pollingIntervalMs);
            await runDetection(config, windowSeconds, detector, metadataFetcher, priceProvider, rpcClient);
        }
    }
}

main().catch(console.error);
