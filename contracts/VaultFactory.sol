// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {AgentVault} from "./AgentVault.sol";
import {AuditLog} from "./AuditLog.sol";
import {IYieldRouter} from "./interfaces/IYieldRouter.sol";
import {PolicyEngine} from "./PolicyEngine.sol";

contract VaultFactory is Ownable {
    IERC20 public immutable usdc;
    PolicyEngine public immutable policyEngine;
    IYieldRouter public immutable yieldRouter;
    AuditLog public immutable auditLog;
    uint256 public vaultCount;

    mapping(bytes32 agentId => address vault) public vaultOfAgent;
    mapping(address owner => address[] vaults) private _vaultsByOwner;

    event VaultDeployed(bytes32 indexed agentId, address indexed owner, address indexed vault, address agent);

    error AgentIdAlreadyUsed();
    error ZeroAddress();

    constructor(
        IERC20 usdc_,
        PolicyEngine policyEngine_,
        IYieldRouter yieldRouter_,
        AuditLog auditLog_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            address(usdc_) == address(0) || address(policyEngine_) == address(0) || address(yieldRouter_) == address(0)
                || address(auditLog_) == address(0) || initialOwner == address(0)
        ) {
            revert ZeroAddress();
        }

        usdc = usdc_;
        policyEngine = policyEngine_;
        yieldRouter = yieldRouter_;
        auditLog = auditLog_;
    }

    function createVault(
        bytes32 agentId,
        address agent,
        uint256 dailyLimit,
        uint256 perTransactionLimit,
        address[] calldata initialRecipients
    ) external onlyOwner returns (address vault) {
        if (vaultOfAgent[agentId] != address(0)) {
            revert AgentIdAlreadyUsed();
        }

        AgentVault agentVault = new AgentVault(
            usdc,
            policyEngine,
            yieldRouter,
            auditLog,
            msg.sender,
            agent,
            agentId,
            dailyLimit,
            perTransactionLimit,
            initialRecipients
        );

        vault = address(agentVault);
        vaultOfAgent[agentId] = vault;
        _vaultsByOwner[msg.sender].push(vault);
        vaultCount++;

        auditLog.registerWriter(vault);
        auditLog.logVaultCreated(agentId, msg.sender, vault, agent);

        emit VaultDeployed(agentId, msg.sender, vault, agent);
    }

    function vaultsByOwner(address owner) external view returns (address[] memory) {
        return _vaultsByOwner[owner];
    }
}
