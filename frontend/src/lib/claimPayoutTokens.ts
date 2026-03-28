import { isAddress, type Address } from "viem";
import type { ClaimLinksEnv } from "@/lib/contracts/contractConfig";
import { NATIVE_TOKEN_IN } from "@/lib/contracts/contractConfig";

export type ClaimPayoutToken = {
  id: string;
  symbol: string;
  address: Address;
  decimals: number;
};

/** Tokens shown as “Receive as” options (2–4 entries). Extend via env. */
export function getClaimPayoutTokens(env: ClaimLinksEnv): ClaimPayoutToken[] {
  const tokens: ClaimPayoutToken[] = [
    { id: "mon", symbol: "MON", address: NATIVE_TOKEN_IN, decimals: 18 },
    { id: "usdc", symbol: "USDC", address: env.usdc, decimals: 6 },
  ];

  const t3 = (import.meta.env as Record<string, string | undefined>).VITE_CLAIM_TOKEN3_ADDRESS?.trim();
  const sym3 = (import.meta.env as Record<string, string | undefined>).VITE_CLAIM_TOKEN3_SYMBOL?.trim() ?? "TK3";
  const dec3 = Number((import.meta.env as Record<string, string | undefined>).VITE_CLAIM_TOKEN3_DECIMALS ?? "18");
  if (t3 && isAddress(t3)) {
    tokens.push({ id: "t3", symbol: sym3, address: t3 as Address, decimals: dec3 });
  }

  const t4 = (import.meta.env as Record<string, string | undefined>).VITE_CLAIM_TOKEN4_ADDRESS?.trim();
  const sym4 = (import.meta.env as Record<string, string | undefined>).VITE_CLAIM_TOKEN4_SYMBOL?.trim() ?? "TK4";
  const dec4 = Number((import.meta.env as Record<string, string | undefined>).VITE_CLAIM_TOKEN4_DECIMALS ?? "18");
  if (t4 && isAddress(t4)) {
    tokens.push({ id: "t4", symbol: sym4, address: t4 as Address, decimals: dec4 });
  }

  return tokens;
}

export function isSamePayoutAsset(tokenIn: Address, tokenOut: Address): boolean {
  const z = NATIVE_TOKEN_IN.toLowerCase();
  return tokenIn.toLowerCase() === tokenOut.toLowerCase() || (tokenIn.toLowerCase() === z && tokenOut.toLowerCase() === z);
}
