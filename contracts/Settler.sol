// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {AuditLog} from "./AuditLog.sol";

contract Settler is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    AuditLog public immutable auditLog;

    struct Settlement {
        address payer;
        address payee;
        uint256 amount;
        bool released;
        bool cancelled;
    }

    mapping(bytes32 taskId => Settlement settlement) public settlements;

    event SettlementOpened(bytes32 indexed taskId, address indexed payer, address indexed payee, uint256 amount);
    event SettlementReleased(bytes32 indexed taskId, address indexed payee, uint256 amount);
    event SettlementCancelled(bytes32 indexed taskId, address indexed payer, uint256 amount);

    error ZeroAddress();
    error AlreadyExists();
    error NotPayer();
    error NotOpen();
    error NotCancelable();

    constructor(IERC20 usdc_, AuditLog auditLog_, address initialOwner) Ownable(initialOwner) {
        if (address(usdc_) == address(0) || address(auditLog_) == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }

        usdc = usdc_;
        auditLog = auditLog_;
    }

    function open(bytes32 taskId, address payee, uint256 amount) external nonReentrant {
        if (payee == address(0)) {
            revert ZeroAddress();
        }

        Settlement storage settlement = settlements[taskId];
        if (settlement.payer != address(0)) {
            revert AlreadyExists();
        }

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        settlement.payer = msg.sender;
        settlement.payee = payee;
        settlement.amount = amount;

        auditLog.logSettlementOpened(taskId, msg.sender, payee, amount);
        emit SettlementOpened(taskId, msg.sender, payee, amount);
    }

    function release(bytes32 taskId, address payer) external onlyOwner nonReentrant {
        Settlement storage settlement = settlements[taskId];
        if (settlement.payer != payer || settlement.released || settlement.cancelled) {
            revert NotOpen();
        }

        settlement.released = true;
        usdc.safeTransfer(settlement.payee, settlement.amount);

        auditLog.logSettlementReleased(taskId, settlement.payee, settlement.amount);
        emit SettlementReleased(taskId, settlement.payee, settlement.amount);
    }

    function cancel(bytes32 taskId) external nonReentrant {
        Settlement storage settlement = settlements[taskId];
        if (settlement.payer != msg.sender || settlement.released || settlement.cancelled) {
            revert NotPayer();
        }

        settlement.cancelled = true;
        usdc.safeTransfer(settlement.payer, settlement.amount);

        auditLog.logSettlementCancelled(taskId, settlement.payer, settlement.amount);
        emit SettlementCancelled(taskId, settlement.payer, settlement.amount);
    }
}
