import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { readContract, simulateContract, writeContract, waitForTransactionReceipt } from "viem/actions";
import { formatUnits, isHex, toHex, type Address } from "viem";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { universalClaimLinksAbi } from "@/lib/contracts/universalClaimLinksAbi";
import { getClaimLinksEnv } from "@/lib/contracts/contractConfig";
import { erc20Abi } from "@/lib/contracts/erc20Abi";
import { fetchSettlementTxHashForClaim } from "@/lib/claims/onChainHistory";
import { getAppChain, getExplorerBaseUrl, getPublicClient } from "@/lib/viem/appChain";
import { useParaViem } from "@/hooks/useParaViem";
import { getClaimPayoutTokens, isSamePayoutAsset, type ClaimPayoutToken } from "@/lib/claimPayoutTokens";
import { getUniswapV3QuoteForClaim, isUniswapV3SupportedChain } from "@/lib/uniswapV3MonadSwap";
import { formatRpcTransportError, formatWriteContractError } from "@/lib/viem/txErrors";
import { tokenLogoUrlForSymbol } from "@/lib/tokenLogos";

type ClaimFundsProps = {
  claimIdOverride?: string;
  embedded?: boolean;
};

type ClaimFromContract = {
  amountIn: bigint;
  expiry: bigint;
  status: bigint;
  sender: `0x${string}`;
  receiver: `0x${string}`;
  tokenIn: `0x${string}`;
  secretHash: `0x${string}`;
};

const STATUS_OPEN = 0;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

function encodeSecretForContract(secret: string): `0x${string}` {
  const s = secret.trim();
  if (!s) return "0x";
  if (isHex(s)) return s as `0x${string}`;
  return toHex(new TextEncoder().encode(s));
}

function shortAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

