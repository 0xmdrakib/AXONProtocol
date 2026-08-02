import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  CircleDollarSign,
  Cpu,
  Database,
  FileSearch,
  Lock,
  LoaderCircle,
  PlugZap,
  Power,
  Receipt,
  Server,
  ShieldCheck,
  TerminalSquare,
  WalletCards,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  numberToHex,
  parseUnits,
  stringToBytes,
  type Address,
  type Abi,
  type EIP1193Provider,
  type Hex,
  zeroAddress,
  zeroHash,
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
import { axonRegistryAbi } from "./abi/AxonRegistry";
import { auditLogAbi } from "./abi/AuditLog";
import { erc20Abi } from "./abi/ERC20";
import { vaultFactoryAbi } from "./abi/VaultFactory";
import { WalletPickerModal, isWalletConnectConnector } from "./components/WalletPickerModal";
import { WalletStatusButton } from "./components/WalletStatusButton";
import { StartHereGuide, type StartHereStep } from "./components/StartHereGuide";
import { arcTestnet } from "./config/chains";
import {
  clearStoredDeployment,
  DEFAULT_USDC_ADDRESS,
  loadDeploymentHistory,
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
  | "FactoryPermission"
  | "SettlerPermission"
  | "Saved";
type DeployAction = {
  step: DeployStep;
  label: string;
  description: string;
};

type Tab = "connect" | "deploy" | "vault" | "services" | "audit";
type ServiceId = "market-data" | "inference" | "dataset" | "agent-task" | "monitoring";
type ConnectedWalletSession = {
  address: Address;
  chainId: number;
  connector: Connector;
};
type ServiceReceiverState = Record<ServiceId, string>;
type DeploymentOrigin = "active" | "history" | "imported" | null;
type PendingAction =
  | "import"
  | "deploy"
  | "attribute"
  | "attribute-vault"
  | "vault"
  | "fund"
  | "pause"
  | `approve:${ServiceId}`
  | `pay:${ServiceId}`
  | null;
type ServicePreset = {
  id: ServiceId;
  title: string;
  category: string;
  amount: string;
  memo: string;
  description: string;
  Icon: LucideIcon;
};

const configuredUsdc = (import.meta.env.VITE_USDC_ADDRESS || DEFAULT_USDC_ADDRESS) as Address;
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const configuredRegistry = import.meta.env.VITE_AXON_REGISTRY_ADDRESS;
const axonPlatformVersion = "axon-web/0.1.0";
const circleFaucetUrl = "https://faucet.circle.com";
const arcAddChainParams = {
  chainId: numberToHex(arcTestnet.id),
  chainName: arcTestnet.name,
  nativeCurrency: arcTestnet.nativeCurrency,
  rpcUrls: [...arcTestnet.rpcUrls.default.http],
  blockExplorerUrls: arcTestnet.blockExplorers?.default.url ? [arcTestnet.blockExplorers.default.url] : undefined,
};
const deployActions: Record<DeployStep, DeployAction> = {
  PolicyEngine: {
    step: "PolicyEngine",
    label: "Deploy Policy Engine",
    description: "Creates the policy contract used by vaults for limits and whitelist checks.",
  },
  AuditLog: {
    step: "AuditLog",
    label: "Deploy Audit Log",
    description: "Creates the on-chain payment event log owned by your wallet.",
  },
  YieldRouter: {
    step: "YieldRouter",
    label: "Deploy Yield Router",
    description: "Creates the vault funding router for Arc testnet USDC.",
  },
  VaultFactory: {
    step: "VaultFactory",
    label: "Deploy Vault Factory",
    description: "Creates the factory that can deploy policy-controlled agent vaults.",
  },
  Settler: {
    step: "Settler",
    label: "Deploy Settler",
    description: "Creates escrow-style settlement for agent-to-agent payments.",
  },
  CCTPReceiver: {
    step: "CCTPReceiver",
    label: "Deploy CCTP Receiver",
    description: "Creates the placeholder receiver for future cross-chain funding.",
  },
  FactoryPermission: {
    step: "FactoryPermission",
    label: "Allow Factory Writer",
    description: "Authorizes the vault factory to write payment audit events.",
  },
  SettlerPermission: {
    step: "SettlerPermission",
    label: "Allow Settler Writer",
    description: "Authorizes the settler to write payment audit events.",
  },
  Saved: {
    step: "Saved",
    label: "Deployment Ready",
    description: "All contracts and permissions are ready for vault creation.",
  },
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
const navItems = [
  { id: "connect", Icon: WalletCards, label: "Connect", detail: "Wallet + Arc" },
  { id: "deploy", Icon: PlugZap, label: "Deploy", detail: "Protocol contracts" },
  { id: "vault", Icon: Zap, label: "Vault", detail: "Create + fund" },
  { id: "services", Icon: Receipt, label: "Services", detail: "Approve + pay" },
  { id: "audit", Icon: TerminalSquare, label: "Audit", detail: "Payment proof" },
] satisfies Array<{ id: Tab; Icon: LucideIcon; label: string; detail: string }>;

function toUsdc(value: string) {
  return parseUnits(value || "0", 6);
}

function shortAddress(value?: string) {
  if (!value) return "0x...";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDeploymentTime(value?: string) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  return date.toLocaleString();
}

function formatDeploymentSource(source?: string, origin?: DeploymentOrigin) {
  if (origin === "history") return "wallet history";
  if (source === "manual-import") return "manual import";
  if (source === "browser-wallet") return "browser wallet";
  return source || "browser wallet";
}

function resolveAddress(value?: string | null): Address {
  return value && isAddress(value) ? getAddress(value) : zeroAddress;
}

function requireReadAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new Error(`${label} is not a valid address.`);
  }

  const addressValue = getAddress(value);
  if (addressValue === zeroAddress) {
    throw new Error(`${label} is the zero address.`);
  }

  return addressValue;
}

function isUserRejectedRequest(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: number; message?: string; cause?: unknown; details?: string };
  const text = [maybe.message, maybe.details].filter(Boolean).join(" ");

  if (maybe.code === 4001) return true;
  if (/user rejected|request rejected|rejected the request|user denied|denied transaction signature/i.test(text)) {
    return true;
  }

  return isUserRejectedRequest(maybe.cause);
}

