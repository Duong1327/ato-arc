import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CircleGatewaySDK } from '@circle-fin/gateway';
import { GatewayBillingManager, saveGatewayState, loadGatewayState } from '../scripts/gatewayBilling';
import * as path from 'path';
import * as fs from 'fs';

describe('Circle Gateway Nanopayments & x402 Agent Micro-Billing', function () {
  let mockGateway: any;
  let mockToken: any;
  let owner: any;
  let buyer: any;
  let seller: any;

  before(async function () {
    [owner, buyer, seller] = await ethers.getSigners();

    // Deploy a mock ERC-20 token to represent USDC
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20Factory.deploy();
    await mockToken.waitForDeployment();

    // Deploy MockGateway
    const MockGatewayFactory = await ethers.getContractFactory('MockGateway');
    mockGateway = await MockGatewayFactory.deploy(
      await mockToken.getAddress()
    );
    await mockGateway.waitForDeployment();
  });

  describe('Solidity MockGateway Contract Specs', function () {
    it('Should allow opening a payment channel', async function () {
      const buyerAddr = await buyer.getAddress();
      const sellerAddr = await seller.getAddress();

      const tx = await mockGateway.connect(buyer).openChannel(
        sellerAddr,
        0, // deposit
        3600 // duration
      );
      const receipt = await tx.wait();
      
      // Parse ChannelOpened event log
      const abi = ["event ChannelOpened(bytes32 indexed channelId, address indexed buyer, address indexed seller, uint256 deposit)"];
      const iface = new ethers.Interface(abi);
      
      let channelId = "";
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'ChannelOpened') {
            channelId = parsed.args[0];
            break;
          }
        } catch (e) {
          // ignore logs from other interfaces
        }
      }

      expect(channelId).to.not.equal("");

      const channel = await mockGateway.getChannel(channelId);
      expect(channel.buyer).to.equal(buyerAddr);
      expect(channel.seller).to.equal(sellerAddr);
      expect(channel.isOpen).to.be.true;
    });

    it('Should allow settling a channel with valid off-chain signatures', async function () {
      const buyerAddr = await buyer.getAddress();
      const sellerAddr = await seller.getAddress();
      const gatewayAddress = await mockGateway.getAddress();

      // Mint 10 USDC to buyer and approve gateway
      const depositAmount = 10000000n; // 10 USDC
      await mockToken.mint(buyerAddr, depositAmount);
      await mockToken.connect(buyer).approve(gatewayAddress, depositAmount);

      const tx = await mockGateway.connect(buyer).openChannel(
        sellerAddr,
        depositAmount, // deposit
        3600 // duration
      );
      const receipt = await tx.wait();

      const abi = ["event ChannelOpened(bytes32 indexed channelId, address indexed buyer, address indexed seller, uint256 deposit)"];
      const iface = new ethers.Interface(abi);
      
      let channelId = "";
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'ChannelOpened') {
            channelId = parsed.args[0];
            break;
          }
        } catch (e) {
          // ignore
        }
      }

      // Sign the proof
      const amount = 5000000n; // finalBalance
      const paymentAmount = 5000000n; // payout 5 USDC to seller
      const nonce = 1n;
      
      const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256', 'address'],
        [channelId, paymentAmount, nonce, gatewayAddress]
      );
      const signature = await buyer.signMessage(ethers.getBytes(messageHash));

      // Settle
      const txSettle = await mockGateway.connect(seller).settleChannel(
        channelId,
        amount,
        paymentAmount,
        signature
      );
      await txSettle.wait();

      const channel = await mockGateway.getChannel(channelId);
      expect(channel.isOpen).to.be.false;
    });
  });

  describe('CircleGatewaySDK Mock & billing billingManager Specs', function () {
    let billingManager: GatewayBillingManager;

    before(async function () {
      const gatewayAddress = await mockGateway.getAddress();
      const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // default hardhat private key
      billingManager = new GatewayBillingManager(privateKey, gatewayAddress);
    });

    beforeEach(function () {
      // Clear local state before each SDK/manager test to ensure sandbox isolation
      const state = loadGatewayState();
      state.activeChannel = null;
      state.logs = [];
      saveGatewayState(state);
    });

    it('Should open and deposit into a gateway channel', async function () {
      const sellerAddr = await seller.getAddress();
      const channel = await billingManager.getOrOpenChannel(sellerAddr, 10.00);
      expect(channel.isOpen).to.be.true;
      expect(parseFloat(channel.balance)).to.equal(10.00);
    });

    it('Should handle normal micropayment operations successfully', async function () {
      const sellerAddr = await seller.getAddress();
      const amount = 0.005; // half cent
      const initialChannel = await billingManager.getOrOpenChannel(sellerAddr, 10.00);
      const initialBalance = parseFloat(initialChannel.balance);

      const proof = await billingManager.processAgentPayment(amount, 'Compliance screening scan');
      expect(proof.channelId).to.equal(initialChannel.channelId);

      // Re-load to get latest state
      const updatedChannel = await billingManager.getOrOpenChannel(sellerAddr, 10.00);
      expect(parseFloat(updatedChannel.balance)).to.equal(initialBalance - amount);
    });

    it('Should block micropayments if the channel is underfunded', async function () {
      const sellerAddr = await seller.getAddress();
      
      // Since beforeEach clears activeChannel, emptyBillingManager will create a clean new channel
      const emptyBillingManager = new GatewayBillingManager(
        '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // second default hardhat account
        await mockGateway.getAddress()
      );

      // Open a channel with $0.00 balance
      const channel = await emptyBillingManager.getOrOpenChannel(sellerAddr, 0.00);
      expect(parseFloat(channel.balance)).to.equal(0.00);

      // Try paying $0.01
      await expect(
        emptyBillingManager.processAgentPayment(0.01, 'Test underfunded payment')
      ).to.be.rejectedWith('Underfunded channel balance');
    });

    it('Should benchmark cryptographic proof generation speed', async function () {
      const sellerAddr = await seller.getAddress();
      await billingManager.getOrOpenChannel(sellerAddr, 10.00);

      const runs = 100;
      const startTime = Date.now();

      for (let i = 0; i < runs; i++) {
        await billingManager.processAgentPayment(0.0001, `Benchmark run ${i}`);
      }

      const durationMs = Date.now() - startTime;
      const averageMs = durationMs / runs;
      console.log(`\n  [Gateway Performance Benchmark]`);
      console.log(`    - Total Runs: ${runs}`);
      console.log(`    - Total Duration: ${durationMs} ms`);
      console.log(`    - Avg Proof Gen Time: ${averageMs.toFixed(3)} ms / transaction\n`);

      expect(averageMs).to.be.lessThan(50); // cryptographic signature should be very fast (under 50ms)
    });
  });
});
