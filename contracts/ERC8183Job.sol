// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC8183.sol";

interface IERC20Local {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/**
 * @title ERC8183Job
 * @dev Compliant implementation of the ERC-8183 standard for AI Agentic Escrow and Job Settlement.
 */
contract ERC8183Job is IERC8183 {
    
    // --- STATE VARIABLES ---
    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;

    // --- MODIFIERS ---
    modifier onlyClient(uint256 jobId) {
        require(msg.sender == jobs[jobId].client, "ERC8183: caller is not the client");
        _;
    }

    modifier onlyProvider(uint256 jobId) {
        require(msg.sender == jobs[jobId].provider, "ERC8183: caller is not the provider");
        _;
    }

    modifier onlyEvaluator(uint256 jobId) {
        require(msg.sender == jobs[jobId].evaluator, "ERC8183: caller is not the evaluator");
        _;
    }

    // --- CONSTRUCTOR ---
    constructor(
        address _client,
        address _provider,
        address _evaluator,
        address _token,
        uint256 _amount,
        uint256 _expiry,
        bytes32 _deliverableHash
    ) {
        // Automatically create the initial job (ID = 1)
        jobCount++;
        jobs[jobCount] = Job({
            client: _client,
            provider: _provider,
            evaluator: _evaluator,
            token: _token,
            amount: _amount,
            expiry: _expiry,
            status: JobStatus.OPEN,
            deliverableHash: _deliverableHash
        });

        emit JobCreated(jobCount, _client, _provider, _evaluator, _token, _amount, _expiry);
    }

    // --- CORE LIFECYCLE FUNCTIONS ---

    /**
     * @notice Creates a new job under this escrow contract.
     */
    function createJob(
        address provider,
        address evaluator,
        address token,
        uint256 amount,
        uint256 expiry,
        bytes32 deliverableHash
    ) external override returns (uint256 jobId) {
        jobCount++;
        jobs[jobCount] = Job({
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            token: token,
            amount: amount,
            expiry: expiry,
            status: JobStatus.OPEN,
            deliverableHash: deliverableHash
        });

        emit JobCreated(jobCount, msg.sender, provider, evaluator, token, amount, expiry);
        return jobCount;
    }

    /**
     * @notice Locks the budget amount from the client into this escrow contract.
     */
    function fund(uint256 jobId) external override onlyClient(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.OPEN, "ERC8183: job already funded or closed");
        
        job.status = JobStatus.FUNDED;
        emit JobFunded(jobId);

        // Pull tokens from the client
        bool success = IERC20Local(job.token).transferFrom(msg.sender, address(this), job.amount);
        require(success, "ERC8183: token transfer failed");
    }

    /**
     * @notice Called by the provider to submit proof/hash of deliverables.
     */
    function submit(uint256 jobId, bytes32 proofHash) external override onlyProvider(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.FUNDED, "ERC8183: job not funded or already closed");
        require(block.timestamp <= job.expiry, "ERC8183: job expired");

        job.deliverableHash = proofHash;
        job.status = JobStatus.SUBMITTED;
        emit JobSubmitted(jobId, proofHash);
    }

    /**
     * @notice Evaluator attests to job completion and releases escrowed funds to the provider.
     */
    function complete(uint256 jobId) public override onlyEvaluator(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.SUBMITTED || job.status == JobStatus.FUNDED, "ERC8183: invalid job state");

        job.status = JobStatus.COMPLETED;
        emit JobCompleted(jobId);

        // Transfer funds to the provider
        bool success = IERC20Local(job.token).transfer(job.provider, job.amount);
        require(success, "ERC8183: fund payout failed");
    }

    /**
     * @notice Alias for complete to release funds in compliance with naming guidelines.
     */
    function releaseFunds(uint256 jobId) external onlyEvaluator(jobId) {
        complete(jobId);
    }

    /**
     * @notice Evaluator rejects deliverables.
     */
    function reject(uint256 jobId) external override onlyEvaluator(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.SUBMITTED, "ERC8183: job must be submitted to reject");

        job.status = JobStatus.REJECTED;
        emit JobRejected(jobId);
    }

    /**
     * @notice Allows client to reclaim escrowed funds if the job has expired or has been rejected.
     */
    function claimRefund(uint256 jobId) external override onlyClient(jobId) {
        Job storage job = jobs[jobId];
        require(
            job.status == JobStatus.REJECTED || 
            (job.status != JobStatus.COMPLETED && block.timestamp > job.expiry), 
            "ERC8183: refund conditions not met"
        );

        uint256 refundAmount = job.amount;
        job.amount = 0; // Prevent reentrancy
        
        emit RefundClaimed(jobId);

        // Send funds back to the client
        bool success = IERC20Local(job.token).transfer(job.client, refundAmount);
        require(success, "ERC8183: refund transfer failed");
    }
}
