import Table from 'cli-table3';
import { MigrationResult } from '../migration/types';

export function formatMigrationsTable(migrations: MigrationResult[]): void {
    if (migrations.length === 0) {
        console.log('\n📭 No migrations found in the specified time window.\n');
        return;
    }

    const table = new Table({
        head: ['Time', 'Symbol', 'Name', 'Mint', 'Market Cap', 'Price', 'Destination'],
        colWidths: [22, 10, 20, 15, 15, 12, 12],
        style: { head: ['cyan'] }
    });

    for (const m of migrations) {
        table.push([
            m.time,
            m.symbol || 'N/A',
            truncate(m.name || 'N/A', 18),
            truncate(m.mint, 12),
            m.market_cap_usd ? `$${formatNumber(m.market_cap_usd)}` : 'N/A',
            m.price_usd ? `$${m.price_usd.toFixed(6)}` : 'N/A',
            m.destination || 'unknown'
        ]);
    }

    console.log('\n🎓 Pump.fun Migrations Detected:\n');
    console.log(table.toString());
    console.log(`\nTotal: ${migrations.length} migration(s)\n`);
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
}

function formatNumber(num: number): string {
    if (num >= 1_000_000) {
        return (num / 1_000_000).toFixed(2) + 'M';
    }
    if (num >= 1_000) {
        return (num / 1_000).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

export function formatIsoTime(unixTimestamp: number): string {
    return new Date(unixTimestamp * 1000).toISOString();
}
