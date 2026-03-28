/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARA_API_KEY: string;
  /** Optional: e.g. `BETA` for sandbox keys — see Para docs */
  readonly VITE_PARA_ENV?: string;
  /** Monad JSON-RPC URL (defaults by chain id if unset) */
  readonly VITE_MONAD_RPC_URL?: string;
  /** Monad explorer base URL, no trailing slash (defaults by `VITE_CHAIN_ID` if unset) */
  readonly VITE_MONAD_EXPLORER_URL?: string;
  /** WalletConnect Cloud project id (Para external wallet flow) */
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  /** @deprecated Use VITE_MONAD_EXPLORER_URL */
  readonly VITE_RSK_EXPLORER_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS?: string;
  readonly VITE_TOKEN_USDC?: string;
  /** First block to scan for `ClaimCreated` logs (default 0). Set to your deployment block if log queries time out. */
  readonly VITE_CLAIMS_FROM_BLOCK?: string;
  /** Override Uniswap v3 addresses if Monad testnet/mainnet deployments change. */
  readonly VITE_UNISWAP_V3_SWAP_ROUTER_10143?: string;
  readonly VITE_UNISWAP_V3_QUOTER_V2_10143?: string;
  readonly VITE_UNISWAP_V3_FACTORY_10143?: string;
  readonly VITE_UNISWAP_WMON_10143?: string;
  readonly VITE_UNISWAP_V3_SWAP_ROUTER_143?: string;
  readonly VITE_UNISWAP_V3_QUOTER_V2_143?: string;
  readonly VITE_UNISWAP_V3_FACTORY_143?: string;
  readonly VITE_UNISWAP_WMON_143?: string;
  /** Optional extra “Receive as” tokens (address + symbol + decimals). */
  readonly VITE_CLAIM_TOKEN3_ADDRESS?: string;
  readonly VITE_CLAIM_TOKEN3_SYMBOL?: string;
  readonly VITE_CLAIM_TOKEN3_DECIMALS?: string;
  readonly VITE_CLAIM_TOKEN4_ADDRESS?: string;
  readonly VITE_CLAIM_TOKEN4_SYMBOL?: string;
  readonly VITE_CLAIM_TOKEN4_DECIMALS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
