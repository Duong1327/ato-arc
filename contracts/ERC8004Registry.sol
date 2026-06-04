// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC8004Registry.sol";

contract ERC8004Registry is IERC8004Registry {
    address public owner;
    
    uint256 private _nextAgentId = 1;
    
    struct AgentInfo {
        uint256 agentId;
        string agentURI;
        uint256 reputation;
        bool isRegistered;
    }
    
    mapping(address => AgentInfo) public agents;
    mapping(uint256 => address) public agentIdToAddress;
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not registry owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    function registerAgent(
        address agentAddress, 
        string calldata agentURI,
        uint256 initialReputation
    ) external onlyOwner returns (uint256) {
        require(agentAddress != address(0), "Invalid agent address");
        require(!agents[agentAddress].isRegistered, "Agent already registered");
        
        uint256 agentId = _nextAgentId++;
        agents[agentAddress] = AgentInfo({
            agentId: agentId,
            agentURI: agentURI,
            reputation: initialReputation,
            isRegistered: true
        });
        agentIdToAddress[agentId] = agentAddress;
        
        emit AgentRegistered(agentAddress, agentId, agentURI);
        emit ReputationUpdated(agentAddress, initialReputation);
        
        return agentId;
    }
    
    function updateReputation(address agentAddress, uint256 newReputation) external onlyOwner {
        require(agents[agentAddress].isRegistered, "Agent not registered");
        agents[agentAddress].reputation = newReputation;
        emit ReputationUpdated(agentAddress, newReputation);
    }
    
    function isAgentRegistered(address agent) external view override returns (bool) {
        return agents[agent].isRegistered;
    }
    
    function getAgentId(address agent) external view override returns (uint256) {
        require(agents[agent].isRegistered, "Agent not registered");
        return agents[agent].agentId;
    }
    
    function getAgentURI(uint256 agentId) external view override returns (string memory) {
        address agent = agentIdToAddress[agentId];
        require(agent != address(0), "Agent ID does not exist");
        return agents[agent].agentURI;
    }
    
    function getAgentReputation(address agent) external view override returns (uint256) {
        require(agents[agent].isRegistered, "Agent not registered");
        return agents[agent].reputation;
    }
}
