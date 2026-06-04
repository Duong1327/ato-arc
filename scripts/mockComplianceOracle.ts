import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const ARC_TESTNET_RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function main() {
    console.log("===============================================================");
    console.log("          DEPLOYING MOCK COMPLIANCE ORACLE TO ARC L1          ");
    console.log("===============================================================");

    if (!PRIVATE_KEY) {
        console.error("FATAL ERROR: PRIVATE_KEY environment variable is not defined!");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const artifactPath = path.join(__dirname, '../artifacts/contracts/MockComplianceOracle.sol/MockComplianceOracle.json');
    
    if (!fs.existsSync(artifactPath)) {
        console.error(`Artifact not found at ${artifactPath}. Please run 'npx hardhat compile' first.`);
        process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    console.log(`Deploying MockComplianceOracle with signer: ${await wallet.getAddress()}`);
    const oracle = await factory.deploy();
    
    console.log("Waiting for confirmation...");
    await oracle.waitForDeployment();
    
    const deployedAddress = await oracle.getAddress();
    console.log("\n===============================================================");
    console.log("Mock Compliance Oracle successfully deployed!");
    console.log(`Address: ${deployedAddress}`);
    console.log("===============================================================\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
