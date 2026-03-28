import type { Abi } from "viem";
import abiJson from "./universalClaimLinksAbi.json";

/**
 * Matches `src/UniversalClaimLinks.sol`. Source of truth: `universalClaimLinksAbi.json`
 * (sync from Forge: `forge build` then `node scripts/sync-universal-claim-abi.mjs`).
 */
export const universalClaimLinksAbi = abiJson as Abi;
