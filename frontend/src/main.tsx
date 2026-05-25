import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Chain } from 'viem';

import { baseSepolia, arbitrumSepolia } from 'wagmi/chains';

export const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
} as const satisfies Chain;

const config = getDefaultConfig({
  appName: 'Autonomous Treasury Orchestrator',
  projectId: 'a872655bfbe30cf007d30d12e8424269', // standard dummy WalletConnect project ID for testnet
  chains: [arcTestnet, baseSepolia, arbitrumSepolia],
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
    [baseSepolia.id]: http('https://sepolia.base.org'),
    [arbitrumSepolia.id]: http('https://sepolia-rollup.arbitrum.io/rpc'),
  },
  ssr: false,
});

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: '#fbc8d8',
          accentColorForeground: '#0a080d',
          borderRadius: 'medium',
        })}>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
