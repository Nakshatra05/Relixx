import {
  type Address,
  type PublicClient,
  encodeFunctionData,
  isAddress,
  size,
  zeroAddress,
} from "viem";
import { readContract } from "viem/actions";
import type { QuoteResponse } from "@/lib/swapQuote";

/** Uniswap docs: https://docs.uniswap.org/contracts/v3/reference/deployments/monad-deployments */
const DEFAULT_MAINNET = {
  swapRouter: "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900" as Address,
  quoterV2: "0x661e93cca42afacb172121ef892830ca3b70f08d" as Address,
  factory: "0x204faca1764b154221e35c0d20abb3c525710498" as Address,
  wmon: "0x3bd359C1119dA7Da1D913D1C4d2B7c461115433A" as Address,
};

/** Same router/factory/quoter IDs as docs; WMON = Monad testnet wrapped native (chain 10143). */
const DEFAULT_TESTNET = {
  swapRouter: "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900" as Address,
  quoterV2: "0x661e93cca42afacb172121ef892830ca3b70f08d" as Address,
  factory: "0x204faca1764b154221e35c0d20abb3c525710498" as Address,
  wmon: "0xFb8b0e77d0a2736C546d148e65842c67B001C541" as Address,
};

const FEE_TIERS = [500, 3000, 10_000] as const;

/** SwapRouter02: recipient flag = `address(2)` → custody on router (then unwrap). */
export const UNISWAP_ADDRESS_THIS: Address = "0x0000000000000000000000000000000000000002";

const factoryAbi = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

const quoterV2Abi = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const swapRouter02Abi = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "multicall",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    name: "unwrapWETH9",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountMinimum", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
] as const;

export type UniswapV3Addresses = {
  swapRouter: Address;
  quoterV2: Address;
  factory: Address;
  wmon: Address;
};

function envAddr(key: string): Address | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[key]?.trim();
  if (!v || !isAddress(v)) return undefined;
  return v as Address;
}

export function getUniswapV3Addresses(chainId: number): UniswapV3Addresses {
  if (chainId === 10143) {
    return {
      swapRouter: envAddr("VITE_UNISWAP_V3_SWAP_ROUTER_10143") ?? DEFAULT_TESTNET.swapRouter,
      quoterV2: envAddr("VITE_UNISWAP_V3_QUOTER_V2_10143") ?? DEFAULT_TESTNET.quoterV2,
      factory: envAddr("VITE_UNISWAP_V3_FACTORY_10143") ?? DEFAULT_TESTNET.factory,
      wmon: envAddr("VITE_UNISWAP_WMON_10143") ?? DEFAULT_TESTNET.wmon,
    };
  }
  if (chainId === 143) {
    return {
      swapRouter: envAddr("VITE_UNISWAP_V3_SWAP_ROUTER_143") ?? DEFAULT_MAINNET.swapRouter,
      quoterV2: envAddr("VITE_UNISWAP_V3_QUOTER_V2_143") ?? DEFAULT_MAINNET.quoterV2,
      factory: envAddr("VITE_UNISWAP_V3_FACTORY_143") ?? DEFAULT_MAINNET.factory,
      wmon: envAddr("VITE_UNISWAP_WMON_143") ?? DEFAULT_MAINNET.wmon,
    };
  }
  return getUniswapV3Addresses(10143);
}

export function isUniswapV3SupportedChain(chainId: number): boolean {
  return chainId === 10143 || chainId === 143;
}

async function hasCode(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getBytecode({ address });
  return code != null && size(code) > 0;
}

/** RPC hint when SwapRouter02 / Quoter / Factory have no code at configured addresses. */
function uniswapBytecodeHint(chainId: number): string {
  if (chainId === 10143) {
    return (
      " On Monad testnet (10143) your RPC often has no Uniswap v3 at the addresses listed on " +
      "https://docs.uniswap.org/contracts/v3/reference/deployments/monad-deployments — those contracts are present on Monad mainnet (143), verified with cast against testnet vs mainnet RPC. " +
      "Use Receive as native MON on testnet, point the app at mainnet (VITE_CHAIN_ID=143 + rpc.monad.xyz) for USDC swaps, or set VITE_UNISWAP_V3_SWAP_ROUTER_10143 (and quoter/factory) when Monad publishes a new testnet deployment."
    );
  }
  return (
    " Set VITE_UNISWAP_V3_* in .env or confirm contracts on " +
    "https://docs.uniswap.org/contracts/v3/reference/deployments/monad-deployments"
  );
}

