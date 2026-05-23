import {
  Activity,
  Banknote,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Cpu,
  Database,
  FileSearch,
  PlugZap,
  Power,
  RefreshCw,
  Receipt,
  Server,
  ShieldCheck,
  TerminalSquare,
  Wallet,
  WalletCards,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  numberToHex,
  parseUnits,
  stringToBytes,
  type Address,
  type EIP1193Provider,
  type Hex,
  zeroAddress,
} from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useConnections,
  useDeployContract,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWatchContractEvent,
  useWriteContract,
  useChainId,
  type Connector,
} from "wagmi";

import { agentVaultAbi } from "./abi/AgentVault";
import { auditLogAbi } from "./abi/AuditLog";
import { erc20Abi } from "./abi/ERC20";
import { vaultFactoryAbi } from "./abi/VaultFactory";
import { arcTestnet } from "./config/chains";
import {
  clearStoredDeployment,
  DEFAULT_USDC_ADDRESS,
  loadStoredDeployment,
  saveStoredDeployment,
  type DeploymentFile,
} from "./config/deployment";

type AuditEvent = {
  id: string;
  vault: Address;
  recipient: Address;
  amount: bigint;
  memo: string;
  timestamp: bigint;
};

type DeployStep =
  | "PolicyEngine"
  | "AuditLog"
  | "YieldRouter"
  | "VaultFactory"
  | "Settler"
  | "CCTPReceiver"
  | "Permissions"
  | "Saved";

type Tab = "connect" | "deploy" | "vault" | "services" | "payments" | "audit";
type ServiceId = "market-data" | "inference" | "dataset" | "agent-task" | "monitoring";
type ConnectedWalletSession = {
  address: Address;
  chainId: number;
  connector: Connector;
};
type ServicePreset = {
  id: ServiceId;
  title: string;
  category: string;
  amount: string;
  memo: string;
  description: string;
  Icon: typeof Banknote;
};

const configuredUsdc = (import.meta.env.VITE_USDC_ADDRESS || DEFAULT_USDC_ADDRESS) as Address;
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const arcAddChainParams = {
  chainId: numberToHex(arcTestnet.id),
  chainName: arcTestnet.name,
  nativeCurrency: arcTestnet.nativeCurrency,
  rpcUrls: [...arcTestnet.rpcUrls.default.http],
  blockExplorerUrls: arcTestnet.blockExplorers?.default.url ? [arcTestnet.blockExplorers.default.url] : undefined,
};
const servicePresets: ServicePreset[] = [
  {
    id: "market-data",
    title: "Market Data API",
    category: "API usage",
    amount: "0.25",
    memo: "market-data-api-call",
    description: "One agent pays an approved API provider after requesting live market data.",
    Icon: Database,
  },
  {
    id: "inference",
    title: "GPU Inference Job",
    category: "Compute",
    amount: "0.5",
    memo: "gpu-inference-job",
    description: "An agent pays a compute provider for a completed inference task.",
    Icon: Cpu,
  },
  {
    id: "dataset",
    title: "Research Dataset",
    category: "Data purchase",
    amount: "0.75",
    memo: "research-dataset-access",
    description: "A research agent pays a data vendor for access to a paid dataset.",
    Icon: FileSearch,
  },
  {
    id: "agent-task",
    title: "Agent Task Payout",
    category: "Agent-to-agent",
    amount: "1",
    memo: "agent-task-payout",
    description: "One agent pays another agent or operator wallet for a completed task.",
    Icon: Bot,
  },
  {
    id: "monitoring",
    title: "Monitoring Subscription",
    category: "Tool subscription",
    amount: "0.1",
    memo: "monitoring-subscription",
    description: "An operations agent pays a recurring service provider within its spend cap.",
    Icon: Server,
  },
];

function toUsdc(value: string) {
  return parseUnits(value || "0", 6);
}

