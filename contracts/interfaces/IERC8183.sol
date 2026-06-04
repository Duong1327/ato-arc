// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC8183
 * @dev Standard interface for ERC-8183 Job contracts representing AI Agentic Commerce.
 */
interface IERC8183 {
    enum JobStatus { OPEN, FUNDED, SUBMITTED, COMPLETED, REJECTED }

    struct Job {
        address client;
        address provider;
        address evaluator;
        address token;
        uint256 amount;
        uint256 expiry;
        JobStatus status;
        bytes32 deliverableHash;
    }

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        address token,
        uint256 amount,
        uint256 expiry
    );
    event JobFunded(uint256 indexed jobId);
    event JobSubmitted(uint256 indexed jobId, bytes32 deliverableHash);
    event JobCompleted(uint256 indexed jobId);
    event JobRejected(uint256 indexed jobId);
    event RefundClaimed(uint256 indexed jobId);

    function createJob(
        address provider,
        address evaluator,
        address token,
        uint256 amount,
        uint256 expiry,
        bytes32 deliverableHash
    ) external returns (uint256 jobId);

    function fund(uint256 jobId) external;

    function submit(uint256 jobId, bytes32 proofHash) external;

    function complete(uint256 jobId) external;

    function reject(uint256 jobId) external;

    function claimRefund(uint256 jobId) external;
}
