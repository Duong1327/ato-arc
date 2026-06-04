import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const ARC_TESTNET_RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const VAULT_CONTRACT_ADDRESS = process.env.VAULT_CONTRACT_ADDRESS;
const REGISTRY_CONTRACT_ADDRESS = process.env.REGISTRY_CONTRACT_ADDRESS;

async function main() {
    console.log(`===============================================================`);
    console.log(`        ATO ERC-8004 AGENT REGISTRATION AGENT SYSTEM         `);
    console.log(`===============================================================`);

    if (!PRIVATE_KEY) {
        console.error("PRIVATE_KEY is not configured.");
        process.exit(1);
    }
    if (!VAULT_CONTRACT_ADDRESS) {
        console.error("VAULT_CONTRACT_ADDRESS is not configured in .env.");
        process.exit(1);
    }
    if (!REGISTRY_CONTRACT_ADDRESS) {
        console.error("REGISTRY_CONTRACT_ADDRESS is not configured in .env.");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Setup contract instances
    const registryAbi = [
        "function registerAgent(address agentAddress, string calldata agentURI, uint256 initialReputation) external returns (uint256)",
        "function isAgentRegistered(address agent) external view returns (bool)",
        "function getAgentId(address agent) external view returns (uint256)"
    ];

    const vaultAbi = [
        "function setAgentRegistryAddress(address newRegistry) external",
        "function agentRegistryAddress() external view returns (address)"
    ];

    const registry = new ethers.Contract(REGISTRY_CONTRACT_ADDRESS, registryAbi, wallet);
    const vault = new ethers.Contract(VAULT_CONTRACT_ADDRESS, vaultAbi, wallet);

    // Update Registry Address in Vault
    console.log(`Checking registered registry address in Vault...`);
    const currentRegistry = await vault.agentRegistryAddress();
    if (currentRegistry.toLowerCase() !== REGISTRY_CONTRACT_ADDRESS.toLowerCase()) {
        console.log(`Registering ERC-8004 Registry in Vault at ${REGISTRY_CONTRACT_ADDRESS}...`);
        const tx = await vault.setAgentRegistryAddress(REGISTRY_CONTRACT_ADDRESS);
        await tx.wait();
        console.log(`Registry configured in Vault!`);
    } else {
        console.log(`Registry already configured in Vault.`);
    }

    // Mock agent addresses to register:
    // 1. Auditor agent: derive from a dummy address or use deployer address
    // 2. Risk Officer agent: dummy address
    // 3. Allocator agent: dummy address or agent private key address
    const agentPrivateKey = process.env.AGENT_PRIVATE_KEY || PRIVATE_KEY;
    const agentWallet = new ethers.Wallet(agentPrivateKey);
    const agentAddress = agentWallet.address;

    const agentsToRegister = [
        {
            address: agentAddress,
            role: "Allocator Agent",
            uri: "ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/allocator.json"
        },
        {
            address: "0x1111111111111111111111111111111111111111",
            role: "Auditor Agent",
            uri: "ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/auditor.json"
        },
        {
            address: "0x2222222222222222222222222222222222222222",
            role: "Risk Officer Agent",
            uri: "ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/riskofficer.json"
        }
    ];

    for (const agent of agentsToRegister) {
        console.log(`Checking registration for ${agent.role} (${agent.address})...`);
        const isRegistered = await registry.isAgentRegistered(agent.address);
        if (!isRegistered) {
            console.log(`Registering ${agent.role} on-chain via ERC-8004...`);
            const tx = await registry.registerAgent(agent.address, agent.uri, 95); // Initial reputation = 95
            await tx.wait();
            console.log(`Successfully registered ${agent.role}!`);
        } else {
            const agentId = await registry.getAgentId(agent.address);
            console.log(`${agent.role} already registered with ID: ${agentId}`);
        }
    }

    console.log(`Agent registration verification completed successfully!`);
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
