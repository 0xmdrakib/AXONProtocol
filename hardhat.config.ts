import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";
import "dotenv/config";

const arcChainId = Number(process.env.ARC_TESTNET_CHAIN_ID ?? "5042002");
const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 31337,
    },
    arcTestnet: {
      type: "http",
      chainType: "l1",
      url: arcRpcUrl,
      chainId: arcChainId,
    },
  },
});
