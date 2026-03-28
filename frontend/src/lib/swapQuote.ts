/** Shared quote shape for `executeClaimAndSwap` (aggregator builds `transaction.{to,calldata,value}`). */
export interface QuoteResponse {
  type: string;
  status: "success" | "error";
  output: string;
  minOut: string;
  transaction: {
    to: string;
    calldata: string;
    value: string;
  };
  gasPrices: Record<string, string>;
  message?: string;
}
