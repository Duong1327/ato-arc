// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStableFX
 * @notice Interface for Arc's on-chain foreign exchange (FX) engine.
 * Supports querying currency exchange quotes and executing PvP stablecoin swaps.
 */
interface IStableFX {
    /**
     * @notice Query exchange rate quote for a token pair.
     * @param sellToken Address of the token to sell (e.g. USDC or EURC).
     * @param buyToken Address of the token to buy (e.g. EURC or USDC).
     * @param sellAmount Amount of sellToken (e.g. 6 decimals).
     * @return buyAmount Estimated buyToken received.
     * @return rate The conversion rate scaled to 1e18.
     */
    function getFXQuote(
        address sellToken,
        address buyToken,
        uint256 sellAmount
    ) external view returns (uint256 buyAmount, uint256 rate);

    /**
     * @notice Executed to swap sellToken to buyToken with slippage limits.
     * @param sellToken Address of token being sold.
     * @param buyToken Address of token being bought.
     * @param sellAmount Amount of token being sold.
     * @param minBuyAmount Minimum accepted amount of token being bought (slippage limit).
     * @param recipient Target address to receive the swapped tokens.
     * @return buyAmountBought Actual amount of buyToken received.
     */
    function executeSwap(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minBuyAmount,
        address recipient
    ) external returns (uint256 buyAmountBought);
}
