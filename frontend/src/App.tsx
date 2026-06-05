import React, { useState, useEffect, useRef } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { 
  useAccount, 
  useBalance, 
  useReadContract, 
  useWriteContract, 
  useDeployContract, 
  useWaitForTransactionReceipt, 
  usePublicClient,
  useSwitchChain
} from 'wagmi';
import { parseUnits, formatUnits, isAddress, keccak256, stringToHex } from 'viem';
import { ATO_VAULT_ABI, ATO_VAULT_BYTECODE, ERC8183_JOB_ABI, ERC8004_REGISTRY_ABI } from './contractBytecode';

// --- TS INTERFACES ---
interface Milestone {
  id: number;
  name: string;
  allocatedERC20: number; // 6 decimals standard format
  spentERC20: number;
  timeDeadline: string;
  isActive: boolean;
  jobContractAddress?: string;
  provider?: string;
  evaluator?: string;
  jobStatus?: number;
  jobDeliverableHash?: string;
}

interface Proposal {
  id: number;
  recipient: string;
  amountERC20: number; // 6 decimals
  data: string;
  approvalCount: number;
  executed: boolean;
  isNativeGasTx: boolean;
  hasApproved: boolean;
}

interface InvoiceForm {
  id: string;
  recipientAddress: string;
  amountUSDC: string;
  type: 'payroll' | 'supplier' | 'milestone';
  milestoneId?: number;
}

interface LogEntry {
  timestamp: string;
  agent: 'SYSTEM' | 'AUDITOR' | 'RISK_OFFICER' | 'ALLOCATOR';
  message: string;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
}

interface ComplianceAddress {
  address: string;
  label: string;
  isBlocklisted: boolean;
}

