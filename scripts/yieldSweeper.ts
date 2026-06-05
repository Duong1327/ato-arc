import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const prisma = new PrismaClient();

// Configuration fallback constants
const DEFAULT_MIN_YIELD_DIFF = 1.5; // 1.5%
const DEFAULT_BRIDGE_CAP = 10000.0; // 10,000 USDC
const DEFAULT_SLIPPAGE_LIMIT = 0.5; // 0.5%

export interface YieldRates {
  baseAave: number;
  baseComp: number;
  arbAave: number;
  arbComp: number;
  arcYield: number;
}

export class YieldSweeper {
  /**
   * Initializes the Yield Rate configuration in the database if it doesn't exist,
   * then returns the current configuration.
   */
  static async getOrCreateConfig() {
    let config = await prisma.yieldRate.findUnique({
      where: { id: 'rates' }
    });

    if (!config) {
      config = await prisma.yieldRate.create({
        data: {
          id: 'rates',
          baseAave: 3.2,
          baseComp: 2.8,
          arbAave: 3.5,
          arbComp: 3.0,
          arcYield: 5.5,
          minYieldDifferential: DEFAULT_MIN_YIELD_DIFF,
          bridgeSizeCapUSDC: DEFAULT_BRIDGE_CAP,
          slippageLimitPercent: DEFAULT_SLIPPAGE_LIMIT,
          isSweepEnabled: true
        }
      });
    }
    return config;
  }

  /**
   * Generates dynamic yield fluctuations (simulating real-time market updates)
   * and saves them to the database.
   */
  static async updateMarketRates(): Promise<YieldRates> {
    const config = await this.getOrCreateConfig();

    // Introduce small random walks to simulate real market changes
    const randomWalk = (val: number, min = 1.5, max = 8.0) => {
      const change = (Math.random() - 0.5) * 0.4; // +/- 0.2%
      return Math.min(max, Math.max(min, Number((val + change).toFixed(2))));
    };

    // Calculate next fluctuations
    const nextRates = {
      baseAave: randomWalk(config.baseAave, 2.0, 5.0),
      baseComp: randomWalk(config.baseComp, 1.8, 4.5),
      arbAave: randomWalk(config.arbAave, 2.2, 5.5),
      arbComp: randomWalk(config.arbComp, 2.0, 4.8),
      arcYield: randomWalk(config.arcYield, 5.0, 7.5), // Destination yield typically higher (USDC native yield incentive on Arc)
    };

    await prisma.yieldRate.update({
      where: { id: 'rates' },
      data: {
        baseAave: nextRates.baseAave,
        baseComp: nextRates.baseComp,
        arbAave: nextRates.arbAave,
        arbComp: nextRates.arbComp,
        arcYield: nextRates.arcYield,
      }
    });

    return nextRates;
  }

