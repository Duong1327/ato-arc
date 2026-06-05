// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGateway
 * @notice Interface for Circle Gateway nanopayment channel/escrow contracts.
 */
interface IGateway {
    struct Channel {
        address buyer;
        address seller;
        uint256 balance;
        uint256 nonce;
        uint256 expiration;
        bool isOpen;
    }

    event ChannelOpened(bytes32 indexed channelId, address indexed buyer, address indexed seller, uint256 deposit);
    event ChannelFunded(bytes32 indexed channelId, uint256 amount);
    event ChannelSettled(bytes32 indexed channelId, uint256 finalBalance, uint256 amountPaid);
    event ChannelClosed(bytes32 indexed channelId);

    function openChannel(address seller, uint256 deposit, uint256 duration) external returns (bytes32);
    function fundChannel(bytes32 channelId, uint256 amount) external;
    function settleChannel(
        bytes32 channelId,
        uint256 finalBalance,
        uint256 paymentAmount,
        bytes calldata signature
    ) external;
    function claimTimeout(bytes32 channelId) external;
    function getChannel(bytes32 channelId) external view returns (Channel memory);
}
