// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {AgentVault} from "./AgentVault.sol";

contract CCTPReceiver is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public authorizedRelayer;

    event AuthorizedRelayerUpdated(address indexed relayer);
    event CrossChainDepositForwarded(address indexed relayer, address indexed vault, uint256 amount, bytes32 indexed source);

    error NotRelayer();
    error ZeroAddress();

    constructor(IERC20 usdc_, address initialOwner) Ownable(initialOwner) {
        if (address(usdc_) == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }

        usdc = usdc_;
    }

    function setAuthorizedRelayer(address relayer) external onlyOwner {
        authorizedRelayer = relayer;
        emit AuthorizedRelayerUpdated(relayer);
    }

    function forwardToVault(address vault, uint256 amount, bytes32 source) external {
        if (msg.sender != authorizedRelayer) {
            revert NotRelayer();
        }
        if (vault == address(0)) {
            revert ZeroAddress();
        }

        usdc.forceApprove(vault, amount);
        AgentVault(vault).deposit(amount);

        emit CrossChainDepositForwarded(msg.sender, vault, amount, source);
    }
}