  /**
   * Checks the yield differentials between source networks and Arc.
   * If the differential exceeds the minYieldDifferential, triggers an automated CCTP sweep.
   */
  static async checkAndSweep(): Promise<{ swept: boolean; reason?: string; bridgeLog?: any }> {
    const config = await this.getOrCreateConfig();

    if (!config.isSweepEnabled) {
      return { swept: false, reason: 'Automated yield sweeping is disabled.' };
    }

    // Determine the lowest yield source network/protocol
    const sources = [
      { name: 'Base Aave', rate: config.baseAave, chain: 'Base' },
      { name: 'Base Compound', rate: config.baseComp, chain: 'Base' },
      { name: 'Arbitrum Aave', rate: config.arbAave, chain: 'Arbitrum' },
      { name: 'Arbitrum Compound', rate: config.arbComp, chain: 'Arbitrum' }
    ];

    // Find the one with the lowest yield
    let lowestSource = sources[0];
    for (const source of sources) {
      if (source.rate < lowestSource.rate) {
        lowestSource = source;
      }
    }

    const currentDiff = Number((config.arcYield - lowestSource.rate).toFixed(2));
    console.log(`[Yield Sweeper] Comparing Arc Yield (${config.arcYield}%) to lowest source yield (${lowestSource.name}: ${lowestSource.rate}%).`);
    console.log(`[Yield Sweeper] Current differential is ${currentDiff}%. Minimum required differential: ${config.minYieldDifferential}%.`);

    if (currentDiff < config.minYieldDifferential) {
      return { 
        swept: false, 
        reason: `Yield differential (${currentDiff}%) does not meet the minimum threshold of ${config.minYieldDifferential}%. No sweep triggered.` 
      };
    }

    // Define sweep amount
    // Let's sweep a random portion of idle treasury funds, bounded by the bridge cap
    const sweepAmount = Number((2000 + Math.random() * 3000).toFixed(2)); // e.g. between 2000 and 5000 USDC

    // Safety checks
    // 1. Size Cap limit
    if (sweepAmount > config.bridgeSizeCapUSDC) {
      return {
        swept: false,
        reason: `Proposed sweep amount (${sweepAmount} USDC) exceeds the bridge size cap of ${config.bridgeSizeCapUSDC} USDC.`
      };
    }

    // 2. Slippage check (simulated transaction cost + slippage)
    const simulatedSlippage = Number((Math.random() * 0.8).toFixed(3)); // 0.0% to 0.8%
    if (simulatedSlippage > config.slippageLimitPercent) {
      console.warn(`[Yield Sweeper Alert] High slippage detected: ${simulatedSlippage}% exceeds limit of ${config.slippageLimitPercent}%. Sweep transaction aborted for safety.`);
      
      // Save a failed bridge log to document the guardrail trigger
      const failedLog = await prisma.bridgeLog.create({
        data: {
          sourceChain: lowestSource.chain,
          destChain: 'Arc',
          amountUSDC: sweepAmount,
          yieldDiff: currentDiff,
          status: 'FAILED',
          cctpMessage: 'Slippage validation failed: ' + simulatedSlippage + '% exceeds limit ' + config.slippageLimitPercent + '%'
        }
      });
      return { swept: false, reason: `Slippage limit exceeded: ${simulatedSlippage}% > ${config.slippageLimitPercent}%.`, bridgeLog: failedLog };
    }

    // Create the CCTP sweep transaction log in the database
    const mockTxHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const cctpMsgBytes = '0x000000000000000000000000' + mockTxHash.slice(2, 42); // mock message bytes

    const bridgeLog = await prisma.bridgeLog.create({
      data: {
        sourceChain: lowestSource.chain,
        destChain: 'Arc',
        amountUSDC: sweepAmount,
        yieldDiff: currentDiff,
        status: 'PENDING',
        txHash: mockTxHash,
        cctpMessage: cctpMsgBytes
      }
    });

    console.log(`[Yield Sweeper] Automated bridge triggered!`);
    console.log(`  - Source: ${lowestSource.chain} (${lowestSource.name})`);
    console.log(`  - Amount: ${sweepAmount} USDC`);
    console.log(`  - Yield Differential: ${currentDiff}%`);
    console.log(`  - CCTP Burn Tx: ${mockTxHash}`);

    // Asynchronous confirmation simulation (simulating circle CCTP relay)
    setTimeout(async () => {
      try {
        console.log(`[Yield Sweeper] CCTP Attestation received for Burn Tx ${mockTxHash}. Minting USDC on Arc...`);
        
        await prisma.bridgeLog.update({
          where: { id: bridgeLog.id },
          data: { status: 'COMPLETED' }
        });

        // Add a Transaction entry in the DB to represent the incoming swept treasury funds
        await prisma.transaction.create({
          data: {
            id: 'TX-SWEEP-' + Math.floor(Math.random() * 1000000),
            invoiceId: 'YIELD-SWEEP',
            walletId: 'agent_gamma_allocator',
            amount: sweepAmount,
            status: 'SUCCESS',
            blockchainTxHash: mockTxHash
          }
        });

        console.log(`[Yield Sweeper] Automated CCTP bridge finalized! ${sweepAmount} USDC arrived on Arc.`);
      } catch (err: any) {
        console.error(`[Yield Sweeper] Failed to finalize CCTP bridge log:`, err.message);
      }
    }, 3000);

    return { swept: true, bridgeLog };
  }
}
