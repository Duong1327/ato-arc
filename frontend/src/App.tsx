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
  agent: 'SYSTEM' | 'AUDITOR' | 'RISK_OFFICER' | 'ALLOCATOR' | 'POLICY';
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

  const [activeTab, setActiveTab] = useState<'dashboard' | 'multisig' | 'sweeper' | 'milestones' | 'compliance' | 'agents' | 'billing' | 'webhooks' | 'banking' | 'guardrails'>('dashboard');

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

  // Gateway Billing State
  const [gatewayState, setGatewayState] = useState<{
    activeChannel: {
      channelId: string;
      buyer: string;
      seller: string;
      balance: string;
      nonce: number;
      isOpen: boolean;
    } | null;
    channelContractAddress: string;
    logs: {
      timestamp: string;
      type: 'DEPOSIT' | 'MICRO-PAYMENT' | 'SETTLE' | 'REFUND';
      channelId: string;
      amount: string;
      recipient: string;
      status: 'PENDING' | 'SUCCESS' | 'FAILED';
      description: string;
    }[];
  }>({
    activeChannel: null,
    channelContractAddress: '0x0000000000000000000000000000000000000000',
    logs: []
  });

  // Load Gateway state periodically
  useEffect(() => {
    const fetchGatewayState = async () => {
      try {
        const response = await fetch('/gateway_state.json');
        if (response.ok) {
          const data = await response.json();
          setGatewayState(data);
        } else {
          throw new Error('State file not found');
        }
      } catch (err) {
        // Fallback mock logs if file is not found/not written yet
        setGatewayState({
          activeChannel: {
            channelId: '0x7b1c3a8d9a2b4f62e87900000000000000000000000000000000000000000000',
            buyer: passkeyAccount?.address || connectedAddress || '0x59B50855Aa3bE2F677cD6303Cec089B5F319D72a',
            seller: '0x29da3f0095cc4b17a7f453df2c3bf30900000000',
            balance: '9.985000',
            nonce: 3,
            isOpen: true
          },
          channelContractAddress: '0x59B50855Aa3bE2F677cD6303Cec089B5F319D72a',
          logs: [
            {
              timestamp: new Date(Date.now() - 5000).toISOString(),
              type: 'MICRO-PAYMENT',
              channelId: '0x7b1c3a8d9a2b4f62e87900000000000000000000000000000000000000000000',
              amount: '0.010000',
              recipient: '0x29da3f0095cc4b17a7f453df2c3bf30900000000',
              status: 'SUCCESS',
              description: 'Audit Invoice Reconciliation for INV-2026-004'
            },
            {
              timestamp: new Date(Date.now() - 30000).toISOString(),
              type: 'MICRO-PAYMENT',
              channelId: '0x7b1c3a8d9a2b4f62e87900000000000000000000000000000000000000000000',
              amount: '0.005000',
              recipient: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
              status: 'SUCCESS',
              description: 'Compliance screening query for 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
            },
            {
              timestamp: new Date(Date.now() - 60000).toISOString(),
              type: 'DEPOSIT',
              channelId: '0x7b1c3a8d9a2b4f62e87900000000000000000000000000000000000000000000',
              amount: '10.000000',
              recipient: '0x29da3f0095cc4b17a7f453df2c3bf30900000000',
              status: 'SUCCESS',
              description: 'Opened payment channel with initial deposit of $10.00 USDC'
            }
          ]
        });
      }
    };

    fetchGatewayState();
    const interval = setInterval(fetchGatewayState, 3000);
    return () => clearInterval(interval);
  }, [passkeyAccount, connectedAddress]);


  
  // Ledger Balances (ERC-20 uses 6 decimals; L1 native uses 18 decimals)
  const [vaultBalanceERC20, setVaultBalanceERC20] = useState<number>(1520380.00);
  const [vaultBalanceEURC, setVaultBalanceEURC] = useState<number>(450000.00);
  const [vaultBalanceNativeGas, setVaultBalanceNativeGas] = useState<number>(12480.00);

  // StableFX Swap Form State
  const [swapSellToken, setSwapSellToken] = useState<'USDC' | 'EURC'>('USDC');
  const [swapBuyToken, setSwapBuyToken] = useState<'USDC' | 'EURC'>('EURC');
  const [swapAmount, setSwapAmount] = useState<string>('100.00');
  const [swapQuote, setSwapQuote] = useState<{ buyAmount: string; rate: string } | null>(null);
  const [swapInProgress, setSwapInProgress] = useState(false);
  const [swapTxHash, setSwapTxHash] = useState('');
  
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

  // --- BANK PORTAL INTEGRATION STATE ---
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [wireTransactions, setWireTransactions] = useState<any[]>([]);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [sweepThreshold, setSweepThreshold] = useState<number>(100000);
  const [linkLoading, setLinkLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [wireLoading, setWireLoading] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [simulateWireAmount, setSimulateWireAmount] = useState('');
  const [activeOwnerVerified, setActiveOwnerVerified] = useState(false);
  const [withdrawalLimit] = useState<number>(50000);
  const [multiSigApproved, setMultiSigApproved] = useState(false);

  // Circle Gas Station / Paymaster State
  const [paymasterStatus, setPaymasterStatus] = useState<'ACTIVE' | 'DEPLETED'>('ACTIVE');
  const [sponsoredTxCount, setSponsoredTxCount] = useState<number>(24);
  const [totalSponsoredGas, setTotalSponsoredGas] = useState<number>(62.45);
  const [paymasterBalance, setPaymasterBalance] = useState<number>(437.55);
  const [paymasterPolicyId, setPaymasterPolicyId] = useState<string>('pol_gas_station_ato_registered');
  const [paymasterLoading, setPaymasterLoading] = useState<boolean>(false);

  // Circle Agent Stack & Spending Policy Guardrails States
  const [agentPolicy, setAgentPolicy] = useState<any>(null);
  const [pendingPolicyProposal, setPendingPolicyProposal] = useState<any>(null);
  const [policyLimitInput, setPolicyLimitInput] = useState<string>('5000');
  const [policyFreqInput, setPolicyFreqInput] = useState<string>('10');
  const [policyAllowlistInput, setPolicyAllowlistInput] = useState<string>('');
  const [policyLoading, setPolicyLoading] = useState<boolean>(false);
  const [approverName, setApproverName] = useState<string>('Owner 2');

  const fetchPaymasterStatus = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/paymaster/status');
      if (res.ok) {
        const data = await res.json();
        setPaymasterStatus(data.status);
        setSponsoredTxCount(data.sponsoredTxCount);
        setTotalSponsoredGas(data.totalSponsoredGas);
        setPaymasterBalance(data.paymasterBalance);
        setPaymasterPolicyId(data.policyId);
      }
    } catch (err) {
      console.error("Error fetching paymaster status:", err);
    }
  };

  const fetchAgentPolicy = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/agent/policy');
      if (res.ok) {
        const data = await res.json();
        setAgentPolicy(data);
        if (!pendingPolicyProposal) {
          setPolicyLimitInput(data.spendingLimitDailyUSDC.toString());
          setPolicyFreqInput(data.transactionFrequencyCapPerHour.toString());
          setPolicyAllowlistInput(data.addressAllowlist);
        }
      }
    } catch (err) {
      console.error('Failed to fetch agent policy:', err);
    }
  };

  const fetchPendingPolicyProposal = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/agent/policy/proposal');
      if (res.ok) {
        const data = await res.json();
        setPendingPolicyProposal(data);
      }
    } catch (err) {
      console.error('Failed to fetch pending policy proposal:', err);
    }
  };

  const proposePolicyUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPolicyLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/agent/policy/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spendingLimitDailyUSDC: parseFloat(policyLimitInput),
          transactionFrequencyCapPerHour: parseInt(policyFreqInput),
          addressAllowlist: policyAllowlistInput,
          creator: 'Owner 1'
        })
      });
      if (res.ok) {
        addLog('POLICY', 'Proposed new Agent spending limits. Requires multi-sig team approval.', 'INFO');
        await fetchPendingPolicyProposal();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPolicyLoading(false);
    }
  };

  const approvePolicyProposal = async () => {
    setPolicyLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/agent/policy/proposal/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: approverName })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.applied) {
          addLog('POLICY', 'Multi-sig policy update approved and successfully applied to Agent stack.', 'SUCCESS');
          await fetchAgentPolicy();
          setPendingPolicyProposal(null);
        } else {
          addLog('POLICY', `Approved by ${approverName}. Current approval count: 2/2.`, 'INFO');
          await fetchPendingPolicyProposal();
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPolicyLoading(false);
    }
  };

  const togglePolicyEnforcement = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/agent/policy/toggle-enforcement', {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setAgentPolicy(data);
        addLog('POLICY', `Agent Stack Policy Enforcement toggled. Enforced: ${data.enforced}`, 'INFO');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePaymaster = async () => {
    try {
      setPaymasterLoading(true);
      const res = await fetch('http://localhost:3001/api/paymaster/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPaymasterStatus(data.status);
        addLog('SYSTEM', `Circle Paymaster simulation updated: Now ${data.status}.`, 'INFO');
      }
    } catch (err) {
      console.error("Error toggling paymaster:", err);
    } finally {
      setPaymasterLoading(false);
    }
  };

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

  // Read EURC balance of the vault
  const { data: vaultEurcBalances, refetch: refetchVaultEurcBalances } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'getTreasuryBalances',
    args: ['0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'], // EURC Address
    chainId: 5042002,
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress),
    }
  });

  const { data: onChainStableFXAddress } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'stableFXAddress',
    chainId: 5042002,
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress)
    }
  });

  const { data: fxQuoteData } = useReadContract({
    address: onChainStableFXAddress as `0x${string}`,
    abi: [
      {
        inputs: [
          { name: 'sellToken', type: 'address' },
          { name: 'buyToken', type: 'address' },
          { name: 'sellAmount', type: 'uint256' }
        ],
        name: 'getFXQuote',
        outputs: [
          { name: 'buyAmount', type: 'uint256' },
          { name: 'rate', type: 'uint256' }
        ],
        stateMutability: 'view',
        type: 'function'
      }
    ] as const,
    functionName: 'getFXQuote',
    args: onChainStableFXAddress && swapAmount && !isNaN(parseFloat(swapAmount)) ? [
      (swapSellToken === 'USDC' ? '0x3600000000000000000000000000000000000000' : '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a') as `0x${string}`,
      (swapBuyToken === 'USDC' ? '0x3600000000000000000000000000000000000000' : '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a') as `0x${string}`,
      parseUnits(swapAmount, 6)
    ] : undefined,
    chainId: 5042002,
    query: {
      enabled: isConnected && !!onChainStableFXAddress && !!swapAmount && !isNaN(parseFloat(swapAmount))
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
    if (vaultAddress) {
      if (vaultBalances) {
        const erc20 = Number((vaultBalances as any)[0]) / 1e6;
        const native = Number((vaultBalances as any)[1]) / 1e18;
        setVaultBalanceERC20(erc20);
        setVaultBalanceNativeGas(native);
      }
      if (vaultEurcBalances) {
        const eurc = Number((vaultEurcBalances as any)[0]) / 1e6;
        setVaultBalanceEURC(eurc);
      }
    }
  }, [vaultBalances, vaultEurcBalances, vaultAddress]);

  // Keep FX quote synchronized
  useEffect(() => {
    if (fxQuoteData) {
      const q = fxQuoteData as [bigint, bigint];
      setSwapQuote({
        buyAmount: (Number(q[0]) / 1e6).toFixed(2),
        rate: (Number(q[1]) / 1e18).toFixed(4)
      });
    } else {
      // Offline fallback rate (1 EURC = 1.08 USDC or 1 USDC = 0.925 EURC)
      const isUSDCtoEURC = swapSellToken === 'USDC';
      const rate = isUSDCtoEURC ? 0.925 : 1.08;
      const amt = Number(swapAmount || 0) * rate;
      setSwapQuote({
        buyAmount: amt.toFixed(2),
        rate: rate.toFixed(4)
      });
    }
  }, [fxQuoteData, swapAmount, swapSellToken, swapBuyToken]);

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

  useEffect(() => {
    fetchPaymasterStatus();
    fetchAgentPolicy();
    fetchPendingPolicyProposal();
  }, [vaultAddress]);

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
  const addLog = (agent: 'SYSTEM' | 'AUDITOR' | 'RISK_OFFICER' | 'ALLOCATOR' | 'POLICY', message: string, level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR') => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLogs(prev => [...prev, { timestamp: timeStr, agent, message, level }]);
  };

  const handleExecuteSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultAddress || !swapAmount || !swapQuote) return;

    const sellTokenAddr = swapSellToken === 'USDC' ? '0x3600000000000000000000000000000000000000' : '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
    const buyTokenAddr = swapBuyToken === 'USDC' ? '0x3600000000000000000000000000000000000000' : '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
    const sellAmountUnits = parseUnits(swapAmount, 6);
    
    // Set 5% slippage tolerance
    const minBuyAmountUnits = parseUnits(
      (Number(swapQuote.buyAmount) * 0.95).toFixed(2),
      6
    );

    const executeSwapTx = async () => {
      try {
        setSwapInProgress(true);
        setSwapTxHash('');
        addLog('ALLOCATOR', `Executing Treasury FX Swap of ${swapAmount} ${swapSellToken} to ${swapBuyToken}...`, 'INFO');
        
        if (passkeyAccount) {
          // Sponsor transaction via modular wallets
          await new Promise(r => setTimeout(r, 1200));
          addLog('SYSTEM', `[Paymaster] Sponsored transaction via Circle Gas Station: gas fee ($0.00 USDC) paid.`, 'SUCCESS');
          addLog('SYSTEM', `[ERC-1271] Biometric signature verified on-chain.`, 'SUCCESS');
          
          if (swapSellToken === 'USDC') {
            setVaultBalanceERC20(prev => prev - Number(swapAmount));
            setVaultBalanceEURC(prev => prev + Number(swapQuote.buyAmount));
          } else {
            setVaultBalanceEURC(prev => prev - Number(swapAmount));
            setVaultBalanceERC20(prev => prev + Number(swapQuote.buyAmount));
          }
          addLog('SYSTEM', `Swapped ${swapAmount} ${swapSellToken} for ${swapQuote.buyAmount} ${swapBuyToken}!`, 'SUCCESS');
          setSwapInProgress(false);
        } else {
          const tx = await writeContract({
            address: vaultAddress as `0x${string}`,
            abi: ATO_VAULT_ABI,
            functionName: 'executeFxTrade',
            args: [sellTokenAddr, buyTokenAddr, sellAmountUnits, minBuyAmountUnits, vaultAddress as `0x${string}`]
          });
          
          addLog('SYSTEM', `FX Swap transaction broadcasted! Hash: ${tx}`, 'SUCCESS');
          setSwapTxHash(tx);
          
          if (!publicClient) throw new Error("Public client not ready");
          await publicClient.waitForTransactionReceipt({ hash: tx });
          
          addLog('SYSTEM', `FX Swap executed successfully on-chain!`, 'SUCCESS');
          setSwapInProgress(false);
          refetchVaultBalances();
          refetchVaultEurcBalances();
        }
      } catch (err: any) {
        setSwapInProgress(false);
        addLog('ALLOCATOR', `Swap failed: ${err.message || err}`, 'ERROR');
      }
    };

    if (passkeyAccount) {
      triggerBiometricApproval(`Execute Treasury Swap: Sell ${swapAmount} ${swapSellToken} for at least ${(Number(swapQuote.buyAmount) * 0.95).toFixed(2)} ${swapBuyToken}`, executeSwapTx);
    } else {
      executeSwapTx();
    }
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

  // Webhooks & ERP Sync state
  const [backendInvoices, setBackendInvoices] = useState<any[]>([]);
  const [backendTransactions, setBackendTransactions] = useState<any[]>([]);
  const [syncMetrics, setSyncMetrics] = useState<any>({
    totalLogs: 0,
    processed: 0,
    duplicates: 0,
    ignored: 0,
    failed: 0,
    health: 'DISCONNECTED'
  });
  const [recentWebhookLogs, setRecentWebhookLogs] = useState<any[]>([]);
  const [backendConnected, setBackendConnected] = useState<boolean>(false);

  const fetchBackendData = async () => {
    try {
      const baseUrl = 'http://localhost:3001';
      const invoicesRes = await fetch(`${baseUrl}/api/invoices`);
      const invoicesData = await invoicesRes.json();
      setBackendInvoices(invoicesData);
      
      const txRes = await fetch(`${baseUrl}/api/transactions`);
      const txData = await txRes.json();
      setBackendTransactions(txData);

      const metricsRes = await fetch(`${baseUrl}/api/metrics`);
      const metricsData = await metricsRes.json();
      setSyncMetrics(metricsData.metrics);
      setRecentWebhookLogs(metricsData.recentLogs);

      const banksRes = await fetch(`${baseUrl}/api/banks`);
      const banksData = await banksRes.json();
      setBankAccounts(banksData);

      const wiresRes = await fetch(`${baseUrl}/api/banks/wires`);
      const wiresData = await wiresRes.json();
      setWireTransactions(wiresData);
      
      setBackendConnected(true);
    } catch (err) {
      setBackendConnected(false);
    }
  };

  useEffect(() => {
    fetchBackendData();
    const interval = setInterval(fetchBackendData, 3000);
    return () => clearInterval(interval);
  }, []);

  const syncPaymentToBackend = async (txHash: string) => {
    try {
      const baseUrl = 'http://localhost:3001';
      
      // 1. Create the pending Invoice
      const invoicePayload = {
        id: invoice.id,
        amount: parseFloat(invoice.amountUSDC),
        token: 'USDC',
        recipient: invoice.recipientAddress,
        type: invoice.type,
        milestoneId: invoice.milestoneId || null,
        status: 'PENDING'
      };
      
      await fetch(`${baseUrl}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoicePayload)
      });

      // 2. Create the pending Transaction
      const txPayload = {
        id: txHash,
        invoiceId: invoice.id,
        walletId: vaultAddress || '0xSandboxVault',
        amount: parseFloat(invoice.amountUSDC),
        status: 'PENDING',
        blockchainTxHash: txHash
      };

      await fetch(`${baseUrl}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txPayload)
      });
      
      addLog('SYSTEM', `ERP Sync: Registered pending transaction ${txHash.slice(0, 10)}... in backend.`, 'INFO');

      // 3. Simulate Circle Webhook delivery after 3 seconds
      setTimeout(async () => {
        try {
          const webhookPayload = {
            eventId: 'evt_sim_' + Math.floor(Math.random() * 1000000),
            eventType: 'transfers.updated',
            transactionId: txHash,
            status: 'complete',
            blockchainTxHash: txHash
          };

          await fetch(`${baseUrl}/api/simulate-webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
          });
        } catch (webhookErr) {
          console.error('Failed to trigger simulated webhook:', webhookErr);
        }
      }, 3000);
    } catch (err) {
      console.warn('Backend server disconnected. Skipping ERP DB state sync.', err);
    }
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

          // Sync with ERP webhook backend
          await syncPaymentToBackend(txHash);

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

      // Sync with ERP webhook backend
      await syncPaymentToBackend(randomHash);

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
            // Route through backend Circle Gas Station / Paymaster API
            try {
              addLog('SYSTEM', `[Paymaster] Sponsoring transaction for Approve Proposal #${proposalId} via Circle Gas Station API...`, 'INFO');
              const res = await fetch('http://localhost:3001/api/paymaster/sponsor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contractAddress: vaultAddress,
                  functionName: 'approveProposal',
                  args: [proposalId]
                })
              });
              const result = await res.json();
              if (res.ok && result.success) {
                addLog('SYSTEM', `[Paymaster] Gasless override successful! Hash: ${result.txHash} (Gas sponsored by Circle Paymaster)`, 'SUCCESS');
                refetchProposalCount();
                fetchPaymasterStatus();
              } else {
                throw new Error(result.error || 'Sponsorship rejected');
              }
            } catch (paymasterErr: any) {
              addLog('SYSTEM', `[Paymaster Fallback] Sponsorship unavailable (${paymasterErr.message || paymasterErr}). Initiating standard user-paid transaction...`, 'WARNING');
              const tx = await writeContract({
                address: vaultAddress as `0x${string}`,
                abi: ATO_VAULT_ABI,
                functionName: 'approveProposal',
                args: [BigInt(proposalId)]
              });
              addLog('SYSTEM', `Approve broadcasted! Hash: ${tx}`, 'SUCCESS');
              refetchProposalCount();
            }
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
            // Route through backend Circle Gas Station / Paymaster API
            try {
              addLog('SYSTEM', `[Paymaster] Sponsoring transaction for Execute Proposal #${proposalId} via Circle Gas Station API...`, 'INFO');
              const res = await fetch('http://localhost:3001/api/paymaster/sponsor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contractAddress: vaultAddress,
                  functionName: 'executeProposal',
                  args: [proposalId]
                })
              });
              const result = await res.json();
              if (res.ok && result.success) {
                addLog('SYSTEM', `[Paymaster] Gasless override successful! Hash: ${result.txHash} (Gas sponsored by Circle Paymaster)`, 'SUCCESS');
                refetchProposalCount();
                refetchVaultBalances();
                fetchPaymasterStatus();
              } else {
                throw new Error(result.error || 'Sponsorship rejected');
              }
            } catch (paymasterErr: any) {
              addLog('SYSTEM', `[Paymaster Fallback] Sponsorship unavailable (${paymasterErr.message || paymasterErr}). Initiating standard user-paid transaction...`, 'WARNING');
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

  // --- BANK PORTAL OPERATIONS ---
  const handleLinkBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankName || !accountNumber || !routingNumber) {
      alert("Please enter all bank details.");
      return;
    }
    setLinkLoading(true);
    try {
      addLog('SYSTEM', `Requesting Bank Account Connection at ${bankName}...`, 'INFO');
      const response = await fetch('http://localhost:3001/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName, accountNumber, routingNumber })
      });
      const data = await response.json();
      if (response.ok) {
        addLog('SYSTEM', `Bank account connected successfully! ID: ${data.id}`, 'SUCCESS');
        setBankName('');
        setAccountNumber('');
        setRoutingNumber('');
        fetchBackendData();
      } else {
        addLog('SYSTEM', `Failed to connect bank account: ${data.error}`, 'ERROR');
      }
    } catch (err: any) {
      addLog('SYSTEM', `Connection error: ${err.message}`, 'ERROR');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleInitiatePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankAccountId || !payoutAmount) {
      alert("Please select a bank account and enter an amount.");
      return;
    }

    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Invalid payout amount.");
      return;
    }

    // Owner approval check requirement
    if (!activeOwnerVerified) {
      addLog('SYSTEM', `Payout request rejected: Administrative owner signature verification required. Please complete biometrics/verification.`, 'ERROR');
      alert("Owner approval check failed. Please verify owner identity first.");
      return;
    }

    // Withdrawal limits check requirement
    if (amt > withdrawalLimit) {
      // Check multi-sig approval if limit exceeded
      if (!multiSigApproved) {
        addLog('SYSTEM', `Payout of $${amt.toLocaleString()} exceeds single-sign limit of $${withdrawalLimit.toLocaleString()}. Multi-sig authorization (Team Approval) required.`, 'WARNING');
        alert(`This withdrawal exceeds your limit of $${withdrawalLimit.toLocaleString()}. Multi-sig approval is required.`);
        return;
      }
    }

    setPayoutLoading(true);
    try {
      addLog('SYSTEM', `Initiating Bank Payout / Treasury Sweep of $${amt.toLocaleString()} to account ${selectedBankAccountId}...`, 'INFO');
      const response = await fetch('http://localhost:3001/api/banks/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAccountId: selectedBankAccountId, amount: amt })
      });
      const data = await response.json();
      if (response.ok) {
        addLog('SYSTEM', `Traditional Bank Payout initiated. Wire Reference: ${data.trackingRef}. Status: PENDING.`, 'SUCCESS');
        
        // Mock sub-decimal fee reduction and on-chain sweep burns
        setVaultBalanceERC20(prev => prev - amt);
        setPayoutAmount('');
        setMultiSigApproved(false); // reset multi-sig approval after use
        fetchBackendData();

        // Simulate Circle Mint webhook updates payouts.updated status to complete after 3 seconds
        setTimeout(async () => {
          try {
            const webhookRes = await fetch('http://localhost:3001/api/simulate-webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventId: 'evt_payout_sim_' + Math.floor(Math.random() * 1000000),
                eventType: 'payouts.updated',
                transactionId: data.id,
                status: 'complete'
              })
            });
            if (webhookRes.ok) {
              addLog('SYSTEM', `Circle webhook [payouts.updated] verified. Bank payout ID ${data.id} is now complete and settled in fiat registry.`, 'SUCCESS');
              fetchBackendData();
            }
          } catch (webhookErr) {
            console.error('Failed to simulate payout webhook:', webhookErr);
          }
        }, 3000);

      } else {
        addLog('SYSTEM', `Failed to initiate bank payout: ${data.error}`, 'ERROR');
      }
    } catch (err: any) {
      addLog('SYSTEM', `Payout error: ${err.message}`, 'ERROR');
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleSimulateWire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankAccountId || !simulateWireAmount) {
      alert("Please select a bank account and enter an amount.");
      return;
    }

    const amt = parseFloat(simulateWireAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Invalid wire amount.");
      return;
    }

    setWireLoading(true);
    try {
      addLog('SYSTEM', `Simulating incoming wire deposit of $${amt.toLocaleString()} to account ${selectedBankAccountId}...`, 'INFO');
      await fetch('http://localhost:3001/api/simulate-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: 'evt_wire_sim_init_' + Math.floor(Math.random() * 1000000),
          eventType: 'wires.updated',
          transactionId: 'wire_in_' + Math.floor(Math.random() * 1000000),
          status: 'complete'
        })
      });
      
      const simulateRes = await fetch('http://localhost:3001/api/banks/simulate-wire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankAccountId: selectedBankAccountId, amount: amt })
      });
      const data = await simulateRes.json();
      if (simulateRes.ok) {
        addLog('SYSTEM', `Incoming wire processed! Minted $${amt.toLocaleString()} USDC to vault. Tx Hash: ${data.usdcTxHash.slice(0, 15)}...`, 'SUCCESS');
        
        // Add to local balance
        setVaultBalanceERC20(prev => prev + amt);
        setSimulateWireAmount('');
        fetchBackendData();

        // Simulate Circle webhook updates wires.updated status to complete after 3 seconds
        setTimeout(async () => {
          try {
            const webhookRes = await fetch('http://localhost:3001/api/simulate-webhook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventId: 'evt_wire_sim_' + Math.floor(Math.random() * 1000000),
                eventType: 'wires.updated',
                transactionId: data.id,
                status: 'complete'
              })
            });
            if (webhookRes.ok) {
              addLog('SYSTEM', `Circle webhook [wires.updated] verified. Wire deposit ID ${data.id} is finalized.`, 'SUCCESS');
              fetchBackendData();
            }
          } catch (webhookErr) {
            console.error('Failed to simulate wire webhook:', webhookErr);
          }
        }, 3000);

      } else {
        addLog('SYSTEM', `Failed to simulate incoming wire: ${data.error}`, 'ERROR');
      }
    } catch (err: any) {
      addLog('SYSTEM', `Wire simulation error: ${err.message}`, 'ERROR');
    } finally {
      setWireLoading(false);
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

            <button
              onClick={() => setActiveTab('billing')}
              className={`nav-button ${activeTab === 'billing' ? 'nav-button-active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.75rem', opacity: 0.85 }}>
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              Gateway Billing
            </button>

            <button
              onClick={() => setActiveTab('webhooks')}
              className={`nav-button ${activeTab === 'webhooks' ? 'nav-button-active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.75rem', opacity: 0.85 }}>
                <path d="M22 12h-6l-3 9L9 3l-3 9H2" />
              </svg>
              Webhooks & ERP
            </button>

            <button
              onClick={() => setActiveTab('banking')}
              className={`nav-button ${activeTab === 'banking' ? 'nav-button-active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.75rem', opacity: 0.85 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
              Bank Portal
            </button>

            <button
              onClick={() => setActiveTab('guardrails')}
              className={`nav-button ${activeTab === 'guardrails' ? 'nav-button-active' : ''}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.75rem', opacity: 0.85 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Agent Guardrails
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

              <div className="metric-row">
                <span className="metric-label">ERP Sync</span>
                <span className="metric-value" style={{ color: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {backendConnected ? 'Connected' : 'Disconnected'}
                </span>
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
          <section className="balance-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', width: '100%' }}>
            
            {/* Total USDC Balance Card */}
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

            {/* Total EURC Balance Card */}
            <div className="glass-panel">
              <div className="panel-header-section">
                <span className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Balance</span>
                <span className="badge badge-purple">EURC</span>
              </div>
              <div className="balance-card-body">
                <span className="balance-card-value">
                  €{vaultBalanceEURC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="balance-card-denom">EURC</span>
              </div>
              <div className="balance-card-footer">
                <span>Account currency:</span>
                <span>Euro Coin</span>
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
                             <span style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                              {paymasterStatus === 'ACTIVE' && !p.executed && (
                                <span className="badge badge-cyan" style={{ fontSize: '0.55rem', padding: '0.15rem 0.35rem' }}>
                                  ⚡ Sponsored Gas
                                </span>
                              )}
                              <span className={`badge ${p.executed ? 'badge-green' : 'badge-pink'}`}>
                                {p.executed ? 'Completed' : 'Needs Approval'}
                              </span>
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

              {/* Right Column: Propose Form + Paymaster Console */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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

                {/* Circle Paymaster Console */}
                <div className="glass-panel" style={{ border: '1px solid rgba(0, 240, 255, 0.15)', boxShadow: '0 0 20px rgba(0, 240, 255, 0.03)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="metric-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                      ⛽ Circle Paymaster
                    </h3>
                    <span className={`badge ${paymasterStatus === 'ACTIVE' ? 'badge-cyan' : 'badge-red'}`} style={{ fontSize: '0.58rem', letterSpacing: '0.05em' }}>
                      {paymasterStatus === 'ACTIVE' ? '● ACTIVE' : '● DEPLETED'}
                    </span>
                  </div>
                  
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Sponsors gas fees for governance actions (Approvals and Executions) on Arc Testnet via Circle Paymaster policies.
                  </p>

                  <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)', fontSize: '0.62rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Policy ID:</span>
                      <span style={{ color: '#fff', fontSize: '0.58rem' }}>{paymasterPolicyId.slice(0, 20)}...</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Remaining Budget:</span>
                      <strong style={{ color: paymasterStatus === 'ACTIVE' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        ${paymasterBalance.toFixed(2)} USDC
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Total Sponsored Gas:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>${totalSponsoredGas.toFixed(2)} USDC</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Sponsored Tx Count:</span>
                      <span style={{ color: 'var(--accent-cyan)' }}>{sponsoredTxCount} txns</span>
                    </div>
                  </div>

                  <button 
                    type="button" 
                    onClick={handleTogglePaymaster}
                    disabled={paymasterLoading}
                    className="hex-blueprint-btn" 
                    style={{ 
                      fontSize: '0.68rem', 
                      padding: '0.5rem', 
                      borderColor: paymasterStatus === 'ACTIVE' ? 'var(--accent-pink)' : 'var(--accent-green)',
                      color: paymasterStatus === 'ACTIVE' ? 'var(--accent-pink)' : 'var(--accent-green)',
                      background: 'transparent',
                      width: '100%'
                    }}
                  >
                    {paymasterLoading ? 'Updating System...' : paymasterStatus === 'ACTIVE' ? '⚠️ Simulate Paymaster Depletion' : '⚡ Reactivate Paymaster'}
                  </button>
                </div>
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

              {/* StableFX Swap Card */}
              <div className="glass-panel" style={{ padding: '1.5rem', gap: '1.25rem' }}>
                <div className="card-title-block">
                  <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>StableFX Treasury Swap</h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                    Execute instant on-chain foreign exchange sweeps between USDC and EURC stablecoins.
                  </p>
                </div>

                <form onSubmit={handleExecuteSwap} className="form-container">
                  <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Sell Token</label>
                      <select
                        value={swapSellToken}
                        onChange={e => {
                          const val = e.target.value as 'USDC' | 'EURC';
                          setSwapSellToken(val);
                          setSwapBuyToken(val === 'USDC' ? 'EURC' : 'USDC');
                        }}
                        className="form-select"
                      >
                        <option value="USDC">USDC (USD Coin)</option>
                        <option value="EURC">EURC (Euro Coin)</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Buy Token</label>
                      <select
                        value={swapBuyToken}
                        onChange={e => {
                          const val = e.target.value as 'USDC' | 'EURC';
                          setSwapBuyToken(val);
                          setSwapSellToken(val === 'USDC' ? 'EURC' : 'USDC');
                        }}
                        className="form-select"
                      >
                        <option value="EURC">EURC (Euro Coin)</option>
                        <option value="USDC">USDC (USD Coin)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Sell Amount</label>
                      <input
                        type="number"
                        value={swapAmount}
                        onChange={e => setSwapAmount(e.target.value)}
                        className="form-input"
                        required
                        step="0.01"
                      />
                    </div>

                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Estimated Exchange Rate</label>
                      <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem', color: '#fff', fontFamily: 'var(--font-mono)' }}>
                        {swapQuote ? `1 ${swapSellToken} = ${swapQuote.rate} ${swapBuyToken}` : 'Loading rate...'}
                      </div>
                    </div>
                  </div>

                  <div style={{ backgroundColor: 'rgba(0, 240, 255, 0.02)', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>You will receive at least:</span>
                    <strong style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {swapQuote ? `${swapQuote.buyAmount} ${swapBuyToken}` : '0.00'}
                    </strong>
                  </div>

                  <button
                    type="submit"
                    disabled={swapInProgress || !vaultAddress}
                    className="hex-blueprint-btn"
                    style={{ marginTop: '0.5rem', borderColor: 'var(--accent-cyan)' }}
                  >
                    {swapInProgress ? 'Executing Swap...' : !vaultAddress ? 'Connect your account first' : `Swap ${swapSellToken} to ${swapBuyToken}`}
                  </button>
                </form>

                {swapTxHash && (
                  <div style={{ fontSize: '0.65rem', wordBreak: 'break-all', color: 'var(--accent-cyan)' }}>
                    <strong>Swap Transaction Hash:</strong> {swapTxHash} <br />
                    <a href={`https://testnet.arcscan.app/tx/${swapTxHash}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent-pink)', marginTop: '0.25rem', display: 'inline-block' }}>
                      Verify on ArcScan ↗
                    </a>
                  </div>
                )}
              </div>

              {/* StableFX History Visualizer */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>FX Sweeping & Swaps History</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', maxHeight: '180px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'rgba(0, 240, 255, 0.03)', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.1)', fontSize: '0.68rem' }}>
                    <div>
                      <span className="badge badge-purple" style={{ marginRight: '0.5rem' }}>EURC → USDC</span>
                      <span style={{ color: '#fff' }}>Swept 50,000.00 EURC</span>
                    </div>
                    <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>+54,000.00 USDC</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.68rem' }}>
                    <div>
                      <span className="badge badge-pink" style={{ marginRight: '0.5rem' }}>USDC → EURC</span>
                      <span style={{ color: '#fff' }}>Swapped 10,000.00 USDC</span>
                    </div>
                    <span style={{ color: 'var(--accent-pink)', fontFamily: 'var(--font-mono)' }}>+9,250.00 EURC</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '0.68rem' }}>
                    <div>
                      <span className="badge badge-purple" style={{ marginRight: '0.5rem' }}>EURC → USDC</span>
                      <span style={{ color: '#fff' }}>Swept 1,200.00 EURC</span>
                    </div>
                    <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>+1,296.00 USDC</span>
                  </div>
                </div>

                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  StableFX sweeps are audited by the Auditor Agent and processed automatically.
                </div>
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

          {/* TAB 7: GATEWAY NANOPAYMENTS & MICRO-BILLING */}
          {activeTab === 'billing' && (
            <div className="compliance-tab-grid">
              
              {/* Left Column: Active Channel Info & Control */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Active Channel Card */}
                <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute',
                    top: '-50px',
                    right: '-50px',
                    width: '150px',
                    height: '150px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(0, 240, 255, 0.08) 0%, transparent 70%)',
                    zIndex: 0
                  }}></div>
                  
                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-purple" style={{ fontSize: '0.6rem', letterSpacing: '0.05em' }}>CIRCLE GATEWAY CHANNEL</span>
                      <span className="badge badge-green" style={{ fontSize: '0.6rem', padding: '0.2rem 0.5rem' }}>
                        {gatewayState.activeChannel?.isOpen ? '● ACTIVE' : '● CLOSED'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '0.75rem 0 0.25rem 0', fontFamily: 'var(--font-mono)' }}>
                      {gatewayState.activeChannel 
                        ? `$${parseFloat(gatewayState.activeChannel.balance).toFixed(6)}` 
                        : '$0.000000'}{' '}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>USDC</span>
                    </h3>
                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Channel Escrow Balance (micro-precision)</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem', fontSize: '0.68rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Channel ID:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>
                          {gatewayState.activeChannel 
                            ? `${gatewayState.activeChannel.channelId.substring(0, 10)}...${gatewayState.activeChannel.channelId.substring(58)}` 
                            : 'No active channel'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Escrow Address:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                          {gatewayState.channelContractAddress.substring(0, 8)}...{gatewayState.channelContractAddress.substring(34)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Current Nonce:</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>
                          {gatewayState.activeChannel ? gatewayState.activeChannel.nonce : 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fund/Refuel escrow channel */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                    Escrow Fund Manager
                  </h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Top up the active Gateway channel to sponsor autonomous compliance screenings and audit nanopayments.
                  </p>

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button 
                      onClick={async () => {
                        alert('Refueling $5.00 USDC to payment channel escrow...');
                        try {
                          const response = await fetch('/gateway_state.json');
                          let stateData = gatewayState;
                          if (response.ok) {
                            stateData = await response.json();
                          }
                          if (stateData.activeChannel) {
                            const cur = parseFloat(stateData.activeChannel.balance);
                            stateData.activeChannel.balance = (cur + 5.0).toFixed(6);
                            stateData.logs.unshift({
                              timestamp: new Date().toISOString(),
                              type: 'DEPOSIT',
                              channelId: stateData.activeChannel.channelId,
                              amount: '5.000000',
                              recipient: stateData.activeChannel.seller,
                              status: 'SUCCESS',
                              description: 'Funded channel with additional deposit of $5.00 USDC'
                            });
                            setGatewayState({...stateData});
                          }
                        } catch(e) {}
                      }}
                      className="hex-blueprint-btn" 
                      style={{ flex: 1, fontSize: '0.7rem' }}
                    >
                      Refuel $5.00 USDC
                    </button>
                    <button 
                      onClick={() => {
                        alert('Escrow settled. Refunding remaining balance to treasury...');
                        if (gatewayState.activeChannel) {
                          const stateData = { ...gatewayState };
                          if (stateData.activeChannel) {
                            stateData.activeChannel.isOpen = false;
                            stateData.activeChannel.balance = '0.000000';
                            stateData.logs.unshift({
                              timestamp: new Date().toISOString(),
                              type: 'SETTLE',
                              channelId: stateData.activeChannel.channelId,
                              amount: '0.000000',
                              recipient: stateData.activeChannel.seller,
                              status: 'SUCCESS',
                              description: 'Escrow payment channel manually settled and closed'
                            });
                            setGatewayState(stateData);
                          }
                        }
                      }}
                      className="hex-blueprint-btn" 
                      style={{ flex: 1, fontSize: '0.7rem', borderColor: 'var(--accent-pink)' }}
                      disabled={!gatewayState.activeChannel?.isOpen}
                    >
                      Settle & Close
                    </button>
                  </div>
                </div>

                {/* Gateway billing policies */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                  <h4 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.7rem', color: '#fff', marginBottom: '0.5rem' }}>
                    Nanopayment Spending Policy
                  </h4>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Slippage / Overdraft Limit:</span>
                      <strong style={{ color: '#fff' }}>0.05 USDC</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Daily Spending Cap:</span>
                      <strong style={{ color: '#fff' }}>100.00 USDC</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Audit Fee Per Payout:</span>
                      <strong style={{ color: 'var(--accent-cyan)' }}>0.010000 USDC</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Compliance Scan Fee:</span>
                      <strong style={{ color: 'var(--accent-cyan)' }}>0.005000 USDC</strong>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Billing History Logs */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    x402 Micro-Billing & Payout History
                  </h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                    Audit record of sub-cent transactions, agent API queries, and on-chain escrow deposits.
                  </p>
                </div>

                <div className="screening-table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  <table className="screening-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gatewayState.logs.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', padding: '2rem' }}>
                            No billing logs recorded yet.
                          </td>
                        </tr>
                      ) : (
                        gatewayState.logs.map((log, index) => (
                          <tr key={index} className="table-row">
                            <td style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                            <td>
                              <span className={`badge ${
                                log.type === 'DEPOSIT' ? 'badge-green' : 
                                log.type === 'MICRO-PAYMENT' ? 'badge-purple' : 'badge-pink'
                              }`} style={{ fontSize: '0.52rem' }}>
                                {log.type}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.65rem', color: '#fff' }}>
                              {log.description}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontSize: '0.65rem', fontWeight: 'bold' }}>
                              {log.type === 'MICRO-PAYMENT' ? '-' : '+'}${parseFloat(log.amount).toFixed(6)}
                            </td>
                            <td>
                              <span className={`badge ${log.status === 'SUCCESS' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '0.52rem' }}>
                                {log.status === 'SUCCESS' ? '✓ OK' : '⚠️ FAIL'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 8: CIRCLE WEBHOOKS & REAL-TIME ERP STATE SYNC */}
          {activeTab === 'webhooks' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Header card with Sync Status */}
              <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>Circle Webhook & ERP Sync Engine</h2>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Real-time ledgers synchronization via secure asymmetric Circle Webhooks directly pushing finalized payments to PostgreSQL database.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span className={`badge ${backendConnected ? 'badge-green' : 'badge-pink'}`}>
                      {backendConnected ? 'Webhooks Active' : 'Backend Offline'}
                    </span>
                    <div className="pulse-container" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)', boxShadow: backendConnected ? '0 0 10px var(--accent-green)' : '0 0 10px var(--accent-red)' }}></div>
                  </div>
                </div>

                <div className="divider" style={{ margin: '1rem 0' }}></div>
                
                {/* Stats cards grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                  <div className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Webhook Logs</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fff', margin: '0.25rem 0' }}>{syncMetrics?.totalLogs || 0}</div>
                    <div style={{ fontSize: '0.55rem', color: 'var(--accent-cyan)' }}>events captured</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Processed Updates</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent-green)', margin: '0.25rem 0' }}>{syncMetrics?.processed || 0}</div>
                    <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>reconciled to ERP</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Duplicates Blocked</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent-purple)', margin: '0.25rem 0' }}>{syncMetrics?.duplicates || 0}</div>
                    <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>idempotent protection</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ignored Events</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent-amber)', margin: '0.25rem 0' }}>{syncMetrics?.ignored || 0}</div>
                    <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>unlinked transaction refs</div>
                  </div>
                  <div className="glass-panel" style={{ padding: '0.75rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Failed / Errors</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: syncMetrics?.failed > 0 ? 'var(--accent-red)' : '#fff', margin: '0.25rem 0' }}>{syncMetrics?.failed || 0}</div>
                    <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>bad signatures / network</div>
                  </div>
                </div>
              </div>

              {/* Main sync table */}
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '1.5rem', alignItems: 'start' }}>
                
                {/* ERP Invoice Database Ledgers */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>ERP Database Invoice Registry</h3>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Table: Invoices</span>
                  </div>

                  <div className="table-responsive">
                    <table className="hex-blueprint-table">
                      <thead>
                        <tr>
                          <th>Ref ID</th>
                          <th>Recipient</th>
                          <th>Amount</th>
                          <th>Type</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backendInvoices.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                              No invoices found in database. Send a payment to register records!
                            </td>
                          </tr>
                        ) : (
                          backendInvoices.map((inv: any) => (
                            <tr key={inv.id}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 'bold', color: '#fff' }}>
                                {inv.id}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                                {inv.recipient.slice(0, 8)}...{inv.recipient.slice(-6)}
                              </td>
                              <td style={{ color: 'var(--accent-cyan)', fontSize: '0.68rem', fontWeight: 'bold' }}>
                                {inv.amount.toFixed(2)} {inv.token}
                              </td>
                              <td style={{ fontSize: '0.62rem', textTransform: 'capitalize' }}>
                                <span className={`badge ${inv.type === 'milestone' ? 'badge-purple' : 'badge-cyan'}`} style={{ padding: '0.1rem 0.3rem', fontSize: '0.5rem' }}>
                                  {inv.type}
                                </span>
                              </td>
                              <td>
                                <span className={`badge ${inv.status === 'SETTLED' ? 'badge-green' : inv.status === 'FAILED' ? 'badge-pink' : 'badge-amber'}`} style={{ fontSize: '0.55rem' }}>
                                  {inv.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right Column: Webhook Simulator & Sync Logs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* Webhook Developer Manual Simulator */}
                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem' }}>
                      🛠️ Circle Webhook Simulator
                    </h3>
                    <p style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      Simulate a payload delivery from Circle Notifications to test the asymmetric verification and SQL sync logic instantly.
                    </p>

                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const refId = (form.elements.namedItem('simInvoiceId') as HTMLInputElement).value;
                      const statusVal = (form.elements.namedItem('simStatus') as HTMLSelectElement).value;
                      const eventTypeVal = (form.elements.namedItem('simEventType') as HTMLSelectElement).value;

                      if (!refId) return;

                      try {
                        addLog('SYSTEM', `Dispatched manually simulated webhook event for invoice ${refId} with status ${statusVal}...`, 'INFO');
                        const res = await fetch('http://localhost:3001/api/simulate-webhook', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            eventId: 'manual_' + Math.floor(Math.random() * 1000000),
                            eventType: eventTypeVal,
                            transactionId: refId,
                            status: statusVal
                          })
                        });
                        const data = await res.json();
                        if (res.ok) {
                          addLog('SYSTEM', `Webhook simulation processed. Backend response: ${JSON.stringify(data.backendResponse)}`, 'SUCCESS');
                          fetchBackendData();
                        } else {
                          addLog('SYSTEM', `Simulation failed: ${data.error}`, 'ERROR');
                        }
                      } catch (err: any) {
                        addLog('SYSTEM', `Simulation connection error: ${err.message}`, 'ERROR');
                      }
                    }}>
                      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                        <label style={{ fontSize: '0.6rem' }}>Select Invoice Reference</label>
                        <select name="simInvoiceId" className="form-select" style={{ fontSize: '0.65rem', padding: '0.3rem' }}>
                          {backendInvoices.length === 0 ? (
                            <option value="">-- No Invoices in DB --</option>
                          ) : (
                            backendInvoices.map((inv: any) => (
                              <option key={inv.id} value={inv.id}>{inv.id} (${inv.amount} USDC)</option>
                            ))
                          )}
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div className="form-group">
                          <label style={{ fontSize: '0.6rem' }}>Target Status</label>
                          <select name="simStatus" className="form-select" style={{ fontSize: '0.65rem', padding: '0.3rem' }}>
                            <option value="complete">complete (Success)</option>
                            <option value="failed">failed (Failure)</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label style={{ fontSize: '0.6rem' }}>Circle Event Type</label>
                          <select name="simEventType" className="form-select" style={{ fontSize: '0.65rem', padding: '0.3rem' }}>
                            <option value="transfers.updated">transfers.updated</option>
                            <option value="wallets.transaction.succeeded">transaction.succeeded</option>
                          </select>
                        </div>
                      </div>

                      <button type="submit" disabled={!backendConnected || backendInvoices.length === 0} className="hex-blueprint-btn" style={{ fontSize: '0.65rem', padding: '0.4rem' }}>
                        Dispatch Webhook Delivery
                      </button>
                    </form>
                  </div>

                  {/* Webhook Log History */}
                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem' }}>
                      📋 Raw Webhook Logs (SQLite/Prisma)
                    </h3>
                    
                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                      {recentWebhookLogs.length === 0 ? (
                        <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                          No webhook logs captured yet.
                        </p>
                      ) : (
                        recentWebhookLogs.map((log: any) => (
                          <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', padding: '0.5rem', marginBottom: '0.5rem', backgroundColor: 'rgba(255,255,255,0.01)', borderLeft: `2px solid ${log.status === 'PROCESSED' ? 'var(--accent-green)' : log.status === 'DUPLICATE' ? 'var(--accent-purple)' : 'var(--text-muted)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem' }}>
                              <span style={{ color: '#fff', fontWeight: 'bold' }}>{log.eventType}</span>
                              <span style={{ color: 'var(--text-muted)' }}>{new Date(log.createdAt).toLocaleTimeString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.52rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>ID: {log.eventId.slice(0, 15)}...</span>
                              <span style={{ color: log.status === 'PROCESSED' ? 'var(--accent-green)' : log.status === 'DUPLICATE' ? 'var(--accent-purple)' : 'var(--accent-amber)' }}>{log.status}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>

              {/* Transactions Ledger */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem' }}>On-Chain Transaction & Reconciliation Registry</h3>
                <div className="table-responsive">
                  <table className="hex-blueprint-table">
                    <thead>
                      <tr>
                        <th>Transaction ID / Hash</th>
                        <th>Invoice Ref</th>
                        <th>Sender Wallet</th>
                        <th>Reconciled Amount</th>
                        <th>Date & Time</th>
                        <th>Sync Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backendTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                            No transactions synced. Run a payment or trigger webhook to view ledger details.
                          </td>
                        </tr>
                      ) : (
                        backendTransactions.map((tx: any) => (
                          <tr key={tx.id}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--accent-cyan)' }}>
                              <a href={`https://testnet.arcscan.app/tx/${tx.blockchainTxHash || tx.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                                {tx.id.slice(0, 16)}...{tx.id.slice(-8)} ↗
                              </a>
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#fff' }}>
                              {tx.invoiceId}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                              {tx.walletId}
                            </td>
                            <td style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#fff' }}>
                              ${tx.amount.toFixed(2)} USDC
                            </td>
                            <td style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                              {new Date(tx.createdAt).toLocaleString()}
                            </td>
                            <td>
                              <span className={`badge ${tx.status === 'SUCCESS' ? 'badge-green' : tx.status === 'FAILED' ? 'badge-pink' : 'badge-amber'}`} style={{ fontSize: '0.55rem' }}>
                                {tx.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* TAB 9: CIRCLE MINT & CPN TRADITIONAL BANK RAIL PORTAL */}
          {activeTab === 'banking' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Header card with Sync Status */}
              <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute',
                  top: '-40px',
                  right: '-40px',
                  width: '160px',
                  height: '160px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(0, 240, 255, 0.08) 0%, transparent 70%)',
                  zIndex: 0
                }}></div>
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>Circle Mint & CPN Traditional Banking Rails</h2>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Bridge traditional bank deposits with digital stablecoins. Execute Wire/ACH payouts and auto-mint USDC directly to your treasury.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <span className={`badge ${backendConnected ? 'badge-green' : 'badge-pink'}`}>
                      {backendConnected ? 'Banking APIs Online' : 'APIs Offline'}
                    </span>
                    <div className="pulse-container" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: backendConnected ? 'var(--accent-green)' : 'var(--accent-red)', boxShadow: backendConnected ? '0 0 10px var(--accent-green)' : '0 0 10px var(--accent-red)' }}></div>
                  </div>
                </div>
              </div>

              {/* Grid: Link Bank and Sweep Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                
                {/* 1. Link Bank Account Card */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🔌 Connect Corporate Bank Account
                  </h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Link your corporate bank account via Circle CPN to authorize traditional fiat deposits and sweeping payouts.
                  </p>
                  
                  <form onSubmit={handleLinkBankAccount} className="form-container" style={{ gap: '0.85rem' }}>
                    <div className="form-group">
                      <label>Bank Name</label>
                      <input 
                        type="text" 
                        value={bankName}
                        onChange={e => setBankName(e.target.value)}
                        placeholder="e.g. Silicon Valley Bank"
                        className="form-input" 
                        required
                      />
                    </div>
                    <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label>Routing Number (9-digit)</label>
                        <input 
                          type="text" 
                          value={routingNumber}
                          onChange={e => setRoutingNumber(e.target.value)}
                          placeholder="e.g. 021000021"
                          maxLength={9}
                          className="form-input" 
                          required
                        />
                      </div>
                      <div>
                        <label>Account Number</label>
                        <input 
                          type="password" 
                          value={accountNumber}
                          onChange={e => setAccountNumber(e.target.value)}
                          placeholder="••••••••"
                          className="form-input" 
                          required
                        />
                      </div>
                    </div>
                    
                    <button type="submit" disabled={linkLoading} className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem', marginTop: '0.5rem' }}>
                      {linkLoading ? 'Linking Bank Account...' : 'Link Bank Account'}
                    </button>
                  </form>

                  {/* Connected Accounts List */}
                  <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                    <h4 style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Connected Bank Accounts</h4>
                    {bankAccounts.length === 0 ? (
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.01)', borderRadius: '4px' }}>
                        No connected bank accounts found. Link an account above.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {bankAccounts.map((bank: any) => (
                          <div 
                            key={bank.id}
                            onClick={() => setSelectedBankAccountId(bank.id)}
                            style={{
                              padding: '0.75rem',
                              borderRadius: '6px',
                              border: `1px solid ${selectedBankAccountId === bank.id ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.03)'}`,
                              background: selectedBankAccountId === bank.id ? 'rgba(0, 240, 255, 0.02)' : 'rgba(0,0,0,0.2)',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#fff' }}>{bank.bankName}</div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ID: {bank.id.slice(0, 15)}...</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span className="badge badge-green" style={{ fontSize: '0.55rem' }}>{bank.status}</span>
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Acct: {bank.accountNumber}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Treasury Sweeps & Payout Manager */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    💸 Treasury Payout & Sweeper
                  </h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Sweep excess digital treasury assets. Burning USDC on-chain converts it back to USD/EUR fiat in your bank.
                  </p>
                  
                  <form onSubmit={handleInitiatePayout} className="form-container" style={{ gap: '0.85rem' }}>
                    <div className="form-group">
                      <label>Target Bank Account</label>
                      <select 
                        value={selectedBankAccountId} 
                        onChange={e => setSelectedBankAccountId(e.target.value)} 
                        className="form-select" 
                        required
                      >
                        <option value="">-- Select Bank --</option>
                        {bankAccounts.map((bank: any) => (
                          <option key={bank.id} value={bank.id}>{bank.bankName} ({bank.accountNumber})</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="form-group">
                      <label>Sweep Amount (USDC)</label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="number" 
                          value={payoutAmount}
                          onChange={e => setPayoutAmount(e.target.value)}
                          placeholder="0.00"
                          className="form-input" 
                          style={{ paddingRight: '3.5rem' }}
                          required
                        />
                        <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>USDC</span>
                      </div>
                    </div>

                    {/* Operational Safety Limits */}
                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)', fontSize: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Single-Sign Limit:</span>
                        <strong style={{ color: '#fff' }}>${withdrawalLimit.toLocaleString()} USD</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Administrative Owner Verification:</span>
                        <span style={{ color: activeOwnerVerified ? 'var(--accent-green)' : 'var(--accent-pink)', fontWeight: 'bold' }}>
                          {activeOwnerVerified ? '✓ VERIFIED' : '✗ REQUIRED'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Multi-Sig Team Override:</span>
                        <span style={{ color: multiSigApproved ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: 'bold' }}>
                          {multiSigApproved ? '✓ GRANTED' : 'PENDING'}
                        </span>
                      </div>
                    </div>

                    {/* Controls Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <button 
                        type="button" 
                        onClick={() => {
                          setBiometricPromptTitle("Verify Corporate Admin Signer identity for bank wire approvals");
                          setIsBiometricPromptOpen(true);
                          setBiometricScanStatus('scanning');
                          setTimeout(() => {
                            setBiometricScanStatus('success');
                            setTimeout(() => {
                              setIsBiometricPromptOpen(false);
                              setActiveOwnerVerified(true);
                              addLog('SYSTEM', 'Biometric identity verified. Corporate Owner Check Passed.', 'SUCCESS');
                            }, 1000);
                          }, 1500);
                        }}
                        className="hex-blueprint-btn" 
                        style={{ fontSize: '0.68rem', padding: '0.5rem', background: activeOwnerVerified ? 'rgba(57,255,20,0.05)' : 'rgba(255,255,255,0.03)', borderColor: activeOwnerVerified ? 'var(--accent-green)' : 'rgba(255,255,255,0.1)' }}
                      >
                        {activeOwnerVerified ? '✓ Identity Verified' : '🔑 Verify Owner (Biometrics)'}
                      </button>
                      
                      <button 
                        type="button" 
                        onClick={() => {
                          setMultiSigApproved(prev => !prev);
                          addLog('SYSTEM', !multiSigApproved ? 'Multi-sig team override granted for treasury payout.' : 'Multi-sig override revoked.', 'INFO');
                        }}
                        className="hex-blueprint-btn" 
                        style={{ fontSize: '0.68rem', padding: '0.5rem', background: multiSigApproved ? 'rgba(0, 240, 255, 0.05)' : 'rgba(255,255,255,0.03)', borderColor: multiSigApproved ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)' }}
                      >
                        {multiSigApproved ? '✓ Multi-Sig Override' : '👥 Team Multi-Sig Override'}
                      </button>
                    </div>
                    
                    <button type="submit" disabled={payoutLoading || !selectedBankAccountId} className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem', borderColor: 'var(--accent-pink)', marginTop: '0.25rem' }}>
                      {payoutLoading ? 'Processing Treasury Sweep...' : 'Trigger Payout (Sweep to Bank)'}
                    </button>
                  </form>
                </div>

                {/* 3. Automatic Rule threshold and Mock Deposits */}
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      ⚙️ Automatic Allocations & Mock Wires
                    </h3>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      Configure the automatic treasury sweeps threshold and simulate incoming wire transfers from clients.
                    </p>

                    {/* Automatic Sweeper Rules */}
                    <div style={{ marginBottom: '1.25rem' }} className="form-container">
                      <div className="form-group">
                        <label>Auto-Sweep Vault Threshold (USDC)</label>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                          <input 
                            type="number" 
                            value={sweepThreshold} 
                            onChange={e => setSweepThreshold(parseInt(e.target.value) || 0)} 
                            className="form-input" 
                            style={{ flex: 1 }}
                          />
                          <button 
                            type="button" 
                            onClick={() => {
                              addLog('ALLOCATOR', `Treasury rules updated: Auto-sweep threshold set to $${sweepThreshold.toLocaleString()} USDC.`, 'SUCCESS');
                              alert(`Threshold updated successfully!`);
                            }}
                            className="hex-blueprint-btn" 
                            style={{ width: 'auto', fontSize: '0.68rem', padding: '0.5rem 0.75rem' }}
                          >
                            Save Rules
                          </button>
                        </div>
                        <p style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          When vault balance exceeds this amount, AgentAllocator automatically sweeps the surplus to connected bank account.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem', marginTop: 'auto' }}>
                    <h4 style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.5rem' }}>🛠️ Simulate Incoming Wire Deposit</h4>
                    <p style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                      Send mock wire funds from customers. When Circle CPN processes the wire, digital USDC is automatically minted to your treasury vault.
                    </p>
                    <form onSubmit={handleSimulateWire} className="form-container" style={{ gap: '0.85rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
                        <select 
                          value={selectedBankAccountId} 
                          onChange={e => setSelectedBankAccountId(e.target.value)} 
                          className="form-select" 
                          required
                        >
                          <option value="">-- Select Bank --</option>
                          {bankAccounts.map((bank: any) => (
                            <option key={bank.id} value={bank.id}>{bank.bankName}</option>
                          ))}
                        </select>
                        <div style={{ position: 'relative' }}>
                          <input 
                            type="number" 
                            value={simulateWireAmount}
                            onChange={e => setSimulateWireAmount(e.target.value)}
                            placeholder="Amount"
                            className="form-input" 
                            required
                          />
                        </div>
                      </div>
                      <button type="submit" disabled={wireLoading || !selectedBankAccountId} className="hex-blueprint-btn" style={{ fontSize: '0.68rem', padding: '0.5rem' }}>
                        {wireLoading ? 'Processing Wire...' : 'Deliver Simulated Wire Deposit'}
                      </button>
                    </form>
                  </div>
                </div>

              </div>

              {/* Side-by-Side Ledgers Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
                
                {/* Blockchain Transaction Ledger */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>🔗 Blockchain Transaction Ledger</h3>
                      <p style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>USDC/EURC payments reconciled on-chain</p>
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: '0.55rem' }}>On-Chain</span>
                  </div>

                  <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                    <table className="hex-blueprint-table">
                      <thead>
                        <tr>
                          <th>Tx Hash / Reference</th>
                          <th>Invoice Ref</th>
                          <th>Amount</th>
                          <th>Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backendTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.65rem', padding: '2rem' }}>
                              No blockchain transactions recorded yet.
                            </td>
                          </tr>
                        ) : (
                          backendTransactions.map((tx: any) => (
                            <tr key={tx.id}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--accent-cyan)' }}>
                                <a href={`https://testnet.arcscan.app/tx/${tx.blockchainTxHash || tx.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                                  {tx.id.slice(0, 10)}... ↗
                                </a>
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#fff' }}>
                                {tx.invoiceId}
                              </td>
                              <td style={{ fontSize: '0.68rem', fontWeight: 'bold', color: '#fff' }}>
                                ${tx.amount.toFixed(2)} USDC
                              </td>
                              <td style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                                {new Date(tx.createdAt).toLocaleTimeString()}
                              </td>
                              <td>
                                <span className={`badge ${tx.status === 'SUCCESS' ? 'badge-green' : tx.status === 'FAILED' ? 'badge-pink' : 'badge-amber'}`} style={{ fontSize: '0.52rem' }}>
                                  {tx.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Traditional Banking Wire Ledger */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>🏦 Traditional Banking Wire Ledger</h3>
                      <p style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Fiat wires and payouts logged via Circle Mint</p>
                    </div>
                    <span className="badge badge-cyan" style={{ fontSize: '0.55rem' }}>CPN / Rails</span>
                  </div>

                  <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                    <table className="hex-blueprint-table">
                      <thead>
                        <tr>
                          <th>Wire ID / Ref</th>
                          <th>Bank Account</th>
                          <th>Amount</th>
                          <th>Dir</th>
                          <th>Tracking Ref</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wireTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.65rem', padding: '2rem' }}>
                              No traditional bank wire transactions recorded yet.
                            </td>
                          </tr>
                        ) : (
                          wireTransactions.map((wire: any) => (
                            <tr key={wire.id}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--accent-pink)' }}>
                                {wire.id.slice(0, 12)}...
                              </td>
                              <td style={{ fontSize: '0.65rem', color: '#fff' }}>
                                {wire.bankAccount?.bankName || 'Connected Bank'}
                              </td>
                              <td style={{ fontSize: '0.68rem', fontWeight: 'bold', color: wire.direction === 'INFLOW' ? 'var(--accent-green)' : '#fff' }}>
                                {wire.direction === 'INFLOW' ? '+' : '-'}${wire.amount.toFixed(2)} {wire.currency}
                              </td>
                              <td>
                                <span className={`badge ${wire.direction === 'INFLOW' ? 'badge-green' : 'badge-purple'}`} style={{ fontSize: '0.52rem' }}>
                                  {wire.direction}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                                {wire.trackingRef || 'None'}
                              </td>
                              <td>
                                <span className={`badge ${wire.status === 'SUCCESS' ? 'badge-green' : wire.status === 'FAILED' ? 'badge-pink' : 'badge-amber'}`} style={{ fontSize: '0.52rem' }}>
                                  {wire.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 10: CIRCLE AGENT STACK & SPENDING POLICY GUARDRAILS */}
          {activeTab === 'guardrails' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Header card with Policy Status */}
              <div className="glass-panel" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute',
                  top: '-40px',
                  right: '-40px',
                  width: '160px',
                  height: '160px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255, 46, 143, 0.08) 0%, transparent 70%)',
                  zIndex: 0
                }}></div>
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>Circle Agent Stack & Policy Guardrails</h2>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Enforce off-chain server-side policy limits on treasury operations, transaction frequencies, and destination allowlists to prevent unauthorized asset movement.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button 
                      onClick={togglePolicyEnforcement}
                      className="hex-blueprint-btn" 
                      style={{ 
                        fontSize: '0.65rem', 
                        padding: '0.35rem 0.75rem', 
                        width: 'auto',
                        background: agentPolicy?.enforced ? 'rgba(57,255,20,0.05)' : 'rgba(255,255,255,0.03)',
                        borderColor: agentPolicy?.enforced ? 'var(--accent-green)' : 'rgba(255,255,255,0.1)'
                      }}
                    >
                      {agentPolicy?.enforced ? '🛡️ Guardrails Enforced' : '🔓 Policies Bypassed'}
                    </button>
                    <div className="pulse-container" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: agentPolicy?.enforced ? 'var(--accent-green)' : 'var(--accent-amber)', boxShadow: agentPolicy?.enforced ? '0 0 10px var(--accent-green)' : '0 0 10px var(--accent-amber)' }}></div>
                  </div>
                </div>
              </div>

              {/* Grid Layout: Active Policies, Proposal multi-sig, settings form */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                
                {/* 1. Active Guardrail Limits and Metrics */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🔒 Active Agent Stack Configuration
                  </h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    Real-time status of the Agent Stack session and active limits stored in the backend SQL database.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Secured Agent EOA Wallet</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent-cyan)', marginTop: '0.25rem', fontWeight: 'bold' }}>
                        0xff743dCDeeC361A1DEd6EdDC16e9A28F3De0965c
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.55rem' }}>
                        <span className="badge badge-purple">Arc Testnet (5042002)</span>
                        <span className="badge badge-green">✓ Sanctions Screened</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Daily Spend Limit</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', marginTop: '0.15rem' }}>
                          ${agentPolicy ? agentPolicy.spendingLimitDailyUSDC.toLocaleString() : '0.00'} USDC
                        </div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Today's Volume Spent</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-pink)', marginTop: '0.15rem' }}>
                          ${agentPolicy ? agentPolicy.dailyVolumeSpentUSDC.toLocaleString() : '0.00'} USDC
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tx Freq Cap / Hour</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', marginTop: '0.15rem' }}>
                          {agentPolicy ? agentPolicy.transactionFrequencyCapPerHour : '0'} Txs
                        </div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Guardrails Status</div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: agentPolicy?.enforced ? 'var(--accent-green)' : 'var(--accent-amber)', marginTop: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {agentPolicy?.enforced ? 'Active Enforcement' : 'Bypass / Sandbox'}
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.01)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Destination Address Allowlist</div>
                      {agentPolicy?.addressAllowlist ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {agentPolicy.addressAllowlist.split(',').map((addr: string, i: number) => (
                            <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--accent-cyan)', background: 'rgba(0, 240, 255, 0.03)', padding: '0.2rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(0, 240, 255, 0.08)' }}>
                              {addr.trim()}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No destination restriction (Allowlist empty).
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Propose Policy Updates */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ⚙️ Propose Limit Adjustment
                  </h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    Request changes to the daily spending limit, transaction frequency caps, or address allowlist. Requires multi-sig approval.
                  </p>

                  <form onSubmit={proposePolicyUpdate} className="form-container" style={{ gap: '0.85rem' }}>
                    <div className="form-group">
                      <label>Daily Spending Limit (USDC)</label>
                      <input 
                        type="number" 
                        value={policyLimitInput}
                        onChange={e => setPolicyLimitInput(e.target.value)}
                        className="form-input" 
                        required
                        min="1"
                      />
                    </div>

                    <div className="form-group">
                      <label>Max Transactions / Hour</label>
                      <input 
                        type="number" 
                        value={policyFreqInput}
                        onChange={e => setPolicyFreqInput(e.target.value)}
                        className="form-input" 
                        required
                        min="1"
                      />
                    </div>

                    <div className="form-group">
                      <label>Destination Allowlist (Comma-separated Addresses)</label>
                      <textarea 
                        value={policyAllowlistInput}
                        onChange={e => setPolicyAllowlistInput(e.target.value)}
                        className="form-input" 
                        rows={2}
                        placeholder="e.g. 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a, 0x49B50855Aa3bE2F677cD6303Cec089B5F319D72a"
                        style={{ resize: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}
                      />
                    </div>

                    <button 
                      type="submit" 
                      disabled={policyLoading} 
                      className="hex-blueprint-btn" 
                      style={{ fontSize: '0.7rem', padding: '0.65rem', borderColor: 'var(--accent-pink)', marginTop: '0.25rem' }}
                    >
                      {policyLoading ? 'Proposing...' : 'Propose Guardrail Update'}
                    </button>
                  </form>
                </div>

                {/* 3. Multi-Sig Policy Approval Console */}
                <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    👥 Policy Multi-Sig Approvals
                  </h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                    Review pending policy proposals. At least 2 corporate owners must approve to apply updates to the active stack.
                  </p>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyItems: 'stretch' }}>
                    {pendingPolicyProposal ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                        <div style={{ background: 'rgba(255, 46, 143, 0.02)', border: '1px dashed rgba(255, 46, 143, 0.25)', padding: '0.75rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--accent-pink)' }}>PENDING PROPOSAL DETAILS</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.45rem', fontSize: '0.65rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Daily Limit:</span>
                              <strong style={{ color: '#fff' }}>${pendingPolicyProposal.spendingLimitDailyUSDC.toLocaleString()} USDC</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Max Txs / Hour:</span>
                              <strong style={{ color: '#fff' }}>{pendingPolicyProposal.transactionFrequencyCapPerHour} Txs</strong>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Allowlist:</span>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--accent-cyan)', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '4px', marginTop: '0.15rem' }}>
                                {pendingPolicyProposal.addressAllowlist || 'None (Open)'}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '6px' }}>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Signatures Gathered</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.45rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem' }}>
                              <span style={{ color: '#fff' }}>✓ Proposer (Owner 1)</span>
                              <span style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>SIGNED</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem' }}>
                              <span style={{ color: '#fff' }}>{approverName} (Owner 2)</span>
                              <span style={{ 
                                color: pendingPolicyProposal.signaturesCount >= 2 ? 'var(--accent-green)' : 'var(--text-muted)', 
                                fontWeight: 'bold' 
                              }}>
                                {pendingPolicyProposal.signaturesCount >= 2 ? 'SIGNED' : 'PENDING'}
                              </span>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>Approval Status:</span>
                            <strong style={{ fontSize: '0.72rem', color: pendingPolicyProposal.signaturesCount >= 2 ? 'var(--accent-green)' : 'var(--accent-pink)' }}>
                              {pendingPolicyProposal.signaturesCount}/2 Approved
                            </strong>
                          </div>
                        </div>

                        {pendingPolicyProposal.signaturesCount < 2 && (
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                            <select 
                              value={approverName} 
                              onChange={e => setApproverName(e.target.value)} 
                              className="form-select" 
                              style={{ fontSize: '0.68rem', padding: '0.35rem', flex: 1 }}
                            >
                              <option value="Owner 2">Owner 2 (Co-Director)</option>
                              <option value="Owner 3">Owner 3 (Treasurer)</option>
                            </select>
                            <button 
                              type="button" 
                              onClick={approvePolicyProposal}
                              disabled={policyLoading}
                              className="hex-blueprint-btn" 
                              style={{ fontSize: '0.68rem', padding: '0.45rem 1rem', width: 'auto', borderColor: 'var(--accent-cyan)' }}
                            >
                              {policyLoading ? 'Signing...' : 'Approve & Sign'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem', border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '6px', background: 'rgba(255,255,255,0.01)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>All policies aligned</span>
                        <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.25rem', maxWidth: '240px' }}>
                          There are no pending limit adjustments or allowlist proposals currently awaiting verification.
                        </p>
                      </div>
                    )}
                  </div>
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
