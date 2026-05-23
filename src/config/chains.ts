import { defineChain } from "viem";

export const arcTestnet = defineChain({
  id: Number(import.meta.env.VITE_ARC_TESTNET_CHAIN_ID ?? 5042002),
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Testnet Explorer",
      url: "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});