async function bestQuoteForPath(
  client: PublicClient,
  u: UniswapV3Addresses,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<{ fee: number; amountOut: bigint } | null> {
  let best: { fee: number; amountOut: bigint } | null = null;
  for (const fee of FEE_TIERS) {
    const pool = (await readContract(client as never, {
      address: u.factory,
      abi: factoryAbi,
      functionName: "getPool",
      args: [tokenIn, tokenOut, fee],
    } as never)) as Address;
    if (!pool || pool === zeroAddress) continue;
    try {
      const [amountOut] = (await readContract(client as never, {
        address: u.quoterV2,
        abi: quoterV2Abi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn,
            tokenOut,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      } as never)) as [bigint, bigint, number, bigint];
      if (amountOut > 0n && (!best || amountOut > best.amountOut)) {
        best = { fee, amountOut };
      }
    } catch {
      continue;
    }
  }
  return best;
}

function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

export type UniswapClaimQuoteParams = {
  claimContract: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  /** Basis points, default 100 (1%). */
  slippageBps?: number;
};

/**
 * Build a quote for `executeClaimAndSwap` using Uniswap v3 SwapRouter02 + QuoterV2 on Monad.
 * `recipient` for the swap is always `claimContract` (matches `executeClaimAndSwap`).
 */
export async function getUniswapV3QuoteForClaim(
  client: PublicClient,
  chainId: number,
  p: UniswapClaimQuoteParams,
): Promise<QuoteResponse> {
  const u = getUniswapV3Addresses(chainId);
  const slippageBps = p.slippageBps ?? 100;

  if (!(await hasCode(client, u.swapRouter))) {
    throw new Error(
      "Uniswap SwapRouter02 has no contract code at the configured address on this RPC." + uniswapBytecodeHint(chainId),
    );
  }
  if (!(await hasCode(client, u.quoterV2))) {
    throw new Error(
      "Uniswap QuoterV2 has no contract code at the configured address on this RPC." + uniswapBytecodeHint(chainId),
    );
  }
  if (!(await hasCode(client, u.factory))) {
    throw new Error(
      "Uniswap V3 Factory has no contract code at the configured address on this RPC." + uniswapBytecodeHint(chainId),
    );
  }

  const native = zeroAddress as Address;
  const nativeIn = p.tokenIn.toLowerCase() === native.toLowerCase();
  const nativeOut = p.tokenOut.toLowerCase() === native.toLowerCase();
  if (nativeIn && nativeOut) {
    throw new Error("Native MON to native MON is not a swap — pick an ERC-20 token out.");
  }

  const tin = nativeIn ? u.wmon : p.tokenIn;
  const tout = nativeOut ? u.wmon : (p.tokenOut as Address);
  if (tin.toLowerCase() === tout.toLowerCase()) {
    throw new Error("tokenIn and tokenOut resolve to the same asset after WMON mapping.");
  }

  const best = await bestQuoteForPath(client, u, tin, tout, p.amountIn);
  if (!best) {
    throw new Error(
      "No Uniswap v3 pool found for this pair (tried fee tiers 500 / 3000 / 10000). Add liquidity or pick another token.",
    );
  }

  const minOut = applySlippage(best.amountOut, slippageBps);
  const sqrt0 = 0n;

  let calldata: `0x${string}`;
  let value: bigint;

  if (!nativeIn && !nativeOut) {
    calldata = encodeFunctionData({
      abi: swapRouter02Abi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: tin,
          tokenOut: tout,
          fee: best.fee,
          recipient: p.claimContract,
          amountIn: p.amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: sqrt0,
        },
      ],
    });
    value = 0n;
  } else if (nativeIn && !nativeOut) {
    calldata = encodeFunctionData({
      abi: swapRouter02Abi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: u.wmon,
          tokenOut: tout,
          fee: best.fee,
          recipient: p.claimContract,
          amountIn: p.amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: sqrt0,
        },
      ],
    });
    value = p.amountIn;
  } else if (!nativeIn && nativeOut) {
    const swapData = encodeFunctionData({
      abi: swapRouter02Abi,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: tin,
          tokenOut: u.wmon,
          fee: best.fee,
          recipient: UNISWAP_ADDRESS_THIS,
          amountIn: p.amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: sqrt0,
        },
      ],
    });
    const unwrapData = encodeFunctionData({
      abi: swapRouter02Abi,
      functionName: "unwrapWETH9",
      args: [minOut, p.claimContract],
    });
    calldata = encodeFunctionData({
      abi: swapRouter02Abi,
      functionName: "multicall",
      args: [[swapData, unwrapData]],
    });
    value = 0n;
  } else {
    throw new Error("Unreachable swap path.");
  }

  return {
    type: "uniswap_v3_exact_input_single",
    status: "success",
    output: best.amountOut.toString(),
    minOut: minOut.toString(),
    transaction: {
      to: u.swapRouter,
      calldata: calldata.startsWith("0x") ? calldata.slice(2) : calldata,
      value: value.toString(),
    },
    gasPrices: {},
  };
}
