import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const prisma = new PrismaClient();

const ERC20_USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const ERC20_EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const NATIVE_USDC_GAS = '0x0000000000000000000000000000000000000000'; // represented as address(0) on-chain

const VAULT_ABI = [
  "function feeBasisPoints() external view returns (uint256)",
  "function accumulatedFees(address token) external view returns (uint256)",
  "function isStakeholder(address account) external view returns (bool)",
  "function setFeeBasisPoints(uint256 newBps) external",
  "function setStakeholder(address stakeholder, bool status) external",
  "function claimFees(address token, uint256 amount) external"
];

export class FeeDistributor {
  static getProvider() {
    try {
      const hre = require('hardhat');
      if (hre && hre.ethers && hre.ethers.provider) {
        return hre.ethers.provider;
      }
    } catch {}
    const rpc = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';
    return new ethers.JsonRpcProvider(rpc);
  }

  static getVaultContract(signer?: ethers.Signer) {
    const address = process.env.VAULT_CONTRACT_ADDRESS || '0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a';
    return new ethers.Contract(address, VAULT_ABI, signer || this.getProvider()) as any;
  }

  /**
   * Reconciles current accumulated fees from the contract to the Prisma database
   */
  static async reconcileFees() {
    const tokens = [
      { address: ERC20_USDC_ADDRESS, symbol: 'USDC', decimals: 6 },
      { address: ERC20_EURC_ADDRESS, symbol: 'EURC', decimals: 6 },
      { address: NATIVE_USDC_GAS, symbol: 'Arc USDC (Native)', decimals: 18 }
    ];

    const vault = this.getVaultContract();
    
    for (const token of tokens) {
      try {
        const rawAccumulated = await vault.accumulatedFees(token.address);
        const accumulated = parseFloat(ethers.formatUnits(rawAccumulated, token.decimals));
        
        await prisma.feeBalance.upsert({
          where: { tokenAddress: token.address },
          update: { accumulatedFees: accumulated },
          create: {
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            accumulatedFees: accumulated,
            claimedFees: 0.0
          }
        });
      } catch (err) {
        console.error(`Error reconciling fees for ${token.symbol}:`, err);
      }
    }

    return prisma.feeBalance.findMany();
  }

  /**
   * Sets the fee schedule in basis points
   */
  static async updateFeeSchedule(ownerSigner: ethers.Signer, newBps: number) {
    const vault = this.getVaultContract(ownerSigner);
    const tx = await vault.setFeeBasisPoints(newBps);
    await tx.wait();
    return tx.hash;
  }

  /**
   * Registers a new stakeholder address allowed to claim fees
   */
  static async registerStakeholder(ownerSigner: ethers.Signer, stakeholder: string, status: boolean) {
    const vault = this.getVaultContract(ownerSigner);
    const tx = await vault.setStakeholder(stakeholder, status);
    await tx.wait();
    return tx.hash;
  }

  /**
   * Claim accumulated fees for a stakeholder
   */
  static async claimFees(stakeholderSigner: ethers.Signer, tokenAddress: string, amount: number) {
    const vault = this.getVaultContract(stakeholderSigner);
    
    // Determine decimals based on tokenAddress
    let decimals = 6;
    let symbol = 'USDC';
    if (tokenAddress.toLowerCase() === ERC20_EURC_ADDRESS.toLowerCase()) {
      symbol = 'EURC';
    } else if (tokenAddress === NATIVE_USDC_GAS) {
      decimals = 18;
      symbol = 'Arc USDC (Native)';
    }

    const rawAmount = ethers.parseUnits(amount.toString(), decimals);
    const tx = await vault.claimFees(tokenAddress, rawAmount);
    await tx.wait();

    const stakeholderAddress = await stakeholderSigner.getAddress();

    // Log the payout in the database
    await prisma.feePayout.create({
      data: {
        stakeholder: stakeholderAddress,
        tokenAddress: tokenAddress,
        tokenSymbol: symbol,
        amount: amount,
        txHash: tx.hash
      }
    });

    // Update FeeBalance table
    await prisma.feeBalance.update({
      where: { tokenAddress: tokenAddress },
      data: {
        claimedFees: { increment: amount }
      }
    });

    // Re-reconcile
    await this.reconcileFees();

    return tx.hash;
  }
}
