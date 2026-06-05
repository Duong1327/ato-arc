import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { CircleGatewaySDK, PaymentProof, ChannelInfo } from '@circle-fin/gateway';

dotenv.config();

const ARC_TESTNET_RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';
const STATE_FILE_PATH = path.join(__dirname, '../frontend/public/gateway_state.json');

export interface BillingLog {
  timestamp: string;
  type: 'DEPOSIT' | 'MICRO-PAYMENT' | 'SETTLE' | 'REFUND';
  channelId: string;
  amount: string;
  recipient: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  description: string;
}

export interface GatewayState {
  activeChannel: ChannelInfo | null;
  channelContractAddress: string;
  logs: BillingLog[];
}

const DEFAULT_STATE: GatewayState = {
  activeChannel: null,
  channelContractAddress: ethers.ZeroAddress,
  logs: []
};

// Load state from local JSON file
export function loadGatewayState(): GatewayState {
  try {
    const publicDir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to load gateway state, using defaults:', err);
  }
  return { ...DEFAULT_STATE };
}

// Save state to local JSON file
export function saveGatewayState(state: GatewayState) {
  try {
    const publicDir = path.dirname(STATE_FILE_PATH);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save gateway state:', err);
  }
}

/**
 * Manage payment channels and trigger micro-billings.
 */
export class GatewayBillingManager {
  private sdk: CircleGatewaySDK;
  private signer: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private gatewayAddress: string;

  constructor(privateKey: string, gatewayAddress: string) {
    this.provider = new ethers.JsonRpcProvider(ARC_TESTNET_RPC_URL);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.gatewayAddress = gatewayAddress;
    this.sdk = new CircleGatewaySDK({
      provider: this.provider,
      signer: this.signer,
      gatewayContractAddress: gatewayAddress
    });
  }

  /**
   * Helper to add a log entry to the state.
   */
  private addLog(
    type: 'DEPOSIT' | 'MICRO-PAYMENT' | 'SETTLE' | 'REFUND',
    channelId: string,
    amount: string,
    recipient: string,
    status: 'PENDING' | 'SUCCESS' | 'FAILED',
    description: string
  ) {
    const state = loadGatewayState();
    const log: BillingLog = {
      timestamp: new Date().toISOString(),
      type,
      channelId,
      amount,
      recipient,
      status,
      description
    };
    state.logs.unshift(log);
    saveGatewayState(state);
  }

  /**
   * Opens or funds a Gateway channel with a deposit.
   */
  async getOrOpenChannel(sellerAddress: string, initialDepositUSD: number): Promise<ChannelInfo> {
    const state = loadGatewayState();
    state.channelContractAddress = this.gatewayAddress;
    saveGatewayState(state);

    if (state.activeChannel && state.activeChannel.isOpen) {
      console.log(`[Gateway Billing] Found active payment channel: ${state.activeChannel.channelId}`);
      return state.activeChannel;
    }

    console.log(`[Gateway Billing] Opening a new channel with seller ${sellerAddress} and deposit: $${initialDepositUSD} USDC...`);
    
    // In local testing/mocking, we can generate a mock channel ID and update the state
    const mockChannelId = ethers.hexlify(ethers.randomBytes(32));
    const newChannel: ChannelInfo = {
      channelId: mockChannelId,
      buyer: await this.signer.getAddress(),
      seller: sellerAddress,
      balance: initialDepositUSD.toFixed(6),
      nonce: 0,
      isOpen: true
    };

    state.activeChannel = newChannel;
    saveGatewayState(state);

    this.addLog(
      'DEPOSIT',
      mockChannelId,
      initialDepositUSD.toFixed(6),
      sellerAddress,
      'SUCCESS',
      `Opened payment channel with initial deposit of $${initialDepositUSD.toFixed(2)} USDC`
    );

    return newChannel;
  }

  /**
   * Refuels/funds the active channel.
   */
  async fundActiveChannel(amountUSD: number): Promise<ChannelInfo> {
    const state = loadGatewayState();
    if (!state.activeChannel || !state.activeChannel.isOpen) {
      throw new Error('No active channel open to fund.');
    }

    const currentBalance = parseFloat(state.activeChannel.balance);
    const newBalance = currentBalance + amountUSD;
    state.activeChannel.balance = newBalance.toFixed(6);
    saveGatewayState(state);

    this.addLog(
      'DEPOSIT',
      state.activeChannel.channelId,
      amountUSD.toFixed(6),
      state.activeChannel.seller,
      'SUCCESS',
      `Funded channel with additional deposit of $${amountUSD.toFixed(2)} USDC`
    );

    return state.activeChannel;
  }

  /**
   * Processes a sub-cent payment proof for an agent operation.
   */
  async processAgentPayment(amountUSD: number, serviceName: string): Promise<PaymentProof> {
    const state = loadGatewayState();
    if (!state.activeChannel || !state.activeChannel.isOpen) {
      throw new Error('Underfunded or non-existent Gateway channel.');
    }

    const currentBalance = parseFloat(state.activeChannel.balance);
    if (currentBalance < amountUSD) {
      this.addLog(
        'MICRO-PAYMENT',
        state.activeChannel.channelId,
        amountUSD.toFixed(6),
        state.activeChannel.seller,
        'FAILED',
        `Micropayment of $${amountUSD.toFixed(6)} for ${serviceName} failed: Underfunded Channel`
      );
      throw new Error(`Underfunded channel balance. Available: $${currentBalance.toFixed(6)} USDC, Required: $${amountUSD.toFixed(6)} USDC`);
    }

    // Spend logic
    state.activeChannel.balance = (currentBalance - amountUSD).toFixed(6);
    state.activeChannel.nonce += 1;
    saveGatewayState(state);

    // Generate off-chain cryptographic proof via Gateway SDK
    const proof = await this.sdk.createPaymentProof(
      state.activeChannel.channelId,
      amountUSD,
      state.activeChannel.nonce,
      state.activeChannel.seller
    );

    this.addLog(
      'MICRO-PAYMENT',
      state.activeChannel.channelId,
      amountUSD.toFixed(6),
      state.activeChannel.seller,
      'SUCCESS',
      `Micropayment of $${amountUSD.toFixed(6)} USDC for ${serviceName} validated`
    );

    return proof;
  }

  /**
   * Verifies the cryptographic proof on the merchant/receiver side.
   */
  verifyPayment(proof: PaymentProof, expectedAmountUSD: number, buyerAddress: string, sellerAddress: string): boolean {
    return this.sdk.verifyPaymentProof(proof, expectedAmountUSD, buyerAddress, sellerAddress);
  }
}
