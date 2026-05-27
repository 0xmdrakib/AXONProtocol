# AXON Protocol

**Autonomous agent banking on Arc testnet.**

AXON gives an AI agent a controlled USDC vault. The agent can pay approved receivers, while the human owner keeps limits, audit visibility, and emergency control.

**Live app:** https://axonprotocol.xyz

## Core Use Case

AI agents need to pay for APIs, compute, data, tools, and other agents. AXON lets the owner fund a vault once, then the agent can send USDC only within policy.

Example:

```text
Vault: 50 USDC
Daily limit: 5 USDC
Per payment limit: 2 USDC
Receiver: approved API provider
Payment: 0.25 USDC
Memo: market-data-api-call
```

The receiver gets USDC directly in their wallet on Arc testnet.

## Key Features

- Browser wallet deployment, no private key in `.env`
- Injected wallets with EIP-6963 discovery
- WalletConnect support through `VITE_WALLETCONNECT_PROJECT_ID`
- Arc testnet switch/add prompt from the UI
- Per-agent `AgentVault`
- Daily and per-payment limits
- Recipient whitelist
- On-chain payment audit log
- Pause, unpause, and fund recovery
- `Settler` escrow for agent-to-agent payments
- Future hooks for CCTP funding and USYC routing

## Wallet Model

AXON does not use a backend deployer wallet.

1. User connects wallet in the Connect tab.
2. UI asks the wallet to switch/add Arc testnet.
3. User deploys AXON from that connected wallet.
4. The browser stores that deployment locally for the same deployer wallet.
5. The factory only allows the deployment owner to create vaults.

For the demo, keep the Agent wallet as the connected deployer wallet. For a real agent setup, the agent address can be a dedicated signer, smart account, or session-key wallet that calls `pay(receiver, amount, memo)`.

## Supported Network

```text
Network: Arc testnet
RPC: https://rpc.testnet.arc.network
Chain ID: 5042002
USDC: 0x3600000000000000000000000000000000000000
Faucet: https://faucet.circle.com
```

## Tech Stack

- Solidity + Hardhat
- React + Vite
- Wagmi + Viem
- Arc testnet USDC
- WalletConnect

## Demo Flow

1. Connect wallet.
2. Switch/add Arc testnet.
3. Deploy AXON from the UI.
4. Create an agent vault.
5. Fund vault with Arc testnet USDC.
6. Send a whitelisted payment.
7. Show the audit event.
8. Pause or unpause the vault.

## Real Use Cases

- API marketplace payments
- AI compute and inference spending
- Research data purchases
- Agent-to-agent task payments
- Enterprise agent budgets
- Subscription-style tool payments
- Cross-chain funding with future CCTP support
- Idle fund routing with future USYC support

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root. then fill all env from [.env.example](./.env.example).

### 3. Run the development server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### 4. Build for production

```bash
npm run build
npm run start
```

---

## License

This project is licensed under the [MIT License](./LICENSE).
