// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AuditLog} from "./AuditLog.sol";
import {IYieldRouter} from "./interfaces/IYieldRouter.sol";
import {PolicyEngine} from "./PolicyEngine.sol";

contract AgentVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    PolicyEngine public immutable policyEngine;
    IYieldRouter public immutable yieldRouter;
    AuditLog public immutable auditLog;
    bytes32 public immutable agentId;

    address public agent;
    PolicyEngine.Policy public policy;
    uint256 public windowStart;
    uint256 public spentInWindow;

    mapping(address recipient => bool allowed) public whitelistedRecipients;

    event Deposited(address indexed funder, uint256 amount);
    event Paid(address indexed agent, address indexed recipient, uint256 amount, string memo);
    event Withdrawn(address indexed receiver, uint256 amount);
    event RecipientUpdated(address indexed recipient, bool allowed);

    error OnlyAgent();
    error ZeroAddress();
    error PolicyRejected(PolicyEngine.Rejection reason);

    constructor(
        IERC20 usdc_,
        PolicyEngine policyEngine_,
        IYieldRouter yieldRouter_,
        AuditLog auditLog_,
        address owner_,
        address agent_,
        bytes32 agentId_,
        uint256 dailyLimit_,
        uint256 perTransactionLimit_,
        address[] memory initialRecipients_
    ) Ownable(owner_) {
        if (
            address(usdc_) == address(0) || address(policyEngine_) == address(0) || address(yieldRouter_) == address(0)
                || address(auditLog_) == address(0) || owner_ == address(0)
        ) {
            revert ZeroAddress();
        }

        usdc = usdc_;
        policyEngine = policyEngine_;
        yieldRouter = yieldRouter_;
        auditLog = auditLog_;
        agent = agent_;
        agentId = agentId_;
        policy = PolicyEngine.Policy({
            dailyLimit: dailyLimit_,
            perTransactionLimit: perTransactionLimit_,
            requireWhitelist: true
        });
        windowStart = policyEngine_.currentWindowStart(block.timestamp);

        for (uint256 i = 0; i < initialRecipients_.length; i++) {
            whitelistedRecipients[initialRecipients_[i]] = true;
            emit RecipientUpdated(initialRecipients_[i], true);
        }
    }

    modifier onlyAgent() {
        if (msg.sender != agent) {
            revert OnlyAgent();
        }
        _;
    }

    function deposit(uint256 amount) external nonReentrant {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        usdc.forceApprove(address(yieldRouter), amount);
        yieldRouter.depositForVault(amount);

        emit Deposited(msg.sender, amount);
    }

    function pay(address recipient, uint256 amount, string calldata memo) external onlyAgent whenNotPaused nonReentrant {
        _rollWindow();

        PolicyEngine.Rejection reason =
            policyEngine.evaluate(policy, whitelistedRecipients[recipient], spentInWindow, amount);
        if (reason != PolicyEngine.Rejection.None) {
            revert PolicyRejected(reason);
        }

        spentInWindow += amount;
        yieldRouter.redeemForVault(amount, address(this));
        usdc.safeTransfer(recipient, amount);

        auditLog.logPayment(agentId, address(this), recipient, amount, memo);
        emit Paid(msg.sender, recipient, amount, memo);
    }

    function withdraw(uint256 amount, address receiver) external onlyOwner nonReentrant {
        if (receiver == address(0)) {
            revert ZeroAddress();
        }

        yieldRouter.redeemForVault(amount, address(this));
        usdc.safeTransfer(receiver, amount);

        emit Withdrawn(receiver, amount);
    }

    function recoverAll(address receiver) external onlyOwner nonReentrant {
        if (receiver == address(0)) {
            revert ZeroAddress();
        }

        uint256 amount = availableBalance();
        if (amount > 0) {
            yieldRouter.redeemForVault(amount, address(this));
            usdc.safeTransfer(receiver, amount);
            emit Withdrawn(receiver, amount);
        }
    }

    function setPolicy(uint256 dailyLimit, uint256 perTransactionLimit, bool requireWhitelist) external onlyOwner {
        policy = PolicyEngine.Policy({
            dailyLimit: dailyLimit,
            perTransactionLimit: perTransactionLimit,
            requireWhitelist: requireWhitelist
        });

        auditLog.logPolicyUpdated(agentId, address(this), dailyLimit, perTransactionLimit, requireWhitelist);
    }

    function setRecipient(address recipient, bool allowed) external onlyOwner {
        whitelistedRecipients[recipient] = allowed;
        emit RecipientUpdated(recipient, allowed);
    }

    function setAgent(address nextAgent) external onlyOwner {
        agent = nextAgent;
        auditLog.logAgentUpdated(agentId, address(this), nextAgent);
    }

    function pause() external onlyOwner {
        _pause();
        auditLog.logVaultState(agentId, address(this), true);
    }

    function unpause() external onlyOwner {
        _unpause();
        auditLog.logVaultState(agentId, address(this), false);
    }

    function availableBalance() public view returns (uint256) {
        return yieldRouter.principalOfVault(address(this));
    }

    function _rollWindow() private {
        uint256 current = policyEngine.currentWindowStart(block.timestamp);
        if (current > windowStart) {
            windowStart = current;
            spentInWindow = 0;
        }
    }
}
