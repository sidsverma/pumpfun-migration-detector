import {
    Connection,
    PublicKey,
    ParsedTransactionWithMeta,
    ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { Config } from '../config';
import { withRetry } from '../utils/retry';
import { SignatureInfo } from './types';

export class SolanaRpcClient {
    private connection: Connection;
    private config: Config;

    constructor(config: Config) {
        this.config = config;
        this.connection = new Connection(config.solanaRpcUrl, {
            commitment: 'confirmed',
        });
    }

    /**
     * Get signatures for an address within a time window
     */
    async getSignaturesForAddress(
        address: string,
        options: {
            before?: string;
            until?: string;
            limit?: number;
        } = {}
    ): Promise<SignatureInfo[]> {
        const pubkey = new PublicKey(address);

        return withRetry(async () => {
            const signatures = await this.connection.getSignaturesForAddress(pubkey, {
                before: options.before,
                until: options.until,
                limit: options.limit || this.config.maxSignaturesPerFetch,
            });

            // Filter out signatures without blockTime
            return signatures.filter(
                (sig): sig is SignatureInfo => sig.blockTime !== null
            );
        });
    }

    /**
     * Fetch all signatures in a time window, handling pagination
     */
    async getSignaturesInTimeWindow(
        address: string,
        windowStartTime: number,
        newestProcessedSignature?: string
    ): Promise<SignatureInfo[]> {
        const allSignatures: SignatureInfo[] = [];
        let before: string | undefined = undefined;
        let reachedEnd = false;

        while (!reachedEnd) {
            const signatures = await this.getSignaturesForAddress(address, {
                before,
                until: newestProcessedSignature,
                limit: this.config.maxSignaturesPerFetch,
            });

            if (signatures.length === 0) {
                break;
            }

            for (const sig of signatures) {
                // Stop if we've gone past the time window
                if (sig.blockTime < windowStartTime) {
                    reachedEnd = true;
                    break;
                }
                allSignatures.push(sig);
            }

            // Prepare for next page
            before = signatures[signatures.length - 1].signature;

            // If we got fewer than the limit, we've reached the end
            if (signatures.length < this.config.maxSignaturesPerFetch) {
                break;
            }
        }

        return allSignatures;
    }

    /**
     * Get a parsed transaction by signature
     */
    async getTransaction(signature: string): Promise<ParsedTransactionWithMeta | null> {
        return withRetry(async () => {
            return this.connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0,
            });
        });
    }

    /**
     * Get token supply for a mint
     */
    async getTokenSupply(mint: string): Promise<number | null> {
        try {
            const pubkey = new PublicKey(mint);
            const supply = await withRetry(() =>
                this.connection.getTokenSupply(pubkey)
            );
            return supply.value.uiAmount;
        } catch (error) {
            console.warn(`Failed to get token supply for ${mint}:`, error);
            return null;
        }
    }

    getConnection(): Connection {
        return this.connection;
    }
}
