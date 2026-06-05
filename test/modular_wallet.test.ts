import { expect } from "chai";
import { ethers } from "hardhat";

describe("ATO Phase 4: Circle Modular Wallets & ERC-1271 Signature Validation", function () {
  let vault: any;
  let registry: any;
  let owner: any;
  let agentOwner: any;
  let otherSigner: any;
  let recipient: any;
  let usdcContract: any;
  let smartWallet: any;
  let chainId: bigint;

  const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

  beforeEach(async function () {
    [owner, agentOwner, otherSigner, recipient] = await ethers.getSigners();
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

    // 4. Deploy MockSmartWallet (ERC-1271 contract) owned by agentOwner
    const MockSmartWallet = await ethers.getContractFactory("MockSmartWallet");
    smartWallet = await MockSmartWallet.deploy(agentOwner.address);
    await smartWallet.waitForDeployment();

    // 5. Register MockSmartWallet as an agent in the registry
    const smartWalletAddress = await smartWallet.getAddress();
    await registry.registerAgent(
      smartWalletAddress,
      "ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/smart-wallet.json",
      100
    );

    // 6. Setup Mock USDC Contract at precompiled address
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

  it("Should verify that MockSmartWallet has code on-chain", async function () {
    const smartWalletAddress = await smartWallet.getAddress();
    const code = await ethers.provider.getCode(smartWalletAddress);
    expect(code).to.not.equal("0x");
  });

  it("Should successfully process direct payout using ERC-1271 signature from registered Smart Wallet agent", async function () {
    const amount = ethers.parseUnits("150", 6);
    const nonce = 0n;
    const vaultAddress = await vault.getAddress();
    const smartWalletAddress = await smartWallet.getAddress();

    // Compute message hash
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "address", "uint256"],
      [recipient.address, amount, nonce, vaultAddress, chainId]
    );
    
    // Sign using smart wallet owner's EOA key
    const signature = await agentOwner.signMessage(ethers.getBytes(messageHash));

    const initialBalance = await usdcContract.balanceOf(recipient.address);

    // Call agentDirectPayoutERC20 (overloaded with agentAddress)
    // Caller is owner (who is allowed by modifier onlyOwner)
    await vault.connect(owner).getFunction("agentDirectPayoutERC20(address,uint256,uint256,address,bytes)")(
      recipient.address,
      amount,
      nonce,
      smartWalletAddress,
      signature
    );

    const finalBalance = await usdcContract.balanceOf(recipient.address);
    expect(finalBalance - initialBalance).to.equal(amount);
    expect(await vault.agentNonces(smartWalletAddress)).to.equal(1n);
  });

  it("Should reject direct payout when signature is not signed by Smart Wallet owner", async function () {
    const amount = ethers.parseUnits("150", 6);
    const nonce = 0n;
    const vaultAddress = await vault.getAddress();
    const smartWalletAddress = await smartWallet.getAddress();

    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "address", "uint256"],
      [recipient.address, amount, nonce, vaultAddress, chainId]
    );

    // Sign using otherSigner (not the smart wallet owner)
    const signature = await otherSigner.signMessage(ethers.getBytes(messageHash));

    await expect(
      vault.connect(owner).getFunction("agentDirectPayoutERC20(address,uint256,uint256,address,bytes)")(
        recipient.address,
        amount,
        nonce,
        smartWalletAddress,
        signature
      )
    ).to.be.revertedWithCustomError(vault, "InvalidSignature");
  });

  it("Should reject direct payout when smart wallet agent is not registered", async function () {
    const amount = ethers.parseUnits("150", 6);
    const nonce = 0n;
    const vaultAddress = await vault.getAddress();

    // Deploy unregistered Smart Wallet
    const MockSmartWallet = await ethers.getContractFactory("MockSmartWallet");
    const unregisteredWallet = await MockSmartWallet.deploy(agentOwner.address);
    await unregisteredWallet.waitForDeployment();
    const unregisteredAddress = await unregisteredWallet.getAddress();

    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "address", "uint256"],
      [recipient.address, amount, nonce, vaultAddress, chainId]
    );
    const signature = await agentOwner.signMessage(ethers.getBytes(messageHash));

    await expect(
      vault.connect(owner).getFunction("agentDirectPayoutERC20(address,uint256,uint256,address,bytes)")(
        recipient.address,
        amount,
        nonce,
        unregisteredAddress,
        signature
      )
    ).to.be.revertedWithCustomError(vault, "InvalidSignature");
  });
});
