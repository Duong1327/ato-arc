// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IComplianceOracle.sol";
import "./interfaces/IERC8004Registry.sol";
import "./ERC8183Job.sol";

/**
 * @dev Standard interface for ERC20 USDC token.
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @title ATOEnterpriseVault
 * @author Autonomous Treasury Orchestrator (ATO)
 * @notice Enterprise-grade smart treasury vault optimized for Circle's Arc Network.
 * Handles dual-decimal conversion between Arc Native USDC Gas (18 decimals) and 
 * ERC-20 USDC (6 decimals). Integrates multi-agent automated execution roles,
 * multi-signature corporate overrides, and milestone-based expenditure allocations.
 */
contract ATOEnterpriseVault {
    
    // --- CONSTANTS ---
    // The official USDC contract address on Arc Testnet
    address public constant ERC20_USDC_ADDRESS = 0x3600000000000000000000000000000000000000;
    
    // Decimal Scaling Factor: Arc L1 Native Gas USDC (18 decimals) vs. ERC-20 USDC (6 decimals)
    // 10^18 / 10^6 = 10^12
    uint256 public constant SCALE_FACTOR = 10 ** 12;

    // --- STRUCTS ---
    struct Milestone {
        string name;
        uint256 allocatedERC20;  // 6 decimals
        uint256 spentERC20;      // 6 decimals
        uint256 timeDeadline;
        bool isActive;
        bool exists;
        address jobContractAddress;
        address provider;
        address evaluator;
    }

    struct TransactionProposal {
        address recipient;
        uint256 amountERC20;     // 6 decimals
        bytes data;
        uint256 approvalCount;
        bool executed;
        bool isNativeGasTx;      // true if transferring native USDC gas (18 decimals)
    }

    // --- STATE VARIABLES ---
    address[] public owners;
    mapping(address => bool) public isOwner;
    mapping(address => bool) public isAgent;
    
    uint256 public requiredSignatures; // Threshold for corporate owner overrides
    uint256 public agentSingleTxLimitERC20; // Maximum amount an agent can transfer in a single txn (6 decimals)
    
    // Milestone tracking
    uint256 public milestoneCount;
    mapping(uint256 => Milestone) public milestones;
    
    // Multi-sig override proposals
    uint256 public proposalCount;
    mapping(uint256 => TransactionProposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApprovedProposal;

    // Compliance Check (Simulated Pre-flight Static Check for Blocklisted Addresses)
    // In production, this can also query a Circle blocklist oracle or static contract call.
    mapping(address => bool) private _localBlocklist;
    address public complianceOracleAddress;

    // ERC-8004 AI Agent Registry & Cryptographic Identity variables
    address public agentRegistryAddress;
    mapping(address => uint256) public agentNonces;

    // --- EVENTS ---
    event AgentStatusUpdated(address indexed agent, bool indexed status);
    event OwnerStatusUpdated(address indexed owner, bool indexed status);
    event SignatureThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event AgentLimitUpdated(uint256 oldLimit, uint256 newLimit);
    
    event MilestoneCreated(uint256 indexed milestoneId, string name, uint256 allocatedERC20, uint256 deadline);
    event MilestoneSpent(uint256 indexed milestoneId, address indexed recipient, uint256 amountERC20);
    event MilestoneStatusChanged(uint256 indexed milestoneId, bool isActive);
    
    event ProposalCreated(uint256 indexed proposalId, address indexed recipient, uint256 amountERC20, bool isNativeGas);
    event ProposalApproved(uint256 indexed proposalId, address indexed owner);
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);
    
    event TreasuryFunded(address indexed sender, uint256 amountERC20, uint256 nativeValueReceived);
    event DirectTransferExecuted(address indexed agent, address indexed recipient, uint256 amountERC20);
    event ComplianceBlocklistUpdated(address indexed targetAddress, bool isBlocklisted);
    event ComplianceOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event AgentRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    
    // --- CUSTOM ERRORS ---
    error NotAnOwner();
    error NotAnAgentOrOwner();
    error AlreadySigned();
    error ProposalAlreadyExecuted();
    error ProposalDoesNotExist();
    error NotEnoughSignatures();
    error AgentLimitExceeded();
    error DeadlinePassed();
    error InactiveMilestone();
    error InsufficientMilestoneFunds();
    error InsufficientVaultBalance();
    error AddressIsBlocklisted();
    error InvalidAddress();
    error ExecutionFailed();
    error InvalidThreshold();
    error InvalidSignature();

    // --- MODIFIERS ---
    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotAnOwner();
        _;
    }

    modifier onlyAgentOrOwner() {
        bool verifiedAgent = false;
        if (agentRegistryAddress != address(0)) {
            verifiedAgent = IERC8004Registry(agentRegistryAddress).isAgentRegistered(msg.sender);
        } else {
            verifiedAgent = isAgent[msg.sender];
        }
        if (!verifiedAgent && !isOwner[msg.sender]) revert NotAnAgentOrOwner();
        _;
    }

    modifier complianceCheck(address target) {
        if (target == address(0)) revert InvalidAddress();
        if (_localBlocklist[target]) revert AddressIsBlocklisted();
        if (complianceOracleAddress != address(0)) {
            if (!IComplianceOracle(complianceOracleAddress).isAddressCompliant(target)) {
                revert AddressIsBlocklisted();
            }
        }
        _;
    }

    // --- CONSTRUCTOR ---
    constructor(
        address[] memory _owners, 
        uint256 _requiredSignatures,
        uint256 _agentSingleTxLimitERC20
    ) {
        if (_owners.length == 0) revert InvalidAddress();
        if (_requiredSignatures == 0 || _requiredSignatures > _owners.length) revert InvalidThreshold();

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            if (owner == address(0)) revert InvalidAddress();
            if (!isOwner[owner]) {
                isOwner[owner] = true;
                owners.push(owner);
                emit OwnerStatusUpdated(owner, true);
            }
        }
        
        requiredSignatures = _requiredSignatures;
        agentSingleTxLimitERC20 = _agentSingleTxLimitERC20;
        
        emit SignatureThresholdUpdated(0, _requiredSignatures);
        emit AgentLimitUpdated(0, _agentSingleTxLimitERC20);
    }

    // --- RECEIVE & FALLBACK ---
    /**
     * @notice Allows the vault to receive native gas USDC (18 decimals) natively.
     */
    receive() external payable {
        emit TreasuryFunded(msg.sender, convertToERC20(msg.value), msg.value);
    }

    fallback() external payable {
        emit TreasuryFunded(msg.sender, convertToERC20(msg.value), msg.value);
    }

    // --- DUAL-DECIMAL CONVERSION UTILITIES ---
    
    /**
     * @notice Converts 6-decimal ERC-20 USDC to 18-decimal Native Gas USDC.
     * @param erc20Amount The amount of USDC in 6-decimals.
     * @return The mathematically equivalent amount in 18-decimals.
     */
    function convertToNativeGas(uint256 erc20Amount) public pure returns (uint256) {
        return erc20Amount * SCALE_FACTOR;
    }

    /**
     * @notice Converts 18-decimal Native Gas USDC to 6-decimal ERC-20 USDC.
     * @dev Uses truncation. In our architecture, backend accounting handles fractional remainders.
     * @param nativeGasAmount The amount of Native Gas USDC in 18-decimals.
     * @return The mathematically equivalent amount in 6-decimals.
     */
    function convertToERC20(uint256 nativeGasAmount) public pure returns (uint256) {
        return nativeGasAmount / SCALE_FACTOR;
    }

    // --- SYSTEM MANAGEMENT (OWNER ONLY) ---

    function setAgentStatus(address agent, bool status) external onlyOwner {
        if (agent == address(0)) revert InvalidAddress();
        isAgent[agent] = status;
        emit AgentStatusUpdated(agent, status);
    }

    function setRequiredSignatures(uint256 newThreshold) external onlyOwner {
        if (newThreshold == 0 || newThreshold > owners.length) revert InvalidThreshold();
        emit SignatureThresholdUpdated(requiredSignatures, newThreshold);
        requiredSignatures = newThreshold;
    }

    function setAgentLimit(uint256 newLimitERC20) external onlyOwner {
        emit AgentLimitUpdated(agentSingleTxLimitERC20, newLimitERC20);
        agentSingleTxLimitERC20 = newLimitERC20;
    }

    /**
     * @notice Allows owners to set compliance mock checks or blocklist addresses to mimic pre-flight screening on-chain.
     */
    function updateComplianceBlocklist(address target, bool isBlocklisted) external onlyOwner {
        _localBlocklist[target] = isBlocklisted;
        emit ComplianceBlocklistUpdated(target, isBlocklisted);
    }

    /**
     * @notice Allows owners to set the compliance oracle contract address.
     */
    function setComplianceOracleAddress(address newOracle) external onlyOwner {
        emit ComplianceOracleUpdated(complianceOracleAddress, newOracle);
        complianceOracleAddress = newOracle;
    }

    /**
     * @notice Allows owners to set the Agent Registry contract address.
     */
    function setAgentRegistryAddress(address newRegistry) external onlyOwner {
        emit AgentRegistryUpdated(agentRegistryAddress, newRegistry);
        agentRegistryAddress = newRegistry;
    }

    // --- MILESTONE TREASURY ALLOCATIONS ---

    /**
     * @notice Creates a new corporate milestone budget.
     * @param name Name/Purpose of the budget (e.g. "Q3 Frontend R&D").
     * @param allocatedERC20 Budget allocated in 6 decimals.
     * @param duration Duration in seconds until expiration.
     */
    function createMilestone(
        string calldata name, 
        uint256 allocatedERC20, 
        uint256 duration,
        address provider,
        address evaluator
    ) external onlyOwner {
        if (provider == address(0) || evaluator == address(0)) revert InvalidAddress();

        milestoneCount++;
        
        // Deploy ERC-8183 Escrow Contract
        ERC8183Job jobContract = new ERC8183Job(
            address(this),
            provider,
            evaluator,
            ERC20_USDC_ADDRESS,
            allocatedERC20,
            block.timestamp + duration,
            bytes32(0)
        );

        // Approve the newly deployed job escrow contract to pull tokens
        IERC20 usdc = IERC20(ERC20_USDC_ADDRESS);
        if (usdc.balanceOf(address(this)) < allocatedERC20) revert InsufficientVaultBalance();

        usdc.approve(address(jobContract), allocatedERC20);

        // Call fund to lock target USDC into the job escrow contract
        jobContract.fund(1);

        milestones[milestoneCount] = Milestone({
            name: name,
            allocatedERC20: allocatedERC20,
            spentERC20: 0,
            timeDeadline: block.timestamp + duration,
            isActive: true,
            exists: true,
            jobContractAddress: address(jobContract),
            provider: provider,
            evaluator: evaluator
        });

        emit MilestoneCreated(milestoneCount, name, allocatedERC20, block.timestamp + duration);
    }

    function setMilestoneStatus(uint256 milestoneId, bool isActive) external onlyOwner {
        if (!milestones[milestoneId].exists) revert ProposalDoesNotExist();
        milestones[milestoneId].isActive = isActive;
        emit MilestoneStatusChanged(milestoneId, isActive);
    }

    // --- AUTONOMOUS AGENT ACTIONS (OPERATIONAL LAYERS) ---

    /**
     * @notice Executed by authorized AI Auditor/Allocator agents to pay standard invoices or payroll directly
     * if the amount is within the `agentSingleTxLimitERC20`. Uses ERC-20 USDC.
     */
    function agentDirectPayoutERC20(
        address recipient, 
        uint256 amountERC20,
        uint256 nonce,
        bytes calldata signature
    ) 
        external 
        onlyAgentOrOwner 
        complianceCheck(recipient) 
        returns (bool) 
    {
        if (amountERC20 > agentSingleTxLimitERC20) revert AgentLimitExceeded();
        
        // Compute the cryptographic message hash matching off-chain signing
        bytes32 messageHash = keccak256(abi.encodePacked(recipient, amountERC20, nonce, address(this), block.chainid));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
        address signer = recoverSigner(ethSignedMessageHash, signature);
        
        // Verify recovered signer is a registered agent (or owner)
        bool verifiedAgent = false;
        if (agentRegistryAddress != address(0)) {
            verifiedAgent = IERC8004Registry(agentRegistryAddress).isAgentRegistered(signer);
        } else {
            verifiedAgent = isAgent[signer];
        }
        if (!verifiedAgent && !isOwner[signer]) revert InvalidSignature();
        
        // Nonce check to prevent replay attacks
        if (nonce != agentNonces[signer]) revert InvalidSignature();
        
        // Increment nonce
        agentNonces[signer]++;
        
        IERC20 usdc = IERC20(ERC20_USDC_ADDRESS);
        if (usdc.balanceOf(address(this)) < amountERC20) revert InsufficientVaultBalance();

        emit DirectTransferExecuted(signer, recipient, amountERC20);
        
        bool success = usdc.transfer(recipient, amountERC20);
        if (!success) revert ExecutionFailed();
        return true;
    }

    /**
     * @notice Executed by agents to release funds allocated to specific active Corporate Milestones.
     * Restricts payouts to the defined budget ceiling and enforces active time windows.
     */
    function agentExecuteMilestonePayout(
        uint256 milestoneId, 
        address recipient, 
        uint256 amountERC20
    ) 
        external 
        onlyAgentOrOwner 
        complianceCheck(recipient) 
        returns (bool) 
    {
        Milestone storage milestone = milestones[milestoneId];
        if (!milestone.exists) revert ProposalDoesNotExist();
        if (!milestone.isActive) revert InactiveMilestone();
        if (block.timestamp > milestone.timeDeadline) revert DeadlinePassed();
        if (milestone.spentERC20 + amountERC20 > milestone.allocatedERC20) revert InsufficientMilestoneFunds();

        milestone.spentERC20 += amountERC20;
        emit MilestoneSpent(milestoneId, recipient, amountERC20);

        // If this milestone is backed by a deployed ERC-8183 escrow contract, the off-chain auditor 
        // agent will trigger the releaseFunds / complete function directly on the job contract.
        // Otherwise, execute the fallback direct transfer from the vault.
        if (milestone.jobContractAddress == address(0)) {
            IERC20 usdc = IERC20(ERC20_USDC_ADDRESS);
            if (usdc.balanceOf(address(this)) < amountERC20) revert InsufficientVaultBalance();
            bool success = usdc.transfer(recipient, amountERC20);
            if (!success) revert ExecutionFailed();
        }

        return true;
    }

    // --- MULTI-SIG OVERRIDE FOR LARGE TRANSACTION PROPOSALS ---

    /**
     * @notice Propose a large treasury outlay or native gas rebalance that exceeds standard limits.
     * @param recipient Target address.
     * @param amountERC20 Amount requested in 6 decimals (converted internally if native gas).
     * @param data Optional payload for target execution.
     * @param isNativeGas True if proposal is to fund native gas wrapper (18 decimals) on Arc.
     */
    function proposeTransaction(
        address recipient, 
        uint256 amountERC20, 
        bytes calldata data,
        bool isNativeGas
    ) 
        external 
        onlyAgentOrOwner 
        complianceCheck(recipient) 
        returns (uint256) 
    {
        proposalCount++;
        
        TransactionProposal storage prop = proposals[proposalCount];
        prop.recipient = recipient;
        prop.amountERC20 = amountERC20;
        prop.data = data;
        prop.approvalCount = 0;
        prop.executed = false;
        prop.isNativeGasTx = isNativeGas;

        emit ProposalCreated(proposalCount, recipient, amountERC20, isNativeGas);
        return proposalCount;
    }

    /**
     * @notice Owners approve proposed transaction overrides.
     */
    function approveProposal(uint256 proposalId) external onlyOwner {
        TransactionProposal storage prop = proposals[proposalId];
        if (prop.recipient == address(0)) revert ProposalDoesNotExist();
        if (prop.executed) revert ProposalAlreadyExecuted();
        if (hasApprovedProposal[proposalId][msg.sender]) revert AlreadySigned();

        hasApprovedProposal[proposalId][msg.sender] = true;
        prop.approvalCount++;

        emit ProposalApproved(proposalId, msg.sender);
    }

    /**
     * @notice Executes a fully approved override transaction. Can handle native gas distribution
     * (which uses 18-decimal scaling inside Arc) or standard ERC-20 transfers.
     */
    function executeProposal(uint256 proposalId) external onlyAgentOrOwner returns (bool) {
        TransactionProposal storage prop = proposals[proposalId];
        if (prop.recipient == address(0)) revert ProposalDoesNotExist();
        if (prop.executed) revert ProposalAlreadyExecuted();
        if (prop.approvalCount < requiredSignatures) revert NotEnoughSignatures();

        prop.executed = true;
        emit ProposalExecuted(proposalId, msg.sender);

        if (prop.isNativeGasTx) {
            // Arc Native Gas transaction. Value must be sent in 18 decimals natively!
            uint256 nativeGasValue = convertToNativeGas(prop.amountERC20);
            if (address(this).balance < nativeGasValue) revert InsufficientVaultBalance();

            (bool success, ) = payable(prop.recipient).call{value: nativeGasValue}(prop.data);
            if (!success) revert ExecutionFailed();
        } else {
            // Standard ERC-20 USDC token transaction (6 decimals)
            IERC20 usdc = IERC20(ERC20_USDC_ADDRESS);
            if (usdc.balanceOf(address(this)) < prop.amountERC20) revert InsufficientVaultBalance();

            bool success = usdc.transfer(prop.recipient, prop.amountERC20);
            if (!success) revert ExecutionFailed();
        }

        return true;
    }

    // --- VIEW FUNCTIONS ---

    /**
     * @notice Get current asset balances of the Vault.
     * @return erc20Balance USDC ERC-20 balance (6 decimals).
     * @return nativeGasBalance Arc Native Gas USDC balance (18 decimals).
     */
    function getTreasuryBalances() external view returns (uint256 erc20Balance, uint256 nativeGasBalance) {
        erc20Balance = IERC20(ERC20_USDC_ADDRESS).balanceOf(address(this));
        nativeGasBalance = address(this).balance;
    }

    /**
     * @notice Pre-flight screening to check if an address is blocklisted.
     * Useful for multi-agent off-chain risk validation.
     */
    function isAddressBlocklisted(address target) external view returns (bool) {
        return _localBlocklist[target];
    }

    /**
     * @notice Cryptographic signature recovery helper.
     */
    function recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature) public pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        return ecrecover(ethSignedMessageHash, v, r, s);
    }
}
