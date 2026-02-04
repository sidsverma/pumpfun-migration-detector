import { PriceProvider, PriceData } from './types';

export abstract class BasePriceProvider implements PriceProvider {
    abstract getPrice(mint: string): Promise<PriceData>;
}
