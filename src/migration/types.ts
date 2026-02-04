export interface MigrationResult {
    time: string;
    signature: string;
    mint: string;
    symbol: string | null;
    name: string | null;
    market_cap_usd: number | null;
    price_usd: number | null;
    destination: string | null;
}

export interface MigrationOutput {
    run_at: string;
    window_seconds: number;
    migrations: MigrationResult[];
}

export interface ParsedMigration {
    signature: string;
    blockTime: number;
    mint: string;
    destination: string | null;
}
