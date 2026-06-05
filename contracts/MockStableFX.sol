// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IStableFX.sol";

interface IERC20Local {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function mint(address account, uint256 amount) external;
}

/**
 * @title MockStableFX
 * @notice A simulated on-chain StableFX trading contract for testing USDC/EURC swaps.
 */
contract MockStableFX is IStableFX {
    uint256 public constant FIXED_RATE = 1.08 * 1e18; // 1 EUR = 1.08 USD (or vice versa)

    /**
     * @notice Query exchange rate quote for a token pair.
     */
    function getFXQuote(
        address sellToken,
        address buyToken,
        uint256 sellAmount
    ) external pure override returns (uint256 buyAmount, uint256 rate) {
        rate = FIXED_RATE;
        // Simple conversion: buyAmount = sellAmount * rate / 1e18
        buyAmount = (sellAmount * rate) / 1e18;
    }

    /**
     * @notice Swap tokens. Pulls sellToken from vault and sends/mints buyToken to recipient.
     */
    function executeSwap(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minBuyAmount,
        address recipient
    ) external override returns (uint256 buyAmountBought) {
        uint256 rate = FIXED_RATE;
        buyAmountBought = (sellAmount * rate) / 1e18;

        require(buyAmountBought >= minBuyAmount, "MockStableFX: Slippage limit exceeded");

        // Pull sellToken from the caller (the Vault)
        bool successSell = IERC20Local(sellToken).transferFrom(msg.sender, address(this), sellAmount);
        require(successSell, "MockStableFX: Transfer from caller failed");

        // Mint or transfer buyToken to recipient
        // We attempt to mint if possible (since MockERC20 supports minting), otherwise do a transfer
        try IERC20Local(buyToken).mint(recipient, buyAmountBought) {
            // Minted successfully
        } catch {
            bool successBuy = IERC20Local(buyToken).transfer(recipient, buyAmountBought);
            require(successBuy, "MockStableFX: Transfer to recipient failed");
        }
    }
}
