import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

// Load environment variables for local secrets management
dotenv.config();

const ARC_TESTNET_RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';
const VAULT_CONTRACT_ADDRESS = process.env.VAULT_CONTRACT_ADDRESS || '0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || process.env.PRIVATE_KEY;

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';

const VAULT_ABI = [
    "function getTreasuryBalances(address token) external view returns (uint256 erc20Balance, uint256 nativeGasBalance)",
    "function executeFxTrade(address sellToken, address buyToken, uint256 sellAmount, uint256 minBuyAmount, address recipient) external returns (uint256 buyAmountBought)",
    "function stableFXAddress() external view returns (address)",
    "function isTokenRegistered(address token) external view returns (bool)"
];

const STABLE_FX_ABI = [
    "function getFXQuote(address sellToken, address buyToken, uint256 sellAmount) external view returns (uint256 buyAmount, uint256 rate)"
];

async function main() {
    console.log("=== ATO StableFX Treasury Sweep & Trade Execution Script ===");
    
    if (!AGENT_PRIVATE_KEY) {
        console.error("Error: AGENT_PRIVATE_KEY or PRIVATE_KEY must be set in .env");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC_URL);
    const wallet = new ethers.Wallet(AGENT_PRIVATE_KEY, provider);
    console.log(`Agent Address: ${wallet.address}`);

    const vault = new ethers.Contract(VAULT_CONTRACT_ADDRESS, VAULT_ABI, wallet);

    // 1. Check current balances
    console.log("\n1. Fetching Treasury Balances...");
    try {
        const usdcBal = await vault.getTreasuryBalances(USDC_ADDRESS);
        const eurcBal = await vault.getTreasuryBalances(EURC_ADDRESS);

        console.log(`- USDC Balance: ${ethers.formatUnits(usdcBal.erc20Balance, 6)} USDC`);
        console.log(`- EURC Balance: ${ethers.formatUnits(eurcBal.erc20Balance, 6)} EURC`);
        console.log(`- Native Gas Balance: ${ethers.formatEther(usdcBal.nativeGasBalance)} USDC`);
    } catch (e: any) {
        console.error("Error reading balances. Is the Vault deployed and address correct?", e.message || e);
        return;
    }

    // 2. Fetch StableFX Config
    const fxAddress = await vault.stableFXAddress();
    console.log(`\n2. StableFX Smart Contract Address: ${fxAddress}`);
    if (fxAddress === ethers.ZeroAddress) {
        console.warn("Warning: StableFX address is not set in the Vault. Swaps will fail.");
        return;
    }

    // 3. Query Exchange Rate Quote
    console.log("\n3. Querying FX Quote (USDC -> EURC) for 100.00 USDC...");
    const sellAmount = ethers.parseUnits("100", 6);
    const fxContract = new ethers.Contract(fxAddress, STABLE_FX_ABI, provider);

    try {
        const quote = await fxContract.getFXQuote(USDC_ADDRESS, EURC_ADDRESS, sellAmount);
        console.log(`- Estimated EURC Received: ${ethers.formatUnits(quote.buyAmount, 6)} EURC`);
        console.log(`- Exchange Rate: ${ethers.formatUnits(quote.rate, 18)}`);
        
        // Calculate slippage tolerance limit (e.g. 1% slippage)
        const slippageTolerance = 99n; // 99% of estimated amount
        const minBuyAmount = (quote.buyAmount * slippageTolerance) / 100n;
        console.log(`- Slippage Tolerance Limit (Min Buy Amount): ${ethers.formatUnits(minBuyAmount, 6)} EURC`);

        // 4. Execute Swap Trade
        console.log(`\n4. Initiating FX Trade of ${ethers.formatUnits(sellAmount, 6)} USDC for at least ${ethers.formatUnits(minBuyAmount, 6)} EURC...`);
        const tx = await vault.executeFxTrade(
            USDC_ADDRESS,
            EURC_ADDRESS,
            sellAmount,
            minBuyAmount,
            wallet.address // Send swapped EURC back to the Agent for verification (or Vault address)
        );
        console.log(`- Transaction Hash: ${tx.hash}`);
        console.log("- Waiting for transaction confirmation...");
        const receipt = await tx.wait();
        console.log(`- Trade Executed Successfully in block ${receipt.blockNumber}!`);
    } catch (e: any) {
        console.error("Error executing StableFX trade:", e.message || e);
    }
}

if (require.main === module) {
    main();
}