function shortAddress(value?: string) {
  if (!value) return "0x...";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function resolveAddress(value?: string | null): Address {
  return value && isAddress(value) ? getAddress(value) : zeroAddress;
}

function connectorLabel(connector: Connector) {
  if (connector.type === "walletConnect") return "WalletConnect";
  return connector.name || connector.id;
}

function isWalletConnect(connector: Connector) {
  return connector.type === "walletConnect" || connector.id.toLowerCase().includes("walletconnect");
}

function isUserRejectedRequest(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: number; message?: string; cause?: unknown };
  if (maybe.code === 4001) return true;
  if (typeof maybe.message === "string" && /user rejected|request rejected|rejected the request|user denied/i.test(maybe.message)) {
    return true;
  }
  return isUserRejectedRequest(maybe.cause);
}

function walletConnectorIconUrl(connector: Connector) {
  return connector.icon || "";
}

function WalletConnectMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="18" fill="#3B99FC" />
      <path
        d="M19.6 26.2C26.5 19.5 37.5 19.5 44.4 26.2L46 27.8C46.7 28.5 46.7 29.6 46 30.2L40.5 35.5C40.1 35.9 39.4 35.9 39 35.5L36.8 33.4C34.2 30.9 29.9 30.9 27.2 33.4L24.9 35.6C24.5 36 23.9 36 23.5 35.6L18 30.2C17.3 29.6 17.3 28.5 18 27.8L19.6 26.2Z"
        fill="#ffffff"
      />
      <path
        d="M28.6 37.2C30.5 35.3 33.5 35.3 35.4 37.2L37.1 38.8C37.6 39.3 37.6 40.1 37.1 40.6L33.1 44.5C32.5 45.1 31.5 45.1 30.9 44.5L26.9 40.6C26.4 40.1 26.4 39.3 26.9 38.8L28.6 37.2Z"
        fill="#ffffff"
      />
    </svg>
  );
}

async function switchProviderToArc(provider: EIP1193Provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: arcAddChainParams.chainId }],
    });
  } catch (cause) {
    if (isUserRejectedRequest(cause)) throw cause;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [arcAddChainParams],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: arcAddChainParams.chainId }],
    });
  }
}

