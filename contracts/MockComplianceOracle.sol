// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IComplianceOracle.sol";

contract MockComplianceOracle is IComplianceOracle {
    mapping(address => bool) private _isBlocked;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @notice Set blocked status for testing.
     */
    function setBlocked(address target, bool blocked) external onlyOwner {
        _isBlocked[target] = blocked;
    }

    /**
     * @notice Returns whether an address is compliant.
     */
    function isAddressCompliant(address target) external view override returns (bool) {
        return !_isBlocked[target];
    }
}
