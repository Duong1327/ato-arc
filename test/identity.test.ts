import { expect } from "chai";
import { ethers } from "hardhat";

describe("ATO Phase 2: ERC-8004 AI Agent Registry & Identity Integration", function () {
  let vault: any;
  let registry: any;
  let owner: any;
  let registeredAgent: any;
  let unregisteredAgent: any;
  let recipient: any;
  let usdcContract: any;
  let chainId: bigint;

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner, registeredAgent, unregisteredAgent, recipient] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    chainId = network.chainId;

    // 1. Deploy ERC-8004 Registry
    const ERC8004Registry = await ethers.getContractFactory("ERC8004Registry");
    registry = await ERC8004Registry.deploy();
    await registry.waitForDeployment();

    // 2. Deploy ATO Enterprise Vault
    const ATOEnterpriseVault = await ethers.getContractFactory("ATOEnterpriseVault");
    const limit = ethers.parseUnits("5000", 6);
    vault = await ATOEnterpriseVault.deploy([owner.address], 1, limit);
    await vault.waitForDeployment();

    // 3. Configure Agent Registry in Vault
    const registryAddress = await registry.getAddress();
    await vault.setAgentRegistryAddress(registryAddress);

    // 4. Register Agent on-chain via ERC-8004 Registry
    await registry.registerAgent(
      registeredAgent.address,
      "ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/allocator.json",
      99
    );

    // 5. Setup Mock USDC Contract at precompiled address
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockERC20 = await MockERC20.deploy();
    await mockERC20.waitForDeployment();

    const code = await ethers.provider.getCode(await mockERC20.getAddress());
    await ethers.provider.send("hardhat_setCode", [USDC_ADDRESS, code]);

    usdcContract = await ethers.getContractAt("MockERC20", USDC_ADDRESS);
    const vaultAddress = await vault.getAddress();
    // Mint 10,000 USDC to the Vault
    await usdcContract.mint(vaultAddress, ethers.parseUnits("10000", 6));
  });

  describe("Agent Registry Admin & Management", function () {
    it("Should track registered agent details and initial reputation score", async function () {
      expect(await registry.isAgentRegistered(registeredAgent.address)).to.equal(true);
      expect(await registry.getAgentReputation(registeredAgent.address)).to.equal(99n);
      
      const agentId = await registry.getAgentId(registeredAgent.address);
      expect(await registry.getAgentURI(agentId)).to.equal("ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/allocator.json");
    });

    it("Should update agent reputation score by registry owner", async function () {
      await registry.updateReputation(registeredAgent.address, 85);
      expect(await registry.getAgentReputation(registeredAgent.address)).to.equal(85n);
    });

    it("Should reject non-owners attempting to update agent details", async function () {
      await expect(
        registry.connect(registeredAgent).updateReputation(registeredAgent.address, 90)
      ).to.be.revertedWith("Not registry owner");
    });
  });

  describe("On-chain Modifier Enforcement & Signature Verification", function () {
    it("Should reject direct calls from unregistered agents", async function () {
      const amount = ethers.parseUnits("100", 6);
      const nonce = 0n;
      const vaultAddress = await vault.getAddress();
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "address", "uint256"],
        [recipient.address, amount, nonce, vaultAddress, chainId]
      );
      const signature = await registeredAgent.signMessage(ethers.getBytes(messageHash));

      // Call is from unregisteredAgent, but has valid registeredAgent signature
      // Since caller is unregistered, modifier onlyAgentOrOwner fails
      await expect(
        vault.connect(unregisteredAgent).agentDirectPayoutERC20(recipient.address, amount, nonce, signature)
      ).to.be.revertedWithCustomError(vault, "NotAnAgentOrOwner");
    });

    it("Should successfully process direct calls when agent is registered and signature matches", async function () {
      const amount = ethers.parseUnits("100", 6);
      const nonce = 0n;
      const vaultAddress = await vault.getAddress();
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "address", "uint256"],
        [recipient.address, amount, nonce, vaultAddress, chainId]
      );
      const signature = await registeredAgent.signMessage(ethers.getBytes(messageHash));

      const initialBalance = await usdcContract.balanceOf(recipient.address);

      // Caller is registeredAgent, signature matches registeredAgent
      await vault.connect(registeredAgent).agentDirectPayoutERC20(recipient.address, amount, nonce, signature);

      const finalBalance = await usdcContract.balanceOf(recipient.address);
      expect(finalBalance - initialBalance).to.equal(amount);
      expect(await vault.agentNonces(registeredAgent.address)).to.equal(1n);
    });

    it("Should reject signature signed by unregistered agent", async function () {
      const amount = ethers.parseUnits("100", 6);
      const nonce = 0n;
      const vaultAddress = await vault.getAddress();
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "address", "uint256"],
        [recipient.address, amount, nonce, vaultAddress, chainId]
      );
      
      // Sign with unregisteredAgent private key
      const signature = await unregisteredAgent.signMessage(ethers.getBytes(messageHash));

      await expect(
        vault.connect(registeredAgent).agentDirectPayoutERC20(recipient.address, amount, nonce, signature)
      ).to.be.revertedWithCustomError(vault, "InvalidSignature");
    });

    it("Should prevent replay attacks by checking and incrementing nonces", async function () {
      const amount = ethers.parseUnits("100", 6);
      const nonce = 0n;
      const vaultAddress = await vault.getAddress();
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "address", "uint256"],
        [recipient.address, amount, nonce, vaultAddress, chainId]
      );
      const signature = await registeredAgent.signMessage(ethers.getBytes(messageHash));

      // First call succeeds
      await vault.connect(registeredAgent).agentDirectPayoutERC20(recipient.address, amount, nonce, signature);

      // Replay of same signature/nonce fails
      await expect(
        vault.connect(registeredAgent).agentDirectPayoutERC20(recipient.address, amount, nonce, signature)
      ).to.be.revertedWithCustomError(vault, "InvalidSignature");
    });

    it("Should reject forged signature (altered payout parameter)", async function () {
      const amount = ethers.parseUnits("100", 6);
      const forgedAmount = ethers.parseUnits("200", 6);
      const nonce = 0n;
      const vaultAddress = await vault.getAddress();
      
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "address", "uint256"],
        [recipient.address, amount, nonce, vaultAddress, chainId]
      );
      const signature = await registeredAgent.signMessage(ethers.getBytes(messageHash));

      // Attempt transaction with forgedAmount but original signature
      await expect(
        vault.connect(registeredAgent).agentDirectPayoutERC20(recipient.address, forgedAmount, nonce, signature)
      ).to.be.revertedWithCustomError(vault, "InvalidSignature");
    });
  });
});
