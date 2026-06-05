import { expect } from "chai";
import { ethers } from "hardhat";
import { PrismaClient } from "@prisma/client";
import { FeeDistributor } from "../scripts/feeDistributor";

const prisma = new PrismaClient();

describe("ATO Phase 14: Dynamic Revenue & Fee Allocation Engine", function () {
  let vault: any;
  let owner: any;
  let agent: any;
  let stakeholder: any;
  let nonStakeholder: any;
  let recipient: any;
  let usdcContract: any;
  let eurcContract: any;

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

  before(async function () {
    process.env.ARC_TESTNET_RPC_URL = "http://127.0.0.1:8545";
  });

  beforeEach(async function () {
    [owner, agent, stakeholder, nonStakeholder, recipient] = await ethers.getSigners();

    // 1. Setup Mock USDC Contract
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUSDC = await MockERC20.deploy();
    await mockUSDC.waitForDeployment();
    const usdcCode = await ethers.provider.getCode(await mockUSDC.getAddress());
    await ethers.provider.send("hardhat_setCode", [USDC_ADDRESS, usdcCode]);
    usdcContract = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

    // 2. Setup Mock EURC Contract
    const mockEURC = await MockERC20.deploy();
    await mockEURC.waitForDeployment();
    const eurcCode = await ethers.provider.getCode(await mockEURC.getAddress());
    await ethers.provider.send("hardhat_setCode", [EURC_ADDRESS, eurcCode]);
    eurcContract = await ethers.getContractAt("MockERC20", EURC_ADDRESS);

    // 3. Deploy Vault
    const ATOEnterpriseVault = await ethers.getContractFactory("ATOEnterpriseVault");
    const limit = ethers.parseUnits("5000", 6);
    vault = await ATOEnterpriseVault.deploy([owner.address], 1, limit);
    await vault.waitForDeployment();

    process.env.VAULT_CONTRACT_ADDRESS = await vault.getAddress();

    // 4. Configure Agent & Register token
    await vault.setAgentStatus(agent.address, true);
    await vault.registerToken(USDC_ADDRESS);
    await vault.registerToken(EURC_ADDRESS);

    // Mint initial tokens to Vault
    const vaultAddress = await vault.getAddress();
    await usdcContract.mint(vaultAddress, ethers.parseUnits("10000", 6));
    await eurcContract.mint(vaultAddress, ethers.parseUnits("10000", 6));

    // Clear Prisma database tables for fee tracking
    await prisma.feeBalance.deleteMany({});
    await prisma.feePayout.deleteMany({});
  });

  describe("Fee Configuration and Schedules", function () {
    it("Should allow corporate owner to set fee basis points", async function () {
      await vault.setFeeBasisPoints(50); // 0.5%
      expect(await vault.feeBasisPoints()).to.equal(50);
    });

    it("Should reject fee setting that exceeds 10% (1000 basis points)", async function () {
      await expect(
        vault.setFeeBasisPoints(1001)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");
    });

    it("Should restrict setFeeBasisPoints to owners", async function () {
      await expect(
        vault.connect(agent).setFeeBasisPoints(50)
      ).to.be.revertedWithCustomError(vault, "NotAnOwner");
    });
  });

  describe("Stakeholder Authorization", function () {
    it("Should allow owner to authorize stakeholder wallets", async function () {
      await vault.setStakeholder(stakeholder.address, true);
      expect(await vault.isStakeholder(stakeholder.address)).to.equal(true);
    });

    it("Should restrict setStakeholder to owners", async function () {
      await expect(
        vault.connect(agent).setStakeholder(stakeholder.address, true)
      ).to.be.revertedWithCustomError(vault, "NotAnOwner");
    });
  });

  describe("Fee Deduction during Transactions", function () {
    beforeEach(async function () {
      await vault.setFeeBasisPoints(100); // 1.0% fee
      await vault.setStakeholder(stakeholder.address, true);
    });

    it("Should deduct fee and update accumulated fees on agentDirectPayoutToken", async function () {
      const payoutAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      
      // Setup cryptographic signature parameters
      const nonce = await vault.agentNonces(agent.address);
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const messageHash = ethers.solidityPackedKeccak256(
        ['address', 'address', 'uint256', 'uint256', 'address', 'uint256'],
        [USDC_ADDRESS, recipient.address, payoutAmount, nonce, await vault.getAddress(), chainId]
      );
      const signature = await agent.signMessage(ethers.getBytes(messageHash));

      const initialRecipientBalance = await usdcContract.balanceOf(recipient.address);

      // Execute transaction
      await vault["agentDirectPayoutToken(address,address,uint256,uint256,bytes)"](
        USDC_ADDRESS,
        recipient.address,
        payoutAmount,
        nonce,
        signature
      );

      // 1.0% of 1000 USDC = 10 USDC fee
      const expectedFee = ethers.parseUnits("10", 6);
      const expectedPayout = ethers.parseUnits("990", 6);

      const finalRecipientBalance = await usdcContract.balanceOf(recipient.address);
      expect(finalRecipientBalance - initialRecipientBalance).to.equal(expectedPayout);

      expect(await vault.accumulatedFees(USDC_ADDRESS)).to.equal(expectedFee);
    });
  });

  describe("Stakeholder Withdrawals & Database Payout Tracking", function () {
    beforeEach(async function () {
      await vault.setFeeBasisPoints(200); // 2% fee
      await vault.setStakeholder(stakeholder.address, true);

      // Manually trigger a payout to generate fee reserves in contract
      const payoutAmount = ethers.parseUnits("1000", 6);
      const nonce = await vault.agentNonces(agent.address);
      const chainId = (await ethers.provider.getNetwork()).chainId;
      const messageHash = ethers.solidityPackedKeccak256(
        ['address', 'address', 'uint256', 'uint256', 'address', 'uint256'],
        [USDC_ADDRESS, recipient.address, payoutAmount, nonce, await vault.getAddress(), chainId]
      );
      const signature = await agent.signMessage(ethers.getBytes(messageHash));

      await vault["agentDirectPayoutToken(address,address,uint256,uint256,bytes)"](
        USDC_ADDRESS,
        recipient.address,
        payoutAmount,
        nonce,
        signature
      );
    });

    it("Should allow stakeholder to withdraw fees and log the payout in database", async function () {
      // Reconcile fees to database first
      await FeeDistributor.reconcileFees();

      const initialStakeholderBalance = await usdcContract.balanceOf(stakeholder.address);

      // Stakeholder claims 15 USDC of accumulated fees
      await FeeDistributor.claimFees(stakeholder, USDC_ADDRESS, 15.0);

      const finalStakeholderBalance = await usdcContract.balanceOf(stakeholder.address);
      expect(finalStakeholderBalance - initialStakeholderBalance).to.equal(ethers.parseUnits("15", 6));

      // Verify that database has updated balance and logged payouts
      const feeBalances = await prisma.feeBalance.findMany();
      const usdcBalance = feeBalances.find(b => b.tokenSymbol === 'USDC');
      expect(usdcBalance).to.not.be.undefined;
      expect(usdcBalance!.accumulatedFees).to.equal(5.0); // 20 USDC initial fee - 15 USDC claimed
      expect(usdcBalance!.claimedFees).to.equal(15.0);

      const payouts = await prisma.feePayout.findMany();
      expect(payouts.length).to.equal(1);
      expect(payouts[0].stakeholder).to.equal(stakeholder.address);
      expect(payouts[0].amount).to.equal(15.0);
    });

    it("Should reject withdrawal attempts by unauthorized wallets", async function () {
      await expect(
        vault.connect(nonStakeholder).claimFees(USDC_ADDRESS, ethers.parseUnits("10", 6))
      ).to.be.revertedWithCustomError(vault, "Unauthorized");
    });

    it("Should reject attempts to withdraw more than accumulated fee balance", async function () {
      await expect(
        vault.connect(stakeholder).claimFees(USDC_ADDRESS, ethers.parseUnits("30", 6)) // 30 USDC exceeds 20 USDC accumulated
      ).to.be.revertedWithCustomError(vault, "InsufficientFees");
    });
  });
});
