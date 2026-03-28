import type { Address } from "viem";

export type SupportedSymbol = "MON" | "USDC";

/** Matches `UniversalClaimLinks.TOKEN_NATIVE` — native MON in `Claim.tokenIn`. */
export const NATIVE_TOKEN_IN: Address = "0x0000000000000000000000000000000000000000";

export type ClaimLinksEnv = {
  claimLinks: Address;
  usdc: Address;
};

export const MONAD_TESTNET_TOKENS = {
  usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
} as const satisfies Record<string, Address>;

export function getClaimLinksEnv(): ClaimLinksEnv | null {
  const chainId = Number(import.meta.env.VITE_CHAIN_ID || 10143);
  const claimLinks = import.meta.env.VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS?.trim();
  let usdc = import.meta.env.VITE_TOKEN_USDC?.trim();

  if (chainId === 10143) {
    if (!usdc) usdc = MONAD_TESTNET_TOKENS.usdc;
  }

  if (!claimLinks || !usdc) return null;
  return {
    claimLinks: claimLinks as Address,
    usdc: usdc as Address,
  };
}

export function tokenAddressForSymbol(env: ClaimLinksEnv, symbol: SupportedSymbol): Address {
  switch (symbol) {
    case "MON":
      return NATIVE_TOKEN_IN;
    case "USDC":
      return env.usdc;
    default:
      return env.usdc;
  }
}

export function symbolForTokenAddress(env: ClaimLinksEnv, token: Address): SupportedSymbol {
  const t = token.toLowerCase();
  if (t === NATIVE_TOKEN_IN.toLowerCase()) return "MON";
  if (t === env.usdc.toLowerCase()) return "USDC";
  return "USDC";
}
