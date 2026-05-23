// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IYieldAdapter {
    function asset() external view returns (address);
    function deposit(uint256 amount, address owner) external returns (uint256 shares);
    function withdraw(uint256 amount, address receiver, address owner) external returns (uint256 assets);
}
