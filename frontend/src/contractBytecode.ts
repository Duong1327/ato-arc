export const ATO_VAULT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "_owners",
        "type": "address[]"
      },
      {
        "internalType": "uint256",
        "name": "_requiredSignatures",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_agentSingleTxLimitERC20",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AddressIsBlocklisted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AgentLimitExceeded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AlreadySigned",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DeadlinePassed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ExecutionFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InactiveMilestone",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientFees",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientMilestoneFunds",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientVaultBalance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAddress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSignature",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidThreshold",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotAnAgentOrOwner",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotAnOwner",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotEnoughSignatures",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProposalAlreadyExecuted",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProposalDoesNotExist",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "Unauthorized",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldLimit",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newLimit",
        "type": "uint256"
      }
    ],
    "name": "AgentLimitUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "oldRegistry",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newRegistry",
        "type": "address"
      }
    ],
    "name": "AgentRegistryUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "AgentStatusUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "targetAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "isBlocklisted",
        "type": "bool"
      }
    ],
    "name": "ComplianceBlocklistUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "oldOracle",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOracle",
        "type": "address"
      }
    ],
    "name": "ComplianceOracleUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      }
    ],
    "name": "DirectTransferExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "oldFacility",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newFacility",
        "type": "address"
      }
    ],
    "name": "FactoringFacilityUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestoneId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "purchaser",
        "type": "address"
      }
    ],
    "name": "FactoringPurchaserRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldBps",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newBps",
        "type": "uint256"
      }
    ],
    "name": "FeeBasisPointsUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "FeeDeducted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "stakeholder",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "FeesClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "sellToken",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "buyToken",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "sellAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "buyAmountBought",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "FxTradeExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestoneId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "allocatedERC20",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "MilestoneCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestoneId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      }
    ],
    "name": "MilestoneSpent",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "milestoneId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      }
    ],
    "name": "MilestoneStatusChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "OwnerStatusUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "ProposalApproved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "isNativeGas",
        "type": "bool"
      }
    ],
    "name": "ProposalCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "executor",
        "type": "address"
      }
    ],
    "name": "ProposalExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "oldThreshold",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newThreshold",
        "type": "uint256"
      }
    ],
    "name": "SignatureThresholdUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "oldStableFX",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newStableFX",
        "type": "address"
      }
    ],
    "name": "StableFXAddressUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "stakeholder",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "StakeholderStatusUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address[]",
        "name": "tokens",
        "type": "address[]"
      },
      {
        "indexed": false,
        "internalType": "uint256[]",
        "name": "weights",
        "type": "uint256[]"
      }
    ],
    "name": "TargetWeightsUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      }
    ],
    "name": "TokenRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "sender",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "nativeValueReceived",
        "type": "uint256"
      }
    ],
    "name": "TreasuryFunded",
    "type": "event"
  },
  {
    "stateMutability": "payable",
    "type": "fallback"
  },
  {
    "inputs": [],
    "name": "ERC20_EURC_ADDRESS",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "ERC20_USDC_ADDRESS",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SCALE_FACTOR",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "accumulatedFees",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "agentDirectPayoutERC20",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "agentDirectPayoutERC20",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "agentDirectPayoutToken",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nonce",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "agentDirectPayoutToken",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "milestoneId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      }
    ],
    "name": "agentExecuteMilestonePayout",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "agentNonces",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "agentRegistryAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "agentSingleTxLimitERC20",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "approveProposal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "claimFees",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "complianceOracleAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "nativeGasAmount",
        "type": "uint256"
      }
    ],
    "name": "convertToERC20",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "erc20Amount",
        "type": "uint256"
      }
    ],
    "name": "convertToNativeGas",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "allocatedERC20",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "duration",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "provider",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "evaluator",
        "type": "address"
      }
    ],
    "name": "createMilestone",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "allocatedERC20",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "duration",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "provider",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "evaluator",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "createMilestone",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sellToken",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "buyToken",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "sellAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "minBuyAmount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "executeFxTrade",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "buyAmountBought",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "proposalId",
        "type": "uint256"
      }
    ],
    "name": "executeProposal",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "factoringFacilityAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeBasisPoints",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getIndexTokens",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getRegisteredTokens",
    "outputs": [
      {
        "internalType": "address[]",
        "name": "",
        "type": "address[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "getTreasuryBalances",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "erc20Balance",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nativeGasBalance",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTreasuryBalances",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "erc20Balance",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "nativeGasBalance",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "hasApprovedProposal",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "indexTokens",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "target",
        "type": "address"
      }
    ],
    "name": "isAddressBlocklisted",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "isAgent",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "isOwner",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "isStakeholder",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "isTokenRegistered",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "milestoneCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "milestonePurchaser",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "milestones",
    "outputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "allocatedERC20",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "spentERC20",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "timeDeadline",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "address",
        "name": "jobContractAddress",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "provider",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "evaluator",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "owners",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "proposalCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "proposals",
    "outputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      },
      {
        "internalType": "uint256",
        "name": "approvalCount",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "executed",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isNativeGasTx",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amountERC20",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      },
      {
        "internalType": "bool",
        "name": "isNativeGas",
        "type": "bool"
      }
    ],
    "name": "proposeTransaction",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "ethSignedMessageHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "recoverSigner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "milestoneId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "purchaser",
        "type": "address"
      }
    ],
    "name": "registerFactoringPurchaser",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      }
    ],
    "name": "registerToken",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "registeredTokens",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "requiredSignatures",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newLimitERC20",
        "type": "uint256"
      }
    ],
    "name": "setAgentLimit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newRegistry",
        "type": "address"
      }
    ],
    "name": "setAgentRegistryAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "setAgentStatus",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOracle",
        "type": "address"
      }
    ],
    "name": "setComplianceOracleAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_factoringFacility",
        "type": "address"
      }
    ],
    "name": "setFactoringFacility",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newBps",
        "type": "uint256"
      }
    ],
    "name": "setFeeBasisPoints",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "milestoneId",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      }
    ],
    "name": "setMilestoneStatus",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newThreshold",
        "type": "uint256"
      }
    ],
    "name": "setRequiredSignatures",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newStableFX",
        "type": "address"
      }
    ],
    "name": "setStableFXAddress",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "stakeholder",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "status",
        "type": "bool"
      }
    ],
    "name": "setStakeholder",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "tokens",
        "type": "address[]"
      },
      {
        "internalType": "uint256[]",
        "name": "weights",
        "type": "uint256[]"
      }
    ],
    "name": "setTargetWeights",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "stableFXAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "targetWeights",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "target",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "isBlocklisted",
        "type": "bool"
      }
    ],
    "name": "updateComplianceBlocklist",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "signer",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "ethSignedMessageHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes",
        "name": "signature",
        "type": "bytes"
      }
    ],
    "name": "verifySignature",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
] as const;

