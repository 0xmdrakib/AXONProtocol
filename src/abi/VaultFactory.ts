export const vaultFactoryAbi = [
  {
    type: "function",
    name: "createVault",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "bytes32" },
      { name: "agent", type: "address" },
      { name: "dailyLimit", type: "uint256" },
      { name: "perTransactionLimit", type: "uint256" },
      { name: "initialRecipients", type: "address[]" },
    ],
    outputs: [{ name: "vault", type: "address" }],
  },
  {
    type: "function",
    name: "vaultOfAgent",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "vaultsByOwner",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "event",
    name: "VaultDeployed",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "vault", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: false },
    ],
    anonymous: false,
  },
] as const;
