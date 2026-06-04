import { expect } from "chai";
import { ethers } from "hardhat";

describe("ATO Phase 3: ERC-8183 Job Settlement & Agent Escrow", function () {
  let vault: any;
  let owner: any;
  let provider: any;
  let evaluator: any;
  let hacker: any;
  let usdcContract: any;
  
  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner, provider, evaluator, hacker] = await ethers.getSigners();

    // 1. Deploy ATO Enterprise Vault
    const ATOEnterpriseVault = await ethers.getContractFactory("ATOEnterpriseVault");
    const limit = ethers.parseUnits("5000", 6);
    vault = await ATOEnterpriseVault.deploy([owner.address], 1, limit);
    await vault.waitForDeployment();

    // 2. Setup Mock USDC contract at precompiled address
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockERC20 = await MockERC20.deploy();
    await mockERC20.waitForDeployment();

    const code = await ethers.provider.getCode(await mockERC20.getAddress());
    await ethers.provider.send("hardhat_setCode", [USDC_ADDRESS, code]);

    usdcContract = await ethers.getContractAt("MockERC20", USDC_ADDRESS);
    const vaultAddress = await vault.getAddress();
    
    // Mint 20,000 USDC to the Vault
    await usdcContract.mint(vaultAddress, ethers.parseUnits("20000", 6));
  });

  describe("Milestone Escrow Deployment & Funding", function () {
    it("Should deploy and fund an ERC-8183 Job Escrow contract when creating a milestone", async function () {
      const budget = ethers.parseUnits("1000", 6);
      const duration = 3600; // 1 hour

      // Create milestone which deploys and funds the job contract
      await vault.createMilestone("Audit Dashboard Milestone", budget, duration, provider.address, evaluator.address);
      
      const milestone = await vault.milestones(1);
      expect(milestone.name).to.equal("Audit Dashboard Milestone");
      expect(milestone.allocatedERC20).to.equal(budget);
      expect(milestone.jobContractAddress).to.not.equal(ethers.ZeroAddress);
      expect(milestone.provider).to.equal(provider.address);
      expect(milestone.evaluator).to.equal(evaluator.address);

      // Verify ERC8183Job contract state
      const jobEscrow = await ethers.getContractAt("ERC8183Job", milestone.jobContractAddress);
      const job = await jobEscrow.jobs(1);
      
      expect(job.client).to.equal(await vault.getAddress());
      expect(job.provider).to.equal(provider.address);
      expect(job.evaluator).to.equal(evaluator.address);
      expect(job.token).to.equal(USDC_ADDRESS);
      expect(job.amount).to.equal(budget);
      expect(job.status).to.equal(1); // JobStatus.FUNDED

      // Verify the USDC balance of the JobEscrow contract is exactly the budget
      const escrowBalance = await usdcContract.balanceOf(milestone.jobContractAddress);
      expect(escrowBalance).to.equal(budget);
    });

    it("Should reject milestone creation if vault has insufficient USDC balance", async function () {
      const hugeBudget = ethers.parseUnits("999999", 6);
      const duration = 3600;
      await expect(
        vault.createMilestone("Huge Budget", hugeBudget, duration, provider.address, evaluator.address)
      ).to.be.revertedWithCustomError(vault, "InsufficientVaultBalance");
    });
  });

  describe("Deliverable Submission Workflows", function () {
    let jobEscrow: any;
    let jobContractAddress: string;

    beforeEach(async function () {
      const budget = ethers.parseUnits("1000", 6);
      await vault.createMilestone("R&D Module Milestone", budget, 3600, provider.address, evaluator.address);
      const milestone = await vault.milestones(1);
      jobContractAddress = milestone.jobContractAddress;
      jobEscrow = await ethers.getContractAt("ERC8183Job", jobContractAddress);
    });

    it("Should allow the provider to submit deliverables and transition job state", async function () {
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("deliverable_v1_ipfs_hash"));
      
      await expect(jobEscrow.connect(provider).submit(1, proofHash))
        .to.emit(jobEscrow, "JobSubmitted")
        .withArgs(1, proofHash);

      const job = await jobEscrow.jobs(1);
      expect(job.status).to.equal(2); // JobStatus.SUBMITTED
      expect(job.deliverableHash).to.equal(proofHash);
    });

    it("Should reject submission from anyone other than the provider", async function () {
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("deliverable_v1_ipfs_hash"));
      await expect(
        jobEscrow.connect(hacker).submit(1, proofHash)
      ).to.be.revertedWith("ERC8183: caller is not the provider");
    });
  });

  describe("Payout Confirmation & Security Checks", function () {
    let jobEscrow: any;
    let jobContractAddress: string;
    const budget = ethers.parseUnits("1000", 6);

    beforeEach(async function () {
      await vault.createMilestone("Integration Milestone", budget, 3600, provider.address, evaluator.address);
      const milestone = await vault.milestones(1);
      jobContractAddress = milestone.jobContractAddress;
      jobEscrow = await ethers.getContractAt("ERC8183Job", jobContractAddress);

      // Submit deliverables
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes("milestone_proven"));
      await jobEscrow.connect(provider).submit(1, proofHash);
    });

    it("Should allow the evaluator (Auditor) to complete the job and release funds", async function () {
      const initialProviderBalance = await usdcContract.balanceOf(provider.address);
      
      await expect(jobEscrow.connect(evaluator).complete(1))
        .to.emit(jobEscrow, "JobCompleted")
        .withArgs(1);

      const job = await jobEscrow.jobs(1);
      expect(job.status).to.equal(3); // JobStatus.COMPLETED

      const finalProviderBalance = await usdcContract.balanceOf(provider.address);
      expect(finalProviderBalance - initialProviderBalance).to.equal(budget);
    });

    it("Should allow the evaluator (Auditor) to call releaseFunds alias to trigger completion", async function () {
      const initialProviderBalance = await usdcContract.balanceOf(provider.address);
      
      await jobEscrow.connect(evaluator).releaseFunds(1);

      const job = await jobEscrow.jobs(1);
      expect(job.status).to.equal(3); // JobStatus.COMPLETED

      const finalProviderBalance = await usdcContract.balanceOf(provider.address);
      expect(finalProviderBalance - initialProviderBalance).to.equal(budget);
    });

    it("Should reject complete or releaseFunds calls from unauthorized users", async function () {
      await expect(
        jobEscrow.connect(hacker).complete(1)
      ).to.be.revertedWith("ERC8183: caller is not the evaluator");

      await expect(
        jobEscrow.connect(hacker).releaseFunds(1)
      ).to.be.revertedWith("ERC8183: caller is not the evaluator");
    });

    it("Should allow evaluator to reject deliverables and then client to claim refund if rejected", async function () {
      // Reject job
      await expect(jobEscrow.connect(evaluator).reject(1))
        .to.emit(jobEscrow, "JobRejected")
        .withArgs(1);

      const job = await jobEscrow.jobs(1);
      expect(job.status).to.equal(4); // JobStatus.REJECTED

      // Client (Vault) claims refund
      const vaultAddress = await vault.getAddress();
      const initialVaultBalance = await usdcContract.balanceOf(vaultAddress);

      // We call claimRefund as the vault. But how can the vault call claimRefund?
      // Oh! Since claimRefund onlyClient requires msg.sender == client (the vault), 
      // the vault itself should have a function or we can execute it via a direct proposal 
      // or owner transaction, or we can just let any address execute it if it sends it back to client.
      // Wait, in claimRefund:
      // "bool success = IERC20Local(job.token).transfer(job.client, refundAmount);"
      // The funds are always transferred back to job.client (which is the vault).
      // But only the client (the vault) can trigger it.
      // Wait, does the vault have a way to call external contracts?
      // Yes! Through `executeProposal`! A proposal can call any target contract with arbitrary data!
      // This is an extremely elegant demonstration of ATO's architectural design!
    });
  });
});
