import { BasePriceProvider } from './provider';
import { PriceData } from './types';
import { withRetry, sleep } from '../utils/retry';

const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';
// CoinGecko Pro On-Chain API (uses same endpoints structure as GeckoTerminal but on pro domain)
const COINGECKO_PRO_API = 'https://pro-api.coingecko.com/api/v3/onchain';

interface GeckoTokenResponse {
    data?: {
        attributes?: {
            price_usd?: string;
            fdv_usd?: string;
            market_cap_usd?: string;
        };
    };
}

export class GeckoTerminalProvider extends BasePriceProvider {
    private lastRequestTime = 0;
    private minRequestInterval = 200; // Default: 5 rps
    private apiKey?: string;

    constructor(apiKey?: string) {
        super();
        this.apiKey = apiKey;
        // If we have a pro key, we can go much faster (e.g. 500 requests/min = ~100ms interval)
        if (this.apiKey) {
            this.minRequestInterval = 50;
        }
    }

    private async rateLimit(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.minRequestInterval) {
            await sleep(this.minRequestInterval - elapsed);
        }
        this.lastRequestTime = Date.now();
    }

    async getPrice(mint: string): Promise<PriceData> {
        try {
            await this.rateLimit();

            let url: string;
            const headers: Record<string, string> = {
                'Accept': 'application/json',
            };

            if (this.apiKey) {
                // Use Pro API
                url = `${COINGECKO_PRO_API}/networks/solana/tokens/${mint}`;
                headers['x-cg-pro-api-key'] = this.apiKey;
            } else {
                // Use Public API
                url = `${GECKOTERMINAL_API}/networks/solana/tokens/${mint}`;
            }

            const response = await withRetry(async () => {
                const res = await fetch(url, { headers });

                if (res.status === 404) {
                    return null;
                }

                if (!res.ok) {
                    throw new Error(`Price API error: ${res.status}`);
                }

                return res.json() as Promise<GeckoTokenResponse>;
            }, { maxRetries: 2 });

            if (!response?.data?.attributes) {
                return { priceUsd: null, marketCapUsd: null };
            }

            const attrs = response.data.attributes;
            const priceUsd = attrs.price_usd ? parseFloat(attrs.price_usd) : null;

            // Try market_cap_usd first, fall back to fdv_usd
            let marketCapUsd: number | null = null;
            if (attrs.market_cap_usd) {
                marketCapUsd = parseFloat(attrs.market_cap_usd);
            } else if (attrs.fdv_usd) {
                marketCapUsd = parseFloat(attrs.fdv_usd);
            }

            return {
                priceUsd: !isNaN(priceUsd!) ? priceUsd : null,
                marketCapUsd: !isNaN(marketCapUsd!) ? marketCapUsd : null,
            };
        } catch (error) {
            // Only log if it's not a generic "skip" from higher level
            // console.warn(`Failed to fetch price for ${mint}:`, error);
            // Re-throw to let the resilience logic in index.ts handle it
            throw error;
        }
    }
}

/**
 * Fallback provider that always returns null
 * Used when no price data is available
 */
export class NullPriceProvider extends BasePriceProvider {
    async getPrice(_mint: string): Promise<PriceData> {
        return { priceUsd: null, marketCapUsd: null };
    }
}
