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
  vault?: Address;
  source?: string;
  deployedAt?: string;
};

function storageKey(deployer: Address, chainId = arcTestnet.id) {
  return `axon:deployment:${chainId}:${getAddress(deployer).toLowerCase()}`;
}

function validAddress(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value);
}

export function loadStoredDeployment(deployer: Address, chainId = arcTestnet.id): DeploymentFile | null {
  if (typeof localStorage === "undefined") return null;

  try {
    const raw = localStorage.getItem(storageKey(deployer, chainId));
    if (!raw) return null;

    const deployment = JSON.parse(raw) as DeploymentFile;
    if (
      deployment.chainId !== chainId ||
      !validAddress(deployment.deployer) ||
      getAddress(deployment.deployer) !== getAddress(deployer) ||
      !validAddress(deployment.vaultFactory) ||
      !validAddress(deployment.auditLog) ||
      !validAddress(deployment.usdc)
    ) {
      return null;
    }

    return deployment;
  } catch {
    return null;
  }
}

export function saveStoredDeployment(deployer: Address, deployment: DeploymentFile, chainId = arcTestnet.id) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(deployer, chainId), JSON.stringify(deployment));
}

export function clearStoredDeployment(deployer: Address, chainId = arcTestnet.id) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(storageKey(deployer, chainId));
}
