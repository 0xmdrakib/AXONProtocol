// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IYieldRouter {
    function depositForVault(uint256 amount) external returns (uint256 deposited);
    function redeemForVault(uint256 amount, address receiver) external returns (uint256 redeemed);
    function principalOfVault(address vault) external view returns (uint256);
}
