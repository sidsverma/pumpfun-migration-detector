import { Connection, PublicKey } from '@solana/web3.js';
import { TokenMetadata } from './types';

// Metaplex Token Metadata Program ID
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

/**
 * Derive the metadata PDA for a token mint
 */
function getMetadataPDA(mint: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from('metadata'),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
    );
    return pda;
}

/**
 * Decode metadata account data (Metaplex format)
 * This is a simplified decoder for the essential fields
 */
function decodeMetaplexMetadata(data: Buffer): TokenMetadata | null {
    try {
        // Skip the first byte (key)
        let offset = 1;

        // Skip update authority (32 bytes)
        offset += 32;

        // Skip mint (32 bytes)
        offset += 32;

        // Read name
        const nameLength = data.readUInt32LE(offset);
        offset += 4;
        const nameRaw = data.slice(offset, offset + nameLength);
        offset += nameLength;
        const name = nameRaw.toString('utf-8').replace(/\0/g, '').trim();

        // Read symbol
        const symbolLength = data.readUInt32LE(offset);
        offset += 4;
        const symbolRaw = data.slice(offset, offset + symbolLength);
        offset += symbolLength;
        const symbol = symbolRaw.toString('utf-8').replace(/\0/g, '').trim();

        // Read URI
        const uriLength = data.readUInt32LE(offset);
        offset += 4;
        const uriRaw = data.slice(offset, offset + uriLength);
        const uri = uriRaw.toString('utf-8').replace(/\0/g, '').trim();

        return {
            name: name || null,
            symbol: symbol || null,
            uri: uri || null,
        };
    } catch (error) {
        return null;
    }
}

export class MetadataFetcher {
    private connection: Connection;
    private rpcUrl: string;

    constructor(connection: Connection, rpcUrl?: string) {
        this.connection = connection;
        this.rpcUrl = rpcUrl || connection.rpcEndpoint;
    }

    /**
     * Fetch token metadata - tries Token-2022 extensions first, then Metaplex
     */
    async fetchMetadata(mintAddress: string): Promise<TokenMetadata> {
        try {
            // First, try to get Token-2022 metadata directly from the mint account
            const token2022Metadata = await this.fetchToken2022Metadata(mintAddress);
            if (token2022Metadata && (token2022Metadata.name || token2022Metadata.symbol)) {
                return token2022Metadata;
            }

            // Fallback to Metaplex metadata
            const metaplexMetadata = await this.fetchMetaplexMetadata(mintAddress);
            if (metaplexMetadata && (metaplexMetadata.name || metaplexMetadata.symbol)) {
                return metaplexMetadata;
            }

            return { name: null, symbol: null, uri: null };
        } catch (error) {
            console.warn(`Failed to fetch metadata for ${mintAddress}:`, error);
            return { name: null, symbol: null, uri: null };
        }
    }

    /**
     * Fetch metadata from Token-2022 tokenMetadata extension
     * Pump.fun tokens use this format
     */
    private async fetchToken2022Metadata(mintAddress: string): Promise<TokenMetadata | null> {
        try {
            // Use raw RPC call to get parsed account info which includes extensions
            const response = await fetch(this.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getAccountInfo',
                    params: [
                        mintAddress,
                        { encoding: 'jsonParsed' }
                    ]
                })
            });

            const result: any = await response.json();
            const accountInfo = result?.result?.value;

            if (!accountInfo) {
                return null;
            }

            // Check if it's a Token-2022 mint with extensions
            const parsed = accountInfo.data?.parsed;
            if (!parsed || parsed.type !== 'mint') {
                return null;
            }

            const extensions = parsed.info?.extensions || [];

            // Find the tokenMetadata extension
            const metadataExt = extensions.find(
                (ext: any) => ext.extension === 'tokenMetadata'
            );

            if (metadataExt && metadataExt.state) {
                return {
                    name: metadataExt.state.name || null,
                    symbol: metadataExt.state.symbol || null,
                    uri: metadataExt.state.uri || null,
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetch metadata from Metaplex Token Metadata Program
     */
    private async fetchMetaplexMetadata(mintAddress: string): Promise<TokenMetadata | null> {
        try {
            const mint = new PublicKey(mintAddress);
            const metadataPDA = getMetadataPDA(mint);

            const accountInfo = await this.connection.getAccountInfo(metadataPDA);

            if (!accountInfo || !accountInfo.data) {
                return null;
            }

            return decodeMetaplexMetadata(accountInfo.data);
        } catch (error) {
            return null;
        }
    }
}
