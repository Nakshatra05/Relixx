/**
 * Self-hosted under `public/tokens/` (served as `/tokens/...`).
 * Avoids hotlink/CORS issues from third-party image hosts (e.g. cryptologos.cc).
 */
export const TOKEN_LOGO_MON = "/tokens/mon.png";
export const TOKEN_LOGO_USDC = "/tokens/usdc.png";

export function tokenLogoUrlForSymbol(symbol: string): string | undefined {
  const s = symbol.trim().toUpperCase();
  if (s === "MON" || s === "WMON") return TOKEN_LOGO_MON;
  if (s === "USDC") return TOKEN_LOGO_USDC;
  return undefined;
}

/** Para / embedded contexts sometimes require an absolute image URL. */
export function absoluteTokenLogoUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (typeof window !== "undefined" && window.location?.origin) {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${window.location.origin}${normalized}`;
  }
  return path;
}
