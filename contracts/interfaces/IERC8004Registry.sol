// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC8004Registry {
    // Identity check
    function isAgentRegistered(address agent) external view returns (bool);
    function getAgentId(address agent) external view returns (uint256);
    function getAgentURI(uint256 agentId) external view returns (string memory);
    
    // Reputation check
    function getAgentReputation(address agent) external view returns (uint256);
    
    // Events
    event AgentRegistered(address indexed agent, uint256 indexed agentId, string agentURI);
    event ReputationUpdated(address indexed agent, uint256 newReputation);
}
