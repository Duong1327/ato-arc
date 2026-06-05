import { expect } from "chai";
import { AgentStackWalletManager } from "../scripts/agentController";
import { PrismaClient } from "@prisma/client";

describe("Circle Agent Stack & Policy Guardrails Tests", function () {
  let walletManager: AgentStackWalletManager;
  let prisma: PrismaClient;
  const testAgentId = "agent_gamma_allocator";

  before(async function () {
    walletManager = new AgentStackWalletManager();
    prisma = new PrismaClient();

    // Ensure database contains a test record
    await prisma.agentPolicy.upsert({
      where: { id: testAgentId },
      update: {
        spendingLimitDailyUSDC: 5000.0,
        dailyVolumeSpentUSDC: 0.0,
        transactionFrequencyCapPerHour: 10,
        addressAllowlist: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a,0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        enforced: true,
      },
      create: {
        id: testAgentId,
        spendingLimitDailyUSDC: 5000.0,
        dailyVolumeSpentUSDC: 0.0,
        transactionFrequencyCapPerHour: 10,
        addressAllowlist: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a,0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        enforced: true,
      },
    });
  });

  after(async function () {
    // Restore default state
    await prisma.agentPolicy.update({
      where: { id: testAgentId },
      data: {
        dailyVolumeSpentUSDC: 0.0,
        spendingLimitDailyUSDC: 5000.0,
        enforced: true,
        addressAllowlist: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a,0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a",
      },
    });
    await prisma.$disconnect();
  });

  it("should fetch active spending policy correctly from the database", async function () {
    const policy = await walletManager.getActivePolicy();
    expect(policy.agentId).to.equal(testAgentId);
    expect(policy.spendingLimitDailyUSDC).to.equal(5000.0);
    expect(policy.enforced).to.equal(true);
    expect(policy.addressAllowlist).to.include("0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a");
  });

  it("should allow transaction to an address on the Allowlist", async function () {
    const result = await walletManager.evaluateTransactionAgainstPolicies(
      "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
      1000.0
    );
    expect(result.allowed).to.equal(true);
  });

  it("should block transaction to an address not on the Allowlist", async function () {
    const result = await walletManager.evaluateTransactionAgainstPolicies(
      "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF",
      100.0
    );
    expect(result.allowed).to.equal(false);
    expect(result.reason).to.include("is not registered on the agent spending allowlist");
  });

  it("should block transaction if it exceeds the daily spending limit", async function () {
    const result = await walletManager.evaluateTransactionAgainstPolicies(
      "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
      6000.0
    );
    expect(result.allowed).to.equal(false);
    expect(result.reason).to.include("exceeds daily spending limit");
  });

  it("should persist transaction volume inside the database upon successful execution", async function () {
    // Current spent is 0
    await walletManager.recordSuccessfulTransaction(250.0);
    const policy = await walletManager.getActivePolicy();
    expect(policy.dailyVolumeSpentUSDC).to.equal(250.0);

    // Evaluate projected limit with new spent amount
    const result = await walletManager.evaluateTransactionAgainstPolicies(
      "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
      4800.0 // 4800 + 250 = 5050 > 5000 (limit)
    );
    expect(result.allowed).to.equal(false);
  });

  it("should bypass policies validation if enforcement is disabled", async function () {
    // Disable enforcement
    await prisma.agentPolicy.update({
      where: { id: testAgentId },
      data: { enforced: false },
    });

    const result = await walletManager.evaluateTransactionAgainstPolicies(
      "0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF",
      9999.0
    );
    expect(result.allowed).to.equal(true);
  });
});