const ClaimFunds = ({ claimIdOverride, embedded }: ClaimFundsProps) => {
  const { id: routeId } = useParams<{ id: string }>();
  const id = claimIdOverride ?? routeId;
  const env = getClaimLinksEnv();
  const qc = useQueryClient();
  const { address, viemClient, ready } = useParaViem();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState("");
  /** Set when this session completes a claim so the explorer link shows before log indexing catches up. */
  const [localSettlementTxHash, setLocalSettlementTxHash] = useState<string | null>(null);

  const chainId = getAppChain().id;
  const canSwapQuote = isUniswapV3SupportedChain(chainId);

  const claimId = useMemo(() => {
    if (!id) return null;
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }, [id]);

  /** Primitive deps only — `getClaimLinksEnv()` returns a new object every render, which was breaking useMemo/useEffect and resetting token selection on every click. */
  const claimLinksKey = env?.claimLinks.toLowerCase() ?? "";
  const usdcKey = env?.usdc.toLowerCase() ?? "";
  const payoutTokens = useMemo(
    () => (env ? getClaimPayoutTokens(env) : []),
    [claimLinksKey, usdcKey],
  );

  const { data: claim, refetch } = useQuery<ClaimFromContract>({
    queryKey: ["claim", env?.claimLinks, claimId?.toString()],
    enabled: !!env && claimId != null,
    queryFn: async () => {
      const pc = getPublicClient();
      return (await readContract(pc as never, {
        address: env!.claimLinks,
        abi: universalClaimLinksAbi,
        functionName: "getClaim",
        args: [claimId!],
      } as never)) as ClaimFromContract;
    },
  });

  const { data: tokenInDecimals } = useQuery({
    queryKey: ["tokenInDecimals", env?.claimLinks, claim?.tokenIn],
    enabled: !!env && !!claim && claim.tokenIn.toLowerCase() !== ZERO_ADDRESS.toLowerCase(),
    queryFn: async () => {
      const pc = getPublicClient();
      return Number(
        await readContract(pc as never, {
          address: claim!.tokenIn as `0x${string}`,
          abi: erc20Abi,
          functionName: "decimals",
        } as never),
      );
    },
  });

  const selected = useMemo(
    () => payoutTokens.find((t) => t.id === selectedId) ?? null,
    [payoutTokens, selectedId],
  );

  /** Reset payout choice only when the loaded claim identity changes — not on arbitrary re-renders. */
  useEffect(() => {
    if (!claim || payoutTokens.length === 0) return;
    const match = payoutTokens.find((t) => isSamePayoutAsset(claim.tokenIn as Address, t.address));
    setSelectedId(match?.id ?? payoutTokens[0]!.id);
  }, [claimId, claim?.tokenIn, claimLinksKey, usdcKey]);

  useEffect(() => {
    setLocalSettlementTxHash(null);
  }, [claimId, claimLinksKey]);

  const settlementStatusNum = claim ? Number(claim.status) : -1;
  const { data: indexedSettlementTxHash } = useQuery({
    queryKey: ["claim-settlement-tx", claimLinksKey, claimId?.toString(), settlementStatusNum],
    enabled: !!env && claimId != null && !!claim && settlementStatusNum !== STATUS_OPEN,
    queryFn: async () =>
      fetchSettlementTxHashForClaim(getPublicClient(), {
        claimLinks: env!.claimLinks,
        claimId: claimId!,
        status: settlementStatusNum,
      }),
    staleTime: 60_000,
  });

  const settlementTxHash = localSettlementTxHash ?? indexedSettlementTxHash ?? null;

  const isDirect =
    !!claim &&
    !!selected &&
    isSamePayoutAsset(claim.tokenIn as Address, selected.address as Address);

  const {
    data: swapQuote,
    isFetching: quoteLoading,
    isError: quoteIsError,
    error: quoteError,
    refetch: refetchQuote,
  } = useQuery({
    queryKey: [
      "uniswap-claim-quote",
      chainId,
      env?.claimLinks,
      claimId?.toString(),
      selected?.address,
      claim?.amountIn?.toString(),
      claim?.tokenIn,
    ],
    enabled:
      !!env &&
      !!claim &&
      claimId != null &&
      Number(claim.status) === STATUS_OPEN &&
      !!selected &&
      !isDirect &&
      canSwapQuote,
    queryFn: async () => {
      const pc = getPublicClient();
      return getUniswapV3QuoteForClaim(pc, chainId, {
        claimContract: env!.claimLinks,
        tokenIn: claim!.tokenIn as Address,
        tokenOut: selected!.address as Address,
        amountIn: claim!.amountIn,
      });
    },
    staleTime: 15_000,
  });

  const decimalsIn = claim
    ? claim.tokenIn.toLowerCase() === ZERO_ADDRESS.toLowerCase()
      ? 18
      : (tokenInDecimals ?? 18)
    : 18;
  const decimalsEst = selected?.decimals ?? 18;

  const tokenInSymbol = useMemo(() => {
    if (!claim) return "";
    if (claim.tokenIn.toLowerCase() === ZERO_ADDRESS.toLowerCase()) return "MON";
    const m = payoutTokens.find((t) => t.address.toLowerCase() === claim.tokenIn.toLowerCase());
    return m?.symbol ?? "Token";
  }, [claim, payoutTokens]);

  const depositedDisplay = claim ? `${formatUnits(claim.amountIn, decimalsIn)} ${tokenInSymbol}` : "—";

  const estimateDisplay = useMemo(() => {
    if (!claim || !selected) return "—";
    if (isDirect) {
      return `${formatUnits(claim.amountIn, decimalsIn)} ${tokenInSymbol}`;
    }
    if (quoteLoading || !swapQuote) return quoteLoading ? "Fetching quote…" : "—";
    if (swapQuote.status !== "success") return "—";
    return `${formatUnits(BigInt(swapQuote.output), decimalsEst)} ${selected.symbol}`;
  }, [claim, selected, isDirect, decimalsIn, decimalsEst, swapQuote, quoteLoading, tokenInSymbol]);

  const subtitle = claimId != null ? `Claim #${claimId.toString()} · ` : "";
  const modeLabel = isDirect ? "Receive same asset (no DEX)" : "Swap via Uniswap v3";

  const onClaimNow = async () => {
    if (!env || !claim || claimId == null || !viemClient || !address || !ready || !selected) return;
    if (Number(claim.status) !== STATUS_OPEN) {
      toast.error("Claim is not open");
      return;
    }
    const isSecretClaim = claim.receiver === ZERO_ADDRESS && claim.secretHash !== ZERO_HASH;
    const secret = window.location.hash.replace(/^#/, "");
    if (isSecretClaim && !secret) {
      toast.error("Missing secret in URL fragment (#...)");
      return;
    }

    if (!isDirect) {
      if (!canSwapQuote) {
        toast.error("Swaps require Monad testnet or mainnet (10143 / 143).");
        return;
      }
      if (!swapQuote || swapQuote.status !== "success") {
        toast.error("Wait for a valid quote or pick another token.");
        return;
      }
    }

    setActionStatus("Submitting…");
    try {
      const publicClient = getPublicClient();
      if (isDirect) {
        const execArgs = isSecretClaim
          ? ([claimId, selected.address as `0x${string}`, encodeSecretForContract(secret), address] as const)
          : ([claimId, selected.address as `0x${string}`, address] as const);
        await simulateContract(publicClient as never, {
          address: env.claimLinks,
          abi: universalClaimLinksAbi,
          functionName: "executeClaim",
          args: execArgs,
          account: address,
        } as never);
        const hash = await writeContract(viemClient as never, {
          chain: getAppChain(),
          address: env.claimLinks,
          abi: universalClaimLinksAbi,
          functionName: "executeClaim",
          args: execArgs,
          account: address,
        } as never);
        const receipt = await waitForTransactionReceipt(viemClient as never, { hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        setLocalSettlementTxHash(receipt.transactionHash);
      } else {
        const calldata = swapQuote!.transaction.calldata.startsWith("0x")
          ? swapQuote!.transaction.calldata
          : `0x${swapQuote!.transaction.calldata}`;
        const swapArgs = isSecretClaim
          ? ([
              claimId,
              selected.address as `0x${string}`,
              encodeSecretForContract(secret),
              swapQuote!.transaction.to as `0x${string}`,
              calldata as `0x${string}`,
              BigInt(swapQuote!.transaction.value || "0"),
              address,
            ] as const)
          : ([
              claimId,
              selected.address as `0x${string}`,
              swapQuote!.transaction.to as `0x${string}`,
              calldata as `0x${string}`,
              BigInt(swapQuote!.transaction.value || "0"),
              address,
            ] as const);
        await simulateContract(publicClient as never, {
          address: env.claimLinks,
          abi: universalClaimLinksAbi,
          functionName: "executeClaimAndSwap",
          args: swapArgs,
          account: address,
        } as never);
        const hash = await writeContract(viemClient as never, {
          chain: getAppChain(),
          address: env.claimLinks,
          abi: universalClaimLinksAbi,
          functionName: "executeClaimAndSwap",
          args: swapArgs,
          account: address,
        } as never);
        const receipt = await waitForTransactionReceipt(viemClient as never, { hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        setLocalSettlementTxHash(receipt.transactionHash);
      }
      await refetch();
      await qc.invalidateQueries({ queryKey: ["uniswap-claim-quote"] });
      setActionStatus("");
      toast.success(isDirect ? "Claim successful" : "Claim + swap successful");
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Failed";
      setActionStatus(formatWriteContractError(formatRpcTransportError(raw)));
    }
  };

  const claimOpen = claim && Number(claim.status) === STATUS_OPEN;
  const swapReady = isDirect || (swapQuote?.status === "success" && !quoteIsError);
  const claimButtonDisabled =
    !claimOpen || !address || !ready || !selected || (!isDirect && (!canSwapQuote || quoteLoading || !swapReady));

  if (!env) return <div className="text-sm text-muted-foreground">Set `VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS`.</div>;
  if (!claimId) return <div className="text-sm text-muted-foreground">Invalid claim id.</div>;
  if (!claim) return <div className="text-sm text-muted-foreground">Loading claim...</div>;

  const statusLabel =
    Number(claim.status) === 0 ? "Open" : Number(claim.status) === 1 ? "Executed" : "Cancelled";

  return (
    <div className={`space-y-6 ${embedded ? "" : "max-w-md mx-auto"}`}>
      <div className="text-center space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight">Claim your funds</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {subtitle}
          {modeLabel}
        </p>
      </div>

      <div className="glass rounded-2xl border border-border/50 px-4 py-4 text-sm space-y-2 shadow-card">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">From</span>
          <span className="font-mono text-foreground/90 text-xs">{shortAddr(claim.sender)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Deposited</span>
          <span className="text-foreground font-medium">{depositedDisplay}</span>
        </div>
        <div className="flex justify-between gap-2 items-start">
          <span className="text-muted-foreground shrink-0">Status</span>
          <div className="text-right space-y-1 min-w-0">
            <span
              className={
                statusLabel === "Open"
                  ? "text-primary font-medium"
                  : statusLabel === "Executed"
                    ? "text-success font-medium"
                    : "text-muted-foreground"
              }
            >
              {statusLabel}
            </span>
            {settlementTxHash && statusLabel !== "Open" ? (
              <a
                href={`${getExplorerBaseUrl()}/tx/${settlementTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-end gap-1 text-xs text-primary hover:underline font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-90" aria-hidden />
                View on Monad explorer
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {statusLabel === "Open" && (
        <>
          <div className="flex justify-center text-primary/70">
            <ChevronDown className="w-6 h-6" aria-hidden />
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3 font-semibold">
              Receive as
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
              {payoutTokens.map((t) => {
                const active = t.id === selectedId;
                const logo = tokenLogoUrlForSymbol(t.symbol);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors cursor-pointer relative z-10 flex items-center gap-2.5 ${
                      active
                        ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                        : "border-border/70 bg-muted/30 hover:border-primary/35 hover:bg-muted/50"
                    }`}
                  >
                    {logo ? (
                      <img
                        src={logo}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover border border-border/60 bg-background/50"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-full border border-border/60 bg-muted/50 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                        {t.symbol.slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">{t.symbol}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={t.address}>
                        {t.address.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? "Native MON" : shortAddr(t.address)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass rounded-2xl border border-border/50 px-4 py-4 shadow-card">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Estimated received
              </p>
              {!isDirect && canSwapQuote && (
                <button
                  type="button"
                  onClick={() => void refetchQuote()}
                  className="p-1 rounded-lg text-primary hover:bg-primary/10"
                  aria-label="Refresh quote"
                >
                  <RefreshCw className={`w-4 h-4 ${quoteLoading ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
            <p className="text-2xl font-semibold text-foreground tabular-nums">{estimateDisplay}</p>
            {isDirect ? (
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Same as escrow: 1:1 payout with no swap. No DEX route is used.
              </p>
            ) : !canSwapQuote ? (
              <p className="text-[11px] text-primary/85 mt-2">
                Set <code className="rounded bg-muted/50 px-1">VITE_CHAIN_ID</code> to 10143 or 143 to load Uniswap
                quotes.
              </p>
            ) : quoteIsError ? (
              <p className="text-[11px] text-destructive/90 mt-2">{quoteError?.message ?? "Quote failed"}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                Quote from Uniswap v3 (QuoterV2). Slippage and pool depth may change before you confirm—refresh if
                needed.
              </p>
            )}
          </div>

          {!address ? (
            <p className="text-center text-sm text-primary font-medium">Connect with Para to claim.</p>
          ) : null}

          <button
            type="button"
            disabled={claimButtonDisabled}
            onClick={() => void onClaimNow()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold py-3.5 shadow-md shadow-primary/20 hover:opacity-95 disabled:opacity-45 disabled:cursor-not-allowed transition-opacity border border-primary/30"
          >
            <Wallet className="w-4 h-4" />
            {isDirect ? "Claim now" : "Claim + swap now"}
            <span aria-hidden>→</span>
          </button>

          {actionStatus ? <p className="text-xs text-muted-foreground text-center">{actionStatus}</p> : null}
        </>
      )}
    </div>
  );
};

export default ClaimFunds;
