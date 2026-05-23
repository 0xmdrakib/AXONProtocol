// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IYieldAdapter} from "./interfaces/IYieldAdapter.sol";
import {IYieldRouter} from "./interfaces/IYieldRouter.sol";

contract YieldRouter is IYieldRouter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IYieldAdapter public adapter;

    mapping(address vault => uint256 principal) public principalOfVault;

    event AdapterUpdated(address indexed adapter);
    event Deposited(address indexed vault, uint256 amount);
    event Redeemed(address indexed vault, address indexed receiver, uint256 amount);

    error ZeroAmount();
    error InsufficientPrincipal();
    error AdapterAssetMismatch();

    constructor(IERC20 asset_, address initialOwner) Ownable(initialOwner) {
        asset = asset_;
    }

    function setAdapter(IYieldAdapter adapter_) external onlyOwner {
        if (address(adapter_) != address(0) && adapter_.asset() != address(asset)) {
            revert AdapterAssetMismatch();
        }

        adapter = adapter_;
        emit AdapterUpdated(address(adapter_));
    }

    function depositForVault(uint256 amount) external nonReentrant returns (uint256 deposited) {
        if (amount == 0) {
            revert ZeroAmount();
        }

        asset.safeTransferFrom(msg.sender, address(this), amount);
        principalOfVault[msg.sender] += amount;

        if (address(adapter) != address(0)) {
            asset.forceApprove(address(adapter), amount);
            adapter.deposit(amount, msg.sender);
        }

        emit Deposited(msg.sender, amount);
        return amount;
    }

    function redeemForVault(uint256 amount, address receiver) external nonReentrant returns (uint256 redeemed) {
        if (amount == 0) {
            revert ZeroAmount();
        }

        uint256 principal = principalOfVault[msg.sender];
        if (amount > principal) {
            revert InsufficientPrincipal();
        }

        principalOfVault[msg.sender] = principal - amount;

        if (address(adapter) != address(0)) {
            adapter.withdraw(amount, address(this), msg.sender);
        }

        asset.safeTransfer(receiver, amount);
        emit Redeemed(msg.sender, receiver, amount);
        return amount;
    }
}
