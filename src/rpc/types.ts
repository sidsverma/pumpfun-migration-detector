import { ConfirmedSignatureInfo, ParsedTransactionWithMeta } from '@solana/web3.js';

export interface SignatureInfo extends ConfirmedSignatureInfo {
    blockTime: number;
}

export interface TransactionResult {
    signature: string;
    transaction: ParsedTransactionWithMeta | null;
}
