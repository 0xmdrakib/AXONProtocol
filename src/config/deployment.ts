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
