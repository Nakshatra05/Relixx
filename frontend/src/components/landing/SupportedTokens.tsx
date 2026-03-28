import { motion } from "framer-motion";
import { Layers } from "lucide-react";
import { TOKEN_LOGO_MON, TOKEN_LOGO_USDC } from "@/lib/tokenLogos";

const tokens = [
  {
    symbol: "MON",
    name: "Monad (native)",
    blurb: "Gas token & native transfers",
    logoUrl: TOKEN_LOGO_MON,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    blurb: "Bridged stablecoin on Monad",
    logoUrl: TOKEN_LOGO_USDC,
  },
];

const SupportedTokens = () => {
  return (
    <section className="pt-12 pb-20 md:pt-14 md:pb-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <span className="tracking-label text-primary mb-4 block">Ecosystem</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gradient mb-3">Monad tokens &amp; more</h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-12 leading-relaxed">
            Deposit <span className="text-foreground/90 font-medium">MON</span> or{" "}
            <span className="text-foreground/90 font-medium">USDC</span> into escrow. At claim time, receivers can swap into
            other Monad ERC-20s via <span className="text-foreground/90 font-medium">Uniswap v3</span> routing — not only the
            tokens listed here.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-4">
          {tokens.map((token, i) => (
            <motion.div
              key={token.symbol}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.05 }}
              className="glass rounded-2xl px-8 py-5 flex items-center gap-4 hover:border-primary/20 transition-all duration-300 cursor-default"
            >
              <div className="w-10 h-10 rounded-full bg-muted/40 border border-border/60 flex items-center justify-center overflow-hidden">
                <img
                  src={token.logoUrl}
                  alt=""
                  className="h-8 w-8 object-cover rounded-full"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="text-left">
                <div className="font-semibold text-sm text-foreground">{token.symbol}</div>
                <div className="text-xs text-muted-foreground">{token.name}</div>
                <div className="text-[11px] text-muted-foreground/90 mt-0.5">{token.blurb}</div>
              </div>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.05 }}
            className="glass rounded-2xl px-8 py-5 flex items-center gap-4 border-primary/15 hover:border-primary/25 transition-all duration-300 cursor-default"
          >
            <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Layers className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-sm text-foreground">More assets</div>
              <div className="text-xs text-muted-foreground">Other ERC-20s on Monad</div>
              <div className="text-[11px] text-muted-foreground/90 mt-0.5">Swap at claim via Uniswap</div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default SupportedTokens;