function App() {
  const publicClient = usePublicClient();
  const configuredChainId = useChainId();
  const { address, isConnected, chainId: accountChainId, connector: activeConnector } = useAccount();
  const connections = useConnections();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { deployContractAsync, isPending: isDeployTxPending } = useDeployContract();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  const [tab, setTab] = useState<Tab>("connect");
  const [agentName, setAgentName] = useState("research-agent-001");
  const [agentAddress, setAgentAddress] = useState("");
  const [dailyLimit, setDailyLimit] = useState("5");
  const [perTxLimit, setPerTxLimit] = useState("2");
  const [whitelist, setWhitelist] = useState("");
  const [vaultAddress, setVaultAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("50");
  const [recipient, setRecipient] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("0.25");
  const [memo, setMemo] = useState("api-call");
  const [serviceReceivers, setServiceReceivers] = useState<Record<ServiceId, string>>({
    "market-data": "",
    inference: "",
    dataset: "",
    "agent-task": "",
    monitoring: "",
  });
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [deployment, setDeployment] = useState<DeploymentFile | null>(null);
  const [deployStep, setDeployStep] = useState<DeployStep | null>(null);
  const [walletSession, setWalletSession] = useState<ConnectedWalletSession | null>(null);
  const [error, setError] = useState("");

  const selectedConnection =
    connections.find((connection) => connection.connector.uid === walletSession?.connector.uid) ?? connections[0];
  const wagmiAddress = address ? getAddress(address) : undefined;
  const connectionAddress = selectedConnection?.accounts[0] ? getAddress(selectedConnection.accounts[0]) : undefined;
  const normalizedAddress = wagmiAddress ?? connectionAddress ?? walletSession?.address;
  const currentConnector = activeConnector ?? selectedConnection?.connector ?? walletSession?.connector;
  const walletChainId = accountChainId ?? selectedConnection?.chainId ?? walletSession?.chainId ?? configuredChainId;
  const walletConnected = isConnected || Boolean(connectionAddress || walletSession?.address);
  const onArc = walletChainId === arcTestnet.id;
  const isOwner =
    Boolean(normalizedAddress && deployment?.deployer) &&
    getAddress(deployment!.deployer!) === normalizedAddress;
  const busy = isDeployTxPending || isWritePending || isSwitching;

  useEffect(() => {
    if (!normalizedAddress) {
      setDeployment(null);
      return;
    }

    setDeployment(loadStoredDeployment(normalizedAddress, arcTestnet.id));
  }, [normalizedAddress]);

  useEffect(() => {
    if (wagmiAddress && activeConnector) {
      setWalletSession((current) => {
        const nextSession = {
          address: wagmiAddress,
          chainId: accountChainId ?? current?.chainId ?? configuredChainId,
          connector: activeConnector,
        };

        if (
          current?.address === nextSession.address &&
          current.chainId === nextSession.chainId &&
          current.connector.uid === nextSession.connector.uid
        ) {
          return current;
        }

        return nextSession;
      });
      return;
    }

    if (!isConnected && connections.length === 0) {
      setWalletSession(null);
    }
  }, [accountChainId, activeConnector, configuredChainId, connections.length, isConnected, wagmiAddress]);

  useEffect(() => {
    if (normalizedAddress && !agentAddress) {
      setAgentAddress(normalizedAddress);
    }
  }, [normalizedAddress, agentAddress]);

  useEffect(() => {
    if (deployment?.vault && !vaultAddress) {
      setVaultAddress(deployment.vault);
    }
  }, [deployment, vaultAddress]);

  const factoryAddress = resolveAddress(deployment?.vaultFactory);
  const auditLogAddress = resolveAddress(deployment?.auditLog);
  const usdcAddress = resolveAddress(deployment?.usdc || configuredUsdc);
  const activeNetwork = deployment?.network || arcTestnet.name;

  const selectedVault = isAddress(vaultAddress) ? getAddress(vaultAddress) : undefined;
  const agentId = useMemo(() => keccak256(stringToBytes(agentName || "agent")), [agentName]);
  const recipients = useMemo(
    () =>
      whitelist
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter((item): item is Address => isAddress(item))
        .map((item) => getAddress(item)),
    [whitelist],
  );

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: selectedVault,
    abi: agentVaultAbi,
    functionName: "availableBalance",
    query: { enabled: Boolean(selectedVault) },
  });
  const { data: spent, refetch: refetchSpent } = useReadContract({
    address: selectedVault,
    abi: agentVaultAbi,
    functionName: "spentInWindow",
    query: { enabled: Boolean(selectedVault) },
  });
  const { data: vaultAgent } = useReadContract({
    address: selectedVault,
    abi: agentVaultAbi,
    functionName: "agent",
    query: { enabled: Boolean(selectedVault) },
  });
  const { data: walletUsdc, refetch: refetchWalletUsdc } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: normalizedAddress ? [normalizedAddress] : undefined,
    query: { enabled: walletConnected && usdcAddress !== zeroAddress },
  });

  useWatchContractEvent({
    address: auditLogAddress !== zeroAddress ? auditLogAddress : undefined,
    abi: auditLogAbi,
    eventName: "PaymentLogged",
    onLogs(logs) {
      setEvents((current) => [
        ...logs.map((log) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          vault: log.args.vault!,
          recipient: log.args.recipient!,
          amount: log.args.amount!,
          memo: log.args.memo!,
          timestamp: log.args.timestamp!,
        })),
        ...current,
      ]);
    },
  });

  async function ensureArc() {
    if (!walletConnected) {
      throw new Error("Connect a wallet first.");
    }

    if (walletChainId !== arcTestnet.id) {
      await switchConnectedWalletToArc();
    }
  }

  async function switchConnectedWalletToArc() {
    if (!currentConnector) {
      throw new Error("Connect a wallet first.");
    }

    const provider = await currentConnector.getProvider().catch(() => undefined);

    if (provider) {
      await switchProviderToArc(provider as EIP1193Provider);
    } else if (currentConnector.switchChain) {
      await currentConnector.switchChain({
        addEthereumChainParameter: {
          blockExplorerUrls: arcAddChainParams.blockExplorerUrls,
          chainName: arcAddChainParams.chainName,
          nativeCurrency: arcAddChainParams.nativeCurrency,
          rpcUrls: arcAddChainParams.rpcUrls,
        },
        chainId: arcTestnet.id,
      });
    } else {
      await switchChainAsync({
        addEthereumChainParameter: {
          blockExplorerUrls: arcAddChainParams.blockExplorerUrls,
          chainName: arcAddChainParams.chainName,
          nativeCurrency: arcAddChainParams.nativeCurrency,
          rpcUrls: arcAddChainParams.rpcUrls,
        },
        chainId: arcTestnet.id,
        connector: currentConnector,
      });
    }

    setWalletSession((current) => (current ? { ...current, chainId: arcTestnet.id } : current));
  }

  async function requestArcNetwork() {
    setError("");

    try {
      await switchConnectedWalletToArc();
    } catch (cause) {
      if (isUserRejectedRequest(cause)) return;
      setError(cause instanceof Error ? cause.message : "Could not switch to Arc testnet.");
    }
  }

  async function deployAndWait(
    step: DeployStep,
    contract: { abi: readonly unknown[]; bytecode: Hex },
    args?: readonly unknown[],
  ) {
    if (!publicClient) throw new Error("Arc RPC is not ready.");
    setDeployStep(step);
    const hash = await deployContractAsync({
      abi: contract.abi,
      bytecode: contract.bytecode,
      args,
      chainId: arcTestnet.id,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) {
      throw new Error(`${step} deployment did not return a contract address.`);
    }
    return getAddress(receipt.contractAddress);
  }

  async function writeAndWait(step: DeployStep, params: Parameters<typeof writeContractAsync>[0]) {
    if (!publicClient) throw new Error("Arc RPC is not ready.");
    setDeployStep(step);
    const hash = await writeContractAsync({ ...params, chainId: arcTestnet.id });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function deployProtocol() {
    if (!normalizedAddress) return;
    setError("");

    try {
      await ensureArc();
      const {
        auditLogArtifact,
        cCTPReceiverArtifact,
        policyEngineArtifact,
        settlerArtifact,
        vaultFactoryArtifact,
        yieldRouterArtifact,
      } = await import("./abi/protocolArtifacts");

      const policyEngine = await deployAndWait("PolicyEngine", policyEngineArtifact);
      const auditLog = await deployAndWait("AuditLog", auditLogArtifact, [normalizedAddress]);
      const yieldRouter = await deployAndWait("YieldRouter", yieldRouterArtifact, [usdcAddress, normalizedAddress]);
      const vaultFactory = await deployAndWait("VaultFactory", vaultFactoryArtifact, [
        usdcAddress,
        policyEngine,
        yieldRouter,
        auditLog,
        normalizedAddress,
      ]);
      const settler = await deployAndWait("Settler", settlerArtifact, [usdcAddress, auditLog, normalizedAddress]);
      const cctpReceiver = await deployAndWait("CCTPReceiver", cCTPReceiverArtifact, [usdcAddress, normalizedAddress]);

      await writeAndWait("Permissions", {
        address: auditLog,
        abi: auditLogArtifact.abi,
        functionName: "setFactory",
        args: [vaultFactory, true],
      });
      await writeAndWait("Permissions", {
        address: auditLog,
        abi: auditLogArtifact.abi,
        functionName: "setWriter",
        args: [settler, true],
      });

      const nextDeployment: DeploymentFile = {
        network: arcTestnet.name,
        chainId: arcTestnet.id,
        deployer: normalizedAddress,
        usdc: usdcAddress,
        policyEngine,
        auditLog,
        yieldRouter,
        vaultFactory,
        settler,
        cctpReceiver,
        source: "browser-wallet",
        deployedAt: new Date().toISOString(),
      };

      saveStoredDeployment(normalizedAddress, nextDeployment, arcTestnet.id);
      setDeployment(nextDeployment);
      setDeployStep("Saved");
      setTab("vault");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Deployment failed.");
    }
  }

  async function createVault() {
    if (!publicClient || factoryAddress === zeroAddress || !isAddress(agentAddress) || !isOwner) return;
    setError("");

    try {
      await ensureArc();
      const hash = await writeContractAsync({
        address: factoryAddress,
        abi: vaultFactoryAbi,
        functionName: "createVault",
        args: [agentId, getAddress(agentAddress), toUsdc(dailyLimit), toUsdc(perTxLimit), recipients],
        chainId: arcTestnet.id,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const logs = await publicClient.getContractEvents({
        address: factoryAddress,
        abi: vaultFactoryAbi,
        eventName: "VaultDeployed",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        strict: true,
      });
      const vault = logs[0]?.args.vault;
      if (vault && normalizedAddress && deployment) {
        const nextDeployment = { ...deployment, vault: getAddress(vault) };
        saveStoredDeployment(normalizedAddress, nextDeployment, arcTestnet.id);
        setDeployment(nextDeployment);
        setVaultAddress(getAddress(vault));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create vault.");
    }
  }

  async function approveAndDeposit() {
    if (!selectedVault || usdcAddress === zeroAddress || !isOwner) return;
    setError("");

    try {
      await ensureArc();
      const amount = toUsdc(depositAmount);
      await writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [selectedVault, amount],
        chainId: arcTestnet.id,
      });
      await writeContractAsync({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: "deposit",
        args: [amount],
        chainId: arcTestnet.id,
      });
      await Promise.all([refetchBalance(), refetchWalletUsdc()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not fund vault.");
    }
  }

  async function payRecipient() {
    if (!selectedVault || !isAddress(recipient) || !canPayFromWallet) return;
    setError("");

    try {
      await ensureArc();
      await writeContractAsync({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: "pay",
        args: [getAddress(recipient), toUsdc(paymentAmount), memo],
        chainId: arcTestnet.id,
      });
      await Promise.all([refetchBalance(), refetchSpent()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send payment.");
    }
  }

  async function allowServiceReceiver(service: ServicePreset) {
    const receiver = serviceReceivers[service.id];
    if (!selectedVault || !isAddress(receiver) || !isOwner) return;
    setError("");

    try {
      await ensureArc();
      await writeContractAsync({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: "setRecipient",
        args: [getAddress(receiver), true],
        chainId: arcTestnet.id,
      });
      setRecipient(getAddress(receiver));
      setPaymentAmount(service.amount);
      setMemo(service.memo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not approve service receiver.");
    }
  }

  async function payService(service: ServicePreset) {
    const receiver = serviceReceivers[service.id];
    if (!selectedVault || !isAddress(receiver) || !canPayFromWallet) return;
    setError("");

    try {
      await ensureArc();
      await writeContractAsync({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: "pay",
        args: [getAddress(receiver), toUsdc(service.amount), service.memo],
        chainId: arcTestnet.id,
      });
      setRecipient(getAddress(receiver));
      setPaymentAmount(service.amount);
      setMemo(service.memo);
      await Promise.all([refetchBalance(), refetchSpent()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not pay service.");
    }
  }

  async function setPaused(paused: boolean) {
    if (!selectedVault || !isOwner) return;
    setError("");

    try {
      await ensureArc();
      await writeContractAsync({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: paused ? "pause" : "unpause",
        args: [],
        chainId: arcTestnet.id,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update vault state.");
    }
  }

  function forgetDeployment() {
    if (!normalizedAddress) return;
    clearStoredDeployment(normalizedAddress, arcTestnet.id);
    setDeployment(null);
    setVaultAddress("");
    setDeployStep(null);
    setTab("deploy");
  }

  async function connectWallet(connector: Connector) {
    setError("");

    try {
      const result = await connectAsync({ connector });
      const connectedAccount = result.accounts[0];

      setWalletSession({
        address: getAddress(connectedAccount),
        chainId: result.chainId,
        connector,
      });

      if (result.chainId !== arcTestnet.id) {
        try {
          const provider = await connector.getProvider().catch(() => undefined);

          if (provider) {
            await switchProviderToArc(provider as EIP1193Provider);
          } else if (connector.switchChain) {
            await connector.switchChain({
              addEthereumChainParameter: {
                blockExplorerUrls: arcAddChainParams.blockExplorerUrls,
                chainName: arcAddChainParams.chainName,
                nativeCurrency: arcAddChainParams.nativeCurrency,
                rpcUrls: arcAddChainParams.rpcUrls,
              },
              chainId: arcTestnet.id,
            });
          } else {
            await switchChainAsync({
              addEthereumChainParameter: {
                blockExplorerUrls: arcAddChainParams.blockExplorerUrls,
                chainName: arcAddChainParams.chainName,
                nativeCurrency: arcAddChainParams.nativeCurrency,
                rpcUrls: arcAddChainParams.rpcUrls,
              },
              chainId: arcTestnet.id,
              connector,
            });
          }
          setWalletSession((current) => (current ? { ...current, chainId: arcTestnet.id } : current));
        } catch (switchCause) {
          if (isUserRejectedRequest(switchCause)) return;
          setError("Wallet connected. Use Switch/Add Arc before deployment or payments.");
        }
      }
    } catch (cause) {
      if (isUserRejectedRequest(cause)) return;
      setError(cause instanceof Error ? cause.message : "Wallet connection failed.");
    }
  }

  async function disconnectWallet() {
    setError("");
    setWalletSession(null);

    try {
      await disconnectAsync(currentConnector ? { connector: currentConnector } : undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet disconnect failed.");
    }
  }

  const configured = Boolean(deployment && isOwner && factoryAddress !== zeroAddress && usdcAddress !== zeroAddress);
  const canPayFromWallet =
    Boolean(normalizedAddress && vaultAgent) && getAddress(vaultAgent!) === normalizedAddress;
  const walletConnectReady = connectors.some(isWalletConnect);
  const walletConnectMissing = !walletConnectProjectId && !walletConnectReady;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brandHeader">
          <img className="brandLogo" src="/axon-symbol.png" alt="" aria-hidden="true" />
          <div>
            <span className="eyebrow">AXON Protocol</span>
            <h1>Agent Banking Console</h1>
          </div>
        </div>

        <button className="connect" onClick={() => setTab("connect")}>
          <Wallet size={18} />
          {walletConnected ? shortAddress(normalizedAddress) : "Connect Wallet"}
        </button>

        <div className="navTabs" aria-label="Dashboard sections">
          {[
            ["connect", WalletCards, "Connect"],
            ["deploy", PlugZap, "Deploy"],
            ["vault", Zap, "Vault"],
            ["services", Receipt, "Services"],
            ["payments", Banknote, "Payments"],
            ["audit", TerminalSquare, "Audit"],
          ].map(([id, Icon, label]) => (
            <button
              className={tab === id ? "navTab active" : "navTab"}
              key={id as string}
              onClick={() => setTab(id as Tab)}
            >
              <Icon size={17} />
              <span>{label as string}</span>
            </button>
          ))}
        </div>

        <div className="stat">
          <span>Wallet USDC</span>
          <strong>{walletUsdc === undefined ? "-" : formatUnits(walletUsdc, 6)}</strong>
        </div>
        <div className="stat">
          <span>Vault Balance</span>
          <strong>{balance === undefined ? "-" : formatUnits(balance, 6)}</strong>
        </div>
        <div className="stat">
          <span>Spent Today</span>
          <strong>{spent === undefined ? "-" : formatUnits(spent, 6)}</strong>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="network">{activeNetwork}</span>
            <h2>Policy-controlled USDC vaults for autonomous AI agents</h2>
            <div className="statusRow">
              <span className={walletConnected ? "statusChip ready" : "statusChip"}>
                {walletConnected ? "Wallet connected" : "Wallet required"}
              </span>
              <span className={onArc ? "statusChip ready" : "statusChip"}>
                {onArc ? "Arc selected" : "Switch to Arc"}
              </span>
              <span className={configured ? "statusChip ready" : "statusChip"}>
                {configured ? "Deployment ready" : "Deploy from wallet"}
              </span>
              {configured && <span>Factory {shortAddress(factoryAddress)}</span>}
            </div>
          </div>
          <button className="iconButton" onClick={() => Promise.all([refetchBalance(), refetchSpent(), refetchWalletUsdc()])}>
            <RefreshCw size={18} />
          </button>
        </header>

        {error && <div className="notice danger">{error}</div>}
        {!onArc && walletConnected && (
          <div className="notice">
            <span>Wallet is on chain {walletChainId}. Switch or add Arc testnet before deployment and payments.</span>
            <button onClick={requestArcNetwork} disabled={isSwitching}>
              <PlugZap size={17} />
              Switch/Add Arc
            </button>
          </div>
        )}

        {tab === "connect" && (
          <section className="panel wide">
            <div className="panelTitle">
              <WalletCards size={19} />
              <h3>Connect Wallet</h3>
            </div>

            {walletConnected && (
              <div className="walletSummary">
                <div>
                  <span>Connected</span>
                  <strong>{shortAddress(normalizedAddress)}</strong>
                  <small>{currentConnector?.name}</small>
                </div>
                <button className="secondaryButton" onClick={disconnectWallet}>
                  <Power size={17} />
                  Disconnect
                </button>
              </div>
            )}

            <div className="walletGrid">
              {connectors
                .filter((connector) => connector.type !== "injected" || connector.name !== "Injected")
                .map((connector) => {
                  const icon = walletConnectorIconUrl(connector);
                  const walletConnect = isWalletConnect(connector);

                  return (
                    <button
                      className="walletOption"
                      key={connector.uid}
                      disabled={isConnecting}
                      onClick={() => connectWallet(connector)}
                    >
                      <span className="walletIcon" aria-hidden="true">
                        {walletConnect ? (
                          <WalletConnectMark />
                        ) : icon ? (
                          <img src={icon} alt="" />
                        ) : (
                          <Wallet size={16} />
                        )}
                      </span>
                      <span>{connectorLabel(connector)}</span>
                    </button>
                  );
                })}
            </div>

            {walletConnectMissing && (
              <p className="hint">Add VITE_WALLETCONNECT_PROJECT_ID in .env to enable WalletConnect QR/mobile wallets.</p>
            )}
          </section>
        )}

        {tab === "deploy" && (
          <section className="panel wide">
            <div className="panelTitle">
              <PlugZap size={19} />
              <h3>Deploy Protocol</h3>
            </div>
            <div className="deploymentGrid">
              <div>
                <span>Owner wallet</span>
                <strong>{normalizedAddress ? shortAddress(normalizedAddress) : "Not connected"}</strong>
              </div>
              <div>
                <span>USDC</span>
                <strong>{shortAddress(usdcAddress)}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{deployment?.source || "browser wallet"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{configured ? "Ready" : deployStep || "Not deployed"}</strong>
              </div>
            </div>

            {configured ? (
              <div className="deploymentActions">
                <button onClick={() => setTab("vault")}>
                  <CheckCircle2 size={18} />
                  Continue
                </button>
                <button className="secondaryButton" onClick={forgetDeployment}>
                  Forget Local Deployment
                </button>
              </div>
            ) : (
              <button disabled={!walletConnected || !onArc || busy} onClick={deployProtocol}>
                <PlugZap size={18} />
                Deploy From Connected Wallet
              </button>
            )}
          </section>
        )}

        {tab === "vault" && (
          <div className="grid">
            <section className="panel">
              <div className="panelTitle">
                <CircleDollarSign size={19} />
                <h3>Create Agent Vault</h3>
              </div>
              <label>
                Agent ID
                <input value={agentName} onChange={(event) => setAgentName(event.target.value)} />
              </label>
              <label>
                Agent wallet
                <input value={agentAddress} onChange={(event) => setAgentAddress(event.target.value)} />
              </label>
              <div className="split">
                <label>
                  Daily limit
                  <input value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} />
                </label>
                <label>
                  Per payment
                  <input value={perTxLimit} onChange={(event) => setPerTxLimit(event.target.value)} />
                </label>
              </div>
              <label>
                Recipients
                <textarea value={whitelist} onChange={(event) => setWhitelist(event.target.value)} />
              </label>
              <button disabled={!configured || busy || !isAddress(agentAddress)} onClick={createVault}>
                <Zap size={18} />
                Create Vault
              </button>
            </section>

            <section className="panel">
              <div className="panelTitle">
                <ShieldCheck size={19} />
                <h3>Human Override</h3>
              </div>
              <label>
                Vault
                <input value={vaultAddress} onChange={(event) => setVaultAddress(event.target.value)} />
              </label>
              <div className="actions">
                <button disabled={!selectedVault || busy || !isOwner} onClick={() => setPaused(true)}>
                  Pause
                </button>
                <button disabled={!selectedVault || busy || !isOwner} onClick={() => setPaused(false)}>
                  Unpause
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === "services" && (
          <section className="panel wide">
            <div className="panelTitle">
              <Receipt size={19} />
              <h3>Use Case Simulator</h3>
            </div>

            <div className="deploymentGrid">
              <div>
                <span>Vault</span>
                <strong>{selectedVault ? shortAddress(selectedVault) : "No vault selected"}</strong>
              </div>
              <div>
                <span>Agent signer</span>
                <strong>{vaultAgent ? shortAddress(vaultAgent) : "No vault agent"}</strong>
              </div>
            </div>

            <div className="serviceGrid">
              {servicePresets.map((service) => {
                const Icon = service.Icon;
                const receiver = serviceReceivers[service.id];
                const receiverReady = isAddress(receiver);

                return (
                  <article className="serviceCard" key={service.id}>
                    <div className="serviceCardHeader">
                      <span className="serviceIcon">
                        <Icon size={19} />
                      </span>
                      <div>
                        <h4>{service.title}</h4>
                        <span>{service.category}</span>
                      </div>
                    </div>
                    <p className="serviceDescription">{service.description}</p>
                    <div className="serviceMeta">
                      <span>Amount</span>
                      <strong>{service.amount} USDC</strong>
                    </div>
                    <div className="serviceMeta">
                      <span>Memo</span>
                      <strong>{service.memo}</strong>
                    </div>
                    <label>
                      Payee wallet
                      <input
                        value={receiver}
                        onChange={(event) =>
                          setServiceReceivers((current) => ({
                            ...current,
                            [service.id]: event.target.value,
                          }))
                        }
                        placeholder="0x..."
                      />
                      <span className="hint">This wallet receives the actual Arc testnet USDC.</span>
                    </label>
                    <div className="serviceActions">
                      <button
                        className="secondaryButton"
                        disabled={!selectedVault || !receiverReady || busy || !isOwner}
                        onClick={() => allowServiceReceiver(service)}
                      >
                        <ShieldCheck size={17} />
                        Allow Receiver
                      </button>
                      <button
                        disabled={!selectedVault || !receiverReady || busy || !canPayFromWallet}
                        onClick={() => payService(service)}
                      >
                        <Activity size={17} />
                        Pay Service
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {tab === "payments" && (
          <section className="panel wide">
            <div className="panelTitle">
              <Banknote size={19} />
              <h3>Fund And Pay</h3>
            </div>
            <label>
              Vault
              <input value={vaultAddress} onChange={(event) => setVaultAddress(event.target.value)} />
            </label>
            <div className="split">
              <label>
                Deposit USDC
                <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
              </label>
              <label>
                Recipient
                <input value={recipient} onChange={(event) => setRecipient(event.target.value)} />
              </label>
            </div>
            <div className="split">
              <label>
                Amount
                <input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
              </label>
              <label>
                Memo
                <input value={memo} onChange={(event) => setMemo(event.target.value)} />
              </label>
            </div>
            <div className="actions">
              <button disabled={!selectedVault || busy || !isOwner} onClick={approveAndDeposit}>
                <CircleDollarSign size={18} />
                Fund Vault
              </button>
              <button disabled={!selectedVault || !isAddress(recipient) || busy || !canPayFromWallet} onClick={payRecipient}>
                <Activity size={18} />
                Send Payment
              </button>
            </div>
          </section>
        )}

        {tab === "audit" && (
          <section className="panel wide ledger">
            <div className="panelTitle">
              <TerminalSquare size={19} />
              <h3>Payment Audit Stream</h3>
            </div>
            {events.length === 0 ? (
              <p className="empty">No payments observed in this session.</p>
            ) : (
              events.map((event) => (
                <div className="event" key={event.id}>
                  <span>
                    {shortAddress(event.vault)}
                    {" -> "}
                    {shortAddress(event.recipient)}
                  </span>
                  <strong>{formatUnits(event.amount, 6)} USDC</strong>
                  <small>{event.memo}</small>
                </div>
              ))
            )}
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
