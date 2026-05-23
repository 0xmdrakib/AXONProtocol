import { QueryClient } from "@tanstack/react-query";
import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import { arcTestnet } from "./config/chains";

export const queryClient = new QueryClient();

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const connectors = [injected()];

if (walletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
  },
});
