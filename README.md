# Pump.fun Migration Tracker

Real-time tracker for Pump.fun token migrations to PumpSwap/Raydium on Solana.

![Dashboard Screenshot](docs/dashboard.png)

## Features

- 🔍 **Real-time Detection** - Monitors Solana blockchain for Pump.fun bonding curve migrations
- 📊 **Web Dashboard** - Beautiful, responsive dashboard showing all migrations
- 💰 **Market Cap Ranking** - Tokens sorted by market cap (highest first)
- 🔗 **Deep Links** - Direct links to DexScreener, Solscan, and trading pages
- 🏷️ **Token Metadata** - Fetches token names and symbols from on-chain data
- 💵 **Price Data** - Real-time prices from GeckoTerminal

## Quick Start

### Prerequisites

- Node.js 18+
- A Solana RPC endpoint (recommended: [Helius](https://helius.dev))

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/pumpfun-migration-tracker.git
cd pumpfun-migration-tracker

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your RPC URL
```

### Configuration

Edit `.env` file:

```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
# Optional: CoinGecko Pro API Key for faster price data
PRICE_API_KEY=CG-xxxxxxxxx
```

### Usage

**Run migration detector (single scan):**
```bash
npx ts-node src/index.ts --window=1h --once
```

**Run with different time windows:**
```bash
npx ts-node src/index.ts --window=5m --once   # 5 minutes
npx ts-node src/index.ts --window=30m --once  # 30 minutes
npx ts-node src/index.ts --window=1h --once   # 1 hour
npx ts-node src/index.ts --window=3h --once   # 3 hours
npx ts-node src/index.ts --window=6h --once   # 6 hours
```

**Start web dashboard:**
```bash
npx ts-node src/server.ts
# Open http://localhost:3000
```

## How It Works

1. **Detection** - Monitors the Pump.fun migration executor account for transactions
2. **Filtering** - Only includes successful migrations (excludes failed attempts and duplicate swaps)
3. **Enrichment** - Fetches token metadata and current prices
4. **Display** - Shows results in console and saves to JSON file

### Migration Detection Logic

- Looks for "Instruction: Migrate" in transaction logs
- Filters out failed transactions (`meta.err !== null`)
- Excludes "already migrated" transactions (just swaps, not actual migrations)
- Identifies destination DEX (PumpSwap or Raydium)

## Project Structure

```
├── src/
│   ├── index.ts          # Main entry point
│   ├── server.ts         # Web dashboard server
│   ├── config.ts         # Configuration loading
│   ├── migration/
│   │   ├── detector.ts   # Migration detection logic
│   │   ├── parser.ts     # Transaction parsing
│   │   └── types.ts      # Type definitions
│   ├── metadata/
│   │   ├── fetcher.ts    # Token metadata (Token-2022 + Metaplex)
│   │   └── types.ts
│   ├── price/
│   │   ├── provider.ts   # Price provider interface
│   │   └── geckoterminal.ts
│   ├── rpc/
│   │   ├── client.ts     # Solana RPC client
│   │   └── types.ts
│   └── utils/
│       ├── format.ts     # Output formatting
│       └── retry.ts      # Retry logic
├── public/
│   └── index.html        # Dashboard UI
├── data/                 # Generated migration data (gitignored)
├── config.json           # App configuration
└── .env.example          # Environment template
```

## API

### GET /api/migrations

Returns the latest migration data:

```json
{
  "run_at": "2024-02-04T12:00:00.000Z",
  "window_seconds": 21600,
  "migrations": [
    {
      "signature": "...",
      "mint": "...",
      "name": "Token Name",
      "symbol": "TKN",
      "market_cap_usd": 100000,
      "price_usd": 0.0001,
      "destination": "pumpswap",
      "time": "2024-02-04T11:30:00.000Z"
    }
  ]
}
```

## Tech Stack

- **TypeScript** - Type-safe code
- **@solana/web3.js** - Solana blockchain interaction
- **Express** - Web server
- **GeckoTerminal API** - Price data

## License

MIT
