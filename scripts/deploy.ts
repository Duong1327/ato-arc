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
    const oracleArtifactPath = path.join(__dirname, '../artifacts/contracts/MockComplianceOracle.sol/MockComplianceOracle.json');
    const registryArtifactPath = path.join(__dirname, '../artifacts/contracts/ERC8004Registry.sol/ERC8004Registry.json');
    let abi: any;
    let bytecode: string;
    let oracleAbi: any;
    let oracleBytecode: string;
    let registryAbi: any;
    let registryBytecode: string;

    if (fs.existsSync(artifactPath) && fs.existsSync(oracleArtifactPath) && fs.existsSync(registryArtifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        abi = artifact.abi;
        bytecode = artifact.bytecode;
        const oracleArtifact = JSON.parse(fs.readFileSync(oracleArtifactPath, 'utf8'));
        oracleAbi = oracleArtifact.abi;
        oracleBytecode = oracleArtifact.bytecode;
        const registryArtifact = JSON.parse(fs.readFileSync(registryArtifactPath, 'utf8'));
        registryAbi = registryArtifact.abi;
        registryBytecode = registryArtifact.bytecode;
        console.log(`[Artifact Loader] Successfully loaded compilation artifacts for Vault, Oracle, and Registry.`);
    } else {
        console.warn(`[Artifact Loader] Hardhat artifacts not found.`);
        console.log(">>> Please compile the contracts using 'npx hardhat compile' before running this script.");
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

    console.log(`\n[Deployment Process] Broadcasting deployment transactions to Arc L1...`);

    try {
        // Deploy Mock Compliance Oracle first
        console.log(`[Deployment Process] Deploying Mock Compliance Oracle...`);
        const oracleFactory = new ethers.ContractFactory(oracleAbi, oracleBytecode, deployerWallet);
        const oracleContract = await oracleFactory.deploy();
        await oracleContract.waitForDeployment();
        const oracleDeployedAddress = await oracleContract.getAddress();
        console.log(`Mock Compliance Oracle deployed at: ${oracleDeployedAddress}`);

        // Deploy ERC-8004 Agent Registry
        console.log(`[Deployment Process] Deploying ERC-8004 Agent Registry...`);
        const registryFactory = new ethers.ContractFactory(registryAbi, registryBytecode, deployerWallet);
        const registryContract = await registryFactory.deploy();
        await registryContract.waitForDeployment();
        const registryDeployedAddress = await registryContract.getAddress();
        console.log(`ERC-8004 Registry deployed at: ${registryDeployedAddress}`);

        // Deploy Vault
        console.log(`[Deployment Process] Deploying ATO Enterprise Vault...`);
        const factory = new ethers.ContractFactory(abi, bytecode, deployerWallet);
        const contract = await factory.deploy(initialOwners, requiredSignatures, agentLimitERC20);
        await contract.waitForDeployment();
        const deployedAddress = await contract.getAddress();
        
        console.log(`[Deployment Process] Registering compliance oracle in Vault...`);
        const vaultContract = new ethers.Contract(deployedAddress, abi, deployerWallet);
        const tx = await vaultContract.setComplianceOracleAddress(oracleDeployedAddress);
        await tx.wait();
        console.log(`Compliance Oracle address successfully registered in the Vault!`);

        console.log(`[Deployment Process] Registering Agent Registry in Vault...`);
        const regTx = await vaultContract.setAgentRegistryAddress(registryDeployedAddress);
        await regTx.wait();
        console.log(`Agent Registry address successfully registered in the Vault!`);

        console.log(`\n===============================================================`);
        console.log(`SUCCESS: ATO Smart Contracts successfully deployed on Arc L1!`);
        console.log(`===============================================================`);
        console.log(`  - Vault Address: ${deployedAddress}`);
        console.log(`  - Oracle Address: ${oracleDeployedAddress}`);
        console.log(`  - Registry Address: ${registryDeployedAddress}`);
        console.log(`  - Transaction Hash: ${contract.deploymentTransaction()?.hash}`);
        console.log(`  - Explorer Link: https://testnet.arcscan.app/address/${deployedAddress}`);
        console.log(`===============================================================\n`);

        // 4. Run Smoke Tests & Verification
        console.log(`[Smoke Testing] Verifying contract utilities on-chain...`);

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
        console.log(`VAULT_CONTRACT_ADDRESS=${deployedAddress}`);
        console.log(`REGISTRY_CONTRACT_ADDRESS=${registryDeployedAddress}\n`);

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
