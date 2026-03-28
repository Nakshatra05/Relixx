import { createPublicClient, http, type Chain, type PublicClient, type Transport } from "viem";
import { TOKEN_LOGO_MON } from "@/lib/tokenLogos";
import { hardhat } from "viem/chains";
import { defineChain } from "viem";

/** Target chain for RPC + Para `useViemClient` (match your deployment). */
export function getAppChain(): Chain {
  const id = Number(import.meta.env.VITE_CHAIN_ID || 10143);
  if (id === 143) {
    return defineChain({
      id: 143,
      name: "Monad Mainnet",
      nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
      blockExplorers: { default: { name: "MonadExplorer", url: "https://monadexplorer.com" } },
    });
  }
  if (id === 10143) {
    return defineChain({
      id: 10143,
      name: "Monad Testnet",
      nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
      blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
    });
  }
  if (id === 31337) return hardhat;
  return defineChain({
    id: 10143,
    name: "Monad Testnet",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
    blockExplorers: { default: { name: "MonadExplorer", url: "https://testnet.monadexplorer.com" } },
  });
}

const PUBLIC_MONAD_TESTNET_RPC = "https://testnet-rpc.monad.xyz";
const PUBLIC_MONAD_MAINNET_RPC = "https://rpc.monad.xyz";

export function getRpcUrl(): string {
  const fromEnv = import.meta.env.VITE_MONAD_RPC_URL?.trim();
  if (fromEnv) return fromEnv;
  const id = Number(import.meta.env.VITE_CHAIN_ID || 10143);
  if (id === 31337) return "http://127.0.0.1:8545";
  if (id === 10143) return PUBLIC_MONAD_TESTNET_RPC;
  if (id === 143) return PUBLIC_MONAD_MAINNET_RPC;
  return PUBLIC_MONAD_TESTNET_RPC;
}

/** Block explorer origin (no trailing slash) for links — matches `VITE_CHAIN_ID` unless overridden. */
/**
 * Monad public RPCs sometimes return HTTP 413 if a JSON-RPC batch or concurrent load exceeds their limit.
 * Keep transport batching off and allow longer timeouts than viem’s default.
 */
export function getMonadRpcTransport(rpcUrl: string): Transport {
  return http(rpcUrl, {
    batch: false,
    retryCount: 2,
    timeout: 60_000,
  });
}

export function getExplorerBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_MONAD_EXPLORER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const id = Number(import.meta.env.VITE_CHAIN_ID || 10143);
  if (id === 143) return "https://monadexplorer.com";
  return "https://testnet.monadexplorer.com";
}

/**
 * Para modal balance “network” metadata (native MON + optional ERC-20s on the same chain).
 * See https://docs.getpara.com/introduction/chain-support
 */
export function getParaBalanceNetwork(): {
  name: string;
  evmChainId: "10143" | "143";
  nativeTokenSymbol: "MON";
  logoUrl: string;
  rpcUrl: string;
  explorer: { name: string; url: string; txUrlFormat: string };
  isTestnet: boolean;
} {
  const id = Number(import.meta.env.VITE_CHAIN_ID || 10143);
  const rpcUrl = getRpcUrl();
  if (id === 143) {
    return {
      name: "Monad Mainnet",
      evmChainId: "143",
      nativeTokenSymbol: "MON",
      logoUrl: TOKEN_LOGO_MON,
      rpcUrl,
      explorer: {
        name: "MonadExplorer",
        url: "https://monadexplorer.com",
        txUrlFormat: "https://monadexplorer.com/tx/{HASH}",
      },
      isTestnet: false,
    };
  }
  return {
    name: "Monad Testnet",
    evmChainId: "10143",
    nativeTokenSymbol: "MON",
    logoUrl: TOKEN_LOGO_MON,
    rpcUrl,
    explorer: {
      name: "MonadExplorer",
      url: "https://testnet.monadexplorer.com",
      txUrlFormat: "https://testnet.monadexplorer.com/tx/{HASH}",
    },
    isTestnet: true,
  };
}

let cached: PublicClient | null = null;
let cachedKey = "";

export function getPublicClient(): PublicClient {
  const chain = getAppChain();
  const url = getRpcUrl();
  const key = `${chain.id}:${url}`;
  if (!cached || cachedKey !== key) {
    cached = createPublicClient({
      chain,
      transport: getMonadRpcTransport(url),
      batch: { multicall: false },
    });
    cachedKey = key;
  }
  return cached;
}
