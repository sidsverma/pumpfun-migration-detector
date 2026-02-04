import { BasePriceProvider } from './provider';
import { PriceData } from './types';
import { withRetry, sleep } from '../utils/retry';

const GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';

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
    private minRequestInterval = 200; // Rate limit: 5 requests per second

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

            const url = `${GECKOTERMINAL_API}/networks/solana/tokens/${mint}`;

            const response = await withRetry(async () => {
                const res = await fetch(url, {
                    headers: {
                        'Accept': 'application/json',
                    },
                });

                if (res.status === 404) {
                    // Token not found - this is expected for new tokens
                    return null;
                }

                if (!res.ok) {
                    throw new Error(`GeckoTerminal API error: ${res.status}`);
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
            console.warn(`Failed to fetch price for ${mint}:`, error);
            return { priceUsd: null, marketCapUsd: null };
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
