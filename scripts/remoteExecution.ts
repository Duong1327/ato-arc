import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const prisma = new PrismaClient();

const EXECUTOR_ABI = [
  "function executeCommand(tuple(address target, bytes payload, uint256 amountUSDC, uint256 nonce, uint256 expiry) cmd, bytes signature) external",
  "function isAgent(address account) external view returns (bool)",
  "function executedNonces(uint256 nonce) external view returns (bool)",
  "function getCommandHash(tuple(address target, bytes payload, uint256 amountUSDC, uint256 nonce, uint256 expiry) cmd) external view returns (bytes32)"
];

export interface Command {
  target: string;
  payload: string; // Hex string (e.g., "0x...")
  amountUSDC: number;
  nonce: number;
  expiry: number; // Unix timestamp
}

export class RemoteExecutionManager {
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

  static getExecutorContract(address: string, signer?: ethers.Signer) {
    return new ethers.Contract(address, EXECUTOR_ABI, signer || this.getProvider()) as any;
  }

  /**
   * Signs a cross-chain command and registers it in the database
   */
  static async proposeCommand(
    agentSigner: ethers.Signer,
    executorAddress: string,
    params: {
      sourceChain: string;
      destChain: string;
      targetAddress: string;
      payload: string;
      amountUSDC: number;
      nonce: number;
      expiry?: number;
    }
  ) {
    const chainId = Number((await this.getProvider().getNetwork()).chainId);
    const expiry = params.expiry || Math.floor(Date.now() / 1000) + 3600; // default 1 hour expiry

    // Scale USDC amount to 6 decimals for the contract command parameters
    const rawAmountUSDC = ethers.parseUnits(params.amountUSDC.toString(), 6);

    const cmd: Command = {
      target: params.targetAddress,
      payload: params.payload,
      amountUSDC: Number(rawAmountUSDC),
      nonce: params.nonce,
      expiry
    };

    // Calculate Keccak256 hash matching Solidity getCommandHash structure
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'bytes', 'uint256', 'uint256', 'uint256', 'address', 'uint256'],
      [cmd.target, cmd.payload, cmd.amountUSDC, cmd.nonce, cmd.expiry, executorAddress, chainId]
    );

    // Sign message using agent's private key
    const signature = await agentSigner.signMessage(ethers.getBytes(messageHash));

    // Save to local database
    const execution = await prisma.remoteExecution.create({
      data: {
        sourceChain: params.sourceChain,
        destChain: params.destChain,
        targetAddress: params.targetAddress,
        payload: params.payload,
        amountUSDC: params.amountUSDC,
        nonce: params.nonce,
        status: 'PENDING',
        signature
      }
    });

    return { execution, signature, cmd };
  }

  /**
   * Submits a signed command to the destination RemoteExecutor smart contract
   */
  static async executeCommand(
    broadcasterSigner: ethers.Signer,
    executorAddress: string,
    dbCommandId: string,
    cmd: Command,
    signature: string
  ) {
    const executor = this.getExecutorContract(executorAddress, broadcasterSigner);

    try {
      // Execute transaction on-chain
      const tx = await executor.executeCommand(
        [cmd.target, cmd.payload, cmd.amountUSDC, cmd.nonce, cmd.expiry],
        signature
      );
      await tx.wait();

      // Update Database Status
      await prisma.remoteExecution.update({
        where: { id: dbCommandId },
        data: {
          status: 'EXECUTED',
          destTxHash: tx.hash
        }
      });

      return { success: true, txHash: tx.hash };
    } catch (err: any) {
      console.error('Remote execution call failed:', err);

      await prisma.remoteExecution.update({
        where: { id: dbCommandId },
        data: { status: 'FAILED' }
      });

      throw err;
    }
  }

  /**
   * Fetches active cross-chain logs from the database
   */
  static async getHistory() {
    return prisma.remoteExecution.findMany({
      orderBy: { createdAt: 'desc' }
    });
  }
}
