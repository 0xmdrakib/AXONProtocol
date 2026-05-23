// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IYieldAdapter} from "../interfaces/IYieldAdapter.sol";

contract MockYieldAdapter is IYieldAdapter {
    using SafeERC20 for IERC20;

    IERC20 private immutable _asset;
    mapping(address owner => uint256 shares) public shareBalance;

    constructor(IERC20 asset_) {
        _asset = asset_;
    }

    function asset() external view returns (address) {
        return address(_asset);
    }

    function deposit(uint256 amount, address owner) external returns (uint256 shares) {
        _asset.safeTransferFrom(msg.sender, address(this), amount);
        shareBalance[owner] += amount;
        return amount;
    }

    function withdraw(uint256 amount, address receiver, address owner) external returns (uint256 assets) {
        shareBalance[owner] -= amount;
        _asset.safeTransfer(receiver, amount);
        return amount;
    }
}
