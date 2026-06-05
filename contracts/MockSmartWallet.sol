// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC1271.sol";

contract MockSmartWallet is IERC1271 {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view override returns (bytes4 magicValue) {
        // Recover signer of the signature
        address signer = recoverSigner(hash, signature);
        if (signer == owner) {
            return 0x1626ba7e; // ERC1271 magic value
        }
        return 0xffffffff;
    }

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
