// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IComplianceOracle {
    /**
     * @notice Returns whether an address is compliant according to the oracle.
     * @param target The address to check.
     * @return True if compliant, false if blocked/non-compliant.
     */
    function isAddressCompliant(address target) external view returns (bool);
}
