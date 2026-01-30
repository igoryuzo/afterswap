'use client'

import { useReadContract, useWatchContractEvent } from 'wagmi'
import { formatEther } from 'viem'
import { SWAPSTATS_ABI, ADDRESSES, SupportedChainId } from '@/lib/contracts'
import { useState, useEffect } from 'react'

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
      <div className="card text-center">
        <div className="text-yellow-400 text-lg mb-2">Hook Not Deployed</div>
        <p className="text-white/60 text-sm">
          The SwapStats hook hasn&apos;t been deployed to this network yet.
        </p>
        <p className="text-white/40 text-xs mt-2">
          Chain ID: {chainId}
        </p>
      </div>
    )
  }

  if (!poolKey) {
    return (
      <div className="card text-center">
        <div className="text-white/60">Enter a pool to view stats</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="card text-center">
        <div className="animate-pulse text-white/60">Loading stats...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-white/60 text-sm mb-1">Total Swaps</div>
          <div className="stat-value">{stats?.totalSwaps?.toString() || '0'}</div>
        </div>
        <div className="card text-center">
          <div className="text-white/60 text-sm mb-1">Volume Token0</div>
          <div className="stat-value text-2xl">
            {stats?.totalVolume0 ? formatEther(stats.totalVolume0) : '0'}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-white/60 text-sm mb-1">Volume Token1</div>
          <div className="stat-value text-2xl">
            {stats?.totalVolume1 ? formatEther(stats.totalVolume1) : '0'}
          </div>
        </div>
        <div className="card text-center">
          <div className="text-white/60 text-sm mb-1">Last Swap</div>
          <div className="text-xl text-white">
            {stats?.lastSwapTimestamp && stats.lastSwapTimestamp > 0n
              ? new Date(Number(stats.lastSwapTimestamp) * 1000).toLocaleTimeString()
              : 'Never'}
          </div>
        </div>
      </div>

      {/* Recent Swaps */}
      {recentSwaps.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Swaps (Live)</h3>
          <div className="space-y-2">
            {recentSwaps.map((swap, i) => (
              <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                <div className="text-sm">
                  <span className={swap.amount0 < 0n ? 'text-red-400' : 'text-green-400'}>
                    {formatEther(swap.amount0 < 0n ? -swap.amount0 : swap.amount0)} Token0
                  </span>
                  <span className="text-white/40 mx-2">→</span>
                  <span className={swap.amount1 < 0n ? 'text-red-400' : 'text-green-400'}>
                    {formatEther(swap.amount1 < 0n ? -swap.amount1 : swap.amount1)} Token1
                  </span>
                </div>
                <div className="text-white/40 text-xs">
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
