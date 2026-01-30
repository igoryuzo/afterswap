'use client'

import { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { baseSepolia, base } from 'wagmi/chains'
import { ConnectButton } from '@/components/ConnectButton'
import { StatsDisplay } from '@/components/StatsDisplay'
import { ADDRESSES, SupportedChainId } from '@/lib/contracts'

export default function Home() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [poolKeyInput, setPoolKeyInput] = useState({
    currency0: '',
    currency1: '',
    fee: '3000',
    tickSpacing: '60',
  })

  const supportedChainId = (chainId === 84532 || chainId === 8453 ? chainId : 84532) as SupportedChainId
  const hookAddress = ADDRESSES[supportedChainId]?.swapStats

  const poolKey = poolKeyInput.currency0 && poolKeyInput.currency1 ? {
    currency0: poolKeyInput.currency0 as `0x${string}`,
    currency1: poolKeyInput.currency1 as `0x${string}`,
    fee: parseInt(poolKeyInput.fee),
    tickSpacing: parseInt(poolKeyInput.tickSpacing),
    hooks: hookAddress,
  } : undefined

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-white">
              SwapStats Hook
            </h1>
            <p className="text-white/60 mt-1">
              Real-time swap analytics for Uniswap v4
            </p>
          </div>
          <div className="flex items-center gap-4">
            {isConnected && (
              <select
                value={chainId}
                onChange={(e) => switchChain({ chainId: parseInt(e.target.value) as 84532 | 8453 })}
                className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value={baseSepolia.id}>Base Sepolia</option>
                <option value={base.id}>Base Mainnet</option>
              </select>
            )}
            <ConnectButton />
          </div>
        </header>

        {/* Hook Info */}
        <section className="card mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">About This Hook</h2>
              <p className="text-white/70 text-sm leading-relaxed">
                SwapStats is a Uniswap v4 hook that tracks swap statistics for any pool.
                It records total swaps, cumulative volume, and timestamps — all on-chain,
                without external indexers.
              </p>
            </div>
            <a
              href="https://github.com/igoryuzo/hook1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-uni-pink hover:text-uni-pink-dark transition-colors text-sm"
            >
              View Code →
            </a>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
              afterSwap
            </span>
            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs">
              Read-Only
            </span>
            <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs">
              No Delta Modification
            </span>
          </div>
        </section>

        {/* Pool Input */}
        <section className="card mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Select Pool</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-white/60 text-sm mb-1">Token 0 Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={poolKeyInput.currency0}
                onChange={(e) => setPoolKeyInput({ ...poolKeyInput, currency0: e.target.value })}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-uni-pink"
              />
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-1">Token 1 Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={poolKeyInput.currency1}
                onChange={(e) => setPoolKeyInput({ ...poolKeyInput, currency1: e.target.value })}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white placeholder-white/30 focus:outline-none focus:border-uni-pink"
              />
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-1">Fee (basis points)</label>
              <select
                value={poolKeyInput.fee}
                onChange={(e) => setPoolKeyInput({ ...poolKeyInput, fee: e.target.value })}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-uni-pink"
              >
                <option value="100">0.01%</option>
                <option value="500">0.05%</option>
                <option value="3000">0.30%</option>
                <option value="10000">1.00%</option>
              </select>
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-1">Tick Spacing</label>
              <select
                value={poolKeyInput.tickSpacing}
                onChange={(e) => setPoolKeyInput({ ...poolKeyInput, tickSpacing: e.target.value })}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-uni-pink"
              >
                <option value="1">1</option>
                <option value="10">10</option>
                <option value="60">60</option>
                <option value="200">200</option>
              </select>
            </div>
          </div>
        </section>

        {/* Stats Display */}
        <StatsDisplay chainId={supportedChainId} poolKey={poolKey} />

        {/* Footer */}
        <footer className="mt-16 text-center text-white/40 text-sm">
          <p>
            Part of{' '}
            <a href="https://v4hooks.dev" className="text-uni-pink hover:underline">
              v4hooks.dev
            </a>
            {' '}— Learn Uniswap v4 hooks by example
          </p>
          <p className="mt-2">
            Built with the{' '}
            <a
              href="https://github.com/igoryuzo/uniswapV4-hooks-skill"
              className="text-uni-pink hover:underline"
            >
              Uniswap v4 Hooks Skill
            </a>
          </p>
        </footer>
      </div>
    </main>
  )
}
