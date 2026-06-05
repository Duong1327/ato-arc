import { expect } from "chai";
import { ethers } from "hardhat";

describe("ATO Phase 5: StableFX Cross-Border Treasury Sweeping & EURC Integration", function () {
  let vault: any;
  let mockStableFX: any;
  let owner: any;
  let agent: any;
  let recipient: any;
  let usdcContract: any;
  let eurcContract: any;

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
  const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

  beforeEach(async function () {
    [owner, agent, recipient] = await ethers.getSigners();

    // 1. Setup Mock USDC Contract at precompiled address
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUSDC = await MockERC20.deploy();
    await mockUSDC.waitForDeployment();
    const usdcCode = await ethers.provider.getCode(await mockUSDC.getAddress());
    await ethers.provider.send("hardhat_setCode", [USDC_ADDRESS, usdcCode]);
    usdcContract = await ethers.getContractAt("MockERC20", USDC_ADDRESS);

    // 2. Setup Mock EURC Contract at precompiled address
    const mockEURC = await MockERC20.deploy();
    await mockEURC.waitForDeployment();
    const eurcCode = await ethers.provider.getCode(await mockEURC.getAddress());
    await ethers.provider.send("hardhat_setCode", [EURC_ADDRESS, eurcCode]);
    eurcContract = await ethers.getContractAt("MockERC20", EURC_ADDRESS);

    // 3. Deploy ATO Enterprise Vault
    const ATOEnterpriseVault = await ethers.getContractFactory("ATOEnterpriseVault");
    const limit = ethers.parseUnits("5000", 6);
    vault = await ATOEnterpriseVault.deploy([owner.address], 1, limit);
    await vault.waitForDeployment();

    // 4. Configure agent
    await vault.setAgentStatus(agent.address, true);

    // 5. Deploy Mock StableFX contract
    const MockStableFX = await ethers.getContractFactory("MockStableFX");
    mockStableFX = await MockStableFX.deploy();
    await mockStableFX.waitForDeployment();

    // Configure StableFX contract in Vault
    const stableFXAddress = await mockStableFX.getAddress();
    await vault.setStableFXAddress(stableFXAddress);

    // Mint USDC and EURC to Vault
    const vaultAddress = await vault.getAddress();
    await usdcContract.mint(vaultAddress, ethers.parseUnits("10000", 6));
    await eurcContract.mint(vaultAddress, ethers.parseUnits("5000", 6));
  });

  describe("Multi-Token Dynamic Registry", function () {
    it("Should automatically register USDC and EURC tokens during deployment", async function () {
      expect(await vault.isTokenRegistered(USDC_ADDRESS)).to.equal(true);
      expect(await vault.isTokenRegistered(EURC_ADDRESS)).to.equal(true);

      const tokens = await vault.getRegisteredTokens();
      expect(tokens).to.include(USDC_ADDRESS);
      expect(tokens).to.include(EURC_ADDRESS);
    });

    it("Should allow the owner to register new custom tokens dynamically", async function () {
      const randomTokenAddress = ethers.getAddress("0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c");
      await vault.registerToken(randomTokenAddress);
      expect(await vault.isTokenRegistered(randomTokenAddress)).to.equal(true);
      
      const tokens = await vault.getRegisteredTokens();
      expect(tokens).to.include(randomTokenAddress);
    });

    it("Should track separate token balances in the vault", async function () {
      const usdcBalances = await vault["getTreasuryBalances(address)"](USDC_ADDRESS);
      expect(usdcBalances.erc20Balance).to.equal(ethers.parseUnits("10000", 6));

      const eurcBalances = await vault["getTreasuryBalances(address)"](EURC_ADDRESS);
      expect(eurcBalances.erc20Balance).to.equal(ethers.parseUnits("5000", 6));
    });
  });

  describe("StableFX Swaps & Trade Execution", function () {
    it("Should successfully query exchange rate quote from StableFX interface", async function () {
      const sellAmount = ethers.parseUnits("100", 6);
      const quote = await mockStableFX.getFXQuote(USDC_ADDRESS, EURC_ADDRESS, sellAmount);
      
      // Fixed rate is 1.08
      expect(quote.rate).to.equal(ethers.parseUnits("1.08", 18));
      expect(quote.buyAmount).to.equal(ethers.parseUnits("108", 6));
    });

    it("Should allow agents to execute swaps with slippage check", async function () {
      const sellAmount = ethers.parseUnits("100", 6);
      const minBuyAmount = ethers.parseUnits("105", 6); // 105 expected, actual is 108 (so succeeds)

      const vaultAddress = await vault.getAddress();
      const initialVaultUSDC = await usdcContract.balanceOf(vaultAddress);
      const initialVaultEURC = await eurcContract.balanceOf(vaultAddress);

      // Execute USDC to EURC swap
      await vault.connect(agent).executeFxTrade(USDC_ADDRESS, EURC_ADDRESS, sellAmount, minBuyAmount, vaultAddress);

      const finalVaultUSDC = await usdcContract.balanceOf(vaultAddress);
      const finalVaultEURC = await eurcContract.balanceOf(vaultAddress);

      expect(initialVaultUSDC - finalVaultUSDC).to.equal(sellAmount);
      expect(finalVaultEURC - initialVaultEURC).to.equal(ethers.parseUnits("108", 6));
    });

    it("Should revert swap execution if slippage exceeds limit", async function () {
      const sellAmount = ethers.parseUnits("100", 6);
      const minBuyAmount = ethers.parseUnits("110", 6); // 110 expected, actual is 108 (so fails)

      const vaultAddress = await vault.getAddress();
      await expect(
        vault.connect(agent).executeFxTrade(USDC_ADDRESS, EURC_ADDRESS, sellAmount, minBuyAmount, vaultAddress)
      ).to.be.revertedWith("MockStableFX: Slippage limit exceeded");
    });

    it("Should reject non-owners and non-agents attempting FX swaps", async function () {
      const sellAmount = ethers.parseUnits("100", 6);
      const vaultAddress = await vault.getAddress();
      await expect(
        vault.connect(recipient).executeFxTrade(USDC_ADDRESS, EURC_ADDRESS, sellAmount, 0, vaultAddress)
      ).to.be.revertedWithCustomError(vault, "NotAnAgentOrOwner");
    });
  });
});
