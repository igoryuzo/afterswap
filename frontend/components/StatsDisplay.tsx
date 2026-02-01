'use client'

import { useReadContract, useWatchContractEvent } from 'wagmi'
import { formatEther } from 'viem'
import { SWAPSTATS_ABI, ADDRESSES, SupportedChainId } from '@/lib/contracts'
import { useState } from 'react'

interface PoolKey {
  currency0: `0x${string}`
  currency1: `0x${string}`
  fee: number
  tickSpacing: number
  hooks: `0x${string}`
}

interface StatsDisplayProps {
  chainId: SupportedChainId
  poolKey?: PoolKey
}

export function StatsDisplay({ chainId, poolKey }: StatsDisplayProps) {
  const [recentSwaps, setRecentSwaps] = useState<Array<{
    amount0: bigint
    amount1: bigint
    timestamp: bigint
  }>>([])

  const addresses = ADDRESSES[chainId]

  const { data: stats, isLoading, refetch } = useReadContract({
    address: addresses.swapStats,
    abi: SWAPSTATS_ABI,
    functionName: 'getPoolStats',
    args: poolKey ? [poolKey] : undefined,
    query: {
      enabled: !!poolKey && addresses.swapStats !== '0x0000000000000000000000000000000000000000',
    },
  })

  // Watch for new swap events
  useWatchContractEvent({
    address: addresses.swapStats,
    abi: SWAPSTATS_ABI,
    eventName: 'SwapRecorded',
    onLogs(logs) {
      logs.forEach((log) => {
        if (log.args) {
          setRecentSwaps((prev) => [
            {
              amount0: log.args.amount0 as bigint,
              amount1: log.args.amount1 as bigint,
              timestamp: log.args.timestamp as bigint,
            },
            ...prev.slice(0, 4),
          ])
        }
      })
      refetch()
    },
  })

  const isDeployed = addresses.swapStats !== '0x0000000000000000000000000000000000000000'

  if (!isDeployed) {
    return (
      <div className="card text-center py-12">
        <div className="font-mono text-xl text-yellow-400 mb-3">Hook Not Deployed</div>
        <p className="text-secondary text-sm">
          The afterSwap hook hasn&apos;t been deployed to this network yet.
        </p>
        <p className="text-dim text-xs mt-3 font-mono">
          Chain ID: {chainId}
        </p>
      </div>
    )
  }

  if (!poolKey) {
    return (
      <div className="card text-center py-12">
        <div className="text-secondary font-mono">Enter a pool to view stats</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="card text-center py-12">
        <div className="animate-pulse text-secondary font-mono">Loading stats...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <div className="section-label">Pool Statistics</div>
        <h2 className="section-title">Live onchain data</h2>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-secondary text-sm mb-2 font-mono">Total Swaps</div>
          <div className="stat-value">{stats?.totalSwaps?.toString() || '0'}</div>
        </div>
        <div className="card text-center">
          <div className="text-secondary text-sm mb-2 font-mono">Volume Token0</div>
          <div className="font-mono text-2xl font-bold text-cyan">
            {stats?.totalVolume0 ? formatEther(stats.totalVolume0) : '0'}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-secondary text-sm mb-2 font-mono">Volume Token1</div>
          <div className="font-mono text-2xl font-bold text-cyan">
            {stats?.totalVolume1 ? formatEther(stats.totalVolume1) : '0'}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-secondary text-sm mb-2 font-mono">Last Swap</div>
          <div className="font-mono text-xl text-primary">
            {stats?.lastSwapTimestamp && stats.lastSwapTimestamp > 0n
              ? new Date(Number(stats.lastSwapTimestamp) * 1000).toLocaleTimeString()
              : 'Never'}
          </div>
        </div>
      </div>

      {/* Recent Swaps */}
      {recentSwaps.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-cyan animate-pulse"></span>
            <h3 className="font-mono font-bold text-primary">Recent Swaps (Live)</h3>
          </div>
          <div className="space-y-2">
            {recentSwaps.map((swap, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-3 bg-elevated rounded border border-border"
              >
                <div className="font-mono text-sm">
                  <span className={swap.amount0 < 0n ? 'text-red-alert' : 'text-green-400'}>
                    {formatEther(swap.amount0 < 0n ? -swap.amount0 : swap.amount0)} Token0
                  </span>
                  <span className="text-dim mx-2">&rarr;</span>
                  <span className={swap.amount1 < 0n ? 'text-red-alert' : 'text-green-400'}>
                    {formatEther(swap.amount1 < 0n ? -swap.amount1 : swap.amount1)} Token1
                  </span>
                </div>
                <div className="text-dim text-xs font-mono">
                  {new Date(Number(swap.timestamp) * 1000).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
