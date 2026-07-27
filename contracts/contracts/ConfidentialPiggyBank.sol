// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    Nox,
    euint256,
    externalEuint256,
    ebool
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/**
 * @title ConfidentialPiggyBank
 * @notice M0 toolchain-validation contract (Nox "Hello World" equivalent).
 *
 * Anyone can deposit an encrypted amount; the running total stays encrypted
 * on-chain as a handle. Only the owner (and the contract itself) are granted
 * ACL access to the balance handle, so only the owner can decrypt the total
 * off-chain via the Handle Gateway.
 */
contract ConfidentialPiggyBank {
    address public immutable owner;
    euint256 private _balance;

    event Deposited(address indexed from);

    constructor() {
        owner = msg.sender;
        // Encrypted state has no default value: initialize explicitly.
        // toEuint256(0) yields a public (trivially-encrypted) handle, so ACL
        // grants are skipped internally until the first confidential deposit.
        _balance = Nox.toEuint256(0);
        Nox.allowThis(_balance);
        Nox.allow(_balance, msg.sender);
    }

    /**
     * @param amountHandle Encrypted amount produced off-chain by the Handle SDK.
     * @param amountProof  Gateway proof binding the handle to this contract and sender.
     */
    function deposit(externalEuint256 amountHandle, bytes calldata amountProof) external {
        euint256 amount = Nox.fromExternal(amountHandle, amountProof);

        // safeAdd + select: on overflow keep the previous balance instead of
        // reverting, so the failure path leaks nothing about the balance.
        (ebool ok, euint256 updated) = Nox.safeAdd(_balance, amount);
        _balance = Nox.select(ok, updated, _balance);

        // ACL grants MUST happen before returning: transient access to the new
        // handle is cleared at end-of-tx and the handle would become unusable.
        Nox.allowThis(_balance);
        Nox.allow(_balance, owner);

        emit Deposited(msg.sender);
    }

    /// @notice Returns the encrypted balance handle (decryptable off-chain by the owner only).
    function balanceHandle() external view returns (euint256) {
        return _balance;
    }
}
