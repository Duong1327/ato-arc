import { expect } from "chai";
import { ethers } from "hardhat";

describe("ATO On-Chain Compliance & Dynamic Risk Audits", function () {
  let vault: any;
  let oracle: any;
  let owner: any;
  let agent: any;
  let recipient1: any;
  let recipient2: any;
  let blockedRecipient: any;
  let usdcContract: any;

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner, agent, recipient1, recipient2, blockedRecipient] = await ethers.getSigners();

    // 1. Deploy Mock Compliance Oracle
    const MockComplianceOracle = await ethers.getContractFactory("MockComplianceOracle");
    oracle = await MockComplianceOracle.deploy();
    await oracle.waitForDeployment();

    // 2. Deploy ATO Enterprise Vault
    const ATOEnterpriseVault = await ethers.getContractFactory("ATOEnterpriseVault");
    // Deploy with owner as admin, threshold = 1, agent limit = 5,000 USDC
    const limit = ethers.parseUnits("5000", 6);
    vault = await ATOEnterpriseVault.deploy([owner.address], 1, limit);
    await vault.waitForDeployment();

    // 3. Register Agent Status
    await vault.setAgentStatus(agent.address, true);

    // 4. Setup Mock USDC Contract at precompiled address
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

  describe("Compliance Oracle Registration", function () {
    it("Should allow the owner to set the Compliance Oracle address", async function () {
      const oracleAddress = await oracle.getAddress();
      await expect(vault.setComplianceOracleAddress(oracleAddress))
        .to.emit(vault, "ComplianceOracleUpdated")
        .withArgs(ethers.ZeroAddress, oracleAddress);

      expect(await vault.complianceOracleAddress()).to.equal(oracleAddress);
    });

    it("Should reject non-owners attempting to set the Compliance Oracle address", async function () {
      const oracleAddress = await oracle.getAddress();
      const nonOwner = agent;
      await expect(
        vault.connect(nonOwner).setComplianceOracleAddress(oracleAddress)
      ).to.be.revertedWithCustomError(vault, "NotAnOwner");
    });
  });

  describe("Compliance Screening Checks", function () {
    beforeEach(async function () {
      const oracleAddress = await oracle.getAddress();
      await vault.setComplianceOracleAddress(oracleAddress);
    });

    async function signAndPayout(recipientAddr: string, amount: bigint) {
      const nonce = await vault.agentNonces(agent.address);
      const vaultAddress = await vault.getAddress();
      const network = await ethers.provider.getNetwork();
      const chainId = network.chainId;
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "address", "uint256"],
        [recipientAddr, amount, nonce, vaultAddress, chainId]
      );
      const signature = await agent.signMessage(ethers.getBytes(messageHash));
      return vault.connect(agent).agentDirectPayoutERC20(recipientAddr, amount, nonce, signature);
    }

    it("Should allow transfers to compliant addresses", async function () {
      // By default mock oracle has no blocklisted addresses
      expect(await oracle.isAddressCompliant(recipient1.address)).to.equal(true);

      // Perform a mock agent payout (direct payout)
      const amount = ethers.parseUnits("100", 6);
      
      const initialBalance = await usdcContract.balanceOf(recipient1.address);

      await signAndPayout(recipient1.address, amount);

      const finalBalance = await usdcContract.balanceOf(recipient1.address);
      expect(finalBalance - initialBalance).to.equal(amount);
    });

    it("Should block transfers to addresses that are blocklisted directly in the Vault", async function () {
      // Update local vault blocklist
      await vault.updateComplianceBlocklist(recipient2.address, true);

      const amount = ethers.parseUnits("100", 6);
      await expect(
        signAndPayout(recipient2.address, amount)
      ).to.be.revertedWithCustomError(vault, "AddressIsBlocklisted");
    });

    it("Should block transfers to addresses flagged by the Compliance Oracle", async function () {
      const blockedAddr = blockedRecipient.address;
      
      // Flag address in Mock Compliance Oracle
      await oracle.setBlocked(blockedAddr, true);
      expect(await oracle.isAddressCompliant(blockedAddr)).to.equal(false);

      const amount = ethers.parseUnits("100", 6);
      await expect(
        signAndPayout(blockedAddr, amount)
      ).to.be.revertedWithCustomError(vault, "AddressIsBlocklisted");
    });
  });
});
