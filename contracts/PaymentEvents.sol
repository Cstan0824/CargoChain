// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title CargoChain payment event surface
/// @notice Shared payment events used by DeliveryEscrow and queried by the frontend.
/// @dev Events provide transaction history without storing an ever-growing array on-chain.
abstract contract PaymentEvents {
    event EscrowFunded(uint256 indexed requestId, uint256 amount);

    event PaymentReleased(
        uint256 indexed requestId,
        uint256 indexed milestoneId,
        uint256 amount,
        address indexed recipient
    );

    event RefundIssued(uint256 indexed requestId, address indexed to, uint256 amount);
}
