export interface PriceData {
    priceUsd: number | null;
    marketCapUsd: number | null;
}

export interface PriceProvider {
    getPrice(mint: string): Promise<PriceData>;
}