function friendlyError(cause: unknown, fallback: string) {
  if (isUserRejectedRequest(cause)) return "Wallet request cancelled.";
  if (!(cause instanceof Error)) return fallback;

  const cleaned = cause.message
    .replace(/\s+(Request Arguments|Details|Version):.*$/i, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line && !/^(request arguments|details|version):/i.test(line));

  if (!cleaned) return fallback;
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

function getNextDeployStep(deployment: DeploymentFile | null): DeployStep | null {
  if (!deployment?.policyEngine) return "PolicyEngine";
  if (!deployment.auditLog) return "AuditLog";
  if (!deployment.yieldRouter) return "YieldRouter";
  if (!deployment.vaultFactory) return "VaultFactory";
  if (!deployment.factoryPermission) return "FactoryPermission";
  if (!deployment.settler) return "Settler";
  if (!deployment.cctpReceiver) return "CCTPReceiver";
  if (!deployment.settlerPermission) return "SettlerPermission";
  return null;
}

type ServiceCardProps = {
  busy: boolean;
  canPayFromWallet: boolean;
  isOwner: boolean;
  pendingAction: PendingAction;
  paymentsLocked: boolean;
  selectedVault?: Address;
  service: ServicePreset;
  serviceReceivers: ServiceReceiverState;
  setServiceReceivers: Dispatch<SetStateAction<ServiceReceiverState>>;
  allowServiceReceiver: (service: ServicePreset) => Promise<void>;
  payService: (service: ServicePreset) => Promise<void>;
};

function ServiceCard({
  busy,
  canPayFromWallet,
  isOwner,
  pendingAction,
  paymentsLocked,
  selectedVault,
  service,
  serviceReceivers,
  setServiceReceivers,
  allowServiceReceiver,
  payService,
}: ServiceCardProps) {
  const Icon = service.Icon;
  const receiver = serviceReceivers[service.id];
  const receiverReady = isAddress(receiver);
  const normalizedReceiver = receiverReady ? getAddress(receiver) : undefined;
  const { data: receiverApproved, refetch: refetchReceiverApproved } = useReadContract({
    address: selectedVault,
    abi: agentVaultAbi,
    functionName: "whitelistedRecipients",
    args: normalizedReceiver ? [normalizedReceiver] : undefined,
    query: { enabled: Boolean(selectedVault && normalizedReceiver) },
  });
  const approved = receiverReady && Boolean(receiverApproved);

  async function approveReceiver() {
    await allowServiceReceiver(service);
    await refetchReceiverApproved();
  }

  async function payApprovedService() {
    if (!approved) return;
    await payService(service);
  }

  return (
    <article className={approved ? "serviceCard approved" : "serviceCard"}>
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
        <span className={approved ? "approvalHint approved" : "approvalHint"}>
          {approved ? "Approved. This service can now receive vault payments." : "Approve this wallet before payment unlocks."}
        </span>
      </label>
      <div className="serviceActions">
        <button
          className="secondaryButton"
          disabled={!selectedVault || !receiverReady || busy || !isOwner || approved}
          onClick={approveReceiver}
        >
          <ShieldCheck size={17} />
          {pendingAction === `approve:${service.id}` ? "Approving..." : approved ? "Approved" : "Approve"}
        </button>
        <button
          disabled={!selectedVault || !receiverReady || !approved || busy || paymentsLocked || !canPayFromWallet}
          onClick={payApprovedService}
        >
          {pendingAction === `pay:${service.id}` ? <LoaderCircle className="spin" size={17} /> : approved ? <Activity size={17} /> : <Lock size={17} />}
          {pendingAction === `pay:${service.id}` ? "Paying..." : approved ? "Pay" : "Locked"}
        </button>
      </div>
    </article>
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
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [agentName, setAgentName] = useState("research-agent-001");
  const [agentAddress, setAgentAddress] = useState("");
  const [dailyLimit, setDailyLimit] = useState("5");
  const [perTxLimit, setPerTxLimit] = useState("2");
  const [whitelist, setWhitelist] = useState("");
  const [vaultAddress, setVaultAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("50");
  const [serviceReceivers, setServiceReceivers] = useState<ServiceReceiverState>({
    "market-data": "",
    inference: "",
    dataset: "",
    "agent-task": "",
    monitoring: "",
  });
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [deployment, setDeployment] = useState<DeploymentFile | null>(null);
  const [deploymentHistory, setDeploymentHistory] = useState<DeploymentFile[]>([]);
  const [deploymentOrigin, setDeploymentOrigin] = useState<DeploymentOrigin>(null);
  const [importFactoryAddress, setImportFactoryAddress] = useState("");
  const [importingFactory, setImportingFactory] = useState(false);
  const [deployStep, setDeployStep] = useState<DeployStep | null>(null);
  const [walletSession, setWalletSession] = useState<ConnectedWalletSession | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState("");

  const openWalletPicker = useCallback(() => {
    setError("");
    setMobileNavOpen(false);
    setWalletPickerOpen(true);
  }, []);
  const closeWalletPicker = useCallback(() => setWalletPickerOpen(false), []);
  const selectTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    setMobileNavOpen(false);
  }, []);

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
  const busy = isDeployTxPending || isWritePending || isSwitching || isDisconnecting || pendingAction !== null;

  useEffect(() => {
    if (!normalizedAddress) {
      setDeployment(null);
      setDeploymentHistory([]);
      setDeploymentOrigin(null);
      return;
    }

    const currentDeployment = loadStoredDeployment(normalizedAddress, arcTestnet.id);
    const walletHistory = loadDeploymentHistory(normalizedAddress, arcTestnet.id);

    setDeploymentHistory(walletHistory);

    if (currentDeployment) {
      setDeployment(currentDeployment);
      setDeploymentOrigin("active");
      return;
    }

    setDeployment(walletHistory[0] ?? null);
    setDeploymentOrigin(walletHistory[0] ? "history" : null);
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
  const registryAddress = isAddress(configuredRegistry || "") ? getAddress(configuredRegistry as Address) : undefined;
  const activeNetwork = deployment?.network || arcTestnet.name;
  const nextDeployStep = getNextDeployStep(deployment);
  const nextDeployAction = nextDeployStep ? deployActions[nextDeployStep] : null;
  const vaultFactoryReady = Boolean(
    deployment && isOwner && factoryAddress !== zeroAddress && usdcAddress !== zeroAddress && deployment.factoryPermission,
  );
  const deploymentReady = vaultFactoryReady && !nextDeployStep;
  const deploymentStatusText = deploymentReady ? "Deployment ready" : vaultFactoryReady ? "Factory ready" : "Deploy from wallet";
  const vaultPrerequisiteLabel = deploymentReady ? "Protocol deployed" : vaultFactoryReady ? "Factory ready" : "Deploy or import factory";
  const activeDeployment = deployment ?? deploymentHistory[0] ?? null;
  const deploymentAttributed = Boolean(
    registryAddress &&
    activeDeployment?.registryDeploymentId &&
    activeDeployment.registry?.toLowerCase() === registryAddress.toLowerCase(),
  );

  const selectedVault = isAddress(vaultAddress) ? getAddress(vaultAddress) : undefined;
  const vaultAttributed = Boolean(
    deploymentAttributed &&
    activeDeployment?.vaultAttributed &&
    activeDeployment.vault &&
    selectedVault &&
    activeDeployment.vault.toLowerCase() === selectedVault.toLowerCase(),
  );
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
  const { data: vaultPaused, refetch: refetchVaultPaused } = useReadContract({
    address: selectedVault,
    abi: agentVaultAbi,
    functionName: "paused",
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
      setError(friendlyError(cause, "Could not switch to Arc testnet."));
    }
  }

  function baseDeployment(): DeploymentFile {
    return {
      network: arcTestnet.name,
      chainId: arcTestnet.id,
      deployer: normalizedAddress,
      usdc: usdcAddress,
      source: "browser-wallet",
    };
  }

  function saveDeploymentProgress(nextDeployment: DeploymentFile) {
    if (!normalizedAddress) return;
    const savedDeployment = saveStoredDeployment(normalizedAddress, nextDeployment, arcTestnet.id) ?? nextDeployment;
    setDeployment(savedDeployment);
    setDeploymentHistory(loadDeploymentHistory(normalizedAddress, arcTestnet.id));
    setDeploymentOrigin("active");
  }

  function restoreDeployment(nextDeployment: DeploymentFile) {
    if (!normalizedAddress) return;
    const restoredDeployment = saveStoredDeployment(normalizedAddress, nextDeployment, arcTestnet.id) ?? nextDeployment;

    setDeployment(restoredDeployment);
    setDeploymentHistory(loadDeploymentHistory(normalizedAddress, arcTestnet.id));
    setDeploymentOrigin("active");
    setDeployStep(getNextDeployStep(restoredDeployment));
    setVaultAddress(restoredDeployment.vault ?? "");
  }

  async function importDeploymentFromFactory() {
    if (!normalizedAddress) {
      setError("Connect a wallet first.");
      return;
    }

    if (!publicClient) {
      setError("Arc RPC is not ready.");
      return;
    }

    if (!isAddress(importFactoryAddress)) {
      setError("Enter a valid Vault Factory address.");
      return;
    }

    const vaultFactory = getAddress(importFactoryAddress);
    setError("");
    setImportingFactory(true);
    setPendingAction("import");

    try {
      await ensureArc();

      const code = await publicClient.getCode({ address: vaultFactory });
      if (!code || code === "0x") {
        throw new Error("No contract found at that address on Arc testnet.");
      }

      let ownerResult: unknown;
      let usdcResult: unknown;
      let policyEngineResult: unknown;
      let yieldRouterResult: unknown;
      let auditLogResult: unknown;

      try {
        [ownerResult, usdcResult, policyEngineResult, yieldRouterResult, auditLogResult] = await Promise.all([
          publicClient.readContract({ address: vaultFactory, abi: vaultFactoryAbi, functionName: "owner" }),
          publicClient.readContract({ address: vaultFactory, abi: vaultFactoryAbi, functionName: "usdc" }),
          publicClient.readContract({ address: vaultFactory, abi: vaultFactoryAbi, functionName: "policyEngine" }),
          publicClient.readContract({ address: vaultFactory, abi: vaultFactoryAbi, functionName: "yieldRouter" }),
          publicClient.readContract({ address: vaultFactory, abi: vaultFactoryAbi, functionName: "auditLog" }),
        ]);
      } catch {
        throw new Error("This is not an AXON Vault Factory on Arc testnet.");
      }

      const owner = requireReadAddress(ownerResult, "Factory owner");
      const usdc = requireReadAddress(usdcResult, "Factory USDC");
      const policyEngine = requireReadAddress(policyEngineResult, "Policy engine");
      const yieldRouter = requireReadAddress(yieldRouterResult, "Yield router");
      const auditLog = requireReadAddress(auditLogResult, "Audit log");
      const expectedUsdc = resolveAddress(configuredUsdc);

      if (owner !== normalizedAddress) {
        throw new Error("Factory owner does not match the connected wallet.");
      }

      if (expectedUsdc === zeroAddress || usdc !== expectedUsdc) {
        throw new Error("Factory USDC does not match the configured Arc testnet USDC.");
      }

      const [auditOwnerResult, factoryPermissionResult] = await Promise.all([
        publicClient.readContract({ address: auditLog, abi: auditLogAbi, functionName: "owner" }),
        publicClient.readContract({
          address: auditLog,
          abi: auditLogAbi,
          functionName: "authorizedFactories",
          args: [vaultFactory],
        }),
      ]);
      const auditOwner = requireReadAddress(auditOwnerResult, "Audit log owner");

      if (auditOwner !== normalizedAddress) {
        throw new Error("Audit log owner does not match the connected wallet.");
      }

      const importedDeployment: DeploymentFile = {
        network: arcTestnet.name,
        chainId: arcTestnet.id,
        deployer: normalizedAddress,
        usdc,
        policyEngine,
        auditLog,
        yieldRouter,
        vaultFactory,
        factoryPermission: factoryPermissionResult === true,
        source: "manual-import",
      };
      const savedDeployment = saveStoredDeployment(normalizedAddress, importedDeployment, arcTestnet.id) ?? importedDeployment;

      setDeployment(savedDeployment);
      setDeploymentHistory(loadDeploymentHistory(normalizedAddress, arcTestnet.id));
      setDeploymentOrigin("imported");
      setDeployStep(getNextDeployStep(savedDeployment));
      setVaultAddress(savedDeployment.vault ?? "");
      setImportFactoryAddress("");
    } catch (cause) {
      setError(friendlyError(cause, "Could not import factory."));
    } finally {
      setImportingFactory(false);
      setPendingAction(null);
    }
  }

  async function deployAndWait(contract: { abi: Abi; bytecode: Hex }, args?: readonly unknown[]) {
    if (!publicClient) throw new Error("Arc RPC is not ready.");
    const hash = await deployContractAsync({
      abi: contract.abi,
      bytecode: contract.bytecode,
      args,
      chainId: arcTestnet.id,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) {
      throw new Error("Deployment did not return a contract address.");
    }
    return getAddress(receipt.contractAddress);
  }

  async function writeAndWait(params: Parameters<typeof writeContractAsync>[0]) {
    if (!publicClient) throw new Error("Arc RPC is not ready.");
    const hash = await writeContractAsync({ ...params, chainId: arcTestnet.id });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async function registerDeploymentOnRegistry(deploymentToRegister: DeploymentFile) {
    if (!registryAddress) {
      throw new Error("AXON attribution is not configured for this deployment.");
    }
    if (!publicClient) {
      throw new Error("Arc RPC is not ready.");
    }
    if (!normalizedAddress || !deploymentToRegister.vaultFactory) {
      throw new Error("A connected owner wallet and Vault Factory are required.");
    }

    const factory = getAddress(deploymentToRegister.vaultFactory);
    const existing = await publicClient.readContract({
      address: registryAddress,
      abi: axonRegistryAbi,
      functionName: "deployments",
      args: [factory],
    });
    const existingDeploymentId = existing[0] as Hex;
    const existingDeployer = existing[1] as Address;

    if (existingDeploymentId !== zeroHash) {
      if (getAddress(existingDeployer) !== normalizedAddress) {
        throw new Error("This Vault Factory is already attributed to another wallet.");
      }

      saveDeploymentProgress({
        ...deploymentToRegister,
        registry: registryAddress,
        registryDeploymentId: existingDeploymentId,
      });
      return existingDeploymentId;
    }

    const hash = await writeContractAsync({
      address: registryAddress,
      abi: axonRegistryAbi,
      functionName: "registerDeployment",
      args: [factory, axonPlatformVersion],
      chainId: arcTestnet.id,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const logs = await publicClient.getContractEvents({
      address: registryAddress,
      abi: axonRegistryAbi,
      eventName: "DeploymentRegistered",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      strict: true,
    });
    const deploymentId = logs[0]?.args.deploymentId as Hex | undefined;

    if (!deploymentId) {
      throw new Error("AXON attribution did not return a deployment ID.");
    }

    saveDeploymentProgress({
      ...deploymentToRegister,
      registry: registryAddress,
      registryDeploymentId: deploymentId,
    });
    return deploymentId;
  }

  async function registerVaultOnRegistry(deploymentToRegister: DeploymentFile, vault: Address, vaultAgentId: Hex) {
    if (!registryAddress) {
      throw new Error("AXON attribution is not configured for this deployment.");
    }
    if (!publicClient) {
      throw new Error("Arc RPC is not ready.");
    }
    if (!normalizedAddress || !deploymentToRegister.vaultFactory || !deploymentToRegister.registryDeploymentId) {
      throw new Error("Register the AXON deployment before attributing its vault.");
    }

    const factory = getAddress(deploymentToRegister.vaultFactory);
    const normalizedVault = getAddress(vault);
    const existingFactory = await publicClient.readContract({
      address: registryAddress,
      abi: axonRegistryAbi,
      functionName: "factoryOfVault",
      args: [normalizedVault],
    });

    if (existingFactory !== zeroAddress) {
      if (getAddress(existingFactory) !== factory) {
        throw new Error("This vault is already attributed to another AXON factory.");
      }

      saveDeploymentProgress({
        ...deploymentToRegister,
        registry: registryAddress,
        agentId: vaultAgentId,
        vault: normalizedVault,
        vaultAttributed: true,
      });
      return;
    }

    const hash = await writeContractAsync({
      address: registryAddress,
      abi: axonRegistryAbi,
      functionName: "registerVault",
      args: [factory, vaultAgentId, normalizedVault],
      chainId: arcTestnet.id,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    saveDeploymentProgress({
      ...deploymentToRegister,
      registry: registryAddress,
      agentId: vaultAgentId,
      vault: normalizedVault,
      vaultAttributed: true,
    });
  }

  async function attributeDeployment() {
    if (!activeDeployment) return;
    setError("");
    setPendingAction("attribute");

    try {
      await ensureArc();
      await registerDeploymentOnRegistry(activeDeployment);
    } catch (cause) {
      setError(friendlyError(cause, "Could not register this deployment with AXON."));
    } finally {
      setPendingAction(null);
    }
  }

  async function attributeVault() {
    if (!activeDeployment || !selectedVault || !activeDeployment.agentId) return;
    setError("");
    setPendingAction("attribute-vault");

    try {
      await ensureArc();
      await registerVaultOnRegistry(activeDeployment, selectedVault, activeDeployment.agentId);
    } catch (cause) {
      setError(friendlyError(cause, "Could not attribute this vault to AXON."));
    } finally {
      setPendingAction(null);
    }
  }

  async function runDeployStep() {
    if (!normalizedAddress || !nextDeployStep) return;
    setError("");
    setPendingAction("deploy");
    let attributionAttempted = false;

    try {
      await ensureArc();
      setDeployStep(nextDeployStep);
      const {
        auditLogArtifact,
        cCTPReceiverArtifact,
        policyEngineArtifact,
        settlerArtifact,
        vaultFactoryArtifact,
        yieldRouterArtifact,
      } = await import("./abi/protocolArtifacts");
      const currentDeployment = deployment ?? deploymentHistory[0] ?? baseDeployment();

      if (nextDeployStep === "PolicyEngine") {
        const policyEngine = await deployAndWait(policyEngineArtifact);
        saveDeploymentProgress({ ...currentDeployment, policyEngine });
        return;
      }

      if (nextDeployStep === "AuditLog") {
        const auditLog = await deployAndWait(auditLogArtifact, [normalizedAddress]);
        saveDeploymentProgress({ ...currentDeployment, auditLog });
        return;
      }

      if (nextDeployStep === "YieldRouter") {
        const yieldRouter = await deployAndWait(yieldRouterArtifact, [usdcAddress, normalizedAddress]);
        saveDeploymentProgress({ ...currentDeployment, yieldRouter });
        return;
      }

      if (nextDeployStep === "VaultFactory") {
        if (!currentDeployment.policyEngine || !currentDeployment.yieldRouter || !currentDeployment.auditLog) {
          throw new Error("Finish earlier deployment steps first.");
        }

        const vaultFactory = await deployAndWait(vaultFactoryArtifact, [
          usdcAddress,
          currentDeployment.policyEngine,
          currentDeployment.yieldRouter,
          currentDeployment.auditLog,
          normalizedAddress,
        ]);
        saveDeploymentProgress({ ...currentDeployment, vaultFactory });
        return;
      }

      if (nextDeployStep === "Settler") {
        if (!currentDeployment.auditLog) throw new Error("Deploy Audit Log first.");
        const settler = await deployAndWait(settlerArtifact, [usdcAddress, currentDeployment.auditLog, normalizedAddress]);
        saveDeploymentProgress({ ...currentDeployment, settler });
        return;
      }

      if (nextDeployStep === "CCTPReceiver") {
        const cctpReceiver = await deployAndWait(cCTPReceiverArtifact, [usdcAddress, normalizedAddress]);
        saveDeploymentProgress({ ...currentDeployment, cctpReceiver });
        return;
      }

      if (nextDeployStep === "FactoryPermission") {
        if (!currentDeployment.auditLog || !currentDeployment.vaultFactory) {
          throw new Error("Deploy Audit Log and Vault Factory first.");
        }

        await writeAndWait({
          address: currentDeployment.auditLog,
          abi: auditLogArtifact.abi,
          functionName: "setFactory",
          args: [currentDeployment.vaultFactory, true],
        });
        saveDeploymentProgress({ ...currentDeployment, factoryPermission: true });
        return;
      }

      if (nextDeployStep === "SettlerPermission") {
        if (!currentDeployment.auditLog || !currentDeployment.settler) {
          throw new Error("Deploy Audit Log and Settler first.");
        }

        await writeAndWait({
          address: currentDeployment.auditLog,
          abi: auditLogArtifact.abi,
          functionName: "setWriter",
          args: [currentDeployment.settler, true],
        });
        const completedDeployment = {
          ...currentDeployment,
          settlerPermission: true,
          deployedAt: currentDeployment.deployedAt ?? new Date().toISOString(),
        };
        saveDeploymentProgress(completedDeployment);
        setDeployStep("Saved");

        if (registryAddress) {
          attributionAttempted = true;
          setPendingAction("attribute");
          await registerDeploymentOnRegistry(completedDeployment);
        }
      }
    } catch (cause) {
      setError(
        friendlyError(
          cause,
          attributionAttempted
            ? "Deployment is ready, but AXON attribution could not be registered. Retry it from this page."
            : "Deployment step failed.",
        ),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function createVault() {
    if (!publicClient || !vaultFactoryReady || factoryAddress === zeroAddress || !isAddress(agentAddress) || !isOwner) return;
    setError("");
    setPendingAction("vault");
    let vaultCreated = false;

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
      if (vault && normalizedAddress) {
        const currentDeployment = deployment ?? deploymentHistory[0];
        const nextDeployment = {
          ...(currentDeployment ?? baseDeployment()),
          agentId,
          vault: getAddress(vault),
        };
        const savedDeployment = saveStoredDeployment(normalizedAddress, nextDeployment, arcTestnet.id) ?? nextDeployment;
        setDeployment(savedDeployment);
        setDeploymentHistory(loadDeploymentHistory(normalizedAddress, arcTestnet.id));
        setDeploymentOrigin("active");
        setVaultAddress(getAddress(vault));
        vaultCreated = true;

        if (registryAddress && savedDeployment.registryDeploymentId) {
          setPendingAction("attribute-vault");
          await registerVaultOnRegistry(savedDeployment, getAddress(vault), agentId);
        }
      }
    } catch (cause) {
      setError(
        friendlyError(
          cause,
          vaultCreated
            ? "Vault created, but AXON could not attribute it. Retry attribution from the vault page."
            : "Could not create vault.",
        ),
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function approveAndDeposit() {
    if (!selectedVault || usdcAddress === zeroAddress || !isOwner) return;
    setError("");
    setPendingAction("fund");

    try {
      await ensureArc();
      const amount = toUsdc(depositAmount);
      await writeAndWait({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [selectedVault, amount],
      });
      await writeAndWait({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: "deposit",
        args: [amount],
      });
      await Promise.all([refetchBalance(), refetchWalletUsdc()]);
    } catch (cause) {
      setError(friendlyError(cause, "Could not fund vault."));
    } finally {
      setPendingAction(null);
    }
  }

  async function allowServiceReceiver(service: ServicePreset) {
    const receiver = serviceReceivers[service.id];
    if (!selectedVault || !isAddress(receiver) || !isOwner) return;
    setError("");
    setPendingAction(`approve:${service.id}`);

    try {
      await ensureArc();
      await writeAndWait({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: "setRecipient",
        args: [getAddress(receiver), true],
      });
      setServiceReceivers((current) => ({
        ...current,
        [service.id]: getAddress(receiver),
      }));
    } catch (cause) {
      setError(friendlyError(cause, "Could not approve service receiver."));
    } finally {
      setPendingAction(null);
    }
  }

  async function payService(service: ServicePreset) {
    const receiver = serviceReceivers[service.id];
    if (!selectedVault || !isAddress(receiver) || !canPayFromWallet) return;
    setError("");
    setPendingAction(`pay:${service.id}`);

    try {
      await ensureArc();
      await writeAndWait({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: "pay",
        args: [getAddress(receiver), toUsdc(service.amount), service.memo],
      });
      await Promise.all([refetchBalance(), refetchSpent()]);
    } catch (cause) {
      setError(friendlyError(cause, "Could not pay service."));
    } finally {
      setPendingAction(null);
    }
  }

  async function setPaused(paused: boolean) {
    if (!selectedVault || !isOwner) return;
    setError("");
    setPendingAction("pause");

    try {
      await ensureArc();
      await writeAndWait({
        address: selectedVault,
        abi: agentVaultAbi,
        functionName: paused ? "pause" : "unpause",
        args: [],
      });
      await refetchVaultPaused();
    } catch (cause) {
      setError(friendlyError(cause, "Could not update vault state."));
    } finally {
      setPendingAction(null);
    }
  }

  function forgetDeployment() {
    if (!normalizedAddress) return;
    clearStoredDeployment(normalizedAddress, arcTestnet.id);
    setDeployment(null);
    setDeploymentOrigin("history");
    setDeployStep(null);
    setVaultAddress("");
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
      closeWalletPicker();

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
          setError(friendlyError(switchCause, "Wallet connected. Use Switch/Add Arc before deployment or payments."));
        }
      }
    } catch (cause) {
      setError(friendlyError(cause, "Wallet connection failed."));
    }
  }

  async function disconnectWallet() {
    setError("");
    setWalletSession(null);
    closeWalletPicker();
    setIsDisconnecting(true);

    try {
      await disconnectAsync(currentConnector ? { connector: currentConnector } : undefined);
    } catch (cause) {
      setError(friendlyError(cause, "Wallet disconnect failed."));
    } finally {
      setIsDisconnecting(false);
    }
  }

  const canPayFromWallet =
    Boolean(normalizedAddress && vaultAgent) && getAddress(vaultAgent!) === normalizedAddress;
  const walletConnectReady = connectors.some(isWalletConnectConnector);
  const walletConnectMissing = !walletConnectProjectId && !walletConnectReady;
  const canImportFactory =
    walletConnected && onArc && !busy && !importingFactory && Boolean(publicClient) && isAddress(importFactoryAddress);
  const vaultFunded = balance !== undefined && balance > 0n;
  const hasPaymentActivity = events.length > 0;

  const openGuidedDeploy = useCallback(() => {
    if (!walletConnected) {
      openWalletPicker();
      return;
    }

    if (!onArc) {
      void requestArcNetwork();
      return;
    }

    selectTab("deploy");
  }, [onArc, openWalletPicker, requestArcNetwork, selectTab, walletConnected]);

  const startHereSteps: StartHereStep[] = [
    {
      number: "01",
      title: "Connect wallet",
      description: "Use the owner wallet that will sign deployments, control the vault, and approve policy changes.",
      status: walletConnected && onArc ? "Ready" : walletConnected ? "Switch network" : "Required",
      actionLabel: walletConnected && onArc ? "Review wallet" : walletConnected ? "Switch to Arc" : "Connect wallet",
      state: walletConnected && onArc ? "complete" : "current",
      Icon: WalletCards,
      onAction: walletConnected && onArc ? () => selectTab("connect") : walletConnected ? () => void requestArcNetwork() : openWalletPicker,
      disabled: isConnecting || isSwitching,
    },
    {
      number: "02",
      title: "Deploy protocol",
      description: "Deploy the policy, audit, routing, factory, and settlement contracts needed by your agent vault.",
      status: deploymentReady ? "Ready" : vaultFactoryReady ? "Continue" : walletConnected && onArc ? "Next step" : "Waiting",
      actionLabel: deploymentReady ? "Review deploy" : !walletConnected ? "Connect first" : !onArc ? "Switch to Arc" : "Open Deploy",
      state: deploymentReady ? "complete" : walletConnected && onArc ? "current" : "upcoming",
      Icon: PlugZap,
      onAction: deploymentReady ? () => selectTab("deploy") : openGuidedDeploy,
      disabled: isSwitching,
    },
    {
      number: "03",
      title: "Create and fund vault",
      description: "Create one policy vault, set the agent limits, then deposit Arc testnet USDC for controlled spending.",
      status: vaultFunded ? "Funded" : selectedVault ? "Created" : deploymentReady ? "Next step" : "Deploy first",
      actionLabel: vaultFunded ? "Review vault" : "Open Vault",
      state: vaultFunded ? "complete" : selectedVault || deploymentReady ? "current" : "upcoming",
      Icon: Zap,
      onAction: () => selectTab("vault"),
    },
    {
      number: "04",
      title: "Approve a service",
      description: "Add a real receiver wallet, approve it once, and unlock an auditable payment for an API or compute task.",
      status: hasPaymentActivity ? "Payment active" : selectedVault ? "Ready to configure" : "Vault required",
      actionLabel: "Open Services",
      state: hasPaymentActivity ? "complete" : selectedVault ? "current" : "upcoming",
      Icon: Receipt,
      onAction: () => selectTab("services"),
    },
    {
      number: "05",
      title: "Review payment proof",
      description: "Use the audit stream to confirm recipient, amount, memo, and on-chain payment activity.",
      status: hasPaymentActivity ? "Payment verified" : "After payment",
      actionLabel: "Open Audit",
      state: hasPaymentActivity ? "complete" : "upcoming",
      Icon: TerminalSquare,
      onAction: () => selectTab("audit"),
    },
  ];
  const completedStartHereSteps = startHereSteps.filter((step) => step.state === "complete").length;

  return (
    <main className="appShell">
      <header className="siteHeader">
        <div className="headerInner">
          <button className="brand" type="button" onClick={() => selectTab("connect")} aria-label="Open AXON Protocol overview">
            <img className="brandLogo" src="/axon-symbol.png" alt="" aria-hidden="true" />
            <span className="brandCopy">
              <strong>
                AXON <span className="brandProtocol">Protocol</span>
              </strong>
              <small>
                <span className="brandTagline">Agent banking console</span>
                <span className="brandProtocolMobile">Protocol</span>
              </small>
            </span>
          </button>

          <nav id="primary-navigation" className={mobileNavOpen ? "mainNav open" : "mainNav"} aria-label="Dashboard sections">
            {navItems.map(({ id, Icon, label, detail }) => (
              <button
                className={tab === id ? "navLink active" : "navLink"}
                key={id}
                type="button"
                aria-current={tab === id ? "page" : undefined}
                onClick={() => selectTab(id)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className="headerActions">
            <WalletStatusButton
              addressLabel={shortAddress(normalizedAddress)}
              isConnecting={isConnecting}
              isDisconnecting={isDisconnecting}
              onArc={onArc}
              onDisconnect={disconnectWallet}
              onOpen={() => (walletConnected ? selectTab("connect") : openWalletPicker())}
              walletConnected={walletConnected}
            />
            <button
              className="menuToggle"
              type="button"
              aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={mobileNavOpen}
              aria-controls="primary-navigation"
              onClick={() => setMobileNavOpen((current) => !current)}
            >
              <span className="menuIcon" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <section className="workspace">
        <div className="workspaceInner">
          <header className="topbar">
            <div className="heroCopy">
              <span className="network">{activeNetwork}</span>
              <h1>Policy-controlled USDC vaults for autonomous AI agents</h1>
              <p className="heroDescription">
                Give agents a predictable budget for APIs, compute, data, and tasks while keeping every payment within policy.
              </p>
              <div className="statusRow" aria-label="Protocol status">
                <span className={walletConnected ? "statusChip ready" : "statusChip"}>
                  {walletConnected ? "Wallet connected" : "Wallet required"}
                </span>
                <span className={onArc ? "statusChip ready" : "statusChip warning"}>
                  {onArc ? "Arc selected" : "Switch to Arc"}
                </span>
                <span className={vaultFactoryReady ? "statusChip ready" : "statusChip"}>
                  {deploymentStatusText}
                </span>
                {factoryAddress !== zeroAddress && <span className="statusMeta">Factory {shortAddress(factoryAddress)}</span>}
              </div>
            </div>
          </header>

          {error && !walletPickerOpen && (
            <div className="notice danger" role="alert">
              <span>{error}</span>
              <button className="noticeClose" type="button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {!onArc && walletConnected && (
            <div className="notice">
              <span>Wallet is on chain {walletChainId}. Switch or add Arc testnet before deployment and payments.</span>
              <button type="button" onClick={requestArcNetwork} disabled={isSwitching}>
                <PlugZap size={17} />
                {isSwitching ? "Switching..." : "Switch/Add Arc"}
              </button>
            </div>
          )}

          <section className="summaryStrip" aria-label="Account summary">
            <div className="summaryCard">
              <span>Wallet USDC</span>
              <strong>{walletUsdc === undefined ? "-" : formatUnits(walletUsdc, 6)}</strong>
              <small>Available in connected wallet</small>
            </div>
            <div className="summaryCard">
              <span>Vault balance</span>
              <strong>{balance === undefined ? "-" : formatUnits(balance, 6)}</strong>
              <small>Ready for agent payments</small>
            </div>
            <div className="summaryCard">
              <span>Spent today</span>
              <strong>{spent === undefined ? "-" : formatUnits(spent, 6)}</strong>
              <small>Policy window activity</small>
            </div>
          </section>

        {tab === "connect" && (
          <section className="panel wide connectPanel">
            <div className="panelHeader">
              <div className="panelTitle">
                <WalletCards size={19} />
                <h3>Wallet access</h3>
              </div>
              <p>Connect the wallet that owns your AXON deployment and keeps control of agent budgets.</p>
            </div>

            {walletConnected ? (
              <div className="walletSummary">
                <div>
                  <span className="summaryLabel"><span className="statusDot connected" />Connected wallet</span>
                  <strong>{shortAddress(normalizedAddress)}</strong>
                  <small>{currentConnector?.name || "Browser wallet"}</small>
                </div>
                <div className="walletSummaryActions">
                  <button className="secondaryButton" type="button" onClick={openWalletPicker} disabled={isConnecting || isDisconnecting}>
                    <WalletCards size={17} />
                    Choose another wallet
                  </button>
                  <button className="tertiaryButton" type="button" onClick={disconnectWallet} disabled={isDisconnecting}>
                    <Power size={17} />
                    {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="walletEmptyState panelEmptyState">
                <span className="emptyStateIcon"><WalletCards size={22} /></span>
                <div>
                  <strong>Connect a wallet to begin</strong>
                  <span>Your wallet signs deployments, vault funding, and policy updates.</span>
                </div>
                <button type="button" onClick={openWalletPicker} disabled={isConnecting}>
                  <WalletCards size={17} />
                  Choose wallet
                </button>
              </div>
            )}

            <div className="faucetCallout">
              <div>
                <span>Need Arc testnet USDC?</span>
                <strong>Claim test tokens from Circle before deploying or funding a vault.</strong>
              </div>
              <a className="faucetButton" href={circleFaucetUrl} target="_blank" rel="noreferrer">
                <CircleDollarSign size={17} />
                Circle Faucet
              </a>
            </div>
          </section>
        )}

        {tab === "connect" && <StartHereGuide completedCount={completedStartHereSteps} steps={startHereSteps} />}

        {tab === "deploy" && (
          <section className="panel wide">
            <div className="panelTitle">
              <PlugZap size={19} />
              <h3>Deploy Protocol</h3>
            </div>
            {deploymentHistory.length > 0 && (
              <div className="restorePanel">
                <Clock3 size={18} />
                <div>
                  <span>Detected from this wallet</span>
                  <strong>
                    {shortAddress(deploymentHistory[0].vaultFactory || deploymentHistory[0].policyEngine || deploymentHistory[0].auditLog)}
                  </strong>
                  <small>{formatDeploymentTime(deploymentHistory[0].savedAt ?? deploymentHistory[0].deployedAt)}</small>
                </div>
                <button className="secondaryButton" onClick={() => restoreDeployment(deploymentHistory[0])}>
                  Restore
                </button>
              </div>
            )}
            <form
              className="importPanel"
              onSubmit={(event) => {
                event.preventDefault();
                void importDeploymentFromFactory();
              }}
            >
              <div className="importPanelHeader">
                <span>Manual import</span>
                <strong>Use an existing AXON Vault Factory</strong>
                <small>Wrong contract or wrong owner will not be saved.</small>
              </div>
              <div className="importRow">
                <label>
                  Factory address
                  <input
                    value={importFactoryAddress}
                    onChange={(event) => setImportFactoryAddress(event.target.value)}
                    placeholder="0x..."
                  />
                </label>
                <button className="secondaryButton" disabled={!canImportFactory} type="submit">
                  <FileSearch size={17} />
                  {importingFactory ? "Checking..." : "Import"}
                </button>
              </div>
            </form>
            <div className="deploymentGrid">
              <div>
                <span>Owner wallet</span>
                <strong>{normalizedAddress ? shortAddress(normalizedAddress) : "Not connected"}</strong>
              </div>
              <div>
                <span>Vault Factory</span>
                <strong>{factoryAddress !== zeroAddress ? shortAddress(factoryAddress) : "Not imported"}</strong>
              </div>
              <div>
                <span>USDC</span>
                <strong>{shortAddress(usdcAddress)}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{formatDeploymentSource(deployment?.source, deploymentOrigin)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{deploymentReady ? "Ready" : vaultFactoryReady ? "Factory ready" : deployStep || nextDeployStep || "Not deployed"}</strong>
              </div>
              <div>
                <span>Detected</span>
                <strong>{formatDeploymentTime(deployment?.savedAt ?? deployment?.deployedAt)}</strong>
              </div>
              <div>
                <span>AXON attribution</span>
                <strong>
                  {!registryAddress ? "Registry not configured" : deploymentAttributed ? "Registered" : vaultFactoryReady ? "Ready to register" : "After deployment"}
                </strong>
              </div>
            </div>

            <div className="attributionPanel">
              <div>
                <span>Platform attribution</span>
                <strong>
                  {deploymentAttributed
                    ? "This user-owned deployment is linked to the canonical AXON registry."
                    : registryAddress
                      ? "Register the factory once so Arc can identify the AXON deployment path."
                      : "The canonical AXON registry address has not been configured yet."}
                </strong>
                <small>
                  AXON never becomes the owner of your factory or vault. Only the owner wallet can create and control them.
                </small>
              </div>
              {registryAddress ? (
                <button
                  className="secondaryButton"
                  type="button"
                  disabled={!vaultFactoryReady || deploymentAttributed || busy || !activeDeployment}
                  onClick={() => void attributeDeployment()}
                >
                  {pendingAction === "attribute" ? "Registering..." : deploymentAttributed ? "Registered with AXON" : "Register deployment"}
                </button>
              ) : (
                <span className="attributionSetup">Set VITE_AXON_REGISTRY_ADDRESS after deploying the canonical registry.</span>
              )}
            </div>

            <div className="faucetCallout">
              <div>
                <span>Need Arc testnet USDC?</span>
                <strong>Claim from Circle first so every deploy transaction has gas.</strong>
              </div>
              <a className="faucetButton" href={circleFaucetUrl} target="_blank" rel="noreferrer">
                <CircleDollarSign size={17} />
                Circle Faucet
              </a>
            </div>

            {!deploymentReady && nextDeployAction && (
              <div className="deployNext">
                <div>
                  <span>Next transaction</span>
                  <strong>{nextDeployAction.label}</strong>
                  <p>{nextDeployAction.description}</p>
                </div>
              </div>
            )}

            {vaultFactoryReady ? (
              <div className="deploymentActions">
                <button onClick={() => setTab("vault")}>
                  <CheckCircle2 size={18} />
                  Continue
                </button>
                {!deploymentReady && nextDeployAction && (
                  <button className="secondaryButton" disabled={!walletConnected || !onArc || busy} onClick={runDeployStep}>
                    <PlugZap size={18} />
                    {pendingAction === "deploy" ? "Working..." : nextDeployAction.label}
                  </button>
                )}
                <button className="secondaryButton" onClick={forgetDeployment}>
                  Clear Active View
                </button>
              </div>
            ) : (
              <button disabled={!walletConnected || !onArc || busy || !nextDeployAction} onClick={runDeployStep}>
                <PlugZap size={18} />
                {pendingAction === "deploy" ? "Working..." : nextDeployAction?.label || "Deployment Ready"}
              </button>
            )}
          </section>
        )}

        {tab === "vault" && (
          <section className="panel wide vaultPanel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Zap size={19} />
                <h3>Agent Vault</h3>
              </div>
              <p>Deploy one policy vault, fund it with Arc testnet USDC, then let the agent pay only approved receivers.</p>
            </div>

            <div className="flowStrip" aria-label="Vault workflow">
              <div className={vaultFactoryReady ? "flowStep ready" : "flowStep"}>
                <CheckCircle2 size={17} />
                <span>{vaultPrerequisiteLabel}</span>
              </div>
              <div className={selectedVault ? "flowStep ready" : "flowStep"}>
                <CheckCircle2 size={17} />
                <span>Vault created</span>
              </div>
              <div className={balance && balance > 0n ? "flowStep ready" : "flowStep"}>
                <CheckCircle2 size={17} />
                <span>Vault funded</span>
              </div>
            </div>

            <div className="deploymentGrid">
              <div>
                <span>Selected vault</span>
                <strong>{selectedVault ? shortAddress(selectedVault) : "Create a vault first"}</strong>
              </div>
              <div>
                <span>Agent signer</span>
                <strong>{vaultAgent ? shortAddress(vaultAgent) : isAddress(agentAddress) ? shortAddress(agentAddress) : "Not set"}</strong>
              </div>
              <div>
                <span>Vault balance</span>
                <strong>{balance === undefined ? "-" : `${formatUnits(balance, 6)} USDC`}</strong>
              </div>
              <div>
                <span>Spend today</span>
                <strong>{spent === undefined ? "-" : `${formatUnits(spent, 6)} USDC`}</strong>
              </div>
            </div>

            {selectedVault && (
              <div className="attributionPanel compact">
                <div>
                  <span>AXON vault attribution</span>
                  <strong>
                    {vaultAttributed
                      ? "Vault linked to the canonical AXON deployment."
                      : !registryAddress
                        ? "Registry not configured"
                        : !deploymentAttributed
                          ? "Register the deployment first"
                          : "Vault is ready to register"}
                  </strong>
                  <small>Future vault activity can be mapped to AXON through the public factory and vault link.</small>
                </div>
                {registryAddress ? (
                  <button
                    className="secondaryButton"
                    type="button"
                    disabled={!deploymentAttributed || vaultAttributed || busy || !activeDeployment?.agentId}
                    onClick={() => void attributeVault()}
                  >
                    {pendingAction === "attribute-vault" ? "Registering..." : vaultAttributed ? "Vault attributed" : "Register vault"}
                  </button>
                ) : (
                  <span className="attributionSetup">Configure the canonical registry to enable vault attribution.</span>
                )}
              </div>
            )}

            <div className="vaultSections">
              <section className="subPanel">
                <div>
                  <span className="stepLabel">Step 1</span>
                  <h4>Create policy vault</h4>
                  <p className="muted">Owner wallet creates the vault and sets the agent, limits, and optional starting whitelist.</p>
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
                  Initial receivers
                  <textarea
                    value={whitelist}
                    onChange={(event) => setWhitelist(event.target.value)}
                    placeholder="Optional: paste receiver wallet addresses"
                  />
                </label>
                <button disabled={!vaultFactoryReady || busy || !isAddress(agentAddress)} onClick={createVault}>
                  {pendingAction === "vault" ? <LoaderCircle className="spin" size={18} /> : <Zap size={18} />}
                  {pendingAction === "vault" ? "Creating..." : "Create Vault"}
                </button>
              </section>

              <section className="subPanel">
                <div>
                  <span className="stepLabel">Step 2</span>
                  <h4>Fund and control</h4>
                  <p className="muted">Deposit testnet USDC into the selected vault. Only the owner can pause or unpause it.</p>
                </div>
                <label>
                  Vault address
                  <input value={vaultAddress} onChange={(event) => setVaultAddress(event.target.value)} />
                </label>
                <label>
                  Deposit amount
                  <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
                </label>
                <div className="actions">
                  <button disabled={!selectedVault || busy || !isOwner} onClick={approveAndDeposit}>
                    {pendingAction === "fund" ? <LoaderCircle className="spin" size={18} /> : <CircleDollarSign size={18} />}
                    {pendingAction === "fund" ? "Funding..." : "Fund Vault"}
                  </button>
                  <a className="faucetButton compact" href={circleFaucetUrl} target="_blank" rel="noreferrer">
                    Faucet
                  </a>
                </div>
                <div className="actions single">
                  <button
                    className="secondaryButton"
                    disabled={!selectedVault || busy || !isOwner}
                    onClick={() => setPaused(!vaultPaused)}
                  >
                    {pendingAction === "pause" ? "Updating..." : vaultPaused ? "Unpause Vault" : "Pause Vault"}
                  </button>
                </div>
              </section>
            </div>
          </section>
        )}

        {tab === "services" && (
          <section className="panel wide servicesPanel">
            <div className="panelHeader">
              <div className="panelTitle">
                <Receipt size={19} />
                <h3>Service Payments</h3>
              </div>
              <p>Select a real receiver wallet, approve it once, then send an actual Arc testnet USDC payment from the agent vault.</p>
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
              {servicePresets.map((service) => (
                <ServiceCard
                  allowServiceReceiver={allowServiceReceiver}
                  busy={busy}
                  canPayFromWallet={canPayFromWallet}
                  isOwner={isOwner}
                  key={service.id}
                  pendingAction={pendingAction}
                  paymentsLocked={Boolean(vaultPaused)}
                  payService={payService}
                  selectedVault={selectedVault}
                  service={service}
                  serviceReceivers={serviceReceivers}
                  setServiceReceivers={setServiceReceivers}
                />
              ))}
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

        <footer className="siteFooter">
          <span>© 2026 Md. Rakib <span aria-hidden="true">•</span> made with love and passion.</span>
        </footer>
        </div>
      </section>

      <WalletPickerModal
        connectors={connectors}
        error={walletPickerOpen ? error : undefined}
        isConnecting={isConnecting}
        onClose={closeWalletPicker}
        onConnect={connectWallet}
        open={walletPickerOpen}
        walletConnectMissing={walletConnectMissing}
        walletConnectReady={walletConnectReady}
      />
    </main>
  );
}

export default App;
