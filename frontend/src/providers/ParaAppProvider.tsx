import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Environment, ParaProvider } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { useMemo } from "react";
import { useTheme } from "@/providers/ThemeProvider";
import { TOKEN_LOGO_USDC, absoluteTokenLogoUrl } from "@/lib/tokenLogos";
import { getAppChain, getParaBalanceNetwork } from "@/lib/viem/appChain";
import { MONAD_TESTNET_TOKENS } from "@/lib/contracts/contractConfig";

const queryClient = new QueryClient();

type ParaAppProviderProps = {
  children: React.ReactNode;
};

export function ParaAppProvider({ children }: ParaAppProviderProps) {
  const apiKey = import.meta.env.VITE_PARA_API_KEY?.trim() ?? "";
  const paraEnv = import.meta.env.VITE_PARA_ENV;
  const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();
  useTheme();

  const appName = "Relix";
  const chain = useMemo(() => getAppChain(), []);
  const paraNetwork = useMemo(() => {
    const n = getParaBalanceNetwork();
    return { ...n, logoUrl: absoluteTokenLogoUrl(n.logoUrl) };
  }, []);

  const usdcAddress = useMemo(() => {
    const chainId = Number(import.meta.env.VITE_CHAIN_ID || 10143);
    let usdc = import.meta.env.VITE_TOKEN_USDC?.trim();
    if (chainId === 10143 && !usdc) usdc = MONAD_TESTNET_TOKENS.usdc;
    return usdc;
  }, []);

  const wallets = walletConnectProjectId
    ? (["METAMASK", "PHANTOM", "WALLETCONNECT"] as const)
    : (["METAMASK", "PHANTOM"] as const);

  const env =
    paraEnv?.toUpperCase() === "PROD" ? Environment.PROD : Environment.BETA;

  if (!apiKey) {
    return (
      <div className="mx-auto max-w-lg p-8 font-sans text-sm leading-relaxed text-foreground">
        <h1 className="mb-2 text-lg font-semibold">Para API key missing</h1>
        <p className="mb-4 text-muted-foreground">
          Vite only exposes variables that start with{" "}
          <code className="rounded bg-muted px-1 py-0.5">VITE_</code>. Add your key to{" "}
          <code className="rounded bg-muted px-1 py-0.5">Relix/.env</code> or{" "}
          <code className="rounded bg-muted px-1 py-0.5">Relix/frontend/.env</code>, then restart{" "}
          <code className="rounded bg-muted px-1 py-0.5">pnpm dev</code>.
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-xs">
          VITE_PARA_API_KEY=beta_...
        </pre>
        <p className="mt-4 text-muted-foreground">
          Optional: <code className="rounded bg-muted px-1 py-0.5">VITE_PARA_ENV=BETA</code> or{" "}
          <code className="rounded bg-muted px-1 py-0.5">PROD</code> to match your Para dashboard key.
        </p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{
          env,
          apiKey,
        }}
        externalWalletConfig={{
          appName,
          wallets,
          ...(walletConnectProjectId
            ? {
                walletConnect: {
                  projectId: walletConnectProjectId,
                },
              }
            : {}),
          includeWalletVerification: true,
          evmConnector: {
            config: {
              chains: [chain],
            },
          },
        }}
        config={{ appName }}
        paraModalConfig={{
          balances: {
            displayType: "AGGREGATED",
            requestType: "MAINNET_AND_TESTNET",
            additionalAssets: [
              {
                name: "Monad",
                symbol: "MON",
                logoUrl: paraNetwork.logoUrl,
                implementations: [
                  {
                    network: paraNetwork,
                  },
                ],
              },
              ...(usdcAddress
                ? [
                    {
                      name: "USD Coin",
                      symbol: "USDC",
                      logoUrl: absoluteTokenLogoUrl(TOKEN_LOGO_USDC),
                      implementations: [
                        {
                          network: paraNetwork,
                          contractAddress: usdcAddress,
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
          disableEmailLogin: false,
          disablePhoneLogin: false,
          authLayout: ["AUTH:FULL", "EXTERNAL:FULL"],
          oAuthMethods: ["GOOGLE", "TWITTER", "TELEGRAM"],
          onRampTestMode: true,
          theme: {
            foregroundColor: "#111111",
            backgroundColor: "#FFFFFF",
            accentColor: "#111111",
            darkForegroundColor: "#FFFFFF",
            darkBackgroundColor: "#0B0B0B",
            darkAccentColor: "#FFFFFF",
            mode: "light",
            borderRadius: "large",
            font: "SF Pro Display",
          },
          logo: "/download.svg",
          recoverySecretStepEnabled: true,
          twoFactorAuthEnabled: false,
        }}
      >
        {children}
      </ParaProvider>
    </QueryClientProvider>
  );
}
