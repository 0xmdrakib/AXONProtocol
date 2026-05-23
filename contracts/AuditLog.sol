// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AuditLog is Ownable {
    mapping(address writer => bool enabled) public authorizedWriters;
    mapping(address factory => bool enabled) public authorizedFactories;

    event WriterUpdated(address indexed writer, bool enabled);
    event FactoryUpdated(address indexed factory, bool enabled);
    event VaultCreated(
        bytes32 indexed agentId,
        address indexed owner,
        address indexed vault,
        address agent,
        uint256 timestamp
    );
    event PolicyUpdated(
        bytes32 indexed agentId,
        address indexed vault,
        uint256 dailyLimit,
        uint256 perTransactionLimit,
        bool requireWhitelist,
        uint256 timestamp
    );
    event PaymentLogged(
        bytes32 indexed agentId,
        address indexed vault,
        address indexed recipient,
        uint256 amount,
        string memo,
        uint256 timestamp
    );
    event VaultStateChanged(bytes32 indexed agentId, address indexed vault, bool paused, uint256 timestamp);
    event AgentUpdated(bytes32 indexed agentId, address indexed vault, address indexed agent, uint256 timestamp);
    event SettlementOpened(bytes32 indexed taskId, address indexed payer, address indexed payee, uint256 amount);
    event SettlementReleased(bytes32 indexed taskId, address indexed payee, uint256 amount);
    event SettlementCancelled(bytes32 indexed taskId, address indexed payer, uint256 amount);

    error NotAuthorized();

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyWriter() {
        if (!authorizedWriters[msg.sender]) {
            revert NotAuthorized();
        }
        _;
    }

    modifier onlyFactory() {
        if (!authorizedFactories[msg.sender]) {
            revert NotAuthorized();
        }
        _;
    }

    function setWriter(address writer, bool enabled) external onlyOwner {
        authorizedWriters[writer] = enabled;
        emit WriterUpdated(writer, enabled);
    }

    function setFactory(address factory, bool enabled) external onlyOwner {
        authorizedFactories[factory] = enabled;
        emit FactoryUpdated(factory, enabled);
    }

    function registerWriter(address writer) external onlyFactory {
        authorizedWriters[writer] = true;
        emit WriterUpdated(writer, true);
    }

    function logVaultCreated(bytes32 agentId, address owner, address vault, address agent) external onlyFactory {
        emit VaultCreated(agentId, owner, vault, agent, block.timestamp);
    }

    function logPolicyUpdated(
        bytes32 agentId,
        address vault,
        uint256 dailyLimit,
        uint256 perTransactionLimit,
        bool requireWhitelist
    ) external onlyWriter {
        emit PolicyUpdated(agentId, vault, dailyLimit, perTransactionLimit, requireWhitelist, block.timestamp);
    }

    function logPayment(bytes32 agentId, address vault, address recipient, uint256 amount, string calldata memo)
        external
        onlyWriter
    {
        emit PaymentLogged(agentId, vault, recipient, amount, memo, block.timestamp);
    }

    function logVaultState(bytes32 agentId, address vault, bool paused) external onlyWriter {
        emit VaultStateChanged(agentId, vault, paused, block.timestamp);
    }

    function logAgentUpdated(bytes32 agentId, address vault, address agent) external onlyWriter {
        emit AgentUpdated(agentId, vault, agent, block.timestamp);
    }

    function logSettlementOpened(bytes32 taskId, address payer, address payee, uint256 amount) external onlyWriter {
        emit SettlementOpened(taskId, payer, payee, amount);
    }

    function logSettlementReleased(bytes32 taskId, address payee, uint256 amount) external onlyWriter {
        emit SettlementReleased(taskId, payee, amount);
    }

    function logSettlementCancelled(bytes32 taskId, address payer, uint256 amount) external onlyWriter {
        emit SettlementCancelled(taskId, payer, amount);
    }
}
