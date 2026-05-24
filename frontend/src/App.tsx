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
import { parseUnits, formatUnits, isAddress } from 'viem';
import { ATO_VAULT_ABI, ATO_VAULT_BYTECODE } from './contractBytecode';

// --- TS INTERFACES ---
interface Milestone {
  id: number;
  name: string;
  allocatedERC20: number; // 6 decimals standard format
  spentERC20: number;
  timeDeadline: string;
  isActive: boolean;
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

  // Load / Save Vault Address from localStorage
  const [vaultAddress, setVaultAddress] = useState<string>(() => {
    return localStorage.getItem('ato_vault_address') || '';
  });
  const [vaultAddressInput, setVaultAddressInput] = useState<string>('');

  useEffect(() => {
    if (vaultAddress) {
      localStorage.setItem('ato_vault_address', vaultAddress);
    } else {
      localStorage.removeItem('ato_vault_address');
    }
  }, [vaultAddress]);

  // --- STATE CORE ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'multisig' | 'sweeper' | 'milestones' | 'compliance' | 'agents'>('dashboard');
  
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
  const { data: sourceChainUsdcBalanceData, refetch: refetchSourceChainUsdcBalance } = useReadContract({
    address: currentSourceConfig.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: isConnected && chainId === cctpSourceChainId
    }
  });

  // --- READ DEPLOYED VAULT BALANCES ---
  const { data: vaultBalances, refetch: refetchVaultBalances } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'getTreasuryBalances',
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress),
    }
  });

  // --- READ DEPLOYED VAULT MILESTONE COUNT ---
  const { data: milestoneCountVal, refetch: refetchMilestoneCount } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'milestoneCount',
    query: {
      enabled: isConnected && !!vaultAddress && isAddress(vaultAddress),
    }
  });

  // --- READ DEPLOYED VAULT MULTISIG PROPOSAL COUNT ---
  const { data: proposalCountVal, refetch: refetchProposalCount } = useReadContract({
    address: vaultAddress as `0x${string}`,
    abi: ATO_VAULT_ABI,
    functionName: 'proposalCount',
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
  useEffect(() => {
    if (!isConnected || !vaultAddress || !isAddress(vaultAddress) || !milestoneCountVal || !publicClient) return;

    const fetchAllOnChainMilestones = async () => {
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
          });
          list.push({
            id: i,
            name: m[0],
            allocatedERC20: Number(m[1]) / 1e6,
            spentERC20: Number(m[2]) / 1e6,
            timeDeadline: new Date(Number(m[3]) * 1000).toISOString().split('T')[0],
            isActive: m[4]
          });
        } catch (err) {
          console.error(`Error reading milestone ${i}:`, err);
        }
      }
      setMilestones(list);
      addLog('SYSTEM', 'On-chain milestone allocations synchronized successfully.', 'SUCCESS');
    };

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
    try {
      addLog('RISK_OFFICER', `Broadcasting blocklist change: address ${targetAddr} set to ${!currentBlockStatus}...`, 'INFO');
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
    } catch (err: any) {
      addLog('RISK_OFFICER', `Transaction failed: ${err.message || err}`, 'ERROR');
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
        let txHash;
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
        
        // Wait for receipt
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        
        setTxReceipt({
          txHash: txHash,
          gasPaid: '0.00 USDC',
          finalityMs: 580
        });

        refetchVaultBalances();
        refetchMilestoneCount();

        setPipelineStep(4);
        addLog('SYSTEM', `Arc L1 transaction finalized successfully.`, 'SUCCESS');
        addLog('AUDITOR', `Ledgers reconciled. Balance updated successfully.`, 'SUCCESS');
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

    if (vaultAddress && isAddress(vaultAddress)) {
      try {
        addLog('SYSTEM', `Submitting new on-chain milestone: "${newMilestoneName}"...`, 'INFO');
        const budgetUnits = parseUnits(newMilestoneBudget, 6);
        const durationSec = BigInt(30 * 24 * 60 * 60); // standard 30-day duration

        const tx = await writeContract({
          address: vaultAddress as `0x${string}`,
          abi: ATO_VAULT_ABI,
          functionName: 'createMilestone',
          args: [newMilestoneName, budgetUnits, durationSec]
        });

        addLog('SYSTEM', `Milestone creation broadcasted! Hash: ${tx}`, 'SUCCESS');
        refetchMilestoneCount();
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
        isActive: true
      };
      setMilestones([...milestones, newM]);
      addLog('SYSTEM', `Created new Corporate Milestone: "${newMilestoneName}" with budget ${budget.toLocaleString()} USDC.`, 'SUCCESS');
    }

    // Reset inputs
    setNewMilestoneName('');
    setNewMilestoneBudget('');
    setNewMilestoneDeadline('');
  };

  // --- MULTISIG CORE HANDLERS ---
  const handleProposeTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPropRecipient || !newPropAmount) return;
    const amountVal = parseFloat(newPropAmount);
    if (isNaN(amountVal) || amountVal <= 0) return;

    if (vaultAddress && isAddress(vaultAddress)) {
      try {
        addLog('SYSTEM', `Creating on-chain Multisig proposal...`, 'INFO');
        const amountUnits = parseUnits(newPropAmount, 6);
        const tx = await writeContract({
          address: vaultAddress as `0x${string}`,
          abi: ATO_VAULT_ABI,
          functionName: 'proposeTransaction',
          args: [newPropRecipient as `0x${string}`, amountUnits, newPropData as `0x${string}`, newPropIsNativeGas]
        });
        addLog('SYSTEM', `Multisig Proposal transaction broadcasted! Hash: ${tx}`, 'SUCCESS');
        refetchProposalCount();
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

  const handleApproveProposal = async (proposalId: number) => {
    if (vaultAddress && isAddress(vaultAddress)) {
      try {
        addLog('SYSTEM', `Approving Multisig Proposal #${proposalId}...`, 'INFO');
        const tx = await writeContract({
          address: vaultAddress as `0x${string}`,
          abi: ATO_VAULT_ABI,
          functionName: 'approveProposal',
          args: [BigInt(proposalId)]
        });
        addLog('SYSTEM', `Approve broadcasted! Hash: ${tx}`, 'SUCCESS');
        refetchProposalCount();
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

  const handleExecuteProposal = async (proposalId: number) => {
    if (vaultAddress && isAddress(vaultAddress)) {
      try {
        addLog('SYSTEM', `Executing Multisig Proposal #${proposalId}...`, 'INFO');
        const tx = await writeContract({
          address: vaultAddress as `0x${string}`,
          abi: ATO_VAULT_ABI,
          functionName: 'executeProposal',
          args: [BigInt(proposalId)]
        });
        addLog('SYSTEM', `Execute transaction broadcasted! Hash: ${tx}`, 'SUCCESS');
        refetchProposalCount();
        refetchVaultBalances();
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
      <div className="divider"></div>
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
        <div className="nav-links" style={{ gap: '1rem' }}>
          <span className="nav-link">Help</span>
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="avatar" />
          
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className="hex-blueprint-btn"
            style={{ padding: '0.5rem 1rem', fontSize: '0.7rem', width: 'auto' }}
          >
            Go to Dashboard
          </button>
        </div>

      </nav>
      <div className="divider-subtle"></div>

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

            {isConnected ? (
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button 
                        onClick={handleDeployVault} 
                        disabled={isDeployPending}
                        className="hex-blueprint-btn" 
                        style={{ width: 'auto', padding: '0.45rem 1.25rem', fontSize: '0.65rem', borderColor: 'var(--accent-pink)' }}
                      >
                        {isDeployPending ? 'Creating your account...' : 'Create New Account'}
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
            ) : (
              <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>
                👋 <strong>Sign in to get started.</strong> Click the connect button in the top-right corner to link your account. Until then, you can explore the platform in demo mode.
              </p>
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
                        {isConnected && chainId === cctpSourceChainId && sourceChainUsdcBalanceData 
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
          {activeTab === 'milestones' && (
            <div className="milestones-tab-grid">
              
              {/* Left Column: Milestones lists */}
              <div className="milestones-list">
                <div className="glass-panel" style={{ gap: '1.25rem' }}>
                  <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>Project Budgets</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {milestones.length === 0 ? (
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No project budgets set up yet. Create one to start tracking spending by project.</p>
                    ) : (
                      milestones.map(m => {
                        const percent = m.allocatedERC20 > 0 ? (m.spentERC20 / m.allocatedERC20) * 100 : 0;
                        return (
                          <div key={m.id} className="milestone-item-card">
                            <div className="milestone-item-row">
                              <div>
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{m.name}</h4>
                                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                                  Deadline: {m.timeDeadline}
                                </p>
                              </div>
                              <span className={`badge ${m.isActive ? 'badge-pink' : 'badge-red'}`}>
                                {m.isActive ? 'Active' : 'Expired'}
                              </span>
                            </div>

                            {/* Progress indicator */}
                            <div className="milestone-progress-block">
                              <div className="progress-labels">
                                <span style={{ color: 'var(--text-secondary)' }}>Spent: ${m.spentERC20.toLocaleString()} USDC</span>
                                <span style={{ color: 'var(--text-primary)' }}>Budget: ${m.allocatedERC20.toLocaleString()} USDC</span>
                              </div>
                              <div className="progress-bar-bg">
                                <div className="progress-bar-fill" style={{ width: `${percent}%` }}></div>
                              </div>
                              <div className="progress-pct">
                                {percent.toFixed(1)}% spent
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Creation form */}
              <div className="glass-panel">
                <div>
                  <h3 className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>New Project Budget</h3>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Set a spending limit for a team or project.</p>
                </div>

                <form onSubmit={handleCreateMilestone} className="form-container">
                  <div className="form-group">
                    <label>Project Name</label>
                    <input 
                      type="text" 
                      value={newMilestoneName}
                      onChange={e => setNewMilestoneName(e.target.value)}
                      placeholder="e.g. Q4 Marketing Campaign"
                      className="form-input" 
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Spending Limit (USDC)</label>
                    <input 
                      type="number" 
                      value={newMilestoneBudget}
                      onChange={e => setNewMilestoneBudget(e.target.value)}
                      placeholder="e.g. 50000"
                      className="form-input" 
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Expires On</label>
                    <input 
                      type="date" 
                      value={newMilestoneDeadline}
                      onChange={e => setNewMilestoneDeadline(e.target.value)}
                      className="form-input" 
                      style={{ fontFamily: 'var(--font-mono)' }}
                      required
                    />
                  </div>

                  <button type="submit" className="hex-blueprint-btn" style={{ fontSize: '0.72rem', padding: '0.65rem' }}>
                    {vaultAddress ? 'Create Budget' : 'Create Budget (Demo)'}
                  </button>
                </form>
              </div>

            </div>
          )}

          {/* TAB 5: COMPLIANCE REGISTRY */}
          {activeTab === 'compliance' && (
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

            </div>
          )}

          {/* TAB 6: AGENTS AND ARCHITECTURE LOGS */}
          {activeTab === 'agents' && (
            <div className="agents-tab-layout">
              <div className="glass-panel">
                <h3 style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: '0.85rem' }}>How ATO Protects Your Money</h3>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                  Every payment goes through three automated checks before it's sent. Here's what happens behind the scenes.
                </p>

                <div className="agents-grid">
                  
                  <div className="agent-card-item">
                    <div className="agent-card-title">
                      <div className="agent-card-dot" style={{ backgroundColor: 'var(--accent-purple)' }}></div>
                      <span>Step 1: Balance Verification</span>
                    </div>
                    <p className="agent-desc">
                      Before any payment is sent, the system checks that your account has enough funds. It also verifies that all the payment details are correct and creates an audit trail automatically.
                    </p>
                  </div>

                  <div className="agent-card-item">
                    <div className="agent-card-title">
                      <div className="agent-card-dot" style={{ backgroundColor: 'var(--accent-pink)' }}></div>
                      <span>Step 2: Recipient Safety Check</span>
                    </div>
                    <p className="agent-desc">
                      We verify that the recipient's account is safe to send money to. If the account has been flagged for any reason, the payment is automatically stopped to protect your funds.
                    </p>
                  </div>

                  <div className="agent-card-item">
                    <div className="agent-card-title">
                      <div className="agent-card-dot" style={{ backgroundColor: 'var(--accent-cyan)' }}></div>
                      <span>Step 3: Instant Delivery</span>
                    </div>
                    <p className="agent-desc">
                      Once verified, the payment is processed and delivered instantly. The system handles all currency conversions and fee calculations automatically — you just see the final result.
                    </p>
                  </div>

                </div>

                <div className="divider" style={{ margin: '1rem 0' }}></div>

                <div className="debug-box">
                  <h4 style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-pink)', marginBottom: '0.25rem' }}>
                    Built-in Safety Features
                  </h4>
                  <p>
                    <strong>1. Blocked recipient protection:</strong> If someone tries to send money to a flagged account, the system automatically cancels the payment before any funds leave your account. You'll never lose money to a bad transfer.
                  </p>
                  <p>
                    <strong>2. Automatic fee handling:</strong> Transaction fees on this network are paid in USDC (the same currency you already use), so there's no need to hold a separate token. The system handles all the math automatically.
                  </p>
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

    </div>
  );
}
