// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

contract RemoteExecutor {
    // Custom Errors
    error NotOwner();
    error NotAgent();
    error CommandExpired();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error CallExecutionFailed();

    struct Command {
        address target;
        bytes payload;
        uint256 amountUSDC;
        uint256 nonce;
        uint256 expiry;
    }

    address public owner;
    mapping(address => bool) public isAgent;
    mapping(uint256 => bool) public executedNonces;

    // Events
    event CommandExecuted(address indexed target, bytes payload, uint256 amountUSDC, uint256 indexed nonce);
    event AgentStatusUpdated(address indexed agent, bool status);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address[] memory initialAgents) {
        owner = msg.sender;
        for (uint256 i = 0; i < initialAgents.length; i++) {
            isAgent[initialAgents[i]] = true;
            emit AgentStatusUpdated(initialAgents[i], true);
        }
    }

    function setAgentStatus(address agent, bool status) external onlyOwner {
        isAgent[agent] = status;
        emit AgentStatusUpdated(agent, status);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidSignature();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Reconstructs the signed message hash for a given Command.
     */
    function getCommandHash(Command calldata cmd) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                cmd.target,
                cmd.payload,
                cmd.amountUSDC,
                cmd.nonce,
                cmd.expiry,
                address(this),
                block.chainid
            )
        );
    }

    /**
     * @notice Executes an off-chain signed agent command.
     * @param cmd The command struct detailing execution parameters.
     * @param signature The cryptographic signature signed by an authorized agent.
     */
    function executeCommand(Command calldata cmd, bytes calldata signature) external {
        if (block.timestamp > cmd.expiry) revert CommandExpired();
        if (executedNonces[cmd.nonce]) revert NonceAlreadyUsed();

        // Reconstruct signed digest (Eth Signed Message standard)
        bytes32 messageHash = getCommandHash(cmd);
        bytes32 ethSignedMessageHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)
        );

        // Recover signer EOA address
        address signer = recoverSigner(ethSignedMessageHash, signature);
        if (!isAgent[signer]) revert NotAgent();

        // Mark nonce as executed
        executedNonces[cmd.nonce] = true;

        // Perform low-level call execution
        (bool success, ) = cmd.target.call(cmd.payload);
        if (!success) revert CallExecutionFailed();

        emit CommandExecuted(cmd.target, cmd.payload, cmd.amountUSDC, cmd.nonce);
    }

    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) public pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) public pure returns (bytes32 r, bytes32 s, uint8 v) {
        if (sig.length != 65) revert InvalidSignature();

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}