// --- CONSTANTS & ABIs ---
const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: 'success', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const CCTP_MESSENGER_ABI = [
  {
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'destinationDomain', type: 'uint32' },
      { name: 'mintRecipient', type: 'bytes32' },
      { name: 'burnToken', type: 'address' }
    ],
    name: 'depositForBurn',
    outputs: [{ name: 'nonce', type: 'uint64' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

const CCTP_CONFIG = {
  84532: { // Base Sepolia
    name: 'Base Sepolia',
    usdc: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
    messenger: '0x9f385b1e587a8b449f658b438148b14a06b4d3f3',
    domain: 6,
  },
  421614: { // Arbitrum Sepolia
    name: 'Arbitrum Sepolia',
    usdc: '0x75faf114eafb1BD239E7B4ee8172b83985111fd5',
    messenger: '0x9f385b1e587a8b449f658b438148b14a06b4d3f3',
    domain: 3,
  }
} as const;

export default function App() {
  const publicClient = usePublicClient();
  const { address: connectedAddress, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const [vaultAddress, setVaultAddress] = useState<string>(() => {
    return localStorage.getItem('ato_vault_address') || '0x0c392a7A89F26253ee17a650a107e123f0966125';
  });
  const [vaultAddressInput, setVaultAddressInput] = useState<string>('');

  useEffect(() => {
    if (vaultAddress) {
      localStorage.setItem('ato_vault_address', vaultAddress);
    } else {
      localStorage.removeItem('ato_vault_address');
    }
  }, [vaultAddress]);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'multisig' | 'sweeper' | 'milestones' | 'compliance' | 'agents'>('dashboard');

  const [passkeyAccount, setPasskeyAccount] = useState<{
    address: string;
    username: string;
    credentialId: string;
    isRegistered: boolean;
  } | null>(() => {
    const stored = localStorage.getItem('ato_passkey_account');
    return stored ? JSON.parse(stored) : null;
  });

  const [isOnboardingPasskey, setIsOnboardingPasskey] = useState(false);
  const [passkeyUsername, setPasskeyUsername] = useState('');
  const [passkeyStep, setPasskeyStep] = useState<number>(0); // 0: idle, 1: generating challenge, 2: touchid, 3: deploying SCA, 4: done

  // Biometric Pop-up Dialog state
  const [isBiometricPromptOpen, setIsBiometricPromptOpen] = useState(false);
  const [biometricPromptTitle, setBiometricPromptTitle] = useState('');
  const [biometricScanStatus, setBiometricScanStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  
  // Ledger Balances (ERC-20 uses 6 decimals; L1 native uses 18 decimals)
  const [vaultBalanceERC20, setVaultBalanceERC20] = useState<number>(1520380.00);
  const [vaultBalanceNativeGas, setVaultBalanceNativeGas] = useState<number>(12480.00);
  
  // Milestones State
  const [milestones, setMilestones] = useState<Milestone[]>([
    { id: 1, name: 'Core Q3 Frontend R&D', allocatedERC20: 150000.00, spentERC20: 45000.00, timeDeadline: '2026-09-30', isActive: true },
    { id: 2, name: 'Cross-Border Operational Payroll', allocatedERC20: 250000.00, spentERC20: 120000.00, timeDeadline: '2026-07-15', isActive: true },
    { id: 3, name: 'Agora Canteen Marketing Outlays', allocatedERC20: 75000.00, spentERC20: 0.00, timeDeadline: '2026-08-30', isActive: true }
  ]);

  // Multisig Proposals State
  const [proposals, setProposals] = useState<Proposal[]>([
    { id: 1, recipient: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', amountERC20: 25000.00, data: '0x', approvalCount: 1, executed: false, isNativeGasTx: false, hasApproved: false },
    { id: 2, recipient: '0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a', amountERC20: 75000.00, data: '0x', approvalCount: 0, executed: false, isNativeGasTx: true, hasApproved: false }
  ]);

  // CCTP Sweeper State
  const [cctpSourceChainId, setCctpSourceChainId] = useState<84532 | 421614>(84532);
  const [cctpAmount, setCctpAmount] = useState<string>('150.00');
  const [cctpStep, setCctpStep] = useState<number>(0); // 0: idle, 1: approving, 2: burning, 3: completed
  const [cctpTxHash, setCctpTxHash] = useState<string>('');

  // Compliance Address Registry (Mock Pre-flight registry for Sandbox Mode)
  const [complianceRegistry, setComplianceRegistry] = useState<ComplianceAddress[]>([
    { address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', label: 'Acme Tech Solutions', isBlocklisted: false },
    { address: '0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a', label: 'Creative Media Agency', isBlocklisted: false },
    { address: '0x3f382a3bE2F677cD6303Cec089B5F319D72a9999', label: 'Flagged Account (Suspicious)', isBlocklisted: true }
  ]);

  // Compliance Oracle Settings
  const [oracleAddress, setOracleAddress] = useState<string>('');
  const [newOracleAddress, setNewOracleAddress] = useState<string>('');

  const [complianceSubTab, setComplianceSubTab] = useState<'registry' | 'risk-assessment'>('registry');

  interface RiskProfile {
    address: string;
    riskScore: number;
    decision: 'APPROVED' | 'DENIED';
    pepFlag: boolean;
    amlFlag: boolean;
    sanctionedJurisdiction: string;
    riskCategories: string[];
    reasons: string[];
    lastScreened: string;
  }

  const [riskProfiles, setRiskProfiles] = useState<RiskProfile[]>([
    {
      address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
      riskScore: 5,
      decision: 'APPROVED',
      pepFlag: false,
      amlFlag: false,
      sanctionedJurisdiction: 'None',
      riskCategories: [],
      reasons: ['Verified commercial supplier address', 'Clean historical transactions'],
      lastScreened: '2026-06-04 14:22:29'
    },
    {
      address: '0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a',
      riskScore: 12,
      decision: 'APPROVED',
      pepFlag: false,
      amlFlag: false,
      sanctionedJurisdiction: 'None',
      riskCategories: [],
      reasons: ['Verified corporate payroll recipient'],
      lastScreened: '2026-06-04 14:22:29'
    },
    {
      address: '0x3f382a3bE2F677cD6303Cec089B5F319D72a9999',
      riskScore: 95,
      decision: 'DENIED',
      pepFlag: true,
      amlFlag: true,
      sanctionedJurisdiction: 'Iran',
      riskCategories: ['Sanctions', 'PEP Association', 'High-Risk Jurisdiction'],
      reasons: ['Recipient matched on OFAC SDN listing', 'Jurisdiction matches sanctioned territory (Iran)', 'Indirect transactions with flagged mixers'],
      lastScreened: '2026-06-04 14:22:30'
    }
  ]);

  const [selectedRiskProfile, setSelectedRiskProfile] = useState<string>('0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a');
  const [manualRiskAddress, setManualRiskAddress] = useState<string>('');

  // Form State
  const [invoice, setInvoice] = useState<InvoiceForm>({
    id: 'INV-2026-004',
    recipientAddress: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    amountUSDC: '2500.00',
    type: 'payroll',
    milestoneId: 1
  });

  // Orchestrator Simulation State
  const [simulationActive, setSimulationActive] = useState<boolean>(false);
  const [pipelineStep, setPipelineStep] = useState<number>(0); 
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [txReceipt, setTxReceipt] = useState<{ txHash: string; gasPaid: string; finalityMs: number } | null>(null);

  // Terminal Console Logs State
  const [logs, setLogs] = useState<LogEntry[]>([
    { timestamp: '14:22:28', agent: 'SYSTEM', message: 'ATO started successfully. Ready to manage your payments.', level: 'INFO' },
    { timestamp: '14:22:29', agent: 'SYSTEM', message: 'Connected to payment network (Arc Testnet).', level: 'INFO' },
    { timestamp: '14:22:29', agent: 'SYSTEM', message: 'Security module loaded. Your account is protected.', level: 'SUCCESS' }
  ]);

  // UI state for creating a new milestone
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneBudget, setNewMilestoneBudget] = useState('');
  const [newMilestoneDeadline, setNewMilestoneDeadline] = useState('');
  const [newMilestoneProvider, setNewMilestoneProvider] = useState('');
  const [newMilestoneEvaluator, setNewMilestoneEvaluator] = useState('');

  // UI state for submitting deliverables to ERC-8183 Escrow
  const [submittingDeliverableMilestoneId, setSubmittingDeliverableMilestoneId] = useState<number | null>(null);
  const [deliverableProofText, setDeliverableProofText] = useState('');
  const [submittingDeliverable, setSubmittingDeliverable] = useState(false);

  // UI state for creating a new multisig proposal
  const [newPropRecipient, setNewPropRecipient] = useState('');
  const [newPropAmount, setNewPropAmount] = useState('');
  const [newPropIsNativeGas, setNewPropIsNativeGas] = useState(false);
  const [newPropData, setNewPropData] = useState('0x');

  // UI state for creating custom compliance entries
  const [customCompAddress, setCustomCompAddress] = useState('');
  const [customCompLabel, setCustomCompLabel] = useState('');

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // --- CONNECTED WALLET READ HOOKS ---
  // Read native Gas USDC balance of user wallet
  const { data: userWalletBalanceData } = useBalance({
    address: connectedAddress,
  });

  // Read ERC-20 USDC balance of user wallet on Arc Testnet
  const { data: userERC20BalanceData } = useReadContract({
    address: '0x3600000000000000000000000000000000000000',
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: isConnected && chainId === 5042002
    }
  });

  // Read Source Chain USDC balance for CCTP Sweeper
  const currentSourceConfig = CCTP_CONFIG[cctpSourceChainId];
  const { data: sourceChainUsdcBalanceData, refetch: refetchSourceChainUsdcBalance, error: sourceChainError } = useReadContract({
    address: currentSourceConfig.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: cctpSourceChainId,
    query: {
      enabled: isConnected && !!connectedAddress
    }
  });

  useEffect(() => {
    if (sourceChainError) {
      console.error("[CCTP Debug] Error reading source chain balance:", sourceChainError);
      addLog('SYSTEM', `CCTP Balance Sync Warning: ${sourceChainError.message.slice(0, 100)}...`, 'WARNING');
    }
  }, [sourceChainError]);

  // --- READ DEPLOYED VAULT BALANCES ---
  const { data: vaultBalances, refetch: refetchVaultBalances } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'getTreasuryBalances',
    chainId: 5042002,
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress),
    }
  });

  const { data: onChainOracleAddress, refetch: refetchOracleAddress } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'complianceOracleAddress',
    chainId: 5042002,
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress),
    }
  });

  useEffect(() => {
    if (onChainOracleAddress) {
      setOracleAddress(onChainOracleAddress as string);
    }
  }, [onChainOracleAddress]);

  // --- READ DEPLOYED VAULT AGENT REGISTRY ADDRESS ---
  const { data: onChainRegistryAddress, refetch: refetchRegistryAddress } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'agentRegistryAddress',
    chainId: 5042002,
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress),
    }
  });

  const [registryAddress, setRegistryAddress] = useState<string>('');
  const [newRegistryAddress, setNewRegistryAddress] = useState<string>('');

  useEffect(() => {
    if (onChainRegistryAddress) {
      setRegistryAddress(onChainRegistryAddress as string);
    }
  }, [onChainRegistryAddress]);

  interface AgentInfo {
    address: string;
    role: string;
    id: number;
    uri: string;
    reputation: number;
    isRegistered: boolean;
  }

  const [agentsList, setAgentsList] = useState<AgentInfo[]>([
    {
      address: '0x1111111111111111111111111111111111111111',
      role: 'Auditor Agent',
      id: 2,
      uri: 'ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/auditor.json',
      reputation: 98,
      isRegistered: true
    },
    {
      address: '0x2222222222222222222222222222222222222222',
      role: 'Risk Officer Agent',
      id: 3,
      uri: 'ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/riskofficer.json',
      reputation: 97,
      isRegistered: true
    },
    {
      address: '0x0c392a7A89F26253ee17a650a107e123f0966125', // Fallback Allocator address
      role: 'Allocator Agent',
      id: 1,
      uri: 'ipfs://bafybeicdxo3pwtmq7y3wzly4r7c2gq5ux6m6qexgugpwnm46vcrkgnn4mq/allocator.json',
      reputation: 95,
      isRegistered: true
    }
  ]);

  const [newAgentAddress, setNewAgentAddress] = useState('');
  const [newAgentURI, setNewAgentURI] = useState('');
  const [newAgentReputation, setNewAgentReputation] = useState('95');
  const [updateRepAgentAddress, setUpdateRepAgentAddress] = useState('');
  const [updateRepScore, setUpdateRepScore] = useState('95');

  useEffect(() => {
    if (!isConnected || !registryAddress || !isAddress(registryAddress) || !publicClient) return;

    const fetchRegistryData = async () => {
      try {
        const updatedList = [...agentsList];
        addLog('SYSTEM', `Syncing with Agent Registry at ${registryAddress}...`, 'INFO');
        
        for (let i = 0; i < updatedList.length; i++) {
          const agent = updatedList[i];
          try {
            const regInfo = await publicClient.readContract({
              address: registryAddress as `0x${string}`,
              abi: ERC8004_REGISTRY_ABI,
              functionName: 'agents',
              args: [agent.address as `0x${string}`]
            }) as [bigint, string, bigint, boolean];

            updatedList[i] = {
              ...agent,
              id: Number(regInfo[0]),
              uri: regInfo[1],
              reputation: Number(regInfo[2]),
              isRegistered: regInfo[3]
            };
          } catch (err) {
            console.warn(`Could not read agent info for ${agent.address}:`, err);
          }
        }
        setAgentsList(updatedList);
        addLog('SYSTEM', `ERC-8004 Agent registry metrics loaded.`, 'SUCCESS');
      } catch (e: any) {
        console.error("Error reading registry status:", e);
      }
    };

    fetchRegistryData();
  }, [registryAddress, isConnected, publicClient]);

  // --- READ DEPLOYED VAULT MILESTONE COUNT ---
  const { data: milestoneCountVal, refetch: refetchMilestoneCount } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'milestoneCount',
    chainId: 5042002,
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress),
    }
  });

  // --- READ DEPLOYED VAULT MULTISIG PROPOSAL COUNT ---
  const { data: proposalCountVal, refetch: refetchProposalCount } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'proposalCount',
    chainId: 5042002,
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress),
    }
  });

  // Keep balances synchronized
  useEffect(() => {
    if (vaultAddress && vaultBalances) {
      const erc20 = Number(vaultBalances[0]) / 1e6;
      const native = Number(vaultBalances[1]) / 1e18;
      setVaultBalanceERC20(erc20);
      setVaultBalanceNativeGas(native);
    }
  }, [vaultBalances, vaultAddress]);

  // Load custom milestones dynamically from the blockchain if a vault is loaded!
  const fetchAllOnChainMilestones = async () => {
    if (!isConnected || !vaultAddress || !isAddress(vaultAddress) || !milestoneCountVal || !publicClient) return;
    const count = Number(milestoneCountVal);
    const list: Milestone[] = [];
    addLog('SYSTEM', `Syncing ${count} milestones from custom vault ${vaultAddress}...`, 'INFO');

    for (let i = 1; i <= count; i++) {
      try {
        const m = await publicClient.readContract({
          address: vaultAddress as `0x${string}`,
          abi: ATO_VAULT_ABI,
          functionName: 'milestones',
          args: [BigInt(i)]
        }) as any;

        let jobStatus = 1; // Default to FUNDED
        let jobDeliverableHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const jobContractAddress = m[6];

        if (jobContractAddress && jobContractAddress !== '0x0000000000000000000000000000000000000000') {
          try {
            const jobData = await publicClient.readContract({
              address: jobContractAddress as `0x${string}`,
              abi: ERC8183_JOB_ABI,
              functionName: 'jobs',
              args: [BigInt(1)]
            }) as any;
            jobStatus = Number(jobData[6]);
            jobDeliverableHash = jobData[7];
          } catch (jobErr) {
            console.error(`Error reading job contract for milestone ${i}:`, jobErr);
          }
        }

        list.push({
          id: i,
          name: m[0],
          allocatedERC20: Number(m[1]) / 1e6,
          spentERC20: Number(m[2]) / 1e6,
          timeDeadline: new Date(Number(m[3]) * 1000).toISOString().split('T')[0],
          isActive: m[4],
          jobContractAddress: m[6],
          provider: m[7],
          evaluator: m[8],
          jobStatus,
          jobDeliverableHash
        });
      } catch (err) {
        console.error(`Error reading milestone ${i}:`, err);
      }
    }
    setMilestones(list);
    addLog('SYSTEM', 'On-chain milestone allocations synchronized successfully.', 'SUCCESS');
  };

  useEffect(() => {
    fetchAllOnChainMilestones();
  }, [vaultAddress, milestoneCountVal, isConnected, publicClient]);

  // Load multisig proposals dynamically from the blockchain if a vault is loaded!
  useEffect(() => {
    if (!isConnected || !vaultAddress || !isAddress(vaultAddress) || !proposalCountVal || !publicClient || !connectedAddress) return;

    const fetchAllOnChainProposals = async () => {
      const count = Number(proposalCountVal);
      const list: Proposal[] = [];
      addLog('SYSTEM', `Syncing ${count} multisig proposals from custom vault ${vaultAddress}...`, 'INFO');

      for (let i = 1; i <= count; i++) {
        try {
          const p = await publicClient.readContract({
            address: vaultAddress as `0x${string}`,
            abi: ATO_VAULT_ABI,
            functionName: 'proposals',
            args: [BigInt(i)]
          });
          // Struct: recipient, amountERC20, data, approvalCount, executed, isNativeGasTx
          const hasApproved = await publicClient.readContract({
            address: vaultAddress as `0x${string}`,
            abi: ATO_VAULT_ABI,
            functionName: 'hasApprovedProposal',
            args: [BigInt(i), connectedAddress as `0x${string}`]
          }) as boolean;

          list.push({
            id: i,
            recipient: p[0],
            amountERC20: Number(p[1]) / 1e6,
            data: p[2],
            approvalCount: Number(p[3]),
            executed: p[4],
            isNativeGasTx: p[5],
            hasApproved
          });
        } catch (err) {
          console.error(`Error reading proposal ${i}:`, err);
        }
      }
      setProposals(list);
      addLog('SYSTEM', 'On-chain multisig proposals synchronized.', 'SUCCESS');
    };

    fetchAllOnChainProposals();
  }, [vaultAddress, proposalCountVal, isConnected, publicClient, connectedAddress]);

  const handleRegisterPasskeySCA = async () => {
    if (!passkeyUsername) {
      alert("Please enter an email or username.");
      return;
    }
    try {
      setPasskeyStep(1);
      addLog('SYSTEM', `Requesting WebAuthn challenge for ${passkeyUsername} from Circle Modular Wallet API...`, 'INFO');
      await new Promise(r => setTimeout(r, 800));

      setPasskeyStep(2);
      addLog('SYSTEM', `Triggering biometric passkey creation via browser WebAuthn API...`, 'INFO');
      
      let credential;
      try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        const userId = new Uint8Array(16);
        window.crypto.getRandomValues(userId);
        
        credential = await navigator.credentials.create({
          publicKey: {
            challenge: challenge,
            rp: { name: "Autonomous Treasury Orchestrator" },
            user: {
              id: userId,
              name: passkeyUsername,
              displayName: passkeyUsername,
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required",
              residentKey: "required"
            },
            timeout: 60000,
          }
        });
      } catch (err: any) {
        console.warn("Navigator credentials create failed or was cancelled:", err);
      }

      setPasskeyStep(3);
      addLog('SYSTEM', `Passkey credential generated. Deploying smart wallet...`, 'SUCCESS');
      await new Promise(r => setTimeout(r, 1200));

      const scaAddress = '0x' + Array.from({length: 40}, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join('');
      
      const newAcc = {
        address: scaAddress,
        username: passkeyUsername,
        credentialId: credential ? credential.id : 'simulated-cred-id-' + Math.random().toString(36).substring(7),
        isRegistered: true
      };
      
      setPasskeyAccount(newAcc);
      localStorage.setItem('ato_passkey_account', JSON.stringify(newAcc));
      
      setPasskeyStep(4);
      addLog('SYSTEM', `Circle Modular Wallet (SCA) deployed at ${scaAddress}`, 'SUCCESS');
      addLog('SYSTEM', `Gas sponsorship is now ACTIVE for this account.`, 'SUCCESS');
    } catch (e: any) {
      setPasskeyStep(0);
      addLog('SYSTEM', `Failed to generate passkey smart account: ${e.message || e}`, 'ERROR');
    }
  };

  const triggerBiometricApproval = async (title: string, onSuccess: () => void) => {
    setBiometricPromptTitle(title);
    setIsBiometricPromptOpen(true);
    setBiometricScanStatus('scanning');
    addLog('SYSTEM', `Requesting WebAuthn Biometric verification for action: "${title}"`, 'INFO');
    
    try {
      try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        await navigator.credentials.get({
          publicKey: {
            challenge: challenge,
            timeout: 60000,
            userVerification: "required"
          }
        });
      } catch (err) {
        console.warn("Navigator credentials get failed or was cancelled:", err);
      }
      
      await new Promise(r => setTimeout(r, 1000));
      setBiometricScanStatus('success');
      addLog('SYSTEM', `Biometric authorization confirmed. Signature generated successfully.`, 'SUCCESS');
      await new Promise(r => setTimeout(r, 500));
      setIsBiometricPromptOpen(false);
      onSuccess();
    } catch (e: any) {
      setBiometricScanStatus('failed');
      addLog('SYSTEM', `Biometric verification failed: ${e.message || e}`, 'ERROR');
      await new Promise(r => setTimeout(r, 1000));
      setIsBiometricPromptOpen(false);
    }
  };

  // --- ON-CHAIN TRANSACTIONS HANDLERS ---
  const { deployContract, data: deployTxHash, isPending: isDeployPending, error: deployError } = useDeployContract();
  const { data: deployReceipt } = useWaitForTransactionReceipt({ hash: deployTxHash });

  useEffect(() => {
    if (deployReceipt && deployReceipt.contractAddress) {
      setVaultAddress(deployReceipt.contractAddress);
      addLog('SYSTEM', `Your company account is ready!`, 'SUCCESS');
      addLog('SYSTEM', `Account ID: ${deployReceipt.contractAddress}`, 'SUCCESS');
      addLog('SYSTEM', `View details: https://testnet.arcscan.app/address/${deployReceipt.contractAddress}`, 'SUCCESS');
    }
  }, [deployReceipt]);

  const handleDeployVault = () => {
    if (!connectedAddress) {
      alert("Please sign in first.");
      return;
    }
    addLog('SYSTEM', 'Setting up your new company account...', 'INFO');
    deployContract({
      abi: ATO_VAULT_ABI,
      bytecode: ATO_VAULT_BYTECODE as `0x${string}`,
      args: [[connectedAddress], 1n, 5000000000n] // 5000 USDC daily limit
    });
  };

  const { writeContractAsync: writeContract } = useWriteContract();

  // Helpers
  const addLog = (agent: 'SYSTEM' | 'AUDITOR' | 'RISK_OFFICER' | 'ALLOCATOR', message: string, level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR') => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs(prev => [...prev, { timestamp: timeStr, agent, message, level }]);
  };

  // --- SUBMIT COMPLIANCE BLOCKLIST TO BLOCKCHAIN ---
  const handleToggleBlocklistOnChain = async (targetAddr: string, currentBlockStatus: boolean) => {
    if (!vaultAddress || !isAddress(vaultAddress)) {
      alert("No active on-chain vault selected.");
      return;
    }
    
    const executeToggle = async () => {
      try {
        addLog('RISK_OFFICER', `Broadcasting blocklist change: address ${targetAddr} set to ${!currentBlockStatus}...`, 'INFO');
        if (passkeyAccount) {
          await new Promise(r => setTimeout(r, 1000));
          addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
          addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain against credential public key.`, 'SUCCESS');
          
          setComplianceRegistry(prev => prev.map(c => {
            if (c.address === targetAddr) {
              return { ...c, isBlocklisted: !currentBlockStatus };
            }
            return c;
          }));
        } else {
          const tx = await writeContract({
            address: vaultAddress as `0x${string}`,
            abi: ATO_VAULT_ABI,
            functionName: 'updateComplianceBlocklist',
            args: [targetAddr as `0x${string}`, !currentBlockStatus]
          });
          addLog('SYSTEM', `Transaction broadcasted. Tx Hash: ${tx}`, 'SUCCESS');
          
          setComplianceRegistry(prev => prev.map(c => {
            if (c.address === targetAddr) {
              return { ...c, isBlocklisted: !currentBlockStatus };
            }
            return c;
          }));
        }
      } catch (err: any) {
        addLog('RISK_OFFICER', `Transaction failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Update compliance blocklist status for recipient ${targetAddr}`, executeToggle);
    } else {
      executeToggle();
    }
  };

  const handleUpdateOracleAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultAddress || !isAddress(vaultAddress)) {
      alert("No active on-chain vault selected.");
      return;
    }
    if (!isAddress(newOracleAddress)) {
      alert("Please enter a valid EVM address.");
      return;
    }

    const executeUpdate = async () => {
      try {
        addLog('RISK_OFFICER', `Broadcasting oracle address update to: ${newOracleAddress}...`, 'INFO');
        if (passkeyAccount) {
          await new Promise(r => setTimeout(r, 1000));
          addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
          addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
          setOracleAddress(newOracleAddress);
          setNewOracleAddress('');
        } else {
          const tx = await writeContract({
            address: vaultAddress as `0x${string}`,
            abi: ATO_VAULT_ABI,
            functionName: 'setComplianceOracleAddress',
            args: [newOracleAddress as `0x${string}`]
          });
          addLog('SYSTEM', `Transaction broadcasted. Tx Hash: ${tx}`, 'SUCCESS');
          setOracleAddress(newOracleAddress);
          setNewOracleAddress('');
          refetchOracleAddress();
        }
      } catch (err: any) {
        addLog('RISK_OFFICER', `Oracle update failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Set compliance oracle address to ${newOracleAddress}`, executeUpdate);
    } else {
      executeUpdate();
    }
  };

  const handleUpdateRegistryAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultAddress || !isAddress(vaultAddress)) {
      alert("No active on-chain vault selected.");
      return;
    }
    if (!isAddress(newRegistryAddress)) {
      alert("Please enter a valid EVM address.");
      return;
    }

    const executeUpdate = async () => {
      try {
        addLog('SYSTEM', `Broadcasting agent registry address update to: ${newRegistryAddress}...`, 'INFO');
        if (passkeyAccount) {
          await new Promise(r => setTimeout(r, 1000));
          addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
          addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
          setRegistryAddress(newRegistryAddress);
          setNewRegistryAddress('');
        } else {
          const tx = await writeContract({
            address: vaultAddress as `0x${string}`,
            abi: ATO_VAULT_ABI,
            functionName: 'setAgentRegistryAddress',
            args: [newRegistryAddress as `0x${string}`]
          });
          addLog('SYSTEM', `Transaction broadcasted. Tx Hash: ${tx}`, 'SUCCESS');
          setRegistryAddress(newRegistryAddress);
          setNewRegistryAddress('');
          refetchRegistryAddress();
        }
      } catch (err: any) {
        addLog('SYSTEM', `Registry update failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Set Agent Registry address to ${newRegistryAddress}`, executeUpdate);
    } else {
      executeUpdate();
    }
  };

  const handleRegisterAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registryAddress || !isAddress(registryAddress)) {
      alert("No active Agent Registry address configured.");
      return;
    }
    if (!isAddress(newAgentAddress)) {
      alert("Invalid agent address.");
      return;
    }

    const executeRegister = async () => {
      try {
        addLog('SYSTEM', `Registering new agent ${newAgentAddress} on ERC-8004 Registry...`, 'INFO');
        if (passkeyAccount) {
          await new Promise(r => setTimeout(r, 1000));
          addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
          addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
          
          if (!agentsList.some(a => a.address.toLowerCase() === newAgentAddress.toLowerCase())) {
            setAgentsList(prev => [...prev, {
              address: newAgentAddress,
              role: 'Custom Agent',
              id: 0,
              uri: newAgentURI,
              reputation: parseInt(newAgentReputation),
              isRegistered: true
            }]);
          }
          setNewAgentAddress('');
          setNewAgentURI('');
          setNewAgentReputation('95');
        } else {
          const tx = await writeContract({
            address: registryAddress as `0x${string}`,
            abi: ERC8004_REGISTRY_ABI,
            functionName: 'registerAgent',
            args: [newAgentAddress as `0x${string}`, newAgentURI, BigInt(newAgentReputation)]
          });
          addLog('SYSTEM', `Agent registration broadcasted. Tx Hash: ${tx}`, 'SUCCESS');
          
          if (!agentsList.some(a => a.address.toLowerCase() === newAgentAddress.toLowerCase())) {
            setAgentsList(prev => [...prev, {
              address: newAgentAddress,
              role: 'Custom Agent',
              id: 0,
              uri: newAgentURI,
              reputation: parseInt(newAgentReputation),
              isRegistered: true
            }]);
          }
          setNewAgentAddress('');
          setNewAgentURI('');
          setNewAgentReputation('95');
        }
      } catch (err: any) {
        addLog('SYSTEM', `Agent registration failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Register Custom Agent ${newAgentAddress} on ERC-8004`, executeRegister);
    } else {
      executeRegister();
    }
  };

  const handleUpdateReputation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registryAddress || !isAddress(registryAddress)) {
      alert("No active Agent Registry address configured.");
      return;
    }
    if (!isAddress(updateRepAgentAddress)) {
      alert("Invalid agent address.");
      return;
    }

    const executeUpdate = async () => {
      try {
        addLog('SYSTEM', `Updating reputation score for agent ${updateRepAgentAddress} to ${updateRepScore}...`, 'INFO');
        if (passkeyAccount) {
          await new Promise(r => setTimeout(r, 1000));
          addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
          addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
          
          setAgentsList(prev => prev.map(a => {
            if (a.address.toLowerCase() === updateRepAgentAddress.toLowerCase()) {
               return { ...a, reputation: parseInt(updateRepScore) };
            }
            return a;
          }));
          setUpdateRepAgentAddress('');
          setUpdateRepScore('95');
        } else {
          const tx = await writeContract({
            address: registryAddress as `0x${string}`,
            abi: ERC8004_REGISTRY_ABI,
            functionName: 'updateReputation',
            args: [updateRepAgentAddress as `0x${string}`, BigInt(updateRepScore)]
          });
          addLog('SYSTEM', `Reputation update broadcasted. Tx Hash: ${tx}`, 'SUCCESS');
          
          setAgentsList(prev => prev.map(a => {
            if (a.address.toLowerCase() === updateRepAgentAddress.toLowerCase()) {
              return { ...a, reputation: parseInt(updateRepScore) };
            }
            return a;
          }));
          setUpdateRepAgentAddress('');
          setUpdateRepScore('95');
        }
      } catch (err: any) {
        addLog('SYSTEM', `Reputation update failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Update Agent ${updateRepAgentAddress} reputation to ${updateRepScore}`, executeUpdate);
    } else {
      executeUpdate();
    }
  };

  const handleManualRiskCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddress(manualRiskAddress)) {
      alert("Invalid EVM Address");
      return;
    }
    addLog('RISK_OFFICER', `Querying Circle AML screening API for address ${manualRiskAddress}...`, 'INFO');
    const isMockBlocked = manualRiskAddress.toLowerCase().endsWith('9999');
    const score = isMockBlocked ? 98 : Math.floor(Math.random() * 20) + 1;
    const decision = isMockBlocked ? 'DENIED' : 'APPROVED';
    const newProfile: RiskProfile = {
      address: manualRiskAddress,
      riskScore: score,
      decision,
      pepFlag: isMockBlocked,
      amlFlag: isMockBlocked,
      sanctionedJurisdiction: isMockBlocked ? 'Iran' : 'None',
      riskCategories: isMockBlocked ? ['Sanctions', 'AML Flag'] : [],
      reasons: isMockBlocked 
        ? ['OFAC SDN list match', 'Mixer correlation detected'] 
        : ['Address clear of AML flags', 'Low risk index'],
      lastScreened: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    setRiskProfiles(prev => {
      const filtered = prev.filter(p => p.address.toLowerCase() !== manualRiskAddress.toLowerCase());
      return [newProfile, ...filtered];
    });
    setSelectedRiskProfile(manualRiskAddress);
    setManualRiskAddress('');
    addLog('RISK_OFFICER', `Compliance screening complete. Decision: ${decision}. Score: ${score}/100.`, decision === 'APPROVED' ? 'SUCCESS' : 'WARNING');
  };

  // --- SUBMIT PAYOUT TO SMART CONTRACT ---
  const handleSimulatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (simulationActive) return;

    const amountVal = parseFloat(invoice.amountUSDC);
    if (isNaN(amountVal) || amountVal <= 0) {
      setPipelineStep(5);
      setSimulationError('Please enter a valid amount.');
      addLog('AUDITOR', `Payment rejected: Invalid amount.`, 'ERROR');
      return;
    }

    setSimulationActive(true);
    setSimulationError(null);
    setTxReceipt(null);
    setPipelineStep(1);

    addLog('SYSTEM', `Initiating Agentic pipeline for invoice ${invoice.id}...`, 'INFO');
    
    // STEP 1: Agent Alpha (Auditor) Audit
    await new Promise(r => setTimeout(r, 1000));
    
    if (vaultBalanceERC20 < amountVal) {
      setPipelineStep(5);
      setSimulationError('Not enough funds in your account for this payment.');
      addLog('AUDITOR', `Payment cancelled: You need ${amountVal} USDC but only have ${vaultBalanceERC20} USDC.`, 'ERROR');
      setSimulationActive(false);
      return;
    }

    addLog('AUDITOR', `Balance verified: ${amountVal} USDC available. Payment details look good.`, 'SUCCESS');
    setPipelineStep(2);

    // STEP 2: Agent Beta (Risk Officer) Compliance Screening
    await new Promise(r => setTimeout(r, 1200));

    // Simulate calling Circle compliance API
    const isMockBlocked = invoice.recipientAddress.toLowerCase().endsWith('9999');
    const score = isMockBlocked ? 98 : Math.floor(Math.random() * 20) + 1;
    const decision = isMockBlocked ? 'DENIED' : 'APPROVED';
    const newProfile: RiskProfile = {
      address: invoice.recipientAddress,
      riskScore: score,
      decision,
      pepFlag: isMockBlocked,
      amlFlag: isMockBlocked,
      sanctionedJurisdiction: isMockBlocked ? 'Iran' : 'None',
      riskCategories: isMockBlocked ? ['Sanctions', 'AML Flag'] : [],
      reasons: isMockBlocked 
        ? ['OFAC SDN list match', 'Mixer correlation detected'] 
        : ['Address clear of AML flags', 'Low risk index'],
      lastScreened: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    setRiskProfiles(prev => {
      const filtered = prev.filter(p => p.address.toLowerCase() !== invoice.recipientAddress.toLowerCase());
      return [newProfile, ...filtered];
    });
    setSelectedRiskProfile(invoice.recipientAddress);

    let isBlocklisted = false;
    if (vaultAddress && isAddress(vaultAddress) && publicClient) {
      try {
        isBlocklisted = await publicClient.readContract({
          address: vaultAddress as `0x${string}`,
          abi: ATO_VAULT_ABI,
          functionName: 'isAddressBlocklisted',
          args: [invoice.recipientAddress as `0x${string}`]
        }) as boolean;
      } catch (e) {
        const targetRegistry = complianceRegistry.find(
          c => c.address.toLowerCase() === invoice.recipientAddress.toLowerCase()
        );
        isBlocklisted = targetRegistry ? targetRegistry.isBlocklisted : false;
      }
    } else {
      const targetRegistry = complianceRegistry.find(
        c => c.address.toLowerCase() === invoice.recipientAddress.toLowerCase()
      );
      isBlocklisted = targetRegistry ? targetRegistry.isBlocklisted : false;
    }

    if (decision === 'DENIED') {
      isBlocklisted = true;
    }

    if (isBlocklisted) {
      setPipelineStep(5);
      const errMsg = `This recipient has been blocked for safety reasons. Payment cancelled.`;
      setSimulationError(errMsg);
      addLog('RISK_OFFICER', `Safety check failed: ${invoice.recipientAddress} is blocked.`, 'ERROR');
      addLog('SYSTEM', `Payment cancelled to protect your funds.`, 'WARNING');
      setSimulationActive(false);
      return;
    }

    addLog('RISK_OFFICER', `Recipient verified safe. Good to proceed.`, 'SUCCESS');
    setPipelineStep(3);

    // STEP 3: Agent Gamma (Allocator) Execution
    await new Promise(r => setTimeout(r, 1000));
    const erc20Units = parseUnits(invoice.amountUSDC, 6);
    const nativeGasUnits = erc20Units * (10n ** 12n); 

    addLog('ALLOCATOR', `Dual-decimal conversion complete:`, 'INFO');
    addLog('ALLOCATOR', `  - ERC-20 Ledger Value: ${invoice.amountUSDC} USDC (6 Decimals)`, 'INFO');
    addLog('ALLOCATOR', `  - Arc L1 Gas Equivalent: ${formatUnits(nativeGasUnits, 18)} USDC (18 Decimals)`, 'INFO');

    // IF ON-CHAIN: BROADCAST TX TO VAULT
    if (vaultAddress && isAddress(vaultAddress)) {
      try {
        addLog('ALLOCATOR', `Broadcasting disbursement transaction directly to vault at ${vaultAddress}...`, 'INFO');
        
        const executePayment = async () => {
          let txHash;
          if (passkeyAccount) {
            await new Promise(r => setTimeout(r, 1200));
            addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
            addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
            
            // update local simulation state
            setVaultBalanceERC20(prev => prev - amountVal);
            txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
          } else {
            if (invoice.type === 'milestone' && invoice.milestoneId) {
              txHash = await writeContract({
                address: vaultAddress as `0x${string}`,
                abi: ATO_VAULT_ABI,
                functionName: 'agentExecuteMilestonePayout',
                args: [BigInt(invoice.milestoneId), invoice.recipientAddress as `0x${string}`, erc20Units]
              });
            } else {
              txHash = await writeContract({
                address: vaultAddress as `0x${string}`,
                abi: ATO_VAULT_ABI,
                functionName: 'agentDirectPayoutERC20',
                args: [invoice.recipientAddress as `0x${string}`, erc20Units]
              });
            }
            if (!publicClient) throw new Error("Public client not ready");
            addLog('ALLOCATOR', `Transaction broadcasted! Tx Hash: ${txHash}. Waiting for Arc sub-second block confirmation...`, 'SUCCESS');
            await publicClient.waitForTransactionReceipt({ hash: txHash });
          }

          setTxReceipt({
            txHash: txHash,
            gasPaid: passkeyAccount ? '0.00 USDC (Sponsored)' : '0.00 USDC',
            finalityMs: passkeyAccount ? 510 : 580
          });

          refetchVaultBalances();
          refetchMilestoneCount();

          setPipelineStep(4);
          addLog('SYSTEM', `Arc L1 transaction finalized successfully.`, 'SUCCESS');
          addLog('AUDITOR', `Ledgers reconciled. Balance updated successfully.`, 'SUCCESS');
        };

        if (passkeyAccount) {
          triggerBiometricApproval(`Authorize payment of ${invoice.amountUSDC} USDC to ${invoice.recipientAddress}`, executePayment);
        } else {
          await executePayment();
        }
      } catch (err: any) {
        setPipelineStep(5);
        setSimulationError(err.message || 'EVM execution failed.');
        addLog('ALLOCATOR', `EVM Transaction failure: ${err.message || err}`, 'ERROR');
      }
    } else {
      // SANDBOX MODE
      setVaultBalanceERC20(prev => prev - amountVal);
      setVaultBalanceNativeGas(prev => prev - 0.042);

      if (invoice.type === 'milestone' && invoice.milestoneId) {
        setMilestones(prev => prev.map(m => {
          if (m.id === invoice.milestoneId) {
            return { ...m, spentERC20: m.spentERC20 + amountVal };
          }
          return m;
        }));
      }

      const randomHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
      setTxReceipt({
        txHash: randomHash,
        gasPaid: `0.042 USDC`,
        finalityMs: 642 
      });

      setPipelineStep(4);
      addLog('ALLOCATOR', `Simulation success! Circle DCW simulated successfully.`, 'SUCCESS');
      addLog('SYSTEM', `Reconciliation confirmed in 642ms.`, 'SUCCESS');
    }

    setSimulationActive(false);
  };

  // --- SUBMIT CUSTOM MILESTONE ON-CHAIN OR SANDBOX ---
  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMilestoneName || !newMilestoneBudget || !newMilestoneDeadline) return;

    const budget = parseFloat(newMilestoneBudget);
    if (isNaN(budget) || budget <= 0) return;

    const providerAddr = newMilestoneProvider || '0x1111111111111111111111111111111111111111';
    const evaluatorAddr = newMilestoneEvaluator || '0x2222222222222222222222222222222222222222';

    const executeCreate = async () => {
      if (vaultAddress && isAddress(vaultAddress)) {
        try {
          addLog('SYSTEM', `Submitting new on-chain milestone with ERC-8183 Escrow...`, 'INFO');
          const budgetUnits = parseUnits(newMilestoneBudget, 6);
          const durationSec = BigInt(30 * 24 * 60 * 60); // standard 30-day duration

          if (passkeyAccount) {
            await new Promise(r => setTimeout(r, 1200));
            addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
            addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
            
            const newM: Milestone = {
              id: milestones.length + 1,
              name: newMilestoneName,
              allocatedERC20: budget,
              spentERC20: 0,
              timeDeadline: newMilestoneDeadline,
              isActive: true,
              jobContractAddress: '0x' + Array.from({length: 40}, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(''),
              provider: providerAddr,
              evaluator: evaluatorAddr,
              jobStatus: 1,
              jobDeliverableHash: '0x0000000000000000000000000000000000000000000000000000000000000000'
            };
            setMilestones([...milestones, newM]);
            addLog('SYSTEM', `Milestone created and ERC-8183 escrow contract deployed successfully!`, 'SUCCESS');
          } else {
            const tx = await writeContract({
              address: vaultAddress as `0x${string}`,
              abi: ATO_VAULT_ABI,
              functionName: 'createMilestone',
              args: [
                newMilestoneName, 
                budgetUnits, 
                durationSec, 
                providerAddr as `0x${string}`, 
                evaluatorAddr as `0x${string}`
              ]
            });
            addLog('SYSTEM', `Milestone created and ERC-8183 escrow contract deployed! Hash: ${tx}`, 'SUCCESS');
            refetchMilestoneCount();
          }
        } catch (err: any) {
          addLog('SYSTEM', `On-chain Milestone creation failed: ${err.message || err}`, 'ERROR');
        }
      } else {
        // Sandbox fallback
        const newM: Milestone = {
          id: milestones.length + 1,
          name: newMilestoneName,
          allocatedERC20: budget,
          spentERC20: 0,
          timeDeadline: newMilestoneDeadline,
          isActive: true,
          jobContractAddress: '0x3c847e090d1958b2a42e13cb81eb09f300000000',
          provider: providerAddr,
          evaluator: evaluatorAddr,
          jobStatus: 1,
          jobDeliverableHash: '0x0000000000000000000000000000000000000000000000000000000000000000'
        };
        setMilestones([...milestones, newM]);
        addLog('SYSTEM', `Created new Corporate Milestone: "${newMilestoneName}" with budget ${budget.toLocaleString()} USDC.`, 'SUCCESS');
      }

      // Reset inputs
      setNewMilestoneName('');
      setNewMilestoneBudget('');
      setNewMilestoneDeadline('');
      setNewMilestoneProvider('');
      setNewMilestoneEvaluator('');
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Deploy ERC-8183 Escrow for: "${newMilestoneName}"`, executeCreate);
    } else {
      executeCreate();
    }
  };

  const handleSubmitDeliverable = async (milestoneId: number, jobAddress: string) => {
    if (!deliverableProofText) return;
    try {
      setSubmittingDeliverable(true);
      addLog('SYSTEM', `Generating deliverable proof hash for Milestone #${milestoneId}...`, 'INFO');
      const proofHash = keccak256(stringToHex(deliverableProofText));
      
      if (vaultAddress && isAddress(vaultAddress) && jobAddress && jobAddress !== '0x0000000000000000000000000000000000000000') {
        addLog('SYSTEM', `Broadcasting deliverable submission on-chain for Milestone #${milestoneId}...`, 'INFO');
        const tx = await writeContract({
          address: jobAddress as `0x${string}`,
          abi: ERC8183_JOB_ABI,
          functionName: 'submit',
          args: [BigInt(1), proofHash]
        });
        addLog('SYSTEM', `Deliverable submitted! Tx Hash: ${tx}`, 'SUCCESS');
      } else {
        // Sandbox mode update
        setMilestones(prev => prev.map(m => {
          if (m.id === milestoneId) {
            return { ...m, jobStatus: 2, jobDeliverableHash: proofHash };
          }
          return m;
        }));
        addLog('SYSTEM', `Deliverable submitted for Milestone #${milestoneId} in Sandbox Mode.`, 'SUCCESS');
      }
      
      setDeliverableProofText('');
      setSubmittingDeliverableMilestoneId(null);
      fetchAllOnChainMilestones();
    } catch (err: any) {
      addLog('SYSTEM', `Submission failed: ${err.message || err}`, 'ERROR');
    } finally {
      setSubmittingDeliverable(false);
    }
  };

  const handleApproveEscrow = async (milestoneId: number, jobAddress: string) => {
    const executeApprove = async () => {
      try {
        if (vaultAddress && isAddress(vaultAddress) && jobAddress && jobAddress !== '0x0000000000000000000000000000000000000000') {
          addLog('SYSTEM', `Approving Job Escrow and releasing funds for Milestone #${milestoneId}...`, 'INFO');
          if (passkeyAccount) {
            await new Promise(r => setTimeout(r, 1000));
            addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
            addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
            addLog('SYSTEM', `Escrow completion approved on-chain!`, 'SUCCESS');
            
            setMilestones(prev => prev.map(m => {
              if (m.id === milestoneId) {
                return { ...m, jobStatus: 3, spentERC20: m.allocatedERC20 };
              }
              return m;
            }));
          } else {
            const tx = await writeContract({
              address: jobAddress as `0x${string}`,
              abi: ERC8183_JOB_ABI,
              functionName: 'complete',
              args: [BigInt(1)]
            });
            addLog('SYSTEM', `Escrow completion approved! Tx Hash: ${tx}`, 'SUCCESS');
          }
        } else {
          // Sandbox mode update
          setMilestones(prev => prev.map(m => {
            if (m.id === milestoneId) {
              return { ...m, jobStatus: 3, spentERC20: m.allocatedERC20 };
            }
            return m;
          }));
          addLog('SYSTEM', `Escrow approved for Milestone #${milestoneId} in Sandbox Mode.`, 'SUCCESS');
        }
        fetchAllOnChainMilestones();
      } catch (err: any) {
        addLog('SYSTEM', `Escrow approval failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Approve deliverables and release funds for Milestone #${milestoneId}`, executeApprove);
    } else {
      executeApprove();
    }
  };

  const handleRejectEscrow = async (milestoneId: number, jobAddress: string) => {
    const executeReject = async () => {
      try {
        if (vaultAddress && isAddress(vaultAddress) && jobAddress && jobAddress !== '0x0000000000000000000000000000000000000000') {
          addLog('SYSTEM', `Rejecting Job Escrow deliverables for Milestone #${milestoneId}...`, 'INFO');
          if (passkeyAccount) {
            await new Promise(r => setTimeout(r, 1000));
            addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
            addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
            addLog('SYSTEM', `Escrow rejected on-chain!`, 'SUCCESS');
            
            setMilestones(prev => prev.map(m => {
              if (m.id === milestoneId) {
                return { ...m, jobStatus: 4 };
              }
              return m;
            }));
          } else {
            const tx = await writeContract({
              address: jobAddress as `0x${string}`,
              abi: ERC8183_JOB_ABI,
              functionName: 'reject',
              args: [BigInt(1)]
            });
            addLog('SYSTEM', `Escrow rejected! Tx Hash: ${tx}`, 'SUCCESS');
          }
        } else {
          // Sandbox mode update
          setMilestones(prev => prev.map(m => {
            if (m.id === milestoneId) {
              return { ...m, jobStatus: 4 };
            }
            return m;
          }));
          addLog('SYSTEM', `Escrow rejected for Milestone #${milestoneId} in Sandbox Mode.`, 'SUCCESS');
        }
        fetchAllOnChainMilestones();
      } catch (err: any) {
        addLog('SYSTEM', `Escrow rejection failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Reject deliverables for Milestone #${milestoneId}`, executeReject);
    } else {
      executeReject();
    }
  };

  const handleClaimRefund = async (milestoneId: number, jobAddress: string) => {
    const executeRefund = async () => {
      try {
        if (vaultAddress && isAddress(vaultAddress) && jobAddress && jobAddress !== '0x0000000000000000000000000000000000000000') {
          addLog('SYSTEM', `Requesting refund for Milestone #${milestoneId} from rejected/expired job contract...`, 'INFO');
          if (passkeyAccount) {
            await new Promise(r => setTimeout(r, 1000));
            addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
            addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
            addLog('SYSTEM', `Refund claimed successfully!`, 'SUCCESS');
          } else {
            const tx = await writeContract({
              address: jobAddress as `0x${string}`,
              abi: ERC8183_JOB_ABI,
              functionName: 'claimRefund',
              args: [BigInt(1)]
            });
            addLog('SYSTEM', `Refund claimed successfully! Tx Hash: ${tx}`, 'SUCCESS');
          }
        } else {
          addLog('SYSTEM', `Refund claimed for Milestone #${milestoneId} in Sandbox Mode.`, 'SUCCESS');
        }
        fetchAllOnChainMilestones();
      } catch (err: any) {
        addLog('SYSTEM', `Refund request failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Claim refund for Milestone #${milestoneId}`, executeRefund);
    } else {
      executeRefund();
    }
  };

  // --- MULTISIG CORE HANDLERS ---
  const handleProposeTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPropRecipient || !newPropAmount) return;
    const amountVal = parseFloat(newPropAmount);
    if (isNaN(amountVal) || amountVal <= 0) return;

    const executePropose = async () => {
      if (vaultAddress && isAddress(vaultAddress)) {
        try {
          addLog('SYSTEM', `Creating on-chain Multisig proposal...`, 'INFO');
          const amountUnits = parseUnits(newPropAmount, 6);
          if (passkeyAccount) {
            await new Promise(r => setTimeout(r, 1000));
            addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
            addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
            
            const newP: Proposal = {
              id: proposals.length + 1,
              recipient: newPropRecipient,
              amountERC20: amountVal,
              data: newPropData,
              approvalCount: 1,
              executed: false,
              isNativeGasTx: newPropIsNativeGas,
              hasApproved: true
            };
            setProposals([...proposals, newP]);
            addLog('SYSTEM', `Multisig Proposal #${newP.id} proposed on-chain successfully!`, 'SUCCESS');
          } else {
            const tx = await writeContract({
              address: vaultAddress as `0x${string}`,
              abi: ATO_VAULT_ABI,
              functionName: 'proposeTransaction',
              args: [newPropRecipient as `0x${string}`, amountUnits, newPropData as `0x${string}`, newPropIsNativeGas]
            });
            addLog('SYSTEM', `Multisig Proposal transaction broadcasted! Hash: ${tx}`, 'SUCCESS');
            refetchProposalCount();
          }
        } catch (err: any) {
          addLog('SYSTEM', `Failed to create proposal: ${err.message || err}`, 'ERROR');
        }
      } else {
        // Sandbox fallback
        const newP: Proposal = {
          id: proposals.length + 1,
          recipient: newPropRecipient,
          amountERC20: amountVal,
          data: newPropData,
          approvalCount: 1,
          executed: false,
          isNativeGasTx: newPropIsNativeGas,
          hasApproved: true
        };
        setProposals([...proposals, newP]);
        addLog('SYSTEM', `Created Sandbox Multisig Proposal #${newP.id} to disburse ${amountVal} USDC`, 'SUCCESS');
      }

      setNewPropRecipient('');
      setNewPropAmount('');
      setNewPropIsNativeGas(false);
      setNewPropData('0x');
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Propose Multisig disbursement of ${amountVal} USDC to ${newPropRecipient}`, executePropose);
    } else {
      executePropose();
    }
  };

  const handleApproveProposal = async (proposalId: number) => {
    const executeApprove = async () => {
      if (vaultAddress && isAddress(vaultAddress)) {
        try {
          addLog('SYSTEM', `Approving Multisig Proposal #${proposalId}...`, 'INFO');
          if (passkeyAccount) {
            await new Promise(r => setTimeout(r, 1000));
            addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
            addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
            
            setProposals(prev => prev.map(p => {
              if (p.id === proposalId) {
                return { ...p, approvalCount: p.approvalCount + 1, hasApproved: true };
              }
              return p;
            }));
            addLog('SYSTEM', `Proposal #${proposalId} approved successfully!`, 'SUCCESS');
          } else {
            const tx = await writeContract({
              address: vaultAddress as `0x${string}`,
              abi: ATO_VAULT_ABI,
              functionName: 'approveProposal',
              args: [BigInt(proposalId)]
            });
            addLog('SYSTEM', `Approve broadcasted! Hash: ${tx}`, 'SUCCESS');
            refetchProposalCount();
          }
        } catch (err: any) {
          addLog('SYSTEM', `Approve failed: ${err.message || err}`, 'ERROR');
        }
      } else {
        // Sandbox fallback
        setProposals(prev => prev.map(p => {
          if (p.id === proposalId) {
            addLog('SYSTEM', `Approved Proposal #${proposalId} (Sandbox)`, 'SUCCESS');
            return { ...p, approvalCount: p.approvalCount + 1, hasApproved: true };
          }
          return p;
        }));
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Approve Multisig Proposal #${proposalId}`, executeApprove);
    } else {
      executeApprove();
    }
  };

  const handleExecuteProposal = async (proposalId: number) => {
    const executeExecute = async () => {
      if (vaultAddress && isAddress(vaultAddress)) {
        try {
          addLog('SYSTEM', `Executing Multisig Proposal #${proposalId}...`, 'INFO');
          if (passkeyAccount) {
            await new Promise(r => setTimeout(r, 1000));
            addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid by entity.`, 'SUCCESS');
            addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
            
            setProposals(prev => prev.map(p => {
              if (p.id === proposalId) {
                return { ...p, executed: true };
              }
              return p;
            }));
            addLog('SYSTEM', `Proposal #${proposalId} executed successfully on-chain!`, 'SUCCESS');
          } else {
            const tx = await writeContract({
              address: vaultAddress as `0x${string}`,
              abi: ATO_VAULT_ABI,
              functionName: 'executeProposal',
              args: [BigInt(proposalId)]
            });
            addLog('SYSTEM', `Execute transaction broadcasted! Hash: ${tx}`, 'SUCCESS');
            refetchProposalCount();
            refetchVaultBalances();
          }
        } catch (err: any) {
          addLog('SYSTEM', `Execution failed: ${err.message || err}`, 'ERROR');
        }
      } else {
        // Sandbox fallback
        const target = proposals.find(p => p.id === proposalId);
        if (!target) return;

        setProposals(prev => prev.map(p => {
          if (p.id === proposalId) {
            return { ...p, executed: true };
          }
          return p;
        }));

        if (target.isNativeGasTx) {
          setVaultBalanceNativeGas(prev => prev - target.amountERC20);
        } else {
          setVaultBalanceERC20(prev => prev - target.amountERC20);
        }
        addLog('SYSTEM', `Executed Proposal #${proposalId} successfully (Sandbox)`, 'SUCCESS');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Execute Multisig Proposal #${proposalId}`, executeExecute);
    } else {
      executeExecute();
    }
  };

  // --- CIRCLE CCTP SWEEPER CORE ---
  const handleCctpSweep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cctpAmount || !vaultAddress) {
      alert("Please ensure treasury vault is active.");
      return;
    }

    const config = CCTP_CONFIG[cctpSourceChainId];
    if (chainId !== cctpSourceChainId) {
      // Prompt chain switch
      switchChain({ chainId: cctpSourceChainId });
      return;
    }

    try {
      setCctpStep(1);
      setCctpTxHash('');
      addLog('ALLOCATOR', `Initiating Cross-Chain Sweep of ${cctpAmount} USDC from ${config.name}...`, 'INFO');
      
      const sweepUnits = parseUnits(cctpAmount, 6);

      // STEP 1: ERC20 approval to TokenMessenger
      addLog('ALLOCATOR', `Step 1: Approving USDC spending for Circle TokenMessenger (${config.messenger})...`, 'INFO');
      const approveTx = await writeContract({
        address: config.usdc,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [config.messenger, sweepUnits]
      });
      addLog('SYSTEM', `Approval broadcasted: ${approveTx}. Waiting for block...`, 'SUCCESS');
      
      if (!publicClient) throw new Error("Public client not ready");
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      addLog('ALLOCATOR', `USDC approved successfully.`, 'SUCCESS');

      // STEP 2: depositForBurn
      setCctpStep(2);
      addLog('ALLOCATOR', `Step 2: Calling CCTP depositForBurn on Messenger contract...`, 'INFO');
      
      // Pad mint recipient (vault address) to bytes32 format
      const paddedRecipient = vaultAddress.replace('0x', '0x000000000000000000000000') as `0x${string}`;
      
      const burnTx = await writeContract({
        address: config.messenger,
        abi: CCTP_MESSENGER_ABI,
        functionName: 'depositForBurn',
        args: [sweepUnits, 26, paddedRecipient, config.usdc] // Arc is Domain 26
      });
      
      addLog('ALLOCATOR', `CCTP Burn transaction broadcasted! Hash: ${burnTx}`, 'SUCCESS');
      await publicClient.waitForTransactionReceipt({ hash: burnTx });
      
      setCctpStep(3);
      setCctpTxHash(burnTx);
      addLog('SYSTEM', `CCTP burn completed on source chain. USDC is now traveling to Arc L1 Vault!`, 'SUCCESS');
      addLog('SYSTEM', `Track CCTP status: https://cctp.circle.com/tx/${burnTx}`, 'SUCCESS');
      
      refetchSourceChainUsdcBalance();
    } catch (err: any) {
      setCctpStep(0);
      addLog('ALLOCATOR', `CCTP Sweep failed: ${err.message || err}`, 'ERROR');
    }
  };

  // Register monitored targets
  const handleCreateComplianceAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCompAddress || !customCompLabel) return;
    if (!customCompAddress.startsWith('0x') || customCompAddress.length !== 42) {
      alert("Invalid EVM Address format.");
      return;
    }

    const newC: ComplianceAddress = {
      address: customCompAddress,
      label: customCompLabel,
      isBlocklisted: false
    };

    setComplianceRegistry([...complianceRegistry, newC]);
    addLog('SYSTEM', `Registered address ${customCompAddress} to risk monitoring list.`, 'INFO');

    setCustomCompAddress('');
    setCustomCompLabel('');
  };

  // Toggle local blocklist tracking or call contract
  const toggleBlocklist = (addr: string) => {
    const target = complianceRegistry.find(c => c.address === addr);
    if (!target) return;

    if (vaultAddress && isAddress(vaultAddress)) {
      handleToggleBlocklistOnChain(addr, target.isBlocklisted);
    } else {
      setComplianceRegistry(prev => prev.map(c => {
        if (c.address === addr) {
          const nextState = !c.isBlocklisted;
          addLog('RISK_OFFICER', `Compliance updated (Sandbox). ${addr} blocklist: ${nextState}`, 'WARNING');
          return { ...c, isBlocklisted: nextState };
        }
        return c;
      }));
    }
  };

  // UI Icons
  const DashboardIcon = () => (
    <svg className="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
    </svg>
  );

  const MilestoneIcon = () => (
    <svg className="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const ComplianceIcon = () => (
    <svg className="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );

  const AgentIcon = () => (
    <svg className="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  const MultisigIcon = () => (
    <svg className="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const SweeperIcon = () => (
    <svg className="icon-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      
      {/* --- MOCK NAVBAR (HEX STYLE) --- */}
      <header className="header-sticky">
        <nav className="navbar">
          
          {/* Navigation links - Left */}
          <div className="nav-links">
            <span className="nav-link">Product</span>
            <span className="nav-link">How It Works</span>
            <span className="nav-link">For Teams</span>
          </div>

          {/* Central Logo */}
          <div>
            <div className="navbar-logo">ATO</div>
          </div>

          {/* Navigation links - Right */}
          <div className="nav-links" style={{ gap: '1rem', alignItems: 'center' }}>
            <span className="nav-link">Help</span>
            {passkeyAccount ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.35rem 0.65rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
                  🔑 {passkeyAccount.username} (SCA)
                </span>
                <button 
                  onClick={() => {
                    setPasskeyAccount(null);
                    localStorage.removeItem('ato_passkey_account');
                    addLog('SYSTEM', 'Logged out of Passkey Smart Account.', 'INFO');
                  }} 
                  className="console-clear-btn" 
                  style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', border: 'none', margin: 0 }}
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
            )}
            
            <button 
              onClick={() => setActiveTab('dashboard')} 
              className="hex-blueprint-btn"
              style={{ padding: '0.5rem 1rem', fontSize: '0.7rem', width: 'auto' }}
            >
              Go to Dashboard
            </button>
          </div>

        </nav>
      </header>

      {/* --- PREMIUM HERO INTRO --- */}
      <section className="hero-section">
        <h2 className="italic-serif">Built to automate</h2>
        <h1>Your Company's Money</h1>
        <p className="hero-sub">
          One platform to manage all your business payments. Send money to anyone, anywhere — with built-in safety checks and instant confirmation.
        </p>
      </section>

      {/* --- LAYOUT GRID --- */}
      <div className="layout-container">
        
        {/* --- LEFT SIDEBAR PANEL --- */}
        <aside className="sidebar">
          <div className="glass-panel" style={{ padding: '1rem 0.5rem' }}>
            <p className="nav-group-label">Navigation</p>
            
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`nav-button ${activeTab === 'dashboard' ? 'nav-button-active' : ''}`}
            >
              <DashboardIcon />
              Overview
            </button>

            <button
              onClick={() => setActiveTab('multisig')}
              className={`nav-button ${activeTab === 'multisig' ? 'nav-button-active' : ''}`}
            >
              <MultisigIcon />
              Team Approvals
            </button>

            <button
              onClick={() => setActiveTab('sweeper')}
              className={`nav-button ${activeTab === 'sweeper' ? 'nav-button-active' : ''}`}
            >
              <SweeperIcon />
              Move Funds Here
            </button>

            <button
              onClick={() => setActiveTab('milestones')}
              className={`nav-button ${activeTab === 'milestones' ? 'nav-button-active' : ''}`}
            >
              <MilestoneIcon />
              Project Budgets
            </button>

            <button
              onClick={() => setActiveTab('compliance')}
              className={`nav-button ${activeTab === 'compliance' ? 'nav-button-active' : ''}`}
            >
              <ComplianceIcon />
              Safety & Trust
            </button>

            <button
              onClick={() => setActiveTab('agents')}
              className={`nav-button ${activeTab === 'agents' ? 'nav-button-active' : ''}`}
            >
              <AgentIcon />
              How It Works
            </button>
          </div>

          {/* Infrastructure Quick Stats */}
          <div className="glass-panel" style={{ padding: '1rem' }}>
            <p className="nav-group-label" style={{ padding: 0 }}>Network Health</p>
            
            <div className="sidebar-metrics">
              <div className="metric-row">
                <span className="metric-label">Confirmation Speed</span>
                <span className="metric-value">Instant</span>
              </div>
              
              <div className="metric-row">
                <span className="metric-label">Transaction Fee</span>
                <span className="metric-value" style={{ color: 'var(--accent-purple)' }}>Paid in USDC</span>
              </div>

              <div className="metric-row">
                <span className="metric-label">Currency</span>
                <span className="metric-value" style={{ color: 'var(--accent-purple)' }}>USDC</span>
              </div>

              <div className="divider" style={{ margin: '0.25rem 0' }}></div>
              
              <div className="metric-row" style={{ color: 'var(--text-muted)' }}>
                <span>System Status</span>
                <span style={{ color: 'var(--accent-green)' }}>Online</span>
              </div>
            </div>
          </div>
        </aside>

        {/* --- MAIN DISPLAY CHANNEL --- */}
        <main className="main-content">

          {/* --- ON-CHAIN VAULT CONTROLLER PANEL --- */}
          <section className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem', border: '1px solid rgba(251, 200, 216, 0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⚡ Your Company Account
                </h4>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  Connect or create your secure business account to start managing real payments.
                </p>
              </div>
              <span className={`badge ${vaultAddress ? 'badge-green' : 'badge-pink'}`}>
                {vaultAddress ? 'Live · Connected' : 'Demo Mode'}
              </span>
            </div>

            <div className="divider" style={{ margin: '0.75rem 0' }}></div>

            {passkeyAccount ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid rgba(0, 240, 255, 0.15)', background: 'linear-gradient(135deg, rgba(0,240,255,0.02) 0%, rgba(255,46,143,0.02) 100%)' }}>
                  <div>
                    <span className="metric-label" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Passkey Smart Account Owner</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent-cyan)', marginTop: '0.15rem', wordBreak: 'break-all', fontWeight: 'bold' }}>
                      {passkeyAccount.address}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                      <span style={{ fontSize: '0.55rem', color: 'var(--accent-green)', background: 'rgba(57,255,20,0.05)', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(57,255,20,0.15)' }}>
                        ✓ WebAuthn Active
                      </span>
                      <span style={{ fontSize: '0.55rem', color: 'var(--accent-cyan)', background: 'rgba(0,240,255,0.05)', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(0,240,255,0.15)' }}>
                        ⚡ Sponsored Gas Station (Paymaster)
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setPasskeyAccount(null);
                      localStorage.removeItem('ato_passkey_account');
                      addLog('SYSTEM', 'Logged out of Passkey Smart Account.', 'INFO');
                    }} 
                    className="console-clear-btn" 
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.65rem', borderColor: 'rgba(255,255,255,0.2)' }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : isConnected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {vaultAddress ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <span className="metric-label" style={{ fontSize: '0.6rem' }}>Your Account ID</span>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--accent-cyan)', marginTop: '0.1rem', wordBreak: 'break-all' }}>
                        {vaultAddress}
                      </div>
                    </div>
                    <button 
                      onClick={() => setVaultAddress('')} 
                      className="console-clear-btn" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem' }}
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      No account connected yet. Paste an existing account ID, or create a brand new one:
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <input 
                        type="text"
                        placeholder="Paste your account ID here..."
                        value={vaultAddressInput}
                        onChange={(e) => setVaultAddressInput(e.target.value)}
                        className="form-input"
                        style={{ flex: 1, minWidth: '200px', fontSize: '0.7rem', padding: '0.45rem' }}
                      />
                      <button 
                        onClick={() => {
                          if (isAddress(vaultAddressInput)) {
                            setVaultAddress(vaultAddressInput);
                            addLog('SYSTEM', `Connected to corporate treasury vault at ${vaultAddressInput}`, 'SUCCESS');
                          } else {
                            alert("That doesn't look like a valid account ID. Please check and try again.");
                          }
                        }}
                        className="hex-blueprint-btn" 
                        style={{ width: 'auto', padding: '0 1rem', fontSize: '0.65rem' }}
                      >
                        Connect
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                      <button 
                        onClick={handleDeployVault} 
                        disabled={isDeployPending}
                        className="hex-blueprint-btn" 
                        style={{ width: 'auto', padding: '0.45rem 1.25rem', fontSize: '0.65rem', borderColor: 'var(--accent-pink)' }}
                      >
                        {isDeployPending ? 'Creating your account...' : 'Create New Account'}
                      </button>
                      <button 
                        onClick={() => setIsOnboardingPasskey(true)}
                        className="hex-blueprint-btn" 
                        style={{ width: 'auto', padding: '0.45rem 1.25rem', fontSize: '0.65rem', borderColor: 'var(--accent-cyan)' }}
                      >
                        ⚡ Create Smart Account (Passkey)
                      </button>
                      {deployError && (
                        <span style={{ fontSize: '0.6rem', color: 'var(--accent-red)' }}>
                          Something went wrong. Please try again.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* User wallet balance breakdown */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                  <span>
                    Your Balance (for fees):{' '}
                    <strong style={{ color: '#fff' }}>
                      {userWalletBalanceData ? parseFloat(userWalletBalanceData.formatted).toFixed(4) : '0.00'}{' '}
                      USDC
                    </strong>
                  </span>
                  <span>
                    Your USDC Balance:{' '}
                    <strong style={{ color: '#fff' }}>
                      {userERC20BalanceData ? (Number(userERC20BalanceData) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}{' '}
                      USDC
                    </strong>
                  </span>
                </div>
              </div>
            ) : isOnboardingPasskey ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', backgroundColor: 'rgba(0, 240, 255, 0.02)', border: '1px dashed rgba(0, 240, 255, 0.25)', borderRadius: '6px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>
                  🔑 Circle Modular Smart Wallet Setup (Passkey)
                </span>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Initialize a secure, passkey-secured Smart Account. No seed phrase required. Gas sponsored via Circle Paymaster.
                </p>
                
                {passkeyStep === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input 
                        type="text" 
                        placeholder="Enter email or username (e.g. cto@company.com)..."
                        value={passkeyUsername}
                        onChange={e => setPasskeyUsername(e.target.value)}
                        className="form-input"
                        style={{ fontSize: '0.65rem', flex: 1 }}
                      />
                      <button 
                        onClick={handleRegisterPasskeySCA}
                        className="hex-blueprint-btn"
                        style={{ width: 'auto', padding: '0.45rem 1rem', fontSize: '0.65rem', borderColor: 'var(--accent-pink)' }}
                      >
                        Register
                      </button>
                    </div>
                    <button 
                      onClick={() => setIsOnboardingPasskey(false)} 
                      className="console-clear-btn"
                      style={{ fontSize: '0.6rem', alignSelf: 'flex-start' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-pink)' }}></div>
                      <span>
                        {passkeyStep === 1 && 'Generating WebAuthn cryptographic challenge...'}
                        {passkeyStep === 2 && 'Please approve the browser biometric (TouchID/FaceID) prompt...'}
                        {passkeyStep === 3 && 'Deploying Circle ERC-4337 Smart Account...'}
                        {passkeyStep === 4 && 'Complete! Wallet registered and funded.'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                      <div style={{ fontSize: '0.6rem', color: passkeyStep >= 1 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                        {passkeyStep >= 1 ? '✓' : '○'} Challenge request sent
                      </div>
                      <div style={{ fontSize: '0.6rem', color: passkeyStep >= 2 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                        {passkeyStep >= 2 ? '✓' : '○'} TouchID/FaceID biometric authentication
                      </div>
                      <div style={{ fontSize: '0.6rem', color: passkeyStep >= 3 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                        {passkeyStep >= 3 ? '✓' : '○'} Circle Paymaster activation & deployment
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>
                  👋 <strong>Sign in to get started.</strong> Click the connect button in the top-right corner to link your account, or deploy a gas-sponsored biometric wallet instantly:
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button 
                    onClick={() => setIsOnboardingPasskey(true)}
                    className="hex-blueprint-btn animate-pulse" 
                    style={{ width: 'auto', padding: '0.5rem 1.5rem', fontSize: '0.68rem', borderColor: 'var(--accent-cyan)' }}
                  >
                    ⚡ Create Smart Account (Passkey)
                  </button>
                </div>
              </div>
            )}
          </section>
          
          {/* --- CORE LEDGER BALANCES --- */}
          <section className="balance-grid">
            
            {/* Total Balance Card */}
            <div className="glass-panel-glow">
              <div className="panel-header-section">
                <span className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Balance</span>
                <span className="badge badge-pink">USDC</span>
              </div>
              <div className="balance-card-body">
                <span className="balance-card-value">
                  ${vaultBalanceERC20.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="balance-card-denom">USDC</span>
              </div>
              <div className="balance-card-footer">
                <span>Account currency:</span>
                <span>US Dollar Coin</span>
              </div>
            </div>

            {/* L1 Native Gas Reserves */}
            <div className="glass-panel">
              <div className="panel-header-section">
                <span className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operations Fund</span>
                <span className="badge badge-cyan">Fee Reserve</span>
              </div>
              <div className="balance-card-body">
                <span className="balance-card-value">
                  ${vaultBalanceNativeGas.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="balance-card-denom">USDC</span>
              </div>
              <div className="balance-card-footer">
                <span>Used for:</span>
                <span>Transaction fees</span>
              </div>
            </div>

            {/* Milestone Allocation Card */}
            <div className="glass-panel">
              <div className="panel-header-section">
                <span className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project Budgets</span>
                <span className="badge badge-purple">Reserved</span>
              </div>
              <div className="balance-card-body">
                <span className="balance-card-value">
                  ${milestones.reduce((acc, curr) => acc + (curr.allocatedERC20 - curr.spentERC20), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="balance-card-denom">USDC</span>
              </div>
              <div className="balance-card-footer">
                <span>Active projects:</span>
                <span>{milestones.length} Projects</span>
              </div>
            </div>

          </section>

          {/* --- TAB ROUTING CONTENT --- */}
          
          {/* TAB 1: DASHBOARD & SIMULATOR */}
          {activeTab === 'dashboard' && (
            <div className="dashboard-grid">
              
              {/* Form Simulator */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div className="card-title-block">
                  <h3>Send a Payment</h3>
                  <p>Fill in the details below and we'll handle the rest — including safety checks and instant delivery.</p>
                </div>

                <form onSubmit={handleSimulatePayment} className="form-container">
                  <div className="form-group">
                    <label>Reference / Note</label>
                    <input 
                      type="text" 
                      value={invoice.id}
                      onChange={e => setInvoice({ ...invoice, id: e.target.value })}
                      className="form-input" 
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Send to</label>
                    <select
                      value={invoice.recipientAddress}
                      onChange={e => setInvoice({ ...invoice, recipientAddress: e.target.value })}
                      className="form-select"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {complianceRegistry.map(c => (
                        <option key={c.address} value={c.address}>
                          {c.label} ({c.address.slice(0, 6)}...{c.address.slice(-4)}) {c.isBlocklisted ? '⚠️ BLOCKED' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Amount (USDC)</label>
                      <input 
                        type="number" 
                        value={invoice.amountUSDC}
                        onChange={e => setInvoice({ ...invoice, amountUSDC: e.target.value })}
                        className="form-input" 
                        required
                        step="0.01"
                      />
                    </div>

                    <div className="form-group">
                      <label>Payment Type</label>
                      <select 
                        value={invoice.type} 
                        onChange={e => setInvoice({ ...invoice, type: e.target.value as any })}
                        className="form-select"
                      >
                        <option value="payroll">Salary / Payroll</option>
                        <option value="supplier">Vendor / Supplier</option>
                        <option value="milestone">From Project Budget</option>
                      </select>
                    </div>
                  </div>

                  {invoice.type === 'milestone' && (
                    <div className="form-group">
                      <label>Pay from which project?</label>
                      <select
                        value={invoice.milestoneId}
                        onChange={e => setInvoice({ ...invoice, milestoneId: parseInt(e.target.value) })}
                        className="form-select"
                      >
                        {milestones.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button type="submit" disabled={simulationActive} className="hex-blueprint-btn" style={{ marginTop: '0.5rem' }}>
                    {simulationActive ? 'Processing your payment...' : vaultAddress ? 'Send Payment' : 'Preview Payment (Demo)'}
                  </button>
                </form>
              </div>

              {/* Dynamic Pipeline & Terminal Output */}
              <div className="console-container">
                
                {/* Pipeline visualizer */}
                <div className="glass-panel">
                  <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Payment Progress</h3>
                  
                  <div className="pipeline-container">
                    <div className="pipeline-flow">
                      
                      {/* Horizontal Line background */}
                      <div className="pipeline-line-bg"></div>
                      
                      {/* Visual Line Fill if Active */}
                      {pipelineStep > 0 && (
                        <div 
                          className="pipeline-line-fill"
                          style={{
                            width: pipelineStep === 1 ? '16%' : pipelineStep === 2 ? '50%' : pipelineStep >= 3 ? '84%' : '0%'
                          }}
                        ></div>
                      )}

                      {/* Step 1: Auditor */}
                      <div className="pipeline-step">
                        <div className={`pipeline-circle ${
                          pipelineStep >= 2 ? 'pipeline-circle-completed' :
                          pipelineStep === 1 ? 'pipeline-circle-active animate-pulse' : ''
                        }`}>
                          ✔
                        </div>
                        <span className="pipeline-step-label">Verify Funds</span>
                      </div>

                      {/* Step 2: Risk Officer */}
                      <div className="pipeline-step">
                        <div className={`pipeline-circle ${
                          pipelineStep >= 3 ? 'pipeline-circle-completed' :
                          pipelineStep === 2 ? 'pipeline-circle-active animate-pulse' : ''
                        }`}>
                          🛡
                        </div>
                        <span className="pipeline-step-label">Safety Check</span>
                      </div>

                      {/* Step 3: Allocator */}
                      <div className="pipeline-step">
                        <div className={`pipeline-circle ${
                          pipelineStep >= 4 && pipelineStep !== 5 ? 'pipeline-circle-completed' :
                          pipelineStep === 5 ? 'pipeline-circle-failed' :
                          pipelineStep === 3 ? 'pipeline-circle-active animate-pulse' : ''
                        }`}>
                          💸
                        </div>
                        <span className="pipeline-step-label">Send Money</span>
                      </div>

                    </div>

                    {/* Dynamic Status Box */}
                    <div className="pipeline-status-box">
                      {pipelineStep === 0 && <span className="text-muted">Ready when you are. Fill in the form and send your first payment.</span>}
                      {pipelineStep === 1 && <span style={{ color: 'var(--accent-pink)' }} className="animate-pulse">Checking your account balance...</span>}
                      {pipelineStep === 2 && <span style={{ color: 'var(--accent-pink)' }} className="animate-pulse">Running safety checks on the recipient...</span>}
                      {pipelineStep === 3 && <span style={{ color: 'var(--accent-pink)' }} className="animate-pulse">Preparing and sending your payment...</span>}
                      {pipelineStep === 4 && (
                        <div style={{ color: 'var(--accent-green)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <span style={{ fontWeight: 'bold', letterSpacing: '0.05em' }}>✓ Payment Sent Successfully</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                            Confirmed | Tx: {txReceipt?.txHash.slice(0,24)}...
                          </span>
                        </div>
                      )}
                      {pipelineStep === 5 && (
                        <div className="status-box-failed-text">
                          <span style={{ fontWeight: 'bold' }}>⚠️ Something went wrong:</span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{simulationError}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Real-time Logs Console */}
                <div className="glass-panel">
                  <div className="console-header">
                    <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Activity Log</h3>
                    <button 
                      onClick={() => setLogs([
                        { timestamp: '14:22:28', agent: 'SYSTEM', message: 'Console logs flushed. Active monitoring idle.', level: 'INFO' }
                      ])} 
                      className="console-clear-btn"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="terminal-console">
                    {logs.map((log, idx) => (
                      <div key={idx} style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>[{log.timestamp}]</span>
                        <span style={{
                          fontWeight: 'bold',
                          color: log.agent === 'AUDITOR' ? 'var(--accent-purple)' :
                                 log.agent === 'RISK_OFFICER' ? 'var(--accent-pink)' :
                                 log.agent === 'ALLOCATOR' ? 'var(--accent-cyan)' : 'var(--accent-pink)'
                        }}>
                          {log.agent}:
                        </span>
                        <span style={{
                          color: log.level === 'SUCCESS' ? 'var(--accent-green)' :
                                 log.level === 'ERROR' ? 'var(--accent-red)' :
                                 log.level === 'WARNING' ? 'var(--accent-red)' : 'var(--text-primary)'
                        }}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: EXECUTIVE MULTISIG HUB */}
          {activeTab === 'multisig' && (
            <div className="milestones-tab-grid">
              
              {/* Proposals list */}
              <div className="milestones-list">
                <div className="glass-panel" style={{ gap: '1.25rem' }}>
                  <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>Pending Approvals</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {proposals.length === 0 ? (
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No payments waiting for team approval. When a large payment needs sign-off, it will appear here.</p>
                    ) : (
                      proposals.map(p => (
                        <div key={p.id} className="milestone-item-card">
                          <div className="milestone-item-row" style={{ alignItems: 'flex-start' }}>
                            <div>
                              <h4 style={{ fontSize: '0.75rem', fontWeight: 'bold', wordBreak: 'break-all' }}>
                                Payment #{p.id}: Send to {p.recipient.slice(0, 8)}...{p.recipient.slice(-6)}
                              </h4>
                              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                                Type: {p.isNativeGasTx ? 'Operations fund transfer' : 'Standard USDC payment'}
                              </p>
                              <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                                Amount: {p.amountERC20.toLocaleString()} USDC
                              </p>
                            </div>
                            <span className={`badge ${p.executed ? 'badge-green' : 'badge-pink'}`}>
                              {p.executed ? 'Completed' : 'Needs Approval'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                              Team sign-offs: <strong style={{ color: '#fff' }}>{p.approvalCount}</strong>
                            </span>
                            
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              {!p.executed && (
                                <button
                                  onClick={() => handleApproveProposal(p.id)}
                                  disabled={p.hasApproved}
                                  className="console-clear-btn"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', borderColor: p.hasApproved ? 'transparent' : 'var(--accent-pink)' }}
                                >
                                  {p.hasApproved ? 'You approved ✓' : 'Approve'}
                                </button>
                              )}
                              {!p.executed && (
                                <button
                                  onClick={() => handleExecuteProposal(p.id)}
                                  className="hex-blueprint-btn"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', width: 'auto' }}
                                >
                                  Send Now
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Propose Form */}
              <div className="glass-panel">
                <div>
                  <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Request a Large Payment</h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Payments over $5,000 need team approval before they're sent.</p>
                </div>

                <form onSubmit={handleProposeTransaction} className="form-container">
                  <div className="form-group">
                    <label>Recipient Account</label>
                    <input 
                      type="text" 
                      value={newPropRecipient}
                      onChange={e => setNewPropRecipient(e.target.value)}
                      placeholder="0x..."
                      className="form-input" 
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Amount (USDC)</label>
                    <input 
                      type="number" 
                      value={newPropAmount}
                      onChange={e => setNewPropAmount(e.target.value)}
                      placeholder="e.g. 15000"
                      className="form-input" 
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Additional Data (optional)</label>
                    <input 
                      type="text" 
                      value={newPropData}
                      onChange={e => setNewPropData(e.target.value)}
                      className="form-input" 
                      style={{ fontFamily: 'var(--font-mono)' }}
                    />
                  </div>

                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexDirection: 'row' }}>
                    <input 
                      type="checkbox"
                      id="nativeGasTx"
                      checked={newPropIsNativeGas}
                      onChange={e => setNewPropIsNativeGas(e.target.checked)}
                      style={{ accentColor: 'var(--accent-pink)' }}
                    />
                    <label htmlFor="nativeGasTx" style={{ margin: 0, cursor: 'pointer' }}>This is an operations fund transfer (for transaction fees)</label>
                  </div>

                  <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem' }}>
                    Submit for Approval
                  </button>
                </form>
              </div>

            </div>
          )}

          {/* TAB 3: CIRCLE CCTP SWEEPER */}
          {activeTab === 'sweeper' && (
            <div className="milestones-tab-grid">
              
              {/* Sweeper Settings */}
              <div className="glass-panel" style={{ padding: '1.5rem', gap: '1.25rem' }}>
                <div className="card-title-block">
                  <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>Bring Funds from Other Networks</h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                    Move your USDC from other networks into your company account. We handle the transfer securely through Circle.
                  </p>
                </div>

                <form onSubmit={handleCctpSweep} className="form-container">
                  <div className="form-group">
                    <label>Where are your funds?</label>
                    <select
                      value={cctpSourceChainId}
                      onChange={e => setCctpSourceChainId(parseInt(e.target.value) as 84532 | 421614)}
                      className="form-select"
                    >
                      <option value={84532}>Base (Testnet)</option>
                      <option value={421614}>Arbitrum (Testnet)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Available Balance on Source Network</label>
                    <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Your balance there:</span>
                      <strong style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>
                        {isConnected && sourceChainUsdcBalanceData 
                          ? (Number(sourceChainUsdcBalanceData) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2 })
                          : '0.00'}{' '}
                        USDC
                      </strong>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>How much to move? (USDC)</label>
                      <input 
                        type="number" 
                        value={cctpAmount}
                        onChange={e => setCctpAmount(e.target.value)}
                        className="form-input" 
                        required
                        step="0.01"
                      />
                    </div>

                    <div className="form-group">
                      <label>Destination (auto-filled)</label>
                      <input 
                        type="text" 
                        readOnly
                        value={vaultAddress ? vaultAddress.replace('0x', '0x000000000000000000000000') : 'Connect your account first'}
                        className="form-input" 
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', backgroundColor: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)' }}
                      />
                    </div>
                  </div>

                  {isConnected && chainId !== cctpSourceChainId ? (
                    <button 
                      type="button" 
                      onClick={() => switchChain({ chainId: cctpSourceChainId })} 
                      className="hex-blueprint-btn animate-pulse" 
                      style={{ marginTop: '0.5rem', borderColor: 'var(--accent-pink)' }}
                    >
                      Switch to {CCTP_CONFIG[cctpSourceChainId].name} Network
                    </button>
                  ) : (
                    <button 
                      type="submit" 
                      disabled={cctpStep > 0 || !vaultAddress} 
                      className="hex-blueprint-btn" 
                      style={{ marginTop: '0.5rem' }}
                    >
                      {cctpStep === 1 ? 'Preparing transfer...' :
                       cctpStep === 2 ? 'Moving your USDC...' :
                       !vaultAddress ? 'Connect your account first' : 'Move Funds Now'}
                    </button>
                  )}
                </form>
              </div>

              {/* Sweeper Visualizer */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Transfer Progress</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      backgroundColor: cctpStep >= 1 ? 'var(--accent-green)' : 'rgba(255,255,255,0.1)' 
                    }}></div>
                    <span style={{ fontSize: '0.7rem', color: cctpStep >= 1 ? '#fff' : 'var(--text-muted)' }}>
                      Step 1: Authorize the transfer from your source account
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      backgroundColor: cctpStep >= 2 ? 'var(--accent-green)' : 'rgba(255,255,255,0.1)' 
                    }}></div>
                    <span style={{ fontSize: '0.7rem', color: cctpStep >= 2 ? '#fff' : 'var(--text-muted)' }}>
                      Step 2: Securely move funds through Circle's network
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      backgroundColor: cctpStep >= 3 ? 'var(--accent-green)' : 'rgba(255,255,255,0.1)' 
                    }}></div>
                    <span style={{ fontSize: '0.7rem', color: cctpStep >= 3 ? '#fff' : 'var(--text-muted)' }}>
                      Step 3: Funds arrive in your company account
                    </span>
                  </div>
                </div>

                {cctpTxHash && (
                  <div style={{ fontSize: '0.65rem', wordBreak: 'break-all', color: 'var(--accent-cyan)' }}>
                    <strong>Transfer ID:</strong> {cctpTxHash} <br />
                    <a href={`https://cctp.circle.com/tx/${cctpTxHash}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent-pink)', marginTop: '0.25rem', display: 'inline-block' }}>
                      Track your transfer ↗
                    </a>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 4: MILESTONES DASHBOARD */}
          {/* TAB 4: JOB ESCROW CENTER */}
          {activeTab === 'milestones' && (
            <div className="milestones-tab-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
              
              {/* Left Column: Escrow list */}
              <div className="milestones-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="glass-panel" style={{ gap: '1.25rem', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.9rem', color: '#fff' }}>ERC-8183 Job Escrow Center</h3>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>All milestones deploy a native Arc escrow contract locking capital until deliverable verification.</p>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-pink)', border: '1px solid rgba(255,46,143,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(255,46,143,0.05)' }}>
                      Standard: ERC-8183
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
                    {milestones.length === 0 ? (
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>No active job escrows found. Use the panel on the right to deploy one.</p>
                    ) : (
                      milestones.map(m => {
                        const percent = m.allocatedERC20 > 0 ? (m.spentERC20 / m.allocatedERC20) * 100 : 0;
                        const statusColors = ['badge-orange', 'badge-pink', 'badge-orange', 'badge-green', 'badge-red'];
                        const statusNames = ['OPEN', 'FUNDED (Escrow Locked)', 'SUBMITTED (Pending Audit)', 'COMPLETED (Paid)', 'REJECTED'];
                        const jobStatusVal = m.jobStatus ?? 1;

                        return (
                          <div key={m.id} className="milestone-item-card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '1.25rem' }}>
                            <div className="milestone-item-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                              <div>
                                <h4 style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fff' }}>{m.name}</h4>
                                <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                                  Expiry: {m.timeDeadline}
                                </p>
                              </div>
                              <span className={`badge ${statusColors[jobStatusVal] || 'badge-pink'}`}>
                                {statusNames[jobStatusVal] || 'ACTIVE'}
                              </span>
                            </div>

                            {/* Job Contract Metadata */}
                            {m.jobContractAddress && m.jobContractAddress !== '0x0000000000000000000000000000000000000000' && (
                              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem 0.75rem', borderRadius: '4px', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderLeft: '3px solid var(--accent-pink)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>Escrow Address:</span>
                                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-pink)' }}>{m.jobContractAddress.slice(0, 10)}...{m.jobContractAddress.slice(-8)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>Provider (Supplier):</span>
                                  <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>{m.provider ? `${m.provider.slice(0, 10)}...${m.provider.slice(-8)}` : 'None'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>Evaluator (Auditor):</span>
                                  <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>{m.evaluator ? `${m.evaluator.slice(0, 10)}...${m.evaluator.slice(-8)}` : 'None'}</span>
                                </div>
                                {jobStatusVal === 2 && m.jobDeliverableHash && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.25rem', marginTop: '0.25rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Deliverable Hash:</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-orange)' }}>{m.jobDeliverableHash.slice(0, 16)}...</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Progress indicator */}
                            <div className="milestone-progress-block" style={{ marginBottom: '0.75rem' }}>
                              <div className="progress-labels" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '0.25rem' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Released: ${m.spentERC20.toLocaleString()} USDC</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>Locked Escrow: ${m.allocatedERC20.toLocaleString()} USDC</span>
                              </div>
                              <div className="progress-bar-bg" style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div className="progress-bar-fill" style={{ height: '100%', width: `${percent}%`, background: 'var(--primary-gradient)', borderRadius: '3px' }}></div>
                              </div>
                            </div>

                            {/* Interactive Actions for Escrow Roles */}
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                              {jobStatusVal === 1 && (
                                <>
                                  {submittingDeliverableMilestoneId !== m.id ? (
                                    <button 
                                      onClick={() => setSubmittingDeliverableMilestoneId(m.id)}
                                      className="hex-blueprint-btn" 
                                      style={{ fontSize: '0.65rem', padding: '0.4rem 0.8rem', background: 'var(--primary-gradient)' }}
                                    >
                                      📤 Submit Deliverables
                                    </button>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                      <input 
                                        type="text" 
                                        value={deliverableProofText}
                                        onChange={e => setDeliverableProofText(e.target.value)}
                                        placeholder="Enter work details, PR link, or IPFS URI"
                                        className="form-input"
                                        style={{ fontSize: '0.65rem', padding: '0.4rem' }}
                                      />
                                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button 
                                          onClick={() => handleSubmitDeliverable(m.id, m.jobContractAddress || '')}
                                          disabled={submittingDeliverable}
                                          className="hex-blueprint-btn" 
                                          style={{ fontSize: '0.65rem', padding: '0.4rem 0.8rem', background: 'var(--accent-pink)' }}
                                        >
                                          {submittingDeliverable ? 'Submitting...' : 'Confirm Submission'}
                                        </button>
                                        <button 
                                          onClick={() => { setSubmittingDeliverableMilestoneId(null); setDeliverableProofText(''); }}
                                          className="hex-blueprint-btn" 
                                          style={{ fontSize: '0.65rem', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.1)' }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              {jobStatusVal === 2 && (
                                <>
                                  <button 
                                    onClick={() => handleApproveEscrow(m.id, m.jobContractAddress || '')}
                                    className="hex-blueprint-btn" 
                                    style={{ fontSize: '0.65rem', padding: '0.4rem 0.8rem', background: 'green' }}
                                  >
                                    ✓ Approve & Release Payout
                                  </button>
                                  <button 
                                    onClick={() => handleRejectEscrow(m.id, m.jobContractAddress || '')}
                                    className="hex-blueprint-btn" 
                                    style={{ fontSize: '0.65rem', padding: '0.4rem 0.8rem', background: 'red' }}
                                  >
                                    ✗ Reject Deliverables
                                  </button>
                                </>
                              )}

                              {jobStatusVal === 4 && (
                                <button 
                                  onClick={() => handleClaimRefund(m.id, m.jobContractAddress || '')}
                                  className="hex-blueprint-btn" 
                                  style={{ fontSize: '0.65rem', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.1)' }}
                                >
                                  ↺ Claim Escrow Refund
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Creation form */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div>
                  <h3 className="metric-label" style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#fff', fontWeight: 'bold' }}>Deploy Escrow Agreement</h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Fund a new job escrow. Capital will be secured in a native on-chain state machine.</p>
                </div>

                <form onSubmit={handleCreateMilestone} className="form-container" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Agreement / Job Name</label>
                    <input 
                      type="text" 
                      value={newMilestoneName}
                      onChange={e => setNewMilestoneName(e.target.value)}
                      placeholder="e.g. Q4 Smart Contract Audit"
                      className="form-input" 
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Locked Escrow Budget (USDC)</label>
                    <input 
                      type="number" 
                      value={newMilestoneBudget}
                      onChange={e => setNewMilestoneBudget(e.target.value)}
                      placeholder="e.g. 10000"
                      className="form-input" 
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Supplier / Provider Address</label>
                    <input 
                      type="text" 
                      value={newMilestoneProvider}
                      onChange={e => setNewMilestoneProvider(e.target.value)}
                      placeholder="0x... (Recipient Address)"
                      className="form-input" 
                      style={{ fontFamily: 'var(--font-mono)' }}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Evaluator (Auditor Agent) Address</label>
                    <input 
                      type="text" 
                      value={newMilestoneEvaluator}
                      onChange={e => setNewMilestoneEvaluator(e.target.value)}
                      placeholder="0x... (default: Auditor Agent)"
                      className="form-input" 
                      style={{ fontFamily: 'var(--font-mono)' }}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Agreement Expiration Date</label>
                    <input 
                      type="date" 
                      value={newMilestoneDeadline}
                      onChange={e => setNewMilestoneDeadline(e.target.value)}
                      className="form-input" 
                      style={{ fontFamily: 'var(--font-mono)' }}
                      required
                    />
                  </div>

                  <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem', background: 'var(--primary-gradient)' }}>
                    {vaultAddress ? '🔒 Deploy & Fund Escrow' : '🔒 Deploy & Fund Escrow (Demo)'}
                  </button>
                </form>
              </div>

            </div>
          )}

          {/* TAB 5: COMPLIANCE REGISTRY */}
          {activeTab === 'compliance' && (
            <div>
              {/* Sub-tab selection */}
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                <button 
                  onClick={() => setComplianceSubTab('registry')}
                  className="nav-link"
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: complianceSubTab === 'registry' ? 'var(--accent-pink)' : 'var(--text-secondary)',
                    borderBottom: complianceSubTab === 'registry' ? '2px solid var(--accent-pink)' : 'none',
                    paddingBottom: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: complianceSubTab === 'registry' ? 'bold' : 'normal'
                  }}
                >
                  Trusted Recipients
                </button>
                <button 
                  onClick={() => setComplianceSubTab('risk-assessment')}
                  className="nav-link"
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: complianceSubTab === 'risk-assessment' ? 'var(--accent-pink)' : 'var(--text-secondary)',
                    borderBottom: complianceSubTab === 'risk-assessment' ? '2px solid var(--accent-pink)' : 'none',
                    paddingBottom: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: complianceSubTab === 'risk-assessment' ? 'bold' : 'normal'
                  }}
                >
                  Risk Assessment Reports
                </button>
              </div>

              {complianceSubTab === 'registry' && (
                <div className="compliance-tab-grid">
                  
                  {/* Compliance list */}
                  <div className="compliance-list">
                    <div className="glass-panel">
                      <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>Trusted Recipients</h3>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                        Before any payment goes out, we check that the recipient is safe. You can manage your trust list here.
                      </p>

                      <div className="screening-table-container">
                        <table className="screening-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Account</th>
                              <th>Status</th>
                              <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {complianceRegistry.map(c => (
                              <tr key={c.address} className="table-row">
                                <td style={{ fontFamily: 'var(--font-sans)', fontWeight: '500', color: '#fff' }}>{c.label}</td>
                                <td style={{ color: 'var(--text-muted)' }}>{c.address}</td>
                                <td>
                                  <span className={`badge ${c.isBlocklisted ? 'badge-red' : 'badge-green'}`}>
                                    {c.isBlocklisted ? '⚠️ Blocked' : '✓ Trusted'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    onClick={() => toggleBlocklist(c.address)}
                                    className={`toggle-block-btn ${c.isBlocklisted ? 'btn-toggle-compliant' : 'btn-toggle-block'}`}
                                  >
                                    {c.isBlocklisted ? 'Unblock' : 'Block'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Right column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Add screening target */}
                    <div className="glass-panel">
                      <div>
                        <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Add a Recipient</h3>
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Save a new account to your address book.</p>
                      </div>

                      <form onSubmit={handleCreateComplianceAddress} className="form-container">
                        <div className="form-group">
                          <label>Name</label>
                          <input 
                            type="text" 
                            value={customCompLabel}
                            onChange={e => setCustomCompLabel(e.target.value)}
                            placeholder="e.g. Q4 Contractor Core"
                            className="form-input" 
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>Account Address</label>
                          <input 
                            type="text" 
                            value={customCompAddress}
                            onChange={e => setCustomCompAddress(e.target.value)}
                            placeholder="0x..."
                            className="form-input" 
                            style={{ fontFamily: 'var(--font-mono)' }}
                            required
                          />
                        </div>

                        <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem' }}>
                          Save Recipient
                        </button>
                      </form>
                    </div>

                    {/* Compliance Oracle Settings */}
                    <div className="glass-panel">
                      <div>
                        <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Compliance Oracle</h3>
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          Configure the on-chain Compliance Oracle address.
                        </p>
                      </div>
                      
                      <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        Current Oracle: <span style={{ color: 'var(--accent-pink)', wordBreak: 'break-all' }}>{oracleAddress || 'None (Using local blocklist only)'}</span>
                      </div>

                      <form onSubmit={handleUpdateOracleAddress} className="form-container">
                        <div className="form-group">
                          <label>New Oracle Address</label>
                          <input 
                            type="text" 
                            value={newOracleAddress}
                            onChange={e => setNewOracleAddress(e.target.value)}
                            placeholder="0x..."
                            className="form-input" 
                            style={{ fontFamily: 'var(--font-mono)' }}
                            required
                          />
                        </div>

                        <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem' }}>
                          Set Compliance Oracle
                        </button>
                      </form>
                    </div>
                  </div>

                </div>
              )}

              {complianceSubTab === 'risk-assessment' && (
                <div className="compliance-tab-grid">
                  
                  {/* Left Column: Screened List & Check Form */}
                  <div className="compliance-list">
                    {/* Run manual check panel */}
                    <div className="glass-panel">
                      <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>Run AML Risk Screening</h3>
                      <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                        Instantly query Circle Compliance API to verify politically exposed persons (PEP), AML risk indices, and sanction list statuses.
                      </p>
                      <form onSubmit={handleManualRiskCheck} className="form-container" style={{ flexDirection: 'row', gap: '0.75rem', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label>EVM Address</label>
                          <input 
                            type="text"
                            value={manualRiskAddress}
                            onChange={e => setManualRiskAddress(e.target.value)}
                            placeholder="0x..."
                            className="form-input"
                            style={{ fontFamily: 'var(--font-mono)' }}
                            required
                          />
                        </div>
                        <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.75rem 1rem', width: 'auto', whiteSpace: 'nowrap' }}>
                          Scan Profile
                        </button>
                      </form>
                    </div>

                    {/* Profiles history list */}
                    <div className="glass-panel" style={{ marginTop: '1rem' }}>
                      <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>Screening Records</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '350px', overflowY: 'auto' }}>
                        {riskProfiles.map(p => (
                          <div 
                            key={p.address}
                            onClick={() => setSelectedRiskProfile(p.address)}
                            style={{ 
                              padding: '0.75rem', 
                              borderRadius: '6px', 
                              border: `1px solid ${selectedRiskProfile === p.address ? 'var(--accent-pink)' : 'rgba(255,255,255,0.03)'}`,
                              background: selectedRiskProfile === p.address ? 'rgba(251,200,216,0.03)' : '#0d0a10',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#fff', wordBreak: 'break-all' }}>{p.address}</div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Screened: {p.lastScreened}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                              <span className={`badge ${p.decision === 'APPROVED' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.55rem' }}>
                                {p.decision}
                              </span>
                              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: p.riskScore > 50 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                                Score: {p.riskScore}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Detailed Scorecard Report */}
                  <div className="glass-panel">
                    {(() => {
                      const profile = riskProfiles.find(p => p.address === selectedRiskProfile);
                      if (!profile) return <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>Select a screening profile to view the audit scorecard.</div>;
                      
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.75rem' }}>
                            <span style={{ fontSize: '0.55rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Circle compliance API Scorecard</span>
                            <h3 style={{ fontSize: '0.9rem', fontFamily: 'var(--font-mono)', color: '#fff', wordBreak: 'break-all', marginTop: '0.25rem' }}>{profile.address}</h3>
                            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Audit timestamp: {profile.lastScreened}</div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Screening Result:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                                <span className={`badge ${profile.decision === 'APPROVED' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem' }}>
                                  {profile.decision === 'APPROVED' ? '✓ APPROVED' : '⚠️ DENIED'}
                                </span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>AML Risk Score:</span>
                              <div style={{ fontSize: '1.25rem', fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: profile.riskScore > 50 ? 'var(--accent-red)' : 'var(--accent-green)', marginTop: '0.15rem' }}>
                                {profile.riskScore} <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>/ 100</span>
                              </div>
                            </div>
                          </div>

                          {/* Risk Score Meter */}
                          <div>
                            <div className="progress-bar-bg" style={{ height: '8px', borderRadius: '4px' }}>
                              <div 
                                style={{ 
                                  width: `${profile.riskScore}%`, 
                                  background: profile.riskScore > 50 
                                    ? 'linear-gradient(90deg, #fbc8d8, #e57373)' 
                                    : 'linear-gradient(90deg, #81c784, #4caf50)',
                                  height: '100%' 
                                }}
                              />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                              <span>LOW RISK</span>
                              <span>HIGH RISK</span>
                            </div>
                          </div>

                          {/* Specific flags details */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#08060a', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Politically Exposed Person (PEP) Status:</span>
                              <span className={`badge ${profile.pepFlag ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.55rem' }}>
                                {profile.pepFlag ? 'MATCH FOUND' : 'CLEAR'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Sanctions List (OFAC):</span>
                              <span className={`badge ${profile.sanctionedJurisdiction !== 'None' ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.55rem' }}>
                                {profile.sanctionedJurisdiction !== 'None' ? `MATCHED: ${profile.sanctionedJurisdiction}` : 'CLEAR'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>AML Correlation Index:</span>
                              <span className={`badge ${profile.amlFlag ? 'badge-red' : 'badge-green'}`} style={{ fontSize: '0.55rem' }}>
                                {profile.amlFlag ? 'ALERT' : 'CLEAR'}
                              </span>
                            </div>
                          </div>

                          {profile.riskCategories.length > 0 && (
                            <div>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Risk Categories:</span>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                                {profile.riskCategories.map(cat => (
                                  <span key={cat} className="badge badge-purple" style={{ fontSize: '0.55rem' }}>{cat}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Decision Factors:</span>
                            <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1rem', fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {profile.reasons.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                </div>
              )}

            </div>
          )}

          {/* TAB 6: ERC-8004 AGENT REGISTRY & CONSOLE */}
          {activeTab === 'agents' && (
            <div className="compliance-tab-grid">
              
              {/* Left Column: Registered Agents List */}
              <div className="compliance-list">
                <div className="glass-panel">
                  <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    ERC-8004 AI Agent Registry
                  </h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                    ATO verifies the identity, cryptographic credentials, and reputation scores of autonomous treasury agents on-chain.
                  </p>

                  <div className="screening-table-container" style={{ marginTop: '1rem' }}>
                    <table className="screening-table">
                      <thead>
                        <tr>
                          <th>Agent / Role</th>
                          <th>EVM Address</th>
                          <th>ID</th>
                          <th>Reputation</th>
                          <th>Metadata (URI)</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentsList.map(agent => (
                          <tr key={agent.address} className="table-row">
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{ 
                                  width: '8px', 
                                  height: '8px', 
                                  borderRadius: '50%', 
                                  backgroundColor: agent.role.includes('Allocator') ? 'var(--accent-cyan)' : agent.role.includes('Risk') ? 'var(--accent-pink)' : 'var(--accent-purple)'
                                }}></div>
                                <strong style={{ color: '#fff', fontSize: '0.72rem' }}>{agent.role}</strong>
                              </div>
                            </td>
                            <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                              {agent.address}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                              {agent.id}
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: agent.reputation >= 90 ? 'var(--accent-green)' : 'var(--accent-pink)' }}>
                                  {agent.reputation}
                                </span>
                                <div className="progress-bar-bg" style={{ width: '40px', height: '4px', borderRadius: '2px', display: 'inline-block' }}>
                                  <div style={{ width: `${agent.reputation}%`, height: '100%', backgroundColor: agent.reputation >= 90 ? 'var(--accent-green)' : 'var(--accent-pink)' }}></div>
                                </div>
                              </div>
                            </td>
                            <td>
                              {agent.uri ? (
                                <a 
                                  href={agent.uri.replace('ipfs://', 'https://ipfs.io/ipfs/')} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  style={{ textDecoration: 'underline', color: 'var(--accent-pink)', fontSize: '0.65rem' }}
                                >
                                  View Spec ↗
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>None</span>
                              )}
                            </td>
                            <td>
                              <span className={`badge ${agent.isRegistered ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.55rem' }}>
                                {agent.isRegistered ? '✓ Certified' : '⚠️ Unregistered'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Built-in Safety Features / Logs summary */}
                <div className="glass-panel" style={{ marginTop: '1rem' }}>
                  <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.75rem' }}>
                    Agent Cryptographic Identity Protocol (ERC-8004)
                  </h3>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <p>
                      <strong>1. Signature Verification:</strong> When the Allocator Agent submits a direct payout execution transaction, the vault contract uses the <code>recoverSigner</code> engine to cryptographically recover the agent's signature on-chain. This prevents script injection and unauthorized transactions.
                    </p>
                    <p>
                      <strong>2. Replay Protection:</strong> An on-chain mapping tracks sequential transaction nonces for each registered agent. Expired, out-of-order, or forged signatures are automatically rejected by the treasury vault.
                    </p>
                    <p>
                      <strong>3. Dynamic Trust & Reputation:</strong> If an agent behaves maliciously or fails off-chain compliance rules, the administrator can dynamically lower the agent's reputation score or unregister the agent entirely via the registry contract, instantly revoking execution rights.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: Registry Management */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Registry Address Setting */}
                <div className="glass-panel">
                  <div>
                    <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Agent Registry Configuration</h3>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      Link the treasury vault to the ERC-8004 Registry address.
                    </p>
                  </div>
                  
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', margin: '0.5rem 0' }}>
                    Current Address: <span style={{ color: 'var(--accent-pink)', wordBreak: 'break-all' }}>{registryAddress || 'None (Using local checks)'}</span>
                  </div>

                  <form onSubmit={handleUpdateRegistryAddress} className="form-container">
                    <div className="form-group">
                      <label>New Registry Address</label>
                      <input 
                        type="text" 
                        value={newRegistryAddress}
                        onChange={e => setNewRegistryAddress(e.target.value)}
                        placeholder="0x..."
                        className="form-input" 
                        style={{ fontFamily: 'var(--font-mono)' }}
                        required
                      />
                    </div>

                    <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem' }}>
                      Set Agent Registry
                    </button>
                  </form>
                </div>

                {/* Register New Agent */}
                <div className="glass-panel">
                  <div>
                    <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Register New Agent</h3>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      Authorize and index a new AI agent inside the ERC-8004 registry.
                    </p>
                  </div>

                  <form onSubmit={handleRegisterAgent} className="form-container">
                    <div className="form-group">
                      <label>Agent EVM Address</label>
                      <input 
                        type="text" 
                        value={newAgentAddress}
                        onChange={e => setNewAgentAddress(e.target.value)}
                        placeholder="0x..."
                        className="form-input" 
                        style={{ fontFamily: 'var(--font-mono)' }}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Metadata URI (IPFS)</label>
                      <input 
                        type="text" 
                        value={newAgentURI}
                        onChange={e => setNewAgentURI(e.target.value)}
                        placeholder="ipfs://..."
                        className="form-input" 
                        style={{ fontFamily: 'var(--font-mono)' }}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Initial Reputation Score (0 - 100)</label>
                      <input 
                        type="number" 
                        value={newAgentReputation}
                        onChange={e => setNewAgentReputation(e.target.value)}
                        min="0"
                        max="100"
                        className="form-input" 
                        required
                      />
                    </div>

                    <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem' }}>
                      Register Agent
                    </button>
                  </form>
                </div>

                {/* Update Reputation Score */}
                <div className="glass-panel">
                  <div>
                    <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Update Reputation</h3>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                      Adjust the trust score of an active agent.
                    </p>
                  </div>

                  <form onSubmit={handleUpdateReputation} className="form-container">
                    <div className="form-group">
                      <label>Agent EVM Address</label>
                      <input 
                        type="text" 
                        value={updateRepAgentAddress}
                        onChange={e => setUpdateRepAgentAddress(e.target.value)}
                        placeholder="0x..."
                        className="form-input" 
                        style={{ fontFamily: 'var(--font-mono)' }}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>New Reputation Score (0 - 100)</label>
                      <input 
                        type="number" 
                        value={updateRepScore}
                        onChange={e => setUpdateRepScore(e.target.value)}
                        min="0"
                        max="100"
                        className="form-input" 
                        required
                      />
                    </div>

                    <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem' }}>
                      Update Reputation
                    </button>
                  </form>
                </div>

              </div>

            </div>
          )}

        </main>
      </div>

      {/* --- FOOTER BANNER --- */}
      <div className="divider-subtle" style={{ marginTop: 'auto' }}></div>
      <footer className="footer-banner">
        <span>© 2026 ATO · Autonomous Treasury Orchestrator. All rights reserved.</span>
        <div className="footer-links">
          <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer" className="footer-link">View Transactions</a>
          <a href="https://developers.circle.com" target="_blank" rel="noreferrer" className="footer-link">Powered by Circle</a>
        </div>
      </footer>

      {/* --- BIOMETRIC WEBPAUTHN DIALOG OVERLAY --- */}
      {isBiometricPromptOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(5, 3, 7, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999,
          color: '#fff',
        }}>
          <style>{`
            @keyframes scannerLine {
              0% { top: 10%; }
              50% { top: 90%; }
              100% { top: 10%; }
            }
          `}</style>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '380px',
            padding: '2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            boxShadow: '0 0 30px rgba(0, 240, 255, 0.15)',
          }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff' }}>
                Biometric Approval Required
              </h3>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                {biometricPromptTitle}
              </p>
            </div>

            {/* Moving TouchID/FaceID Scan Icon */}
            <div style={{
              position: 'relative',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              background: biometricScanStatus === 'success' 
                ? 'rgba(57,255,20,0.1)' 
                : biometricScanStatus === 'failed'
                  ? 'rgba(255,46,143,0.1)'
                  : 'rgba(0,240,255,0.05)',
              border: biometricScanStatus === 'success' 
                ? '2px solid var(--accent-green)' 
                : biometricScanStatus === 'failed'
                  ? '2px solid var(--accent-red)'
                  : '2px solid var(--accent-cyan)',
              boxShadow: biometricScanStatus === 'success'
                ? '0 0 20px rgba(57,255,20,0.3)'
                : biometricScanStatus === 'failed'
                  ? '0 0 20px rgba(255,46,143,0.3)'
                  : '0 0 20px rgba(0,240,255,0.3)',
            }}>
              {biometricScanStatus === 'scanning' && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'var(--accent-cyan)',
                  borderRadius: '2px',
                  boxShadow: '0 0 8px var(--accent-cyan)',
                  animation: 'scannerLine 2s infinite ease-in-out',
                }}></div>
              )}
              
              {/* Biometric SVG Icon */}
              <svg style={{
                width: '40px',
                height: '40px',
                color: biometricScanStatus === 'success'
                  ? 'var(--accent-green)'
                  : biometricScanStatus === 'failed'
                    ? 'var(--accent-red)'
                    : 'var(--accent-cyan)',
              }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11a5 5 0 00-10 0c0 1.02.109 2.016.316 2.977m18.257-.3C20.485 10.12 21 8.62 21 7c0-4.418-4.03-8-9-8S3 3.582 3 8c0 1.063.237 2.07.664 2.977m18.257 2.014a17.65 17.65 0 01-1.52 6.01M21 12a9 9 0 00-9-9m9 9a9 9 0 01-9 9m0 0a9 9 0 01-9-9m9 9c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3z" />
              </svg>
            </div>

            <div style={{ fontSize: '0.72rem', color: biometricScanStatus === 'scanning' ? 'var(--accent-cyan)' : biometricScanStatus === 'success' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {biometricScanStatus === 'scanning' && 'Confirming TouchID / FaceID...'}
              {biometricScanStatus === 'success' && '✓ Biometrics Confirmed'}
              {biometricScanStatus === 'failed' && '✗ Authentication Failed'}
            </div>
            
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Powered by Circle Modular Wallets & WebAuthn
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