export const ATO_VAULT_BYTECODE = "0x604060808152346200037e576200613790813803806200001f8162000383565b93843982016060838203126200037e5782516001600160401b0391908281116200037e5784019181601f840112156200037e578251908111620001ac5760059181831b60209485806200007481850162000383565b8096815201928201019283116200037e578501905b8282106200035d5750505083838601519501518151156200034c578515801562000341575b620003305760005b8251811015620001d35780841b83018501516001600160a01b03168015620001c2578060005260019081875287600020805460ff81161562000120575b5050505060001981146200010a57600101620000b6565b634e487b7160e01b600052601160045260246000fd5b60ff19168317905560005468010000000000000000811015620001ac5782810180600055811015620001965760008080528881209190910180546001600160a01b031916831790557f8fbed58a67991416e812270ffc7698fb1478ccb821b7c556aa67c98d1797d3649080a338808080620000f3565b634e487b7160e01b600052603260045260246000fd5b634e487b7160e01b600052604160045260246000fd5b865163e6c4247b60e01b8152600490fd5b858288878160035582600455601b60991b928360005260108252846000209360ff1994600186825416179055600f90815490680100000000000000009182811015620001ac576001810180855581101562000196578360005285600020019560018060a01b03199682888254161790557f158412daecdc1456d01568828bcdb18464cc7f1ce0215ddbc3f3cfede9d1e63d9182600080a27389b50855aa3be2f677cd6303cec089b5f319d72a97886000526010875260018a60002091825416179055835492831015620001ac576001830180855583101562000196578789977f4bb9f2da0fb9c1041e37dbf9e3213e18e69d7d5fb478d2399c5c76d46863e2599989957f149153f58b4da003a8cfd4523709a202402182cb5aa335046911277a1be6eede97600052896000200191825416179055835192600080a26000825285820152a182519160008352820152a151615d8d9081620003aa8239f35b845163aabd5a0960e01b8152600490fd5b5081518611620000ae565b845163e6c4247b60e01b8152600490fd5b81516001600160a01b03811681036200037e57815290850190850162000089565b600080fd5b6040519190601f01601f191682016001600160401b03811183821017620001ac5760405256fe608060405260043610156200002c575b3615620000225762000020620028ab565b005b62000020620028ab565b60003560e01c8063013cf08b14620004755780630165dd27146200046f578063017519981462000469578063025e7c2714620004635780630681ca55146200045d578063072c9511146200045757806309824a80146200045157806309b21981146200044b5780630a85ef8d14620004455780630ab33277146200043f5780630d61b519146200043957806311988e5b146200043357806314cbd993146200042d578063178f421514620004275780631ffbb064146200042157806323fc0ab2146200041b578063243d2379146200041557806324f0ca22146200040f57806326aa101f146200040957806326f9009914620004035780632f54bf6e14620003fd578063369db57714620003f7578063377e524014620003f157806338f250ec14620003eb5780633c2c980214620003e55780634a437f8814620003df5780635c46ff9914620003d95780635f4240db14620003d357806365efe08414620003cd5780637373352314620003c7578063770669d414620003c15780637d2b9cc014620003bb57806381c633b514620003b557806382af76fe14620003af578063840aac2c14620003a95780638d06804314620003a357806390ab709b146200039d57806394ab95b9146200039757806397aba7f9146200039157806398951b56146200038b57806399dcfc9614620003855780639a0ba2ea146200037f5780639de4d5a01462000379578063a1fde54f1462000373578063a6c55961146200036d578063b514295d1462000367578063b8606eef1462000361578063b96034a8146200035b578063bc97c95e1462000355578063ce4b5bbe146200034f578063ce83e1b61462000349578063cffe15151462000343578063da35c664146200033d578063deb62b181462000337578063e89e4ed61462000331578063ea81aedc146200032b578063ef037b901462000325578063f95b620d146200031f578063fa17ebf71462000319578063fc5bb15c14620003135763fcf66664036200000f576200286a565b620027e0565b620027af565b62002728565b620026e2565b62002649565b62002500565b6200243c565b6200241c565b620021f6565b620020f9565b620020d7565b62002096565b62001f7d565b62001f5d565b62001e36565b62001e0b565b62001d81565b62001cff565b62001cb2565b62001c30565b62001aee565b62001a98565b62001a78565b62001976565b62001956565b62001831565b62001727565b620016a6565b62001624565b6200159d565b6200153e565b620014b5565b6200148f565b62001303565b620012b6565b6200128b565b62001215565b620011cf565b620010da565b62001094565b62001053565b6200100d565b62000feb565b62000fc0565b62000ea7565b62000e31565b62000d13565b62000c8d565b62000b64565b62000a4d565b620009e6565b620009b0565b62000985565b62000941565b62000904565b620008e4565b62000894565b620007ea565b620006a9565b6200058e565b90600182811c92168015620004ad575b60208310146200049757565b634e487b7160e01b600052602260045260246000fd5b91607f16916200048b565b634e487b7160e01b600052604160045260246000fd5b6001600160401b038111620004e257604052565b620004b8565b90601f801991011681019081106001600160401b03821117620004e257604052565b919082519283825260005b84811062000537575050826000602080949584010152601f8019910116010190565b60208183018101518483018201520162000515565b94919260a0949796936200057a92600180881b03168752602087015260c0604087015260c08601906200050a565b956060850152151560808401521515910152565b34620006a457602080600319360112620006a45760006004358152600882526040812060018060a01b0381541660018083015493600284019560405196879383825492620005dc846200047b565b808852938381169081156200067d575060011462000632575b868a6200062e8b8b6200060b858c0386620004e8565b600460038301549201549160405195869560ff808660081c16951693876200054c565b0390f35b8152838120979695945091905b8183106200066457509495509293509091820101816200060b6200062e3880620005f5565b87548a840185015296870196899450918301916200063f565b60ff19168689015250505050151560051b8301019050816200060b6200062e3880620005f5565b600080fd5b34620006a4576020366003190112620006a45760043533600052600160205260ff60406000205416156200072c576103e881116200071a5760155460408051918252602082018390527fa000bd133a155b02a7bc4f0592fdaf6cfb67ae19c4176c6cbc7bdafda544817d91a1601555005b60405163aabd5a0960e01b8152600490fd5b604051631dd523ff60e31b8152600490fd5b6001600160a01b03811603620006a457565b6040519061014082018281106001600160401b03821117620004e257604052565b6001600160401b038111620004e257601f01601f191660200190565b9291926200079b8262000771565b91620007ab6040519384620004e8565b829481845281830111620006a4578281602093846000960137010152565b9080601f83011215620006a457816020620007e7933591016200078d565b90565b34620006a4576060366003190112620006a4576004356200080b816200073e565b6044356001600160401b038111620006a457602091620008346200083f923690600401620007c9565b9060243590620040e6565b6040519015158152f35b634e487b7160e01b600052603260045260246000fd5b6011548110156200087b57601160005260206000200190600090565b62000849565b6001600160a01b03909116815260200190565b34620006a4576020366003190112620006a4576004356000908154811015620008d45781805260209182902001546040516001600160a01b039091168152f35b5080fd5b6000910312620006a457565b34620006a4576000366003190112620006a4576020600554604051908152f35b34620006a4576020366003190112620006a4576200092f60043562000929816200073e565b62004dc5565b60408051928352602083019190915290f35b34620006a4576020366003190112620006a45760043562000962816200073e565b33600052600160205260ff60406000205416156200072c576200002090620029ae565b34620006a4576000366003190112620006a457600e546040516001600160a01b039091168152602090f35b34620006a4576020366003190112620006a4576004356000526014602052602060018060a01b0360406000205416604051908152f35b34620006a4576020366003190112620006a45760043533600052600160205260ff60406000205416156200072c5760045460408051918252602082018390527f4bb9f2da0fb9c1041e37dbf9e3213e18e69d7d5fb478d2399c5c76d46863e25991a1600455005b34620006a4576020366003190112620006a457600c546001600160a01b0316801562000b4e5760206040518092631a26db1160e21b8252818062000a95336004830162000881565b03915afa90811562000b485760009162000b13575b505b158062000aee575b62000adc576200062e62000aca60043562004ad9565b60405190151581529081906020820190565b60405163332d131b60e11b8152600490fd5b5062000b0d62000b0962000b023362000daf565b5460ff1690565b1590565b62000ab4565b62000b39915060203d811162000b40575b62000b308183620004e8565b81019062002b67565b3862000aaa565b503d62000b24565b62002b9a565b5062000b5e62000b023362000d95565b62000aac565b34620006a4576060366003190112620006a45760243562000b85816200073e565b600c546001600160a01b0316801562000c315760206040518092631a26db1160e21b8252818062000bba336004830162000881565b03915afa90811562000b485760009162000c0e575b505b158062000bf4575b62000adc5762000aca6200062e9160443590600435620041a6565b5062000c0862000b0962000b023362000daf565b62000bd9565b62000c2a915060203d811162000b405762000b308183620004e8565b3862000bcf565b5062000c4162000b023362000d95565b62000bd1565b6020908160408183019282815285518094520193019160005b82811062000c6f575050505090565b83516001600160a01b03168552938101939281019260010162000c60565b34620006a45760008060031936011262000d1057604051600f805480835290835260208083019360008051602062005d3883398151915292915b82821062000cef576200062e8562000ce281890382620004e8565b6040519182918262000c47565b83546001600160a01b03168652948501946001938401939091019062000cc7565b80fd5b34620006a4576020366003190112620006a45760043562000d34816200073e565b600090338252600160205260ff604083205416156200072c57600c546001600160a01b0391821691829082167f29d43d615aa13e2afae5605639201aa6571c7d1ec3bec3eb4a33605f8d0db2648580a36001600160a01b03191617600c5580f35b6001600160a01b0316600090815260026020526040902090565b6001600160a01b0316600090815260016020526040902090565b6001600160a01b0316600090815260166020526040902090565b6001600160a01b0316600090815260106020526040902090565b6001600160a01b03166000908152600a6020526040902090565b6001600160a01b03166000908152600d6020526040902090565b34620006a4576020366003190112620006a45760043562000e52816200073e565b60018060a01b03166000526002602052602060ff604060002054166040519015158152f35b9181601f84011215620006a4578235916001600160401b038311620006a45760208381860195010111620006a457565b34620006a45760a0366003190112620006a45760043562000ec8816200073e565b6064359062000ed7826200073e565b6084356001600160401b038111620006a45762000ef990369060040162000e77565b600c549091906001600160a01b0316801562000faa5760206040518092631a26db1160e21b8252818062000f31336004830162000881565b03915afa90811562000b485760009162000f87575b505b158062000f6d575b62000adc576200062e9362000aca93604435906024359062003790565b5062000f8162000b0962000b023362000daf565b62000f50565b62000fa3915060203d811162000b405762000b308183620004e8565b3862000f46565b5062000fba62000b023362000d95565b62000f48565b34620006a4576000366003190112620006a4576013546040516001600160a01b039091168152602090f35b34620006a4576000366003190112620006a457604051601b60991b8152602090f35b34620006a4576020366003190112620006a4576004356200102e816200073e565b60018060a01b03166000526010602052602060ff604060002054166040519015158152f35b34620006a4576020366003190112620006a45760043562001074816200073e565b60018060a01b0316600052600d6020526020604060002054604051908152f35b34620006a4576020366003190112620006a457600435620010b5816200073e565b60018060a01b03166000526001602052602060ff604060002054166040519015158152f35b34620006a4576040366003190112620006a457602435600435620010fe826200073e565b6013546200111c906001600160a01b03165b6001600160a01b031690565b330362000adc576200114d62000b09600462001142846000526006602052604060002090565b015460081c60ff1690565b620011bd576001600160a01b038216918215620011ab5762001184906200117e836000526014602052604060002090565b6200293a565b7fe1670b359cd30045beb88acf780fd153d5855d5fbe707df036475238af543677600080a3005b60405163e6c4247b60e01b8152600490fd5b604051636ce3c70160e11b8152600490fd5b34620006a4576020366003190112620006a457600435620011f0816200073e565b60018060a01b0316600052600a602052602060ff604060002054166040519015158152f35b34620006a45760008060031936011262000d10576040516011805480835290835260208083019360008051602062005cf883398151915292915b8282106200126a576200062e8562000ce281890382620004e8565b83546001600160a01b0316865294850194600193840193909101906200124f565b34620006a4576000366003190112620006a457600c546040516001600160a01b039091168152602090f35b34620006a4576020366003190112620006a457600435601154811015620006a457601160005260008051602062005cf883398151915201546040516001600160a01b039091168152602090f35b34620006a457604080600319360112620006a45760049081359062001328826200073e565b33600090815260176020526040902060243592906200134c9062000b099062000b02565b6200148057826200135d8262000dc9565b541062001470576200136f8162000dc9565b6200137c84825462002b59565b90556001600160a01b03169283620013e657600080808086335af1620013a162002ba6565b5015620013d857507ffe3464cd748424446c37877c28ce5b700222c5bc9f90d908afcc4e5cb22707ff905b519182523391602090a3005b9051632b3f6d1160e21b8152fd5b815163a9059cbb60e01b81526020818062001405873387840162002b7f565b03816000895af190811562000b48576000916200144d575b5015620013d857507ffe3464cd748424446c37877c28ce5b700222c5bc9f90d908afcc4e5cb22707ff90620013cc565b62001469915060203d811162000b405762000b308183620004e8565b386200141d565b8151638d53e55360e01b81528490fd5b81516282b42960e81b81528490fd5b34620006a4576020366003190112620006a457602060405164e8d4a51000600435048152f35b34620006a4576020366003190112620006a457600435620014d6816200073e565b600090338252600160205260ff604083205416156200072c576001600160a01b03908116908115620011ab57601380546001600160a01b031981168417909155167f0cad0986d025fe48b48637d74ffd4307f383bb41bca33e8ee6f39f48e89968f78380a380f35b34620006a4576020366003190112620006a4576020620015606004356200291f565b604051908152f35b80151503620006a457565b6040906003190112620006a4576004356200158e816200073e565b90602435620007e78162001568565b34620006a457620015ae3662001573565b600091338352600160205260ff604084205416156200072c576001600160a01b0316908115620011ab578183526017602052620015fa81604085209060ff801983541691151516179055565b1515907f275f086356231c35020e0045ed24caf1e779bee7a6665d529f77ba195f4e7c0a8380a380f35b34620006a4576020366003190112620006a45760043533600052600160205260ff60406000205416156200072c57801580156200169a575b6200071a5760035460408051918252602082018390527f149153f58b4da003a8cfd4523709a202402182cb5aa335046911277a1be6eede91a1600355005b5060005481116200165c565b34620006a457620016b73662001573565b600091338352600160205260ff604084205416156200072c576001600160a01b0316808352600a602090815260408420805460ff191660ff8515151617905590917f588fa2fa21918bc52f49f5375ba6167344fb333211a1318238b6b627c6a6d30591906040519015158152a280f35b34620006a4576080366003190112620006a45760043562001748816200073e565b6064356001600160401b038111620006a4576200176a90369060040162000e77565b600c549192916001600160a01b031680156200181b5760206040518092631a26db1160e21b82528180620017a2336004830162000881565b03915afa90811562000b4857600091620017f8575b505b1580620017de575b62000adc576200062e9262000aca926044359060243590620035e6565b50620017f262000b0962000b023362000daf565b620017c1565b62001814915060203d811162000b405762000b308183620004e8565b38620017b7565b506200182b62000b023362000d95565b620017b9565b34620006a4576080366003190112620006a45760043562001852816200073e565b6044356001600160401b038111620006a4576200187490369060040162000e77565b60649291923590620018868262001568565b600c546001600160a01b03168015620019405760206040518092631a26db1160e21b82528180620018bb336004830162000881565b03915afa90811562000b48576000916200191d575b505b158062001903575b62000adc576200062e93620018f393602435906200480a565b6040519081529081906020820190565b506200191762000b0962000b023362000daf565b620018da565b62001939915060203d811162000b405762000b308183620004e8565b38620018d0565b506200195062000b023362000d95565b620018d2565b34620006a4576000366003190112620006a4576020600354604051908152f35b34620006a45760a0366003190112620006a45760043562001997816200073e565b60243590620019a6826200073e565b608435620019b4816200073e565b600c546001600160a01b0316801562001a625760206040518092631a26db1160e21b82528180620019e9336004830162000881565b03915afa90811562000b485760009162001a3f575b505b158062001a25575b62000adc576200062e92620018f392606435916044359162002beb565b5062001a3962000b0962000b023362000daf565b62001a08565b62001a5b915060203d811162000b405762000b308183620004e8565b38620019fe565b5062001a7262000b023362000d95565b62001a00565b34620006a4576000366003190112620006a4576020600454604051908152f35b34620006a4576040366003190112620006a4576024356001600160401b038111620006a45762001adc62001ad36020923690600401620007c9565b60043562004e45565b6040516001600160a01b039091168152f35b34620006a4576020366003190112620006a45760048035600091338352600160205260ff6040842054161562001c215762001b33826000526008602052604060002090565b80549091906001600160a01b03161562001c12578181015460ff1662001c035762001b8862000b023362001b71866000526009602052604060002090565b9060018060a01b0316600052602052604060002090565b62001bf4575060039062001bbc62001baf3362001b71866000526009602052604060002090565b805460ff19166001179055565b0162001bc9815462002a54565b905533907f049c28adfe50bcf1b76fd95273b6a24566b9f377e52fddc653c3355248dad07a8380a380f35b60405163585eb56560e11b8152fd5b6040516351618d5360e01b8152fd5b604051636ce3c70160e11b8152fd5b604051631dd523ff60e31b8152fd5b34620006a4576020366003190112620006a45760043562001c51816200073e565b600090338252600160205260ff604083205416156200072c57600e546001600160a01b0391821691829082167fa7e3397f5ffe7bdbc31cebe54ce8c1e1d8f1f905382da65e43c5aea6ff1ed6078580a36001600160a01b03191617600e5580f35b34620006a4576020366003190112620006a457600435600f54811015620006a457600f60005260008051602062005d3883398151915201546040516001600160a01b039091168152602090f35b34620006a4576020366003190112620006a45760043562001d20816200073e565b600090338252600160205260ff604083205416156200072c57600b546001600160a01b0391821691829082167f3641a035def717206d548bd39933ff6efbd82c447a411565258f5e784ebd16198580a36001600160a01b03191617600b5580f35b34620006a45760a0366003190112620006a4576004356001600160401b038111620006a45762001db690369060040162000e77565b9060643562001dc5816200073e565b6084359162001dd4836200073e565b33600052600160205260ff60406000205416156200072c57620000209362001e05604435926024359236916200078d565b6200301a565b34620006a4576000366003190112620006a457600b546040516001600160a01b039091168152602090f35b34620006a45760c0366003190112620006a45760043562001e57816200073e565b6024359062001e66826200073e565b60843562001e74816200073e565b60a4356001600160401b038111620006a45762001e9690369060040162000e77565b600c549092906001600160a01b0316801562001f475760206040518092631a26db1160e21b8252818062001ece336004830162000881565b03915afa90811562000b485760009162001f24575b505b158062001f0a575b62000adc576200062e9462000aca94606435916044359162003a0a565b5062001f1e62000b0962000b023362000daf565b62001eed565b62001f40915060203d811162000b405762000b308183620004e8565b3862001ee3565b5062001f5762000b023362000d95565b62001ee5565b34620006a4576000366003190112620006a4576020601554604051908152f35b34620006a45760a0366003190112620006a45760043562001f9e816200073e565b6024359062001fad826200073e565b6084356001600160401b038111620006a45762001fcf90369060040162000e77565b600c549091906001600160a01b03168015620020805760206040518092631a26db1160e21b8252818062002007336004830162000881565b03915afa90811562000b48576000916200205d575b505b158062002043575b62000adc576200062e9362000aca936064359160443591620038a0565b506200205762000b0962000b023362000daf565b62002026565b62002079915060203d811162000b405762000b308183620004e8565b386200201c565b506200209062000b023362000d95565b6200201e565b34620006a4576020366003190112620006a457600435620020b7816200073e565b60018060a01b031660005260126020526020604060002054604051908152f35b34620006a4576000366003190112620006a457602060405164e8d4a510008152f35b34620006a457604080600319360112620006a4576004356024356200211e8162001568565b600092338452600160205260ff818520541615620021b357828452600660205260ff6004828620015460081c1615620021a3577fd783cedf89cb17ea0f372ce84d8cf78d05e088ecfc05086b7c259296ec79479f916020918486526006835262002199826004838920019060ff801983541691151516179055565b519015158152a280f35b51636ce3c70160e11b8152600490fd5b51631dd523ff60e31b8152600490fd5b9181601f84011215620006a4578235916001600160401b038311620006a4576020808501948460051b010111620006a457565b34620006a457604080600319360112620006a45760046001600160401b038135818111620006a4576200222d9036908401620021c3565b91602435908111620006a457620022489036908501620021c3565b9460009433865260018060205260ff8388205416156200240d57878603620023fe5786815b62002397575b50506200227f62002a7d565b85805b868210620022de57612710915003620022d0575094620022ca917f5fe0d79e633b3ed00b10fcc83803bf46fbdacce4bc51677706c570ddf44291619596519485948562002adf565b0390a180f35b905163aabd5a0960e01b8152fd5b620022f5620022ef83898962002ab4565b62002ac5565b6001600160a01b0381161580156200237d575b6200236d5762002366916200234a6200235f9262002328868e8b62002ab4565b6001600160a01b03821660009081526012602052604090209035905562002959565b62002357848c8962002ab4565b359062002ad1565b9162002a54565b9062002282565b845163e6c4247b60e01b81528490fd5b506200239162000b0962000b028362000de3565b62002308565b601154811015620023f8578088620023ea620023d0620023bb620023f1956200085f565b905460039190911b1c6001600160a01b031690565b6001600160a01b0316600090815260126020526040902090565b5562002a54565b816200226d565b62002273565b50905163aabd5a0960e01b8152fd5b509051631dd523ff60e31b8152fd5b34620006a4576000366003190112620006a4576020600754604051908152f35b34620006a4576040366003190112620006a457602060ff6200248b60243562002465816200073e565b6004356000526009845260406000209060018060a01b0316600052602052604060002090565b54166040519015158152f35b98939092620024b9610120999896939c9b9794610140808d528c01906200050a565b60208b019c909c5260408a0152606089015215156080880152151560a08701526001600160a01b0391821660c087015292811660e086015291821661010085015216910152565b34620006a457602080600319360112620006a457600060043581526006825260408120906040518093829084549362002539856200047b565b908185526001958681169081600014620026265750600114620025e3575b5050506200062e92916200256d910385620004e8565b820154600283015460038401546004850154600586015491969295929390916001600160a01b03166006840154909290620025bd906007906001600160a01b03169501546001600160a01b031690565b9460405198899860018060a01b038460101c169460ff808660081c169516938b62002497565b91949392508582528482205b8183106200260f57509293919250820101816200256d6200062e62002557565b8054888401870152879350918501918401620025ef565b60ff1916848701525050151560051b8301019050816200256d6200062e62002557565b34620006a45760c0366003190112620006a4576004356001600160401b038111620006a4576200267e90369060040162000e77565b906064356200268d816200073e565b608435906200269c826200073e565b60a43592620026ab846200073e565b33600052600160205260ff60406000205416156200072c576200002094620026dc604435926024359236916200078d565b6200333d565b34620006a4576020366003190112620006a45760043562002703816200073e565b60018060a01b03166000526017602052602060ff604060002054166040519015158152f35b34620006a457620027393662001573565b600091338352600160205260ff604084205416156200072c576001600160a01b0316908115620011ab5781835260026020526200278581604085209060ff801983541691151516179055565b1515907f43314420513e06ee74a711d7266f55b5a9b3369d13ce7245574f96e0c0dd6eaa8380a380f35b34620006a4576000366003190112620006a45760206040517389b50855aa3be2f677cd6303cec089b5f319d72a8152f35b34620006a4576000366003190112620006a4576040516370a0823160e01b8152306004820152602081602481601b60991b5afa90811562000b485760009162002835575b506040805191825247602083015290f35b6200285b915060203d811162002862575b620028528183620004e8565b81019062002bdb565b3862002824565b503d62002846565b34620006a4576020366003190112620006a4576004356200288b816200073e565b60018060a01b031660005260166020526020604060002054604051908152f35b6040805164e8d4a51000349081048252602082015233917fc368570c718ead78e572d31d3c0a44869e1623a1355733b857032ded01322d839190819081015b0390a2565b634e487b7160e01b600052601160045260246000fd5b818102929181159184041417156200291957565b620028ef565b64e8d4a5100090818102918183041490151715620029195790565b80546001600160a01b0319166001600160a01b03909216919091179055565b601154600160401b811015620004e25760018101806011558110156200087b57601160005260008051602062005cf88339815191520180546001600160a01b0319166001600160a01b03909216919091179055565b6001600160a01b03168015620011ab57600081815260106020526040812060ff81541662002a4f57805460ff19166001179055600f5490600160401b821015620004e2576001820180600f558210156200087b57600f815260008051602062005d3883398151915290910180546001600160a01b031916831790557f158412daecdc1456d01568828bcdb18464cc7f1ce0215ddbc3f3cfede9d1e63d9080a2565b505050565b6000198114620029195760010190565b81811062002a70575050565b6000815560010162002a64565b60115460006011558062002a8e5750565b601160005262002ab29060008051602062005cf88339815191529081019062002a64565b565b91908110156200087b5760051b0190565b35620007e7816200073e565b919082018092116200291957565b90918060408301604084525260608201929060005b81811062002b2b575050508082036020909101528281526001600160fb1b038311620006a45760209260051b809284830137010190565b909193600190853562002b3e816200073e565b828060a01b0316815260208091019501910191909162002af4565b919082039182116200291957565b90816020910312620006a45751620007e78162001568565b6001600160a01b039091168152602081019190915260400190565b6040513d6000823e3d90fd5b3d1562002bd6573d9062002bba8262000771565b9162002bca6040519384620004e8565b82523d6000602084013e565b606090565b90816020910312620006a4575190565b600e54929594919390926001600160a01b0316936001600160a01b039182861615620011ab5762002c2462000b0962000b028762000de3565b801562002da7575b620011ab57828416958615620011ab5785848a9716956040519263095ea7b360e01b8452838062002c6560209e8f946004840162002b7f565b038160008b5af192831562000b48576000899387928e9662002d85575b50600e5462002ced9062002ca19062001110906001600160a01b031681565b6040516339ec272160e11b81526001600160a01b0393841660048201529483166024860152604485019690965260648401979097529092166084820152938492918391829060a4820190565b03925af197881562000b485760009862002d3b575b505060408051948552602085018890529116927fc5edf31804b613155b2a00e84b4f1d7a1296d3ba1c531a006b92e992b4a4c5fe9190a4565b7fc5edf31804b613155b2a00e84b4f1d7a1296d3ba1c531a006b92e992b4a4c5fe93929850908162002d7b92903d106200286257620028528183620004e8565b9690913862002d02565b62002d9f90873d891162000b405762000b308183620004e8565b503862002c82565b5062002dbb62000b0962000b028462000de3565b62002c2c565b9190601f811162002dd157505050565b62002ab2926000526020600020906020601f840160051c8301931062002e00575b601f0160051c019062002a64565b909150819062002df2565b91909182516001600160401b038111620004e25762002e378162002e3084546200047b565b8462002dc1565b602080601f831160011462002e7657508192939460009262002e6a575b50508160011b916000199060031b1c1916179055565b01519050388062002e54565b90601f1983169562002e8d85600052602060002090565b926000905b88821062002ecd5750508360019596971062002eb3575b505050811b019055565b015160001960f88460031b161c1916905538808062002ea9565b8060018596829496860151815501950193019062002e92565b600762002fee61012062002ab29462002f0181518662002e0b565b60208101516001860155604081015160028601556060810151600386015562002fa56004860162002f4b62002f396080850151151590565b829060ff801983541691151516179055565b62002f7362002f5d60a0850151151590565b825461ff00191690151560081b61ff0016178255565b60c08301516001600160a01b0316815462010000600160b01b03191660109190911b62010000600160b01b0316179055565b60e081015162002fc2906001600160a01b0316600587016200293a565b61010081015162002fe0906001600160a01b0316600687016200293a565b01516001600160a01b031690565b91016200293a565b62003010604092959493956060835260608301906200050a565b9460208201520152565b91939091906001600160a01b0384811615801562003332575b8015620032ef575b620011ab57620030566200305160055462002a54565b600555565b62003062864262002ad1565b90604091825190610e6290818301908382106001600160401b03831117620004e25788878b620030d594879662004e9688393081526001600160a01b03918216602082015291166040820152601b60991b6060820152608081019190915260a0810191909152600060c082015260e00190565b0360009182f090811562000b485783516370a0823160e01b8152926020928462003103306004830162000881565b03948481601b60991b9781895afa801562000b48578a918591620032cd575b5010620032bc57855163095ea7b360e01b8152911693839082908185816200314f8e8b6004840162002b7f565b03925af1801562000b48576200329a575b50823b1562000d1057835163ca1d209d60e01b81526001600482015294818660248183885af195861562000b48577f0f4e75dfe6d136c1af06914c91d27150d48998efcde5da45a195b590360916c0996200321762003261968a9662003238968f620031df8f916200322798620028ea9f6200327c575b504262002ad1565b92620031ea62000750565b9a8b528a01528a890152606088015260016080880152600160a08801526001600160a01b031660c0870152565b6001600160a01b031660e0850152565b6001600160a01b0316610100830152565b601b60991b6101208201525b6200325b6005546000526006602052604060002090565b62002ee6565b62003270600554964262002ad1565b90519384938462002ff6565b806200328c6200329392620004ce565b80620008d8565b38620031d7565b620032b490833d851162000b405762000b308183620004e8565b503862003160565b85516314ecd6c760e01b8152600490fd5b620032e89150863d88116200286257620028528183620004e8565b3862003122565b50601b60991b60005260106020526200332c62000b097fae98406994bf2bc838273489ba1e24c817d576ab4ea6783f20f7c16fcfbeea1562000b02565b6200303b565b508082161562003033565b91946001600160a01b0394919391858316158015620035db575b8015620035c1575b620011ab57620033756200305160055462002a54565b62003381874262002ad1565b95604092835197610e62808a01918a83106001600160401b03841117620004e2578984878a8e96620033f39662004e9689393081526001600160a01b03918216602082015291811660408301529091166060820152608081019190915260a0810191909152600060c082015260e00190565b0360009889f090811562000b485784516370a0823160e01b815281841693602093909184818062003428306004830162000881565b0381895afa801562000b48578b918d916200359f575b50106200358e57865163095ea7b360e01b815291169383908290818d816200346b8f8b6004840162002b7f565b03925af1801562000b48576200356c575b50823b156200356857845163ca1d209d60e01b81526001600482015293898560248183885af190811562000b485762003546620028ea98620035368b978f977f0f4e75dfe6d136c1af06914c91d27150d48998efcde5da45a195b590360916c09f8f620034fe620032449b620032619e620035579b6200327c57504262002ad1565b926200350962000750565b9c8d528c01528c8b015260608a0152600160808a0152600160a08a01526001600160a01b031660c0890152565b6001600160a01b031660e0870152565b6001600160a01b0316610100850152565b6001600160a01b0316610120830152565b8880fd5b6200358690833d851162000b405762000b308183620004e8565b50386200347c565b86516314ecd6c760e01b8152600490fd5b620035ba9150863d88116200286257620028528183620004e8565b386200343e565b50620035d562000b0962000b028462000de3565b6200335f565b508581161562003357565b939291906001600160a01b0380861615620011ab576200360a62000b028762000dfd565b6200367457600b546001600160a01b031616806200362f575b50620007e7946200370c565b60206040518092630bd4c19d60e31b82528180620036518b6004830162000881565b03915afa90811562000b485760009162003686575b501562003674573862003623565b6040516308c4cdd160e01b8152600490fd5b620036a2915060203d811162000b405762000b308183620004e8565b3862003666565b939091926088959360018060601b0319809460601b1686526014860152603485015260601b16605483015260688201520190565b603c917f19457468657265756d205369676e6564204d6573736167653a0a3332000000008252601c8201520190565b620007e7949293919360405160208101816200372d4630868b8987620036a9565b039162003743601f1993848101835282620004e8565b519020906200376d604051918262003760602082019586620036dd565b03908101835282620004e8565b5190209462003789620037823687876200078d565b8762004e45565b9262003b1f565b94939291906001600160a01b0380871615620011ab57620037b562000b028862000dfd565b6200367457600b546001600160a01b03161680620037da575b50620007e79562003842565b60206040518092630bd4c19d60e31b82528180620037fc8c6004830162000881565b03915afa90811562000b48576000916200381f575b5015620036745738620037ce565b6200383b915060203d811162000b405762000b308183620004e8565b3862003811565b9391620007e7959391604051602081018162003863463087878d87620036a9565b039162003879601f1993848101835282620004e8565b5190209062003896604051918262003760602082019586620036dd565b5190209562003b1f565b94939291906001600160a01b0380821615620011ab57620038c562000b028362000dfd565b6200367457600b546001600160a01b03161680620038ea575b50620007e79562003991565b60206040518092630bd4c19d60e31b825281806200390c876004830162000881565b03915afa90811562000b48576000916200392f575b5015620036745738620038de565b6200394b915060203d811162000b405762000b308183620004e8565b3862003921565b949192609c96949160018060601b03199485809260601b16885260601b1660148701526028860152604885015260601b166068830152607c8201520190565b90939192620007e795936040516020810181620039b4463087878d8b8862003952565b0391620039ca601f1993848101835282620004e8565b51902090620039e7604051918262003760602082019586620036dd565b5190209562003a03620039fc3688886200078d565b8862004e45565b9362003e7e565b9594939291906001600160a01b0380821615620011ab5762003a3062000b028362000dfd565b6200367457600b546001600160a01b0316168062003a55575b50620007e79662003abd565b60206040518092630bd4c19d60e31b8252818062003a77876004830162000881565b03915afa90811562000b485760009162003a9a575b501562003674573862003a49565b62003ab6915060203d811162000b405762000b308183620004e8565b3862003a8c565b94929091620007e7969492604051602081018162003ae2468b88888830938862003952565b039162003af8601f1993848101835282620004e8565b5190209062003b15604051918262003760602082019586620036dd565b5190209662003e7e565b601b60991b600052601060205294939092909162003b6162000b097fae98406994bf2bc838273489ba1e24c817d576ab4ea6783f20f7c16fcfbeea1562000b02565b620011ab576004968754851162003e6d576001600160a01b0383811696909490871562003e5c579162003b9f62000b099262003ba79436916200078d565b9085620040e6565b62003df857600c54829084166001600160a01b0316801562003e4657604051631a26db1160e21b81529160209183918290819062003be890828f0162000881565b03915afa90811562000b485760009162003e23575b505b158062003e09575b62003df85762003c178262000e17565b540362003de75762003c299062000e17565b62003c35815462002a54565b90556040938451916370a0823160e01b83526020948362003c59308a830162000881565b03938681601b60991b9681885afa801562000b4857869160009162003dc5575b501062003db55791839162003d629593879560008051602062005d1883398151915262003d1362003cc562003cbd62003cb56015548b62002905565b612710900490565b809962002b59565b601b60991b6000526016602052977ff44eefdc7d3b859ae13dfb70baea3429b24af0b02aaa5707ef34047211cea1515b62003d0282825462002ad1565b90558c519081529081906020820190565b0390a28851858152918316917fe3ade051475bed3fd2d4a21a238ed43abc7cce06f9fe24b68382a8dcc7fe1f1690602090a36000875180968195829463a9059cbb60e01b84528c840162002b7f565b03925af191821562000b485760009262003d93575b50501562003d86575050600190565b51632b3f6d1160e21b8152fd5b62003dad9250803d1062000b405762000b308183620004e8565b388062003d77565b86516314ecd6c760e01b81528890fd5b62003de09150883d8a116200286257620028528183620004e8565b3862003c79565b604051638baa579f60e01b81528690fd5b604051638baa579f60e01b81528790fd5b5062003e1d62000b0962000b028462000daf565b62003c07565b62003e3f915060203d811162000b405762000b308183620004e8565b3862003bfd565b5062000b0262003e569162000d95565b62003bff565b604051638baa579f60e01b81528a90fd5b60405163042ecb4160e11b81528890fd5b939091949262003e9662000b0962000b028762000de3565b620011ab57600497885487116200409a576001600160a01b0383811698909590891562004089579162003b9f62000b099262003ed49436916200078d565b6200402557600c54829085166001600160a01b03168015620040735762003f14916020918b604051809581948293631a26db1160e21b8452830162000881565b03915afa90811562000b485760009162004050575b505b158062004036575b620040255762003f438262000e17565b540362003df85762003f559062000e17565b62003f61815462002a54565b9055604080516370a0823160e01b81529095602095858516949287818062003f8c308e830162000881565b0381895afa801562000b4857829160009162004003575b501062003ff3579162003d629593918560008051602062005d1883398151915262003d138a989662003cf562003fec62003fe462003cb56015548562002905565b809362002b59565b9962000dc9565b87516314ecd6c760e01b81528990fd5b6200401e9150893d8b116200286257620028528183620004e8565b3862003fa3565b604051638baa579f60e01b81528890fd5b506200404a62000b0962000b028462000daf565b62003f33565b6200406c915060203d811162000b405762000b308183620004e8565b3862003f29565b5062000b02620040839162000d95565b62003f2b565b604051638baa579f60e01b81528b90fd5b60405163042ecb4160e11b81528990fd5b90816020910312620006a457516001600160e01b031981168103620006a45790565b604090620007e79392815281602082015201906200050a565b9091906001600160a01b0381169081156200419d573b15620041885762004128916020916040518080958194630b135d3f60e11b9889845260048401620040cd565b03915afa6000918162004151575b5062004143575050600090565b6001600160e01b0319161490565b6200417891925060203d811162004180575b6200416f8183620004e8565b810190620040ab565b903862004136565b503d62004163565b916200419991620011109162004e45565b1490565b50505050600090565b91906001600160a01b0380821615620011ab57620041c862000b028362000dfd565b6200367457600b546001600160a01b03161680620041ed575b50620007e79262004255565b60206040518092630bd4c19d60e31b825281806200420f876004830162000881565b03915afa90811562000b485760009162004232575b5015620036745738620041e1565b6200424e915060203d811162000b405762000b308183620004e8565b3862004224565b916200426b836000526006602052604060002090565b906004938483019283549460ff8660081c1615620047f95760ff861615620047e85760038201544211620047d757600282018054620042ab868262002ad1565b600185015410620047c65785620042c29162002ad1565b90559360018060a01b039283620042f4620042e7836000526014602052604060002090565b546001600160a01b031690565b166200470d575b836040978851837fb58cef819b4cb39759da27ae5dc4789871912bbb4d1a0cc4564a027e07fd921e848b169280620043388c829190602083019252565b0390a360101c166200445f575050600701546001600160a01b0316808216620044595750601b60991b5b168351926370a0823160e01b845260209384818062004384308b830162000881565b0381865afa801562000b4857849160009162004437575b50106200442757918162003d6293859360008051602062005d1883398151915262004407620043dd620043d562003cb56015548962002905565b809762002b59565b95620043e98462000dc9565b620043f682825462002ad1565b90558a519081529081906020820190565b0390a26000875180968195829463a9059cbb60e01b84528c840162002b7f565b84516314ecd6c760e01b81528690fd5b620044529150863d88116200286257620028528183620004e8565b386200439b565b62004362565b62001110620042e762004482929795949396976000526014602052604060002090565b62004494575b50505050505050600190565b600701546001600160a01b0316808216620047075750601b60991b5b1690620045116200111062001110620044d062003cb56015548962002905565b958560008051602062005d18833981519152620044fe620044f28a8c62002b59565b9962003cf58462000dc9565b0390a25460101c6001600160a01b031690565b803b15620006a4576000865180926316deebd960e21b82528183816200453e8d8201906001602083019252565b03925af19081620046f0575b50620046245784516370a0823160e01b81526020949085818062004571308c830162000881565b0381875afa90811562000b485760009162004602575b50106200442757918391620045b3936000875180968195829463a9059cbb60e01b84528c840162002b7f565b03925af191821562000b4857600092620045e0575b50501562003d865750505b3880808080808062004488565b620045fa9250803d1062000b405762000b308183620004e8565b3880620045c8565b6200461d9150863d88116200286257620028528183620004e8565b3862004587565b84516370a0823160e01b81526020949085818062004645308c830162000881565b0381875afa90811562000b4857600091620046ce575b5010620044275791839162004687936000875180968195829463a9059cbb60e01b84528c840162002b7f565b03925af191821562000b4857600092620046ac575b50501562003d86575050620045d3565b620046c69250803d1062000b405762000b308183620004e8565b38806200469c565b620046e99150863d88116200286257620028528183620004e8565b386200465b565b806200328c6200470092620004ce565b386200454a565b620044b0565b945062004728620042e7866000526014602052604060002090565b600b54909590869085166001600160a01b0316806200474a575b5050620042fb565b6200476e916020918b604051809581948293630bd4c19d60e31b8452830162000881565b03915afa90811562000b4857600091620047a3575b50156200479257853862004742565b6040516308c4cdd160e01b81528890fd5b620047bf915060203d811162000b405762000b308183620004e8565b3862004783565b604051637bf25ba160e11b81528990fd5b60405163387b2e5560e11b81528790fd5b604051631249bc4f60e11b81528790fd5b604051636ce3c70160e11b81528790fd5b939291906001600160a01b0380861615620011ab576200482e62000b028762000dfd565b6200367457600b546001600160a01b0316168062004853575b50620007e794620048bb565b60206040518092630bd4c19d60e31b82528180620048758b6004830162000881565b03915afa90811562000b485760009162004898575b501562003674573862004847565b620048b4915060203d811162000b405762000b308183620004e8565b386200488a565b91929092620048cc60075462002a54565b8060075560009081526020600881526040822093620048ec86866200293a565b6001878187015560028601926001600160401b038311620004e257899562004921846200491a87546200047b565b8762002dc1565b8591601f8511600114620049cc57509280620049789895938193889660049994620049c0575b50501b916000199060031b1c19161790555b600382015501805461ffff191691151560081b61ff0016919091179055565b600754604080519384529315156020840152926001600160a01b03919091169183917f3cf12598a62c61e9bb9afe67ca45db329806335869b2518857efe6a27b4e07df91a390565b01359250388062004947565b91601f949394198416620049e587600052602060002090565b9388905b82821062004a335750509160049795939185620049789b9896941062004a18575b505050811b01905562004959565b0135600019600384901b60f8161c1916905538808062004a0a565b8484013586558e9a50948701949283019290810190620049e9565b60009291815462004a5f816200047b565b9260019180831690811562004abd575060011462004a7e575b50505050565b90919293945060005260209081600020906000915b85831062004aab575050505001903880808062004a78565b80548584015291830191810162004a93565b60ff191684525050508115159091020191503880808062004a78565b62004aee816000526008602052604060002090565b80546001600160a01b031615620011bd576004918282019162004b12835460ff1690565b62004db45760038101546003541162004da357825460ff1916600117835560409262004b6d84519160009433907f9c85b616f29fca57a17eafe71cf9ff82ffef41766e2cf01ea7f8f7878dd3ec248780a35460081c60ff1690565b1562004c65575062004b8360018201546200291f565b80471062004c555790600283928360008051602062005d1883398151915262004c0c62004bc362004bbb62003cb56015548762002905565b809562002b59565b600080526016602052937f0263c2b778d062355049effc2dece97bc6547ff8a88a3258daa512061c2153dd62004bfb82825462002ad1565b905589519081529081906020820190565b0390a2825462004c279062001110906001600160a01b031681565b9262004c398751809481930162004a4e565b03925af162004c4762002ba6565b501562003d86575050600190565b505050516314ecd6c760e01b8152fd5b6370a0823160e01b81526020918162004c813088830162000881565b03908383601b60991b9381855afa92831562000b4857859362004d7f575b50600181015480931062004d6f57918162004d32859462004d4e969460008051602062005d1883398151915262004d2262004ced62004ce562003cb56015548a62002905565b809862002b59565b601b60991b6000526016602052967ff44eefdc7d3b859ae13dfb70baea3429b24af0b02aaa5707ef34047211cea15162003cf5565b0390a2546001600160a01b031690565b86885180978195829463a9059cbb60e01b84528d840162002b7f565b03925af192831562000b48579262003d935750501562003d86575050600190565b85516314ecd6c760e01b81528790fd5b62004d9b919350843d86116200286257620028528183620004e8565b913862004c9f565b60405163e246dc6360e01b81528490fd5b6040516351618d5360e01b81528490fd5b60ff62004dd28262000de3565b54161562004e3d576040516370a0823160e01b815230600482015290602090829060249082906001600160a01b03165afa90811562000b485760009162004e1a575b50904790565b62004e36915060203d81116200286257620028528183620004e8565b3862004e14565b506000904790565b604182510362004e8e5760806000918360208095015160606040830151920151604051938452851a868401526040830152606082015282805260015afa1562000b485760005190565b505060009056fe6080346101fb57601f610e6238819003918201601f19168301926001600160401b0392909183851183861017610200578160e092849260409788528339810103126101fb5761004d81610216565b61005960208301610216565b610064858401610216565b9261007160608201610216565b9460808201519060c060a084015193015190600091825460001981146101e7576001018084558a51926101008401908111848210176101d3578b528a60018060a01b03809916998a8552896020860199169b8c8a528a8387019216998a83528b6060880192169b8c835260808801938a85528160a08a01968d885260c08b01988c8a5260e08c019a8b528c5260016020528b209951169260018060a01b031993848b5416178a558260018b01915116848254161790558160028a0191511683825416179055600388019251169082541617905551600485015551600584015560068301905160058110156101bf5760809694927f042b59478e078c635a1c1a1df96a444995a1bae13870a71743a4c9db67e089b49896949260079260ff8019835416911617905551910155549589519384526020840152888301526060820152a451610c37908161022b8239f35b634e487b7160e01b85526021600452602485fd5b634e487b7160e01b85526041600452602485fd5b634e487b7160e01b84526011600452602484fd5b600080fd5b634e487b7160e01b600052604160045260246000fd5b51906001600160a01b03821682036101fb5756fe608060408181526004908136101561001657600080fd5b600092833560e01c908163052d92e91461092a57508063180aedf3146108825780632ecea788146106ed5780634c5d8a0f146106cc5780634d68282f146106785780635b7baf64146104c0578063971d852f1461032f578063b8adaa111461023e5763ca1d209d1461008757600080fd5b3461023a576020908160031936011261023657823580855260018352818520546001600160a01b0391906100be9083163314610b1b565b8086526001845282862060068101805460ff81166005811015610223576101d25760ff191660011790558351928592849260649284928b92918b917f9033fdbde83e5ac011bb056ee12acd7656d1e63de51cd2ec958e95b85f0b87a48580a26003830154169101546323b872dd60e01b8452338b85015230602485015260448401525af19081156101c857859161019b575b501561015a578380f35b5162461bcd60e51b815291820152601e60248201527f455243383138333a20746f6b656e207472616e73666572206661696c65640000604482015260649150fd5b6101bb9150833d85116101c1575b6101b38183610ae3565b810190610b71565b38610150565b503d6101a9565b82513d87823e3d90fd5b855162461bcd60e51b8152808901889052602560248201527f455243383138333a206a6f6220616c72656164792066756e646564206f7220636044820152641b1bdcd95960da1b6064820152608490fd5b634e487b7160e01b8a526021895260248afd5b8380fd5b8280fd5b503461023a57602036600319011261023a57813591828452600160205261027460018060a01b0360028487200154163314610b8e565b82845260016020526006828520019182549060ff8216600581101561031c576002036102c9575060ff19161790557fd080311711eb34e1cb5f771b6f21a5dd7b7fe8d43de79c31e4d0c228e00ad4268280a280f35b5162461bcd60e51b8152602081840152602860248201527f455243383138333a206a6f62206d757374206265207375626d697474656420746044820152671bc81c995a9958dd60c21b6064820152608490fd5b634e487b7160e01b875260218452602487fd5b503461023a576020908160031936011261023657823580855260018352818520600201546001600160a01b03906103699082163314610b8e565b818652600184528286209160068301805460ff8116600581101561022357600281149081156104b5575b5015610475579186939160036103fd969460ff19161790558886518096819582947f02244c8529cb95e213ee542e76e7776342b3dabd10203d01472bbf4441be89298580a28b86600383015416966001830154169101549063a9059cbb60e01b84528c8401610be6565b03925af19081156101c8578591610458575b5015610419578380f35b5162461bcd60e51b815291820152601b60248201527a115490ce0c4e0cce88199d5b99081c185e5bdd5d0819985a5b1959602a1b604482015260649150fd5b61046f9150833d85116101c1576101b38183610ae3565b3861040f565b855162461bcd60e51b8152808901889052601a602482015279455243383138333a20696e76616c6964206a6f6220737461746560301b6044820152606490fd5b600191501438610393565b503461023a576020908160031936011261023657823580855260018352818520546001600160a01b03906104f79082163314610b1b565b818652600184528286209060ff600683015416600581101561066557868114908115610646575b50156105f857918161057e9388888895019381855495558751968795869485937fc118564863bc4bc4615080294149317d0199c54d04e6ccc10de28a41cf9807c68680a28060038801541696541663a9059cbb60e01b84528c8401610be6565b03925af19081156101c85785916105db575b501561059a578380f35b5162461bcd60e51b815291820152601f60248201527f455243383138333a20726566756e64207472616e73666572206661696c656400604482015260649150fd5b6105f29150833d85116101c1576101b38183610ae3565b38610590565b835162461bcd60e51b8152808701869052602260248201527f455243383138333a20726566756e6420636f6e646974696f6e73206e6f74206d604482015261195d60f21b6064820152608490fd5b60039150141580610658575b3861051e565b5060058201544211610652565b634e487b7160e01b885260218752602488fd5b503461023a576020908160031936011261023657823580855260018352818520600201546001600160a01b03906106b29082163314610b8e565b818652600184526103698160028589200154163314610b8e565b8382346106e957816003193601126106e957602091549051908152f35b5080fd5b508290346106e957806003193601126106e9578235906024358284526020916001835260018060a01b03600182872001541633036108345783855260018352808520600681019081549760ff89166005811015610821576001036107cc576005820154421161079257507fe4e2ea11593286c894bffb239a87ebdd43e0fb561dc1074759a1ceb20ef60857959697846007600293015560ff191617905551908152a280f35b835162461bcd60e51b81529081018690526014602482015273115490ce0c4e0cce881a9bd888195e1c1a5c995960621b6044820152606490fd5b835162461bcd60e51b8152908101869052602960248201527f455243383138333a206a6f62206e6f742066756e646564206f7220616c726561604482015268191e4818db1bdcd95960ba1b6064820152608490fd5b634e487b7160e01b895260218252602489fd5b5162461bcd60e51b8152808601839052602360248201527f455243383138333a2063616c6c6572206973206e6f74207468652070726f76696044820152623232b960e91b6064820152608490fd5b5082346109275760203660031901126109275782358152600160205281812060018060a01b03918282541693836001840154169380600285015416906003850154168785015491600586015493600760ff600689015416970154978151998a5260208a01528801526060870152608086015260a085015260058210156109145750610100935060c083015260e0820152f35b634e487b7160e01b815260218552602490fd5b80fd5b849291503461023a5760c036600319011261023a5783356001600160a01b038181169291839003610adf5760243591818316809303610adb576044359582871680970361092757606435916084359382546000198114610ac85760010190818455610100830183811067ffffffffffffffff821117610ab557908991825233845260208401908982528285019189835260608601908d8252608087019289845260a08801948b86528160c08a01978b895260e08b019960a4358b528c5260016020528b209951169260018060a01b031993848b5416178a558260018b01915116848254161790558160028a01915116838254161790556003880192511690825416179055518c8501555160058401556006830190516005811015610aa25760209b50906007929160ff80198354169116179055519101555495855193845287840152848301526060820152837f042b59478e078c635a1c1a1df96a444995a1bae13870a71743a4c9db67e089b460803393a451908152f35b634e487b7160e01b855260218c52602485fd5b634e487b7160e01b855260418c52602485fd5b634e487b7160e01b845260118b52602484fd5b8580fd5b8480fd5b90601f8019910116810190811067ffffffffffffffff821117610b0557604052565b634e487b7160e01b600052604160045260246000fd5b15610b2257565b60405162461bcd60e51b815260206004820152602160248201527f455243383138333a2063616c6c6572206973206e6f742074686520636c69656e6044820152601d60fa1b6064820152608490fd5b90816020910312610b8957518015158103610b895790565b600080fd5b15610b9557565b60405162461bcd60e51b8152602060048201526024808201527f455243383138333a2063616c6c6572206973206e6f7420746865206576616c7560448201526330ba37b960e11b6064820152608490fd5b6001600160a01b03909116815260208101919091526040019056fea2646970667358221220370747821c5cd72bcf4b9bec4f4958d6c929da9c8834d2faff71211031d506dd64736f6c6343000814003331ecc21a745e3968a04e9570e4425bc18fa8019c68028196b546d1669c200c680d8c219e174e3ed4fdd15ef82c342b78a9424d047927d921f9e0ff46cec478908d1108e10bcb7c27dddfc02ed9d693a074039d026cf4ea4240b40f7d581ac802a264697066735822122085cd6ce4be0fe8baf7d8f5cd802cceb8a5f89883f5a606274848804b0cfb423d64736f6c63430008140033";

