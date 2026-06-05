// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IGateway.sol";

interface IERC20Local {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

/**
 * @title MockGateway
 * @notice Mock implementation of on-chain Circle Gateway payment channels.
 */
contract MockGateway is IGateway {
    address public immutable usdc;
    mapping(bytes32 => Channel) public channels;
    uint256 public nextNonce;

    constructor(address _usdc) {
        usdc = _usdc;
    }

    function openChannel(address seller, uint256 deposit, uint256 duration) external override returns (bytes32) {
        bytes32 channelId = keccak256(abi.encodePacked(msg.sender, seller, nextNonce++));
        
        if (deposit > 0) {
            require(IERC20Local(usdc).transferFrom(msg.sender, address(this), deposit), "MockGateway: Transfer failed");
        }

        channels[channelId] = Channel({
            buyer: msg.sender,
            seller: seller,
            balance: deposit,
            nonce: 0,
            expiration: block.timestamp + duration,
            isOpen: true
        });

        emit ChannelOpened(channelId, msg.sender, seller, deposit);
        return channelId;
    }

    function fundChannel(bytes32 channelId, uint256 amount) external override {
        Channel storage ch = channels[channelId];
        require(ch.isOpen, "MockGateway: Channel is not open");
        
        require(IERC20Local(usdc).transferFrom(msg.sender, address(this), amount), "MockGateway: Transfer failed");
        ch.balance += amount;

        emit ChannelFunded(channelId, amount);
    }

    function settleChannel(
        bytes32 channelId,
        uint256 finalBalance,
        uint256 paymentAmount,
        bytes calldata signature
    ) external override {
        Channel storage ch = channels[channelId];
        require(ch.isOpen, "MockGateway: Channel is not open");
        require(msg.sender == ch.seller || msg.sender == ch.buyer, "MockGateway: Unauthorized caller");
        require(paymentAmount <= ch.balance, "MockGateway: Insufficient channel balance");

        ch.balance -= paymentAmount;
        ch.isOpen = false;

        require(IERC20Local(usdc).transfer(ch.seller, paymentAmount), "MockGateway: Payout failed");
        if (ch.balance > 0) {
            require(IERC20Local(usdc).transfer(ch.buyer, ch.balance), "MockGateway: Refund failed");
        }

        emit ChannelSettled(channelId, finalBalance, paymentAmount);
    }

    function claimTimeout(bytes32 channelId) external override {
        Channel storage ch = channels[channelId];
        require(ch.isOpen, "MockGateway: Channel is not open");
        require(block.timestamp >= ch.expiration, "MockGateway: Expiration has not passed");

        ch.isOpen = false;
        uint256 refundAmount = ch.balance;
        ch.balance = 0;

        require(IERC20Local(usdc).transfer(ch.buyer, refundAmount), "MockGateway: Refund failed");
        emit ChannelClosed(channelId);
    }

    function getChannel(bytes32 channelId) external view override returns (Channel memory) {
        return channels[channelId];
    }
}
