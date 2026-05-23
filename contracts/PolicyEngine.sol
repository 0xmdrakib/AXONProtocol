// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract PolicyEngine {
    enum Rejection {
        None,
        ZeroAmount,
        RecipientNotWhitelisted,
        PerTransactionLimitExceeded,
        DailyLimitExceeded
    }

    struct Policy {
        uint256 dailyLimit;
        uint256 perTransactionLimit;
        bool requireWhitelist;
    }

    function evaluate(
        Policy calldata policy,
        bool recipientWhitelisted,
        uint256 spentInWindow,
        uint256 amount
    ) external pure returns (Rejection) {
        if (amount == 0) {
            return Rejection.ZeroAmount;
        }

        if (policy.requireWhitelist && !recipientWhitelisted) {
            return Rejection.RecipientNotWhitelisted;
        }

        if (policy.perTransactionLimit > 0 && amount > policy.perTransactionLimit) {
            return Rejection.PerTransactionLimitExceeded;
        }

        if (policy.dailyLimit > 0 && spentInWindow + amount > policy.dailyLimit) {
            return Rejection.DailyLimitExceeded;
        }

        return Rejection.None;
    }

    function currentWindowStart(uint256 timestamp) external pure returns (uint256) {
        return (timestamp / 1 days) * 1 days;
    }
}
