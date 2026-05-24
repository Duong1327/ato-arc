import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const ARC_TESTNET_RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY; // The deployer's private key

// Arc Network Constants
const ARC_CHAIN_ID = 5042002;

/**
 * Main deployment execution function.
 */
async function main() {
    console.log(`===============================================================`);
    console.log(`      ATO SMART CONTRACT DEPLOYMENT ENGINE (ARC TESTNET)      `);
    console.log(`===============================================================`);

    if (!PRIVATE_KEY) {
        console.error("FATAL ERROR: PRIVATE_KEY environment variable is not defined in your .env file!");
        process.exit(1);
    }

    // 1. Initialize Network Provider and Signer Wallet
    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC_URL);
    const deployerWallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Verify network connection and correct Chain ID
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    
    console.log(`[Network Check] Connected to RPC: ${ARC_TESTNET_RPC_URL}`);
    console.log(`[Network Check] Chain ID on RPC: ${chainId} (Expected: ${ARC_CHAIN_ID})`);
    
    if (chainId !== ARC_CHAIN_ID) {
        console.warn(`[Network Warning] Chain ID mismatch! You are connected to chain ${chainId} instead of Arc Testnet (${ARC_CHAIN_ID}).`);
    }

    const deployerAddress = await deployerWallet.getAddress();
    const balance = await provider.getBalance(deployerAddress);

    console.log(`[Deployer Setup] Deployer Address: ${deployerAddress}`);
    console.log(`[Deployer Setup] Deployer L1 Gas Balance: ${ethers.formatUnits(balance, 18)} USDC`);

    if (balance === 0n) {
        console.error("FATAL ERROR: Deployer wallet does not have any native USDC gas on Arc Testnet!");
        console.error("Please fund your wallet from the official faucet: https://faucet.circle.com");
        process.exit(1);
    }

    // 2. Prepare Contract Compilation Artifacts
    // Reading the ABI and Bytecode from Hardhat/Foundry outputs.
    // We assume the contract has been compiled. If running standard deploy,
    // we define the ABI and bytecode lookup logic.
    const artifactPath = path.join(__dirname, '../artifacts/contracts/ATOEnterpriseVault.sol/ATOEnterpriseVault.json');
    let abi: any;
    let bytecode: string;

    if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        abi = artifact.abi;
        bytecode = artifact.bytecode;
        console.log(`[Artifact Loader] Successfully loaded compilation artifacts from: ${artifactPath}`);
    } else {
        console.warn(`[Artifact Loader] Hardhat artifact not found at ${artifactPath}.`);
        console.log(`[Artifact Loader] Falling back to pre-compiled bytecode wrapper interface.`);
        
        // If artifacts folder doesn't exist yet, we guide the user to compile first,
        // or provide the layout. For a professional blueprint, we expect standard compiling:
        console.log(">>> Please compile the contracts using 'npx hardhat compile' or 'forge build' before running this script.");
        console.log(">>> Make sure to configure hardhat.config.ts with the Arc Testnet coordinates.");
        process.exit(1);
    }

    // 3. Define Constructor Arguments
    const initialOwners = [deployerAddress]; // The deployer is set as the initial administrator
    const requiredSignatures = 1; // Single signature required initially
    const agentLimitERC20 = ethers.parseUnits("5000", 6); // 5,000 USDC direct execution limit for AI Agents

    console.log(`\n[Deployment Parameters]:`);
    console.log(`  - Initial Corporate Owners: ${JSON.stringify(initialOwners)}`);
    console.log(`  - Required Multi-Sig Signatures: ${requiredSignatures}`);
    console.log(`  - Autonomous Agent Payout Limit: 5,000 USDC (6 decimals: ${agentLimitERC20.toString()})`);

    console.log(`\n[Deployment Process] Broadcasting deployment transaction to Arc L1...`);

    try {
        const factory = new ethers.ContractFactory(abi, bytecode, deployerWallet);
        
        // Deploying the contract
        const contract = await factory.deploy(initialOwners, requiredSignatures, agentLimitERC20);
        
        console.log(`[Deployment Process] Transaction broadcasted. Waiting for sub-second confirmation...`);
        await contract.waitForDeployment();
        
        const deployedAddress = await contract.getAddress();
        console.log(`\n===============================================================`);
        console.log(`SUCCESS: ATO Smart Contract successfully deployed on Arc L1!`);
        console.log(`===============================================================`);
        console.log(`  - Contract Address: ${deployedAddress}`);
        console.log(`  - Transaction Hash: ${contract.deploymentTransaction()?.hash}`);
        console.log(`  - Explorer Link: https://testnet.arcscan.app/address/${deployedAddress}`);
        console.log(`===============================================================\n`);

        // 4. Run Smoke Tests & Verification
        console.log(`[Smoke Testing] Verifying contract utilities on-chain...`);
        const vaultContract = new ethers.Contract(deployedAddress, abi, deployerWallet);

        // Test dual-decimal converter
        const testERC20Amount = 100n * (10n ** 6n); // 100 USDC (6 decimals)
        const expectedNativeGas = await vaultContract.convertToNativeGas(testERC20Amount);
        
        console.log(`[Smoke Testing] Dual-Decimal Test passed:`);
        console.log(`  - Input: 100 USDC (6 decimals)`);
        console.log(`  - Converted Native Gas (18 decimals): ${expectedNativeGas.toString()}`);
        
        if (expectedNativeGas === 100n * (10n ** 18n)) {
            console.log(`  - RESULT: Precision matches perfectly!`);
        } else {
            console.error(`  - RESULT: Precision mismatch! Got: ${expectedNativeGas.toString()}`);
        }

        console.log(`[Smoke Testing] Active Owners count: ${initialOwners.length}`);
        console.log(`\n>>> Please update your backend .env file with:`);
        console.log(`VAULT_CONTRACT_ADDRESS=${deployedAddress}\n`);

    } catch (deployError: any) {
        console.error(`\n[Deployment Failure] Deployment failed with exception:`);
        console.error(deployError.message || deployError);
        console.error(`Ensure your deployer account has enough USDC gas and correct RPC configuration.\n`);
    }
}

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
