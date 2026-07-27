import { defineConfig } from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";

dotenv.config();

// Note: @iexec-nox/nox-protocol-contracts pragma is ^0.8.35 (NOT ^0.8.27 as the
// Hello World tutorial suggests) — see feedback.md.
export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: "0.8.35",
    // Offline/CI escape hatch: point SOLC_PATH at a local solc build (e.g.
    // node_modules/solc/soljson.js) when binaries.soliditylang.org is
    // unreachable. Left unset, Hardhat downloads the native compiler.
    ...(process.env.SOLC_PATH ? { path: process.env.SOLC_PATH } : {}),
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url:
        process.env.SEPOLIA_RPC_URL ??
        "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
});
