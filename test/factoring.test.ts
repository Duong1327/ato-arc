import { expect } from "chai";
import { ethers } from "hardhat";

describe("ATO Phase 12: Supplier Invoice Factoring Facility", function () {
  let vault: any;
  let factoring: any;
  let owner: any;
  let provider: any;
  let purchaser: any;
  let evaluator: any;
  let hacker: any;
  let usdcContract: any;

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner, provider, purchaser, evaluator, hacker] = await ethers.getSigners();

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

    // Mint USDC to Vault, Provider, and Purchaser
    await usdcContract.mint(vaultAddress, ethers.parseUnits("20000", 6));
    await usdcContract.mint(provider.address, ethers.parseUnits("1000", 6));
    await usdcContract.mint(purchaser.address, ethers.parseUnits("10000", 6));

    // 3. Deploy InvoiceFactoring Contract
    const InvoiceFactoring = await ethers.getContractFactory("InvoiceFactoring");
    factoring = await InvoiceFactoring.deploy(vaultAddress, USDC_ADDRESS);
    await factoring.waitForDeployment();

    // Register factoring contract in the vault
    await vault.setFactoringFacility(await factoring.getAddress());
  });

  describe("Factoring Offer Proposing & Verification", function () {
    it("Should allow the supplier (provider) to propose factoring terms", async function () {
      const budget = ethers.parseUnits("1000", 6);
      await vault.createMilestone("Receivable Milestone", budget, 3600, provider.address, evaluator.address);

      // Propose factoring: milestoneId = 1, discountRate = 500 bps (5%)
      await expect(factoring.connect(provider).proposeFactoringOffer(1, 500))
        .to.emit(factoring, "FactoringOfferProposed")
        .withArgs(1, provider.address, budget, 500, ethers.parseUnits("950", 6));

      const offer = await factoring.offers(1);
      expect(offer.exists).to.be.true;
      expect(offer.supplier).to.equal(provider.address);
      expect(offer.totalAmount).to.equal(budget);
      expect(offer.discountRate).to.equal(500);
      expect(offer.netPayout).to.equal(ethers.parseUnits("950", 6));
      expect(offer.isSold).to.be.false;
      expect(offer.isApproved).to.be.false;
    });

    it("Should reject proposal from anyone other than the registered supplier (provider)", async function () {
      const budget = ethers.parseUnits("1000", 6);
      await vault.createMilestone("Receivable Milestone", budget, 3600, provider.address, evaluator.address);

      await expect(
        factoring.connect(hacker).proposeFactoringOffer(1, 500)
      ).to.be.revertedWithCustomError(factoring, "NotTheProvider");
    });
  });

  describe("Factoring Offer Approval & Evaluating", function () {
    beforeEach(async function () {
      const budget = ethers.parseUnits("1000", 6);
      await vault.createMilestone("Receivable Milestone", budget, 3600, provider.address, evaluator.address);
      await factoring.connect(provider).proposeFactoringOffer(1, 500);
    });

    it("Should allow the owner/agent to approve the factoring offer", async function () {
      await expect(factoring.connect(owner).evaluateFactoringOffer(1, true))
        .to.emit(factoring, "FactoringOfferEvaluated")
        .withArgs(1, true);

      const offer = await factoring.offers(1);
      expect(offer.isApproved).to.be.true;
    });

    it("Should reject evaluation from unauthorized users", async function () {
      await expect(
        factoring.connect(hacker).evaluateFactoringOffer(1, true)
      ).to.be.revertedWithCustomError(factoring, "Unauthorized");
    });
  });

  describe("Factoring Purchase & Payout Routing", function () {
    beforeEach(async function () {
      const budget = ethers.parseUnits("1000", 6);
      // Let's create a milestone without job contract (direct fallback) to test vault routing simply
      // Wait, createMilestone always deploys a jobContract.
      // But we can create a milestone with a mock/no job contract by updating the storage? Or we can just let it claim refund / direct pay.
      // Wait, we can test both!
      await vault.createMilestone("Direct Payout Milestone", budget, 3600, provider.address, evaluator.address);
      await factoring.connect(provider).proposeFactoringOffer(1, 500);
      await factoring.connect(owner).evaluateFactoringOffer(1, true);
    });

    it("Should allow a purchaser to buy a claim and update vault registry", async function () {
      const netPayout = ethers.parseUnits("950", 6);
      
      // Approve USDC spending by purchaser
      await usdcContract.connect(purchaser).approve(await factoring.getAddress(), netPayout);

      const initialProviderUSDC = await usdcContract.balanceOf(provider.address);

      await expect(factoring.connect(purchaser).buyMilestoneClaim(1))
        .to.emit(factoring, "FactoringClaimPurchased")
        .withArgs(1, purchaser.address, netPayout);

      const finalProviderUSDC = await usdcContract.balanceOf(provider.address);
      expect(finalProviderUSDC - initialProviderUSDC).to.equal(netPayout);

      // Verify that the purchaser is registered in the vault
      const registeredPurchaser = await vault.milestonePurchaser(1);
      expect(registeredPurchaser).to.equal(purchaser.address);

      const offer = await factoring.offers(1);
      expect(offer.isSold).to.be.true;
      expect(offer.purchaser).to.equal(purchaser.address);
    });

    it("Should route milestone payouts to the factoring purchaser upon execution", async function () {
      const budget = ethers.parseUnits("1000", 6);
      const netPayout = ethers.parseUnits("950", 6);

      // Buy claim
      await usdcContract.connect(purchaser).approve(await factoring.getAddress(), netPayout);
      await factoring.connect(purchaser).buyMilestoneClaim(1);

      // Add owner as agent or allow direct payout trigger
      await vault.setMilestoneStatus(1, true);

      // Trigger payout
      // The auditor agent executes: agentExecuteMilestonePayout
      // Wait, owner is an owner, which is authorized under onlyAgentOrOwner modifier!
      const initialPurchaserBalance = await usdcContract.balanceOf(purchaser.address);

      // Since there is a job contract, when the auditor executes it, it checks for a refund or routes direct vault payout.
      // Our implementation does:
      // if (milestone.jobContractAddress != address(0)) { 
      //    try jobContract.claimRefund() { ... } catch { direct vault transfer to purchaser }
      // }
      // Since the jobContract is not expired or rejected, claimRefund fails, but it catches the error and executes the fallback direct vault transfer to the purchaser!
      await vault.connect(owner).agentExecuteMilestonePayout(1, provider.address, budget);

      const finalPurchaserBalance = await usdcContract.balanceOf(purchaser.address);
      expect(finalPurchaserBalance - initialPurchaserBalance).to.equal(budget); // Receives the full 1000 USDC!
    });
  });
});
