import { expect } from "chai";
import { ethers } from "hardhat";
import { PrismaClient } from "@prisma/client";
import { RemoteExecutionManager } from "../scripts/remoteExecution";

const prisma = new PrismaClient();

describe("ATO Phase 15: Cross-Chain Remote Execution Layer", function () {
  let executor: any;
  let owner: any;
  let agent: any;
  let nonAgent: any;
  let recipient: any;
  let tokenContract: any;

  before(async function () {
    // Re-initialize sqlite clean database logs
    await prisma.remoteExecution.deleteMany({});
  });

  beforeEach(async function () {
    [owner, agent, nonAgent, recipient] = await ethers.getSigners();

    // 1. Deploy a Mock ERC20 to execute remote calls on
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    tokenContract = await MockERC20.deploy();
    await tokenContract.waitForDeployment();

    // 2. Deploy RemoteExecutor contract with agent pre-authorized
    const RemoteExecutor = await ethers.getContractFactory("RemoteExecutor");
    executor = await RemoteExecutor.deploy([agent.address]);
    await executor.waitForDeployment();

    process.env.REMOTE_EXECUTOR_ADDRESS = await executor.getAddress();
  });

  describe("Agent Registration and Ownership Control", function () {
    it("Should initialize the pre-authorized agents during deployment", async function () {
      expect(await executor.isAgent(agent.address)).to.equal(true);
      expect(await executor.isAgent(nonAgent.address)).to.equal(false);
    });

    it("Should allow the owner to authorize/revoke agents", async function () {
      await executor.setAgentStatus(nonAgent.address, true);
      expect(await executor.isAgent(nonAgent.address)).to.equal(true);

      await executor.setAgentStatus(nonAgent.address, false);
      expect(await executor.isAgent(nonAgent.address)).to.equal(false);
    });

    it("Should reject agent updates called by non-owner addresses", async function () {
      await expect(
        executor.connect(nonAgent).setAgentStatus(recipient.address, true)
      ).to.be.revertedWithCustomError(executor, "NotOwner");
    });
  });

  describe("Remote Command Verification & Execution Flow", function () {
    it("Should successfully execute signed cross-chain commands and update database status", async function () {
      const amount = 500;
      const amountUnits = ethers.parseUnits(amount.toString(), 6);
      const recipientAddress = recipient.address;

      // Transfer tokens to the executor contract so it can execute the call
      await tokenContract.transfer(await executor.getAddress(), amountUnits);

      // Encode payload: tokenContract.transfer(recipient, amountUnits)
      const payload = tokenContract.interface.encodeFunctionData("transfer", [
        recipientAddress,
        amountUnits
      ]);

      const executorAddress = await executor.getAddress();
      const nonce = Math.floor(Math.random() * 1000000);

      // Propose command using agent signature
      const { execution, signature, cmd } = await RemoteExecutionManager.proposeCommand(
        agent,
        executorAddress,
        {
          sourceChain: "Arc",
          destChain: "Base",
          targetAddress: await tokenContract.getAddress(),
          payload,
          amountUSDC: amount,
          nonce
        }
      );

      expect(execution.status).to.equal("PENDING");
      expect(execution.nonce).to.equal(nonce);

      // Verify recipient's token balance before execution
      const balanceBefore = await tokenContract.balanceOf(recipientAddress);

      // Execute command on-chain
      const result = await RemoteExecutionManager.executeCommand(
        owner,
        executorAddress,
        execution.id,
        cmd,
        signature
      );

      expect(result.success).to.equal(true);
      expect(result.txHash).to.not.be.undefined;

      // Verify recipient's token balance after execution
      const balanceAfter = await tokenContract.balanceOf(recipientAddress);
      expect(balanceAfter - balanceBefore).to.equal(amountUnits);

      // Verify database updated to EXECUTED
      const updatedExec = await prisma.remoteExecution.findUnique({
        where: { id: execution.id }
      });
      expect(updatedExec?.status).to.equal("EXECUTED");
      expect(updatedExec?.destTxHash).to.equal(result.txHash);
    });

    it("Should reject command execution if signed by unauthorized agent", async function () {
      const payload = tokenContract.interface.encodeFunctionData("transfer", [
        recipient.address,
        100
      ]);

      const executorAddress = await executor.getAddress();
      const nonce = Math.floor(Math.random() * 1000000);

      // Propose using non-agent signer
      const { execution, signature, cmd } = await RemoteExecutionManager.proposeCommand(
        nonAgent, // not authorized agent
        executorAddress,
        {
          sourceChain: "Arc",
          destChain: "Base",
          targetAddress: await tokenContract.getAddress(),
          payload,
          amountUSDC: 10,
          nonce
        }
      );

      await expect(
        RemoteExecutionManager.executeCommand(owner, executorAddress, execution.id, cmd, signature)
      ).to.be.revertedWithCustomError(executor, "NotAgent");

      // Verify status set to FAILED in DB
      const updatedExec = await prisma.remoteExecution.findUnique({
        where: { id: execution.id }
      });
      expect(updatedExec?.status).to.equal("FAILED");
    });

    it("Should prevent command replay attacks by enforcing unique nonces", async function () {
      const amountUnits = ethers.parseUnits("10", 6);
      const payload = tokenContract.interface.encodeFunctionData("transfer", [
        recipient.address,
        amountUnits
      ]);

      await tokenContract.transfer(await executor.getAddress(), amountUnits * 2n);

      const executorAddress = await executor.getAddress();
      const nonce = Math.floor(Math.random() * 1000000);

      const { execution, signature, cmd } = await RemoteExecutionManager.proposeCommand(
        agent,
        executorAddress,
        {
          sourceChain: "Arc",
          destChain: "Base",
          targetAddress: await tokenContract.getAddress(),
          payload,
          amountUSDC: 10,
          nonce
        }
      );

      // Execute first time
      await RemoteExecutionManager.executeCommand(owner, executorAddress, execution.id, cmd, signature);

      // Attempt replay
      await expect(
        executor.executeCommand([cmd.target, cmd.payload, cmd.amountUSDC, cmd.nonce, cmd.expiry], signature)
      ).to.be.revertedWithCustomError(executor, "NonceAlreadyUsed");
    });

    it("Should reject command execution after the expiry has passed", async function () {
      const payload = tokenContract.interface.encodeFunctionData("transfer", [
        recipient.address,
        100
      ]);

      const executorAddress = await executor.getAddress();
      const nonce = Math.floor(Math.random() * 1000000);
      const pastExpiry = Math.floor(Date.now() / 1000) - 60; // Expired 1 minute ago

      const { execution, signature, cmd } = await RemoteExecutionManager.proposeCommand(
        agent,
        executorAddress,
        {
          sourceChain: "Arc",
          destChain: "Base",
          targetAddress: await tokenContract.getAddress(),
          payload,
          amountUSDC: 10,
          nonce,
          expiry: pastExpiry
        }
      );

      await expect(
        RemoteExecutionManager.executeCommand(owner, executorAddress, execution.id, cmd, signature)
      ).to.be.revertedWithCustomError(executor, "CommandExpired");
    });
  });
});
