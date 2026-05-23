import { getAddress, isAddress, type Address } from "viem";

import { arcTestnet } from "./chains";

export const DEFAULT_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

export type DeploymentFile = {
  network?: string;
  chainId?: number;
  deployer?: Address;
  usdc?: Address;
  policyEngine?: Address;
  auditLog?: Address;
  yieldRouter?: Address;
  vaultFactory?: Address;
  settler?: Address;
  cctpReceiver?: Address;
  factoryPermission?: boolean;
  settlerPermission?: boolean;
  vault?: Address;
  source?: string;
  deployedAt?: string;
  savedAt?: string;
};

function storageKey(deployer: Address, chainId = arcTestnet.id) {
  return `axon:deployment:${chainId}:${getAddress(deployer).toLowerCase()}`;
}

function historyKey(deployer: Address, chainId = arcTestnet.id) {
  return `axon:deployment-history:${chainId}:${getAddress(deployer).toLowerCase()}`;
}

function validAddress(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value);
}

function timeValue(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function deploymentKey(deployment: DeploymentFile) {
  return [
    deployment.chainId,
    deployment.deployer?.toLowerCase(),
    deployment.vaultFactory?.toLowerCase() || deployment.policyEngine?.toLowerCase() || "partial",
  ].join(":");
}

function normalizeDeployment(deployment: DeploymentFile, deployer: Address, chainId = arcTestnet.id): DeploymentFile | null {
  if (
    deployment.chainId !== chainId ||
    !validAddress(deployment.deployer) ||
    getAddress(deployment.deployer) !== getAddress(deployer) ||
    !validAddress(deployment.usdc)
  ) {
    return null;
  }

  const addressFields: Array<keyof DeploymentFile> = [
    "policyEngine",
    "auditLog",
    "yieldRouter",
    "vaultFactory",
    "settler",
    "cctpReceiver",
    "vault",
  ];

  if (addressFields.some((field) => deployment[field] !== undefined && !validAddress(deployment[field]))) {
    return null;
  }

  const fullDeployment =
    validAddress(deployment.policyEngine) &&
    validAddress(deployment.auditLog) &&
    validAddress(deployment.yieldRouter) &&
    validAddress(deployment.vaultFactory) &&
    validAddress(deployment.settler) &&
    validAddress(deployment.cctpReceiver);

  if (fullDeployment && deployment.deployedAt) {
    return {
      ...deployment,
      factoryPermission: deployment.factoryPermission ?? true,
      settlerPermission: deployment.settlerPermission ?? true,
    };
  }

  return deployment;
}

export function loadStoredDeployment(deployer: Address, chainId = arcTestnet.id): DeploymentFile | null {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(storageKey(deployer, chainId));
    if (!raw) return null;

    return normalizeDeployment(JSON.parse(raw) as DeploymentFile, deployer, chainId);
  } catch {
    return null;
  }
}

export function loadDeploymentHistory(deployer: Address, chainId = arcTestnet.id): DeploymentFile[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(historyKey(deployer, chainId));
    if (!raw) return [];

    const items = JSON.parse(raw) as DeploymentFile[];
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => normalizeDeployment(item, deployer, chainId))
      .filter((item): item is DeploymentFile => Boolean(item))
      .sort((a, b) => timeValue(b.savedAt ?? b.deployedAt) - timeValue(a.savedAt ?? a.deployedAt));
  } catch {
    return [];
  }
}

export function saveStoredDeployment(deployer: Address, deployment: DeploymentFile, chainId = arcTestnet.id) {
  if (typeof localStorage === "undefined") return null;

  const nextDeployment = {
    ...deployment,
    savedAt: new Date().toISOString(),
  };
  const currentHistory = loadDeploymentHistory(deployer, chainId);
  const nextKey = deploymentKey(nextDeployment);
  const nextHistory = [
    nextDeployment,
    ...currentHistory.filter((item) => deploymentKey(item) !== nextKey),
  ].slice(0, 8);

  localStorage.setItem(storageKey(deployer, chainId), JSON.stringify(nextDeployment));
  localStorage.setItem(historyKey(deployer, chainId), JSON.stringify(nextHistory));
  return nextDeployment;
}

export function clearStoredDeployment(deployer: Address, chainId = arcTestnet.id) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(storageKey(deployer, chainId));
}
