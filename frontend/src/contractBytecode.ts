export const ATO_VAULT_ABI = [
  {
    inputs: [
      { internalType: 'address[]', name: '_owners', type: 'address[]' },
      { internalType: 'uint256', name: '_requiredSignatures', type: 'uint256' },
      { internalType: 'uint256', name: '_agentSingleTxLimitERC20', type: 'uint256' }
    ],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  {
    inputs: [],
    name: 'AddressIsBlocklisted',
    type: 'error'
  },
  {
    inputs: [],
    name: 'AgentLimitExceeded',
    type: 'error'
  },
  {
    inputs: [],
    name: 'AlreadySigned',
    type: 'error'
  },
  {
    inputs: [],
    name: 'DeadlinePassed',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ExecutionFailed',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InactiveMilestone',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InsufficientMilestoneFunds',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InsufficientVaultBalance',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidAddress',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidThreshold',
    type: 'error'
  },
  {
    inputs: [],
    name: 'NotAnAgentOrOwner',
    type: 'error'
  },
  {
    inputs: [],
    name: 'NotAnOwner',
    type: 'error'
  },
  {
    inputs: [],
    name: 'NotEnoughSignatures',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ProposalAlreadyExecuted',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ProposalDoesNotExist',
    type: 'error'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'uint256', name: 'oldLimit', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'newLimit', type: 'uint256' }
    ],
    name: 'AgentLimitUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'agent', type: 'address' },
      { indexed: true, internalType: 'bool', name: 'status', type: 'bool' }
    ],
    name: 'AgentStatusUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'targetAddress', type: 'address' },
      { indexed: false, internalType: 'bool', name: 'isBlocklisted', type: 'bool' }
    ],
    name: 'ComplianceBlocklistUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'agent', type: 'address' },
      { indexed: true, internalType: 'address', name: 'recipient', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amountERC20', type: 'uint256' }
    ],
    name: 'DirectTransferExecuted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'milestoneId', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'name', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'allocatedERC20', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'deadline', type: 'uint256' }
    ],
    name: 'MilestoneCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'milestoneId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'recipient', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amountERC20', type: 'uint256' }
    ],
    name: 'MilestoneSpent',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'milestoneId', type: 'uint256' },
      { indexed: false, internalType: 'bool', name: 'isActive', type: 'bool' }
    ],
    name: 'MilestoneStatusChanged',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' },
      { indexed: true, internalType: 'bool', name: 'status', type: 'bool' }
    ],
    name: 'OwnerStatusUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'proposalId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'owner', type: 'address' }
    ],
    name: 'ProposalApproved',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'proposalId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'recipient', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amountERC20', type: 'uint256' },
      { indexed: false, internalType: 'bool', name: 'isNativeGas', type: 'bool' }
    ],
    name: 'ProposalCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'proposalId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'executor', type: 'address' }
    ],
    name: 'ProposalExecuted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: 'uint256', name: 'oldThreshold', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'newThreshold', type: 'uint256' }
    ],
    name: 'SignatureThresholdUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'sender', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amountERC20', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'nativeValueReceived', type: 'uint256' }
    ],
    name: 'TreasuryFunded',
    type: 'event'
  },
  {
    stateMutability: 'payable',
    type: 'fallback'
  },
  {
    inputs: [],
    name: 'ERC20_USDC_ADDRESS',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'SCALE_FACTOR',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'agentRegistryAddress',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'newRegistry', type: 'address' }],
    name: 'setAgentRegistryAddress',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amountERC20', type: 'uint256' }
    ],
    name: 'agentDirectPayoutERC20',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'milestoneId', type: 'uint256' },
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amountERC20', type: 'uint256' }
    ],
    name: 'agentExecuteMilestonePayout',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'agentSingleTxLimitERC20',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'proposalId', type: 'uint256' }],
    name: 'approveProposal',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'nativeGasAmount', type: 'uint256' }],
    name: 'convertToERC20',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'erc20Amount', type: 'uint256' }],
    name: 'convertToNativeGas',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'uint256', name: 'allocatedERC20', type: 'uint256' },
      { internalType: 'uint256', name: 'duration', type: 'uint256' },
      { internalType: 'address', name: 'provider', type: 'address' },
      { internalType: 'address', name: 'evaluator', type: 'address' }
    ],
    name: 'createMilestone',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'proposalId', type: 'uint256' }],
    name: 'executeProposal',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getTreasuryBalances',
    outputs: [
      { internalType: 'uint256', name: 'erc20Balance', type: 'uint256' },
      { internalType: 'uint256', name: 'nativeGasBalance', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
      { internalType: 'address', name: '', type: 'address' }
    ],
    name: 'hasApprovedProposal',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'target', type: 'address' }],
    name: 'isAddressBlocklisted',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'isAgent',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'isOwner',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'milestoneCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'milestones',
    outputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'uint256', name: 'allocatedERC20', type: 'uint256' },
      { internalType: 'uint256', name: 'spentERC20', type: 'uint256' },
      { internalType: 'uint256', name: 'timeDeadline', type: 'uint256' },
      { internalType: 'bool', name: 'isActive', type: 'bool' },
      { internalType: 'bool', name: 'exists', type: 'bool' },
      { internalType: 'address', name: 'jobContractAddress', type: 'address' },
      { internalType: 'address', name: 'provider', type: 'address' },
      { internalType: 'address', name: 'evaluator', type: 'address' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'owners',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'proposalCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'proposals',
    outputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amountERC20', type: 'uint256' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      { internalType: 'uint256', name: 'approvalCount', type: 'uint256' },
      { internalType: 'bool', name: 'executed', type: 'bool' },
      { internalType: 'bool', name: 'isNativeGasTx', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'uint256', name: 'amountERC20', type: 'uint256' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      { internalType: 'bool', name: 'isNativeGas', type: 'bool' }
    ],
    name: 'proposeTransaction',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'requiredSignatures',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'newLimitERC20', type: 'uint256' }],
    name: 'setAgentLimit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'agent', type: 'address' },
      { internalType: 'bool', name: 'status', type: 'bool' }
    ],
    name: 'setAgentStatus',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'milestoneId', type: 'uint256' },
      { internalType: 'bool', name: 'isActive', type: 'bool' }
    ],
    name: 'setMilestoneStatus',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'newThreshold', type: 'uint256' }],
    name: 'setRequiredSignatures',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bool', name: 'isBlocklisted', type: 'bool' }
    ],
    name: 'updateComplianceBlocklist',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'complianceOracleAddress',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'newOracle', type: 'address' }],
    name: 'setComplianceOracleAddress',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
] as const;