export const ERC8004_REGISTRY_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "agentURI",
        "type": "string"
      }
    ],
    "name": "AgentRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "agent",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newReputation",
        "type": "uint256"
      }
    ],
    "name": "ReputationUpdated",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "agentIdToAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "agents",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "agentURI",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "reputation",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isRegistered",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "agent",
        "type": "address"
      }
    ],
    "name": "getAgentId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "agent",
        "type": "address"
      }
    ],
    "name": "getAgentReputation",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "agentId",
        "type": "uint256"
      }
    ],
    "name": "getAgentURI",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "agent",
        "type": "address"
      }
    ],
    "name": "isAgentRegistered",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "agentAddress",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "agentURI",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "initialReputation",
        "type": "uint256"
      }
    ],
    "name": "registerAgent",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "agentAddress",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "newReputation",
        "type": "uint256"
      }
    ],
    "name": "updateReputation",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

export const ERC8183_JOB_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "jobId", "type": "uint256" }
    ],
    "name": "jobs",
    "outputs": [
      { "internalType": "address", "name": "client", "type": "address" },
      { "internalType": "address", "name": "provider", "type": "address" },
      { "internalType": "address", "name": "evaluator", "type": "address" },
      { "internalType": "address", "name": "token", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "uint256", "name": "expiry", "type": "uint256" },
      { "internalType": "uint8", "name": "status", "type": "uint8" },
      { "internalType": "bytes32", "name": "deliverableHash", "type": "bytes32" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "jobId", "type": "uint256" },
      { "internalType": "bytes32", "name": "proofHash", "type": "bytes32" }
    ],
    "name": "submit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "jobId", "type": "uint256" }
    ],
    "name": "complete",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "jobId", "type": "uint256" }
    ],
    "name": "releaseFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "jobId", "type": "uint256" }
    ],
    "name": "reject",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "jobId", "type": "uint256" }
    ],
    "name": "claimRefund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
