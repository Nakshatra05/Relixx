/** HTTP / RPC quirks (e.g. Monad public RPC 413 under load or huge batches). */
export function formatRpcTransportError(message: string): string {
  if (/413|Payload Too Large|Request Entity Too Large|body exceeds/i.test(message)) {
    return [
      "Monad RPC returned HTTP 413 (request too large). The public testnet endpoint can reject big or batched JSON-RPC payloads when busy.",
      "Try: refresh and claim again; set VITE_CLAIMS_FROM_BLOCK to your claim contract deployment block (smaller log queries); use a dedicated/testnet RPC if you have one.",
    ].join(" ");
  }
  return message;
}

/** Turn low-level RPC errors into something actionable for wallet / Para setups. */
export function formatWriteContractError(message: string): string {
  if (/eth_sendTransaction is not supported/i.test(message)) {
    return [
      "The active browser provider does not support sending transactions (common when Para’s proxy is first in the stack).",
      "Fix: use Para’s embedded wallet for this app, or open the site with MetaMask as the signing wallet (multiple extensions: pick MetaMask in the provider list).",
    ].join(" ");
  }
  if (/InsufficientLiquidity/i.test(message)) {
    return [
      "The claim contract may not hold enough of the output token to pay you at the quoted rate.",
      "Escrowed MON / USDC stays in the contract for accounting; some flows require separate liquidity for payouts.",
      "Fix: try another output token, or ensure the swap route has liquidity on Uniswap v3.",
    ].join(" ");
  }
  if (/ClaimExpired|execution reverted.*ClaimExpired/i.test(message)) {
    return "This claim has expired on-chain (chain time ≥ expiry). The receiver can no longer execute it.";
  }
  if (/NotReceiver|execution reverted.*NotReceiver/i.test(message)) {
    return "Only the receiver address set on the claim can execute it. Connect the correct wallet.";
  }
  if (/UnsupportedToken|execution reverted.*UnsupportedToken/i.test(message)) {
    return "That output token is not supported by the contract for this claim. Pick another token on Monad.";
  }
  if (/InvalidAmount|execution reverted.*InvalidAmount/i.test(message)) {
    return "Payout amount rounded to zero (try a larger claim or a different token pair).";
  }
  if (/NotOpen|execution reverted.*NotOpen/i.test(message)) {
    return "This claim is no longer open (already claimed or cancelled).";
  }
  if (/TokenOutMismatch|execution reverted.*TokenOutMismatch/i.test(message)) {
    return "Direct claim requires the same asset as the escrow (e.g. native MON in → native MON out). Pick MON if the claim was funded with MON.";
  }
  if (/TransferFailed|execution reverted.*TransferFailed/i.test(message)) {
    return "Native transfer to your wallet failed on-chain (some contracts cannot receive MON). Try an EOA or a wallet that accepts native transfers.";
  }
  if (/InvalidSecret|execution reverted.*InvalidSecret/i.test(message)) {
    return "Wrong or missing secret for this claim. Open the link with the correct #fragment in the URL.";
  }
  if (/ClaimNotFound|execution reverted.*ClaimNotFound/i.test(message)) {
    return "No claim exists for this id at this contract address.";
  }
  return message;
}

/** When a tx is included but reverts, RPC rarely decodes the reason — keep the hint anyway. */
export function claimRevertedReceiptHint(tokenOutLabel: string): string {
  return [
    `Transaction reverted on-chain. Often the route or liquidity for ${tokenOutLabel} failed — check the explorer for details.`,
    "Open the tx in MonadExplorer for raw revert data.",
  ].join(" ");
}