export const ATO_VAULT_BYTECODE = "0x60806040523480156200001157600080fd5b506040516200222438038062002224833981016040819052620000349162000261565b8251600003620000575760405163e6c4247b60e01b815260040160405180910390fd5b811580620000655750825182115b15620000845760405163aabd5a0960e01b815260040160405180910390fd5b60005b8351811015620001a6576000848281518110620000a857620000a862000346565b6020026020010151905060006001600160a01b0316816001600160a01b031603620000e65760405163e6c4247b60e01b815260040160405180910390fd5b6001600160a01b03811660009081526001602052604090205460ff1662000190576001600160a01b0381166000818152600160208190526040808320805460ff191683179055825480830184558380527f290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e5630180546001600160a01b03191685179055519092917f8fbed58a67991416e812270ffc7698fb1478ccb821b7c556aa67c98d1797d36491a35b50806200019d816200035c565b91505062000087565b5060038290556004810190556040805160008152602081018490527f149153f58b4da003a8cfd4523709a202402182cb5aa335046911277a1be6eede910160405180910390a16040805160008152602081018390527f4bb9f2da0fb9c1041e37dbf9e3213e18e69d7d5fb478d2399c5c76d46863e259910160405180910390a150505062000384565b634e487b7160e01b600052604160045260246000fd5b80516001600160a01b03811681146200025c57600080fd5b919050565b60008060006060848603121561188257600080fd5b8335925061189260208501611856565b9150604084013590509250925092565b6000602082840312156118b457600080fd5b6118bd82611856565b9392505050565b600080604083850312156118d757600080fd5b6118e083611856565b946020939093013593505050565b80151581146118fc57600080fd5b50565b6000806040838503121561191257600080fd5b61191b83611856565b9150602083013561192b816118ee565b809150509250929050565b60008083601f84011261194857600080fd5b50813567ffffffffffffffff81111561196057600080fd5b60208301915083602082850101111561197857600080fd5b9250929050565b60008060008060006080868803121561199757600080fd5b6119a086611856565b945060208601359350604086013567ffffffffffffffff8111156119c357600080fd5b6119cf88828901611936565b90945092505060608601356119e3816118ee565b809150509295509295909350565b60008060008060608587031215611a0757600080fd5b843567ffffffffffffffff811115611a1e57600080fd5b611a2a87828801611936565b90989097506020870135966040013595509350505050565b60008060408385031215611a5557600080fd5b82359150602083013561192b816118ee565b60008060408385031215611a7a57600080fd5b82359150611a8a60208401611856565b90509250929050565b60c081526000611aa660c08301896117c9565b6020830197909752506040810194909452606084019290925215156080830152151560a090910152919050565b634e487b7160e01b600052601160045260246000fd5b600082611b0657634e487b7160e01b600052601260045260246000fd5b500490565b600181811c90821680611b1f57607f821691505b602082108103611b3f57634e487b7160e01b600052602260045260246000fd5b50919050565b6000808354611b5381611b0b565b60018281168015611b6b5760018114611b8057611baf565b60ff1984168752821515830287019450611baf565b8760005260208060002060005b85811015611ba65781548a820152908401908201611b8d565b50505082870194505b50929695505050505050565b600060208284031215611bcd57600080fd5b5051919050565b600060208284031215611be657600080fd5b81516118bd816118ee565b8082018082111561061057610610611ad3565b808202811582820484141761061057610610611ad3565b600060018201611c2d57611c2d611ad3565b5060010190565b634e487b7160e01b600052604160045260246000fd5b601f821115611c9457600081815260208120601f850160051c81016020861015611c715750805b601f850160051c820191505b81811015611c9057828155600101611c7d565b5050505b505050565b67ffffffffffffffff831115611cb157611cb1611c34565b611cc583611cbf8354611b0b565b83611c4a565b6000601f841160018114611cf95760008515611ce15750838201355b600019600387901b1c1916600186901b178355611d53565b600083815260209020601f19861690835b82811015611d2a5786850135825560209485019460019092019101611d0a565b5086821015611d475760001960f88860031b161c19848701351681555b5060018560011b0183555b5050505050565b815167ffffffffffffffff811115611d7457611d74611c34565b611d8881611d828454611b0b565b84611c4a565b602080601f831160018114611dbd5760008415611da55750858301515b600019600386901b1c1916600185901b178555611c90565b600085815260208120601f198616915b82811015611dec57888601518255948401946001909101908401611dcd565b5085821015611e0a5787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b606081528360608201528385608083013760006080858301015260006080601f19601f87011683010190508360208301528260408301529594505050505056fea264697066735822122081720812ef76963dbb8b2596016c39a2e6ffad1a036f09a50abf1b3925d37f1364736f6c63430008140033";

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
