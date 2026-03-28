/** Unified shape for claim list UI (built from on-chain logs + `getClaim` reads). */
export type ClaimRecord = {
  claim_id: string;
  chain_id: number;
  sender: string;
  receiver: string;
  token_in_symbol: string;
  token_in_decimals: number;
  token_out_symbol: string | null;
  amount_in_wei: string;
  amount_out_wei: string | null;
  claim_link: string;
  status: "open" | "executed" | "cancelled";
  expiry_ts: string;
  created_tx_hash: string | null;
  executed_tx_hash: string | null;
  cancelled_tx_hash: string | null;
  executed_by: string | null;
  created_at: string;
  updated_at: string;
};
