import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { encodeFunctionData, getAddress, keccak256, parseUnits, toBytes, zeroAddress } from "viem";

describe("AXON Protocol", async function () {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();

  async function deployProtocol() {
    const [owner, agent, recipient, stranger, payee] = await viem.getWalletClients();

    const usdc = await viem.deployContract("MockUSDC", [owner.account.address]);
    const policyEngine = await viem.deployContract("PolicyEngine");
    const auditLog = await viem.deployContract("AuditLog", [owner.account.address]);
    const yieldRouter = await viem.deployContract("YieldRouter", [usdc.address, owner.account.address]);
    const factory = await viem.deployContract("VaultFactory", [
      usdc.address,
      policyEngine.address,
      yieldRouter.address,
      auditLog.address,
      owner.account.address,
    ]);
    const settler = await viem.deployContract("Settler", [
      usdc.address,
      auditLog.address,
      owner.account.address,
    ]);

    await auditLog.write.setFactory([factory.address, true]);
    await auditLog.write.setWriter([factory.address, true]);
    await auditLog.write.setWriter([settler.address, true]);

    return { owner, agent, recipient, stranger, payee, usdc, policyEngine, auditLog, yieldRouter, factory, settler };
  }

  it("creates an agent vault, routes deposits through the yield router, and pays whitelisted recipients", async function () {
    const { owner, agent, recipient, usdc, yieldRouter, factory, auditLog } = await deployProtocol();
    const agentId = keccak256(toBytes("research-agent-001"));
    const depositAmount = parseUnits("50", 6);
    const payAmount = parseUnits("1.25", 6);

    await usdc.write.mint([owner.account.address, depositAmount]);

    const createHash = await factory.write.createVault([
      agentId,
      agent.account.address,
      parseUnits("5", 6),
      parseUnits("2", 6),
      [recipient.account.address],
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
    const createEvents = await publicClient.getContractEvents({
      address: factory.address,
      abi: factory.abi,
      eventName: "VaultDeployed",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      strict: true,
    });
    const vaultAddress = getAddress(createEvents[0].args.vault);
    const vault = await viem.getContractAt("AgentVault", vaultAddress);

    await usdc.write.approve([vault.address, depositAmount]);
    await vault.write.deposit([depositAmount]);

    assert.equal(await usdc.read.balanceOf([vault.address]), 0n);
    assert.equal(await usdc.read.balanceOf([yieldRouter.address]), depositAmount);
    assert.equal(await vault.read.availableBalance(), depositAmount);

    const payHash = await vault.write.pay([recipient.account.address, payAmount, "weather-api"], {
      account: agent.account,
    });
    const payReceipt = await publicClient.waitForTransactionReceipt({ hash: payHash });
    const paymentEvents = await publicClient.getContractEvents({
      address: auditLog.address,
      abi: auditLog.abi,
      eventName: "PaymentLogged",
      fromBlock: payReceipt.blockNumber,
      toBlock: payReceipt.blockNumber,
      strict: true,
    });

    assert.equal(paymentEvents[0].args.agentId, agentId);
    assert.equal(getAddress(paymentEvents[0].args.vault), vault.address);
    assert.equal(getAddress(paymentEvents[0].args.recipient), getAddress(recipient.account.address));
    assert.equal(paymentEvents[0].args.amount, payAmount);
    assert.equal(paymentEvents[0].args.memo, "weather-api");

    assert.equal(await usdc.read.balanceOf([recipient.account.address]), payAmount);
    assert.equal(await vault.read.availableBalance(), depositAmount - payAmount);
    assert.equal(await vault.read.spentInWindow(), payAmount);
  });

  it("enforces per-transaction, daily, and whitelist policies", async function () {
    const { owner, agent, recipient, stranger, usdc, factory } = await deployProtocol();
    const agentId = keccak256(toBytes("ops-agent-002"));
    const depositAmount = parseUnits("10", 6);

    await usdc.write.mint([owner.account.address, depositAmount]);
    const createHash = await factory.write.createVault([
      agentId,
      agent.account.address,
      parseUnits("3", 6),
      parseUnits("2", 6),
      [recipient.account.address],
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
    const createEvents = await publicClient.getContractEvents({
      address: factory.address,
      abi: factory.abi,
      eventName: "VaultDeployed",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      strict: true,
    });
    const vault = await viem.getContractAt("AgentVault", getAddress(createEvents[0].args.vault));

    await usdc.write.approve([vault.address, depositAmount]);
    await vault.write.deposit([depositAmount]);

    await assert.rejects(
      vault.write.pay([stranger.account.address, parseUnits("1", 6), "blocked"], { account: agent.account }),
      /PolicyRejected/,
    );

    await assert.rejects(
      vault.write.pay([recipient.account.address, parseUnits("2.01", 6), "too-large"], { account: agent.account }),
      /PolicyRejected/,
    );

    await vault.write.pay([recipient.account.address, parseUnits("2", 6), "batch-1"], { account: agent.account });
    await assert.rejects(
      vault.write.pay([recipient.account.address, parseUnits("1.01", 6), "daily-cap"], { account: agent.account }),
      /PolicyRejected/,
    );
  });

  it("only lets the deployment owner create vaults from a factory", async function () {
    const { agent, recipient, stranger, factory } = await deployProtocol();
    const agentId = keccak256(toBytes("blocked-factory-user"));

    await assert.rejects(
      factory.write.createVault(
        [agentId, agent.account.address, parseUnits("3", 6), parseUnits("1", 6), [recipient.account.address]],
        { account: stranger.account },
      ),
      /OwnableUnauthorizedAccount/,
    );
  });

  it("resets daily spending windows after 24 hours", async function () {
    const { owner, agent, recipient, usdc, factory } = await deployProtocol();
    const agentId = keccak256(toBytes("subscription-agent-003"));
    const depositAmount = parseUnits("20", 6);

    await usdc.write.mint([owner.account.address, depositAmount]);
    const createHash = await factory.write.createVault([
      agentId,
      agent.account.address,
      parseUnits("2", 6),
      parseUnits("2", 6),
      [recipient.account.address],
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
    const createEvents = await publicClient.getContractEvents({
      address: factory.address,
      abi: factory.abi,
      eventName: "VaultDeployed",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      strict: true,
    });
    const vault = await viem.getContractAt("AgentVault", getAddress(createEvents[0].args.vault));

    await usdc.write.approve([vault.address, depositAmount]);
    await vault.write.deposit([depositAmount]);
    await vault.write.pay([recipient.account.address, parseUnits("2", 6), "day-1"], { account: agent.account });

    await connection.provider.request({
      method: "evm_increaseTime",
      params: [24 * 60 * 60 + 1],
    });
    await connection.provider.request({ method: "evm_mine", params: [] });

    await vault.write.pay([recipient.account.address, parseUnits("2", 6), "day-2"], { account: agent.account });
    assert.equal(await usdc.read.balanceOf([recipient.account.address]), parseUnits("4", 6));
    assert.equal(await vault.read.spentInWindow(), parseUnits("2", 6));
  });

  it("lets the owner pause, revoke the agent, and recover vault funds", async function () {
    const { owner, agent, recipient, stranger, usdc, factory } = await deployProtocol();
    const agentId = keccak256(toBytes("guarded-agent-004"));
    const depositAmount = parseUnits("10", 6);

    await usdc.write.mint([owner.account.address, depositAmount]);
    const createHash = await factory.write.createVault([
      agentId,
      agent.account.address,
      parseUnits("5", 6),
      parseUnits("5", 6),
      [recipient.account.address],
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
    const createEvents = await publicClient.getContractEvents({
      address: factory.address,
      abi: factory.abi,
      eventName: "VaultDeployed",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      strict: true,
    });
    const vault = await viem.getContractAt("AgentVault", getAddress(createEvents[0].args.vault));

    await usdc.write.approve([vault.address, depositAmount]);
    await vault.write.deposit([depositAmount]);
    await vault.write.pause();

    await assert.rejects(
      vault.write.pay([recipient.account.address, parseUnits("1", 6), "paused"], { account: agent.account }),
      /EnforcedPause/,
    );

    await vault.write.unpause();
    await vault.write.setAgent([stranger.account.address]);

    await assert.rejects(
      vault.write.pay([recipient.account.address, parseUnits("1", 6), "revoked"], { account: agent.account }),
      /OnlyAgent/,
    );

    const before = await usdc.read.balanceOf([owner.account.address]);
    await vault.write.recoverAll([owner.account.address]);

    assert.equal(await vault.read.availableBalance(), 0n);
    assert.equal(await usdc.read.balanceOf([owner.account.address]), before + depositAmount);
  });

  it("escrows and releases agent-to-agent settlement payments", async function () {
    const { owner, payee, usdc, settler } = await deployProtocol();
    const taskId = keccak256(toBytes("task:copywriting:42"));
    const amount = parseUnits("4", 6);

    await usdc.write.mint([owner.account.address, amount]);
    await usdc.write.approve([settler.address, amount]);

    await settler.write.open([taskId, payee.account.address, amount]);
    assert.equal(await usdc.read.balanceOf([settler.address]), amount);

    await settler.write.release([taskId, owner.account.address]);
    assert.equal(await usdc.read.balanceOf([payee.account.address]), amount);
  });

  it("exposes calldata-compatible functions for agent automation", async function () {
    const payCall = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "pay",
          stateMutability: "nonpayable",
          inputs: [
            { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "memo", type: "string" },
          ],
          outputs: [],
        },
      ],
      functionName: "pay",
      args: [zeroAddress, 1n, "api-call"],
    });

    assert.match(payCall, /^0x/);
  });
});
