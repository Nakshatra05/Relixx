#!/usr/bin/env node
/**
 * Copies ABI from forge output into the frontend. Run from repo root after `forge build`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifact = join(root, "out/UniversalClaimLinks.sol/UniversalClaimLinks.json");
const out = join(root, "frontend/src/lib/contracts/universalClaimLinksAbi.json");

const { abi } = JSON.parse(readFileSync(artifact, "utf8"));
writeFileSync(out, JSON.stringify(abi, null, 2) + "\n");
console.log("Wrote", out);
