import { ethers } from 'ethers';

export interface ChannelInfo {
  channelId: string;
  buyer: string;
  seller: string;
  balance: string; // in USDC
  nonce: number;
  isOpen: boolean;
}

export interface PaymentProof {
  channelId: string;
  amount: string; // in USDC
  nonce: number;
  signature: string;
}

export class CircleGatewaySDK {
  private provider: any;
  private signer: any;
  private gatewayContractAddress: string;

  constructor(config: { provider: any; signer: any; gatewayContractAddress?: string }) {
    this.provider = config.provider;
    this.signer = config.signer;
    this.gatewayContractAddress = config.gatewayContractAddress || ethers.ZeroAddress;
  }

  // Generate x402 headers for a service requiring payment
  public static create402Header(serviceId: string, amountUSD: number, sellerAddress: string): string {
    return JSON.stringify({
      serviceId,
      amountUSD,
      sellerAddress,
      nonce: Math.floor(Math.random() * 1000000)
    });
  }

  // Client creates payment token / signature proof for x402 header request
  public async createPaymentProof(
    channelId: string,
    amountUSD: number,
    nonce: number,
    sellerAddress: string
  ): Promise<PaymentProof> {
    const formattedAmount = amountUSD.toFixed(6);
    const amountUnits = ethers.parseUnits(formattedAmount, 6);
    
    // Hash fields: channelId, amountUnits, nonce, sellerAddress
    const messageHash = ethers.solidityPackedKeccak256(
      ['bytes32', 'uint256', 'uint256', 'address'],
      [channelId, amountUnits, nonce, sellerAddress]
    );
    
    const signature = await this.signer.signMessage(ethers.getBytes(messageHash));
    return {
      channelId,
      amount: formattedAmount,
      nonce,
      signature
    };
  }

  // Seller verifies payment proof
  public verifyPaymentProof(
    proof: PaymentProof,
    expectedAmountUSD: number,
    buyerAddress: string,
    sellerAddress: string
  ): boolean {
    try {
      const amountUnits = ethers.parseUnits(Number(proof.amount).toFixed(6), 6);
      const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'uint256', 'uint256', 'address'],
        [proof.channelId, amountUnits, proof.nonce, sellerAddress]
      );

      const signerAddr = ethers.verifyMessage(ethers.getBytes(messageHash), proof.signature);
      const addressMatch = signerAddr.toLowerCase() === buyerAddress.toLowerCase();
      const amountSufficient = Number(proof.amount) >= expectedAmountUSD;

      return addressMatch && amountSufficient;
    } catch (err) {
      return false;
    }
  }
}
