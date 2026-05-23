export const auditLogAbi = [
  {
    type: "event",
    name: "PaymentLogged",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "vault", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "memo", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PolicyUpdated",
    inputs: [
      { name: "agentId", type: "bytes32", indexed: true },
      { name: "vault", type: "address", indexed: true },
      { name: "dailyLimit", type: "uint256", indexed: false },
      { name: "perTransactionLimit", type: "uint256", indexed: false },
      { name: "requireWhitelist", type: "bool", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;
