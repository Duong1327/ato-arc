import { expect } from "chai";
import { ethers } from "hardhat";
import { PrismaClient } from "@prisma/client";
import { IndexManager } from "../scripts/indexManager";

const prisma = new PrismaClient();

describe("ATO Phase 13: Multi-Token Treasury Index Manager", function () {
  let vault: any;
  let mockStableFX: any;
  let owner: any;
  let agent: any;
  let recipient: any;
  let usdcContract: any;
  let eurcContract: any;

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

  before(async function () {
    // Set process.env variables to point to this vault instance if needed
    process.env.ARC_TESTNET_RPC_URL = "http://127.0.0.1:8545"; // Hardhat local RPC
  });

  beforeEach(async function () {
    [owner, agent, recipient] = await ethers.getSigners();

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

    // 4. Configure agent
    await vault.setAgentStatus(agent.address, true);

    // 5. Deploy Mock StableFX contract
    const MockStableFX = await ethers.getContractFactory("MockStableFX");
    mockStableFX = await MockStableFX.deploy();
    await mockStableFX.waitForDeployment();
    await vault.setStableFXAddress(await mockStableFX.getAddress());

    // Mint initial tokens to Vault
    const vaultAddress = await vault.getAddress();
    await usdcContract.mint(vaultAddress, ethers.parseUnits("6000", 6)); // 6000 USDC
    await eurcContract.mint(vaultAddress, ethers.parseUnits("3703.7", 6)); // Approx 4000 USD worth (at 1.08)

    // Clear Prisma database tables
    await prisma.indexAllocation.deleteMany({});
    await prisma.rebalanceLog.deleteMany({});
  });

  describe("Portfolio Target Weights and Registry", function () {
    it("Should allow owner to configure target index weights on-chain", async function () {
      const tokens = [USDC_ADDRESS, EURC_ADDRESS];
      const weights = [6000, 4000]; // 60% USDC, 40% EURC

      await vault.setTargetWeights(tokens, weights);

      expect(await vault.targetWeights(USDC_ADDRESS)).to.equal(6000);
      expect(await vault.targetWeights(EURC_ADDRESS)).to.equal(4000);

      const indexTokens = await vault.getIndexTokens();
      expect(indexTokens).to.include(USDC_ADDRESS);
      expect(indexTokens).to.include(EURC_ADDRESS);
    });

    it("Should reject target weights that do not sum to exactly 10000 bps (100%)", async function () {
      const tokens = [USDC_ADDRESS, EURC_ADDRESS];
      const weights = [5000, 4000]; // 90% total

      await expect(
        vault.setTargetWeights(tokens, weights)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");
    });

    it("Should restrict setTargetWeights to corporate owner", async function () {
      const tokens = [USDC_ADDRESS, EURC_ADDRESS];
      const weights = [6000, 4000];

      await expect(
        vault.connect(agent).setTargetWeights(tokens, weights)
      ).to.be.revertedWithCustomError(vault, "NotAnOwner");
    });
  });

  describe("Database Reconciliation and Drift Computation", function () {
    it("Should reconcile token balances and calculate weights in database", async function () {
      // Set weights on-chain
      await vault.setTargetWeights([USDC_ADDRESS, EURC_ADDRESS], [6000, 4000]);

      // Run reconciliation
      const allocations = await IndexManager.reconcileBalances();

      expect(allocations.length).to.equal(2);
      
      const usdcAlloc = allocations.find(a => a.tokenSymbol === 'USDC');
      const eurcAlloc = allocations.find(a => a.tokenSymbol === 'EURC');

      expect(usdcAlloc).to.not.be.undefined;
      expect(eurcAlloc).to.not.be.undefined;

      expect(usdcAlloc!.targetWeight).to.equal(60.0);
      expect(eurcAlloc!.targetWeight).to.equal(40.0);

      // Total portfolio value: 6000 * 1.0 + 3703.7 * 1.08 = 6000 + 4000 = 10000 USD
      // USDC current weight = 6000 / 10000 = 60%
      // EURC current weight = 4000 / 10000 = 40%
      expect(usdcAlloc!.currentWeight).to.be.closeTo(60.0, 0.5);
      expect(eurcAlloc!.currentWeight).to.be.closeTo(40.0, 0.5);
    });
  });

  describe("Automated Rebalancing Execution", function () {
    it("Should skip rebalancing if drift is within tolerance", async function () {
      await vault.setTargetWeights([USDC_ADDRESS, EURC_ADDRESS], [6000, 4000]);
      
      // Perform check with 5% tolerance
      const result = await IndexManager.checkAndRebalanceIndex(5.0, 0.5);
      
      expect(result.rebalanced).to.equal(false);
      expect(result.reason).to.contain("within tolerance threshold");
    });

    it("Should execute rebalancing trade when drift exceeds tolerance", async function () {
      // 1. Set target weights on-chain (60% USDC, 40% EURC)
      await vault.setTargetWeights([USDC_ADDRESS, EURC_ADDRESS], [6000, 4000]);

      // 2. Artificially create a drift by minting excessive EURC to the vault (making it overweight)
      const vaultAddress = await vault.getAddress();
      await eurcContract.mint(vaultAddress, ethers.parseUnits("3000", 6)); // extra 3000 EURC (~3240 USD)
      
      // Portfolio state is now: 6000 USDC, 6703.7 EURC.
      // Total value: 6000 + 6703.7 * 1.08 = 6000 + 7240 = 13240 USD.
      // USDC actual: 6000 / 13240 = 45.3% (Deficit: -14.7%)
      // EURC actual: 7240 / 13240 = 54.7% (Surplus: +14.7%)
      
      // 3. Trigger rebalancing swap with 5% drift tolerance
      const result = await IndexManager.checkAndRebalanceIndex(5.0, 0.5);

      expect(result.rebalanced).to.equal(true);
      expect(result.log).to.not.be.undefined;
      expect(result.log.sellToken).to.equal("EURC");
      expect(result.log.buyToken).to.equal("USDC");
      expect(result.log.status).to.equal("SUCCESS");

      // Verify rebalance history is stored in DB
      const logs = await prisma.rebalanceLog.findMany();
      expect(logs.length).to.equal(1);
      expect(logs[0].sellToken).to.equal("EURC");
      expect(logs[0].buyToken).to.equal("USDC");
    });
  });
});
