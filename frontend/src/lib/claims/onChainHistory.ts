import { getAddress, parseAbiItem, type Address, type PublicClient } from "viem";
import { getLogs, readContract } from "viem/actions";
import { universalClaimLinksAbi } from "@/lib/contracts/universalClaimLinksAbi";
import { NATIVE_TOKEN_IN } from "@/lib/contracts/contractConfig";
import type { ClaimRecord } from "@/lib/claims/types";

const claimCreatedEvent = parseAbiItem(
  "event ClaimCreated(uint256 indexed claimId, address indexed sender, address indexed receiver, address tokenIn, uint256 amountIn, uint40 expiry, bool isOpen)",
);
const claimExecutedEvent = parseAbiItem(
  "event ClaimExecuted(uint256 indexed claimId, address indexed receiver, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address swapTo)",
);
const claimCancelledEvent = parseAbiItem(
  "event ClaimCancelled(uint256 indexed claimId, address indexed sender, address tokenIn, uint256 amountIn)",
);

function fromBlockEnv(): bigint {
  const raw = import.meta.env.VITE_CLAIMS_FROM_BLOCK?.trim();
  if (raw) {
    try {
      return BigInt(raw);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function tokenLabel(tokenIn: Address, usdc: Address): { symbol: string; decimals: number } {
  const t = tokenIn.toLowerCase();
  if (t === NATIVE_TOKEN_IN.toLowerCase()) return { symbol: "MON", decimals: 18 };
  if (t === usdc.toLowerCase()) return { symbol: "USDC", decimals: 6 };
  return { symbol: `${tokenIn.slice(0, 6)}…${tokenIn.slice(-4)}`, decimals: 18 };
}

function statusLabel(status: number): "open" | "executed" | "cancelled" {
  if (status === 1) return "executed";
  if (status === 2) return "cancelled";
  return "open";
}

function claimLinkOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "";
}

/**
 * Lists claims where the user appears as sender or receiver (indexed in `ClaimCreated`).
 * Open secret claims only appear under "sent" (sender); receivers must use claim id search until executed.
 */
export async function fetchClaimsForAddressFromChain(
  publicClient: PublicClient,
  params: { claimLinks: Address; user: Address; chainId: number; usdc: Address },
): Promise<ClaimRecord[]> {
  const user = getAddress(params.user);
  const fromBlock = fromBlockEnv();

  const [asSender, asReceiver] = await Promise.all([
    getLogs(publicClient, {
      address: params.claimLinks,
      event: claimCreatedEvent,
      args: { sender: user },
      fromBlock,
      toBlock: "latest",
    }),
    getLogs(publicClient, {
      address: params.claimLinks,
      event: claimCreatedEvent,
      args: { receiver: user },
      fromBlock,
      toBlock: "latest",
    }),
  ]);

  const byClaim = new Map<
    string,
    { claimId: bigint; blockNumber: bigint; txHash: `0x${string}`; logIndex: number }
  >();
  for (const log of [...asSender, ...asReceiver]) {
    const id = log.args.claimId!.toString();
    if (!byClaim.has(id)) {
      byClaim.set(id, {
        claimId: log.args.claimId!,
        blockNumber: log.blockNumber!,
        txHash: log.transactionHash!,
        logIndex: log.logIndex,
      });
    }
  }

  const [execLogs, cancelLogs] = await Promise.all([
    getLogs(publicClient, {
      address: params.claimLinks,
      event: claimExecutedEvent,
      fromBlock,
      toBlock: "latest",
    }),
    getLogs(publicClient, {
      address: params.claimLinks,
      event: claimCancelledEvent,
      fromBlock,
      toBlock: "latest",
    }),
  ]);

  const execTxByClaimId = new Map<string, `0x${string}`>();
  const execByAddr = new Map<string, string>();
  for (const log of execLogs) {
    const id = log.args.claimId!.toString();
    if (!execTxByClaimId.has(id)) execTxByClaimId.set(id, log.transactionHash);
    execByAddr.set(id, getAddress(log.args.receiver!));
  }

  const cancelTxByClaimId = new Map<string, `0x${string}`>();
  for (const log of cancelLogs) {
    const id = log.args.claimId!.toString();
    if (!cancelTxByClaimId.has(id)) cancelTxByClaimId.set(id, log.transactionHash);
  }

  const blockTsCache = new Map<bigint, bigint>();
  async function blockTimestamp(blockNumber: bigint): Promise<bigint> {
    if (blockTsCache.has(blockNumber)) return blockTsCache.get(blockNumber)!;
    const b = await publicClient.getBlock({ blockNumber });
    blockTsCache.set(blockNumber, b.timestamp);
    return b.timestamp;
  }

  const origin = claimLinkOrigin();
  const out: ClaimRecord[] = [];

  for (const [idStr, meta] of byClaim) {
    const claim = await readContract(publicClient, {
      address: params.claimLinks,
      abi: universalClaimLinksAbi,
      functionName: "getClaim",
      args: [meta.claimId],
    });

    const tokenIn = claim.tokenIn as Address;
    const { symbol: token_in_symbol, decimals: token_in_decimals } = tokenLabel(tokenIn, params.usdc);
    const st = statusLabel(Number(claim.status));

    const ts = await blockTimestamp(meta.blockNumber);
    const created_at = new Date(Number(ts) * 1000).toISOString();

    const receiver = (claim.receiver as string).toLowerCase();

    out.push({
      claim_id: idStr,
      chain_id: params.chainId,
      sender: (claim.sender as string).toLowerCase(),
      receiver,
      token_in_symbol,
      token_in_decimals,
      token_out_symbol: null,
      amount_in_wei: claim.amountIn.toString(),
      amount_out_wei: null,
      claim_link: origin ? `${origin}/claim/${idStr}` : `/claim/${idStr}`,
      status: st,
      expiry_ts: claim.expiry.toString(),
      created_tx_hash: meta.txHash,
      executed_tx_hash: execTxByClaimId.get(idStr) ?? null,
      cancelled_tx_hash: cancelTxByClaimId.get(idStr) ?? null,
      executed_by: st === "executed" ? (execByAddr.get(idStr) ?? null) : null,
      created_at,
      updated_at: created_at,
    });
  }

  out.sort((a, b) => (BigInt(b.claim_id) > BigInt(a.claim_id) ? 1 : BigInt(b.claim_id) < BigInt(a.claim_id) ? -1 : 0));
  return out;
}

/** Tx that executed or cancelled a claim (for explorer links). Requires `VITE_CLAIMS_FROM_BLOCK` ≤ deployment block when set. */
export async function fetchSettlementTxHashForClaim(
  publicClient: PublicClient,
  params: { claimLinks: Address; claimId: bigint; status: number },
): Promise<`0x${string}` | null> {
  if (params.status === 0) return null;
  const fromBlock = fromBlockEnv();
  if (params.status === 1) {
    const logs = await getLogs(publicClient, {
      address: params.claimLinks,
      event: claimExecutedEvent,
      args: { claimId: params.claimId },
      fromBlock,
      toBlock: "latest",
    });
    const log = logs[logs.length - 1];
    return log?.transactionHash ?? null;
  }
  if (params.status === 2) {
    const logs = await getLogs(publicClient, {
      address: params.claimLinks,
      event: claimCancelledEvent,
      args: { claimId: params.claimId },
      fromBlock,
      toBlock: "latest",
    });
    const log = logs[logs.length - 1];
    return log?.transactionHash ?? null;
  }
  return null;
}
