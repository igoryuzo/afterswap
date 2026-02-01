'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWatchContractEvent, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { base } from 'wagmi/chains'
import { formatEther, parseEther, maxUint256, encodeAbiParameters, toHex, keccak256 } from 'viem'
import { SWAPSTATS_ABI, ADDRESSES } from '@/lib/contracts'
import { ConnectButton } from '@/components/ConnectButton'

// Pre-configured pool - WETH/MOLT on Base Mainnet (new pool with correct price)
const POOL_KEY = {
  currency0: '0x4200000000000000000000000000000000000006' as `0x${string}`, // WETH
  currency1: '0xB695559b26BB2c9703ef1935c37AeaE9526bab07' as `0x${string}`, // MOLT
  fee: 1000, // 0.10% fee tier
  tickSpacing: 20,
  hooks: '0x0b9bD21322063AA5e8eE09a54AeA4C90a4A08040' as `0x${string}`, // SwapStats
}

// Official Uniswap V4 contracts on Base
const UNIVERSAL_ROUTER = '0x6ff5693b99212da76ad316178a184ab56d299b43' as `0x${string}`
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as `0x${string}`
const POOL_MANAGER = '0x498581fF718922c3f8e6A244956aF099B2652b2b' as `0x${string}`

// Compute PoolId from PoolKey (keccak256 of ABI-encoded struct)
const POOL_ID = keccak256(
  encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [POOL_KEY.currency0, POOL_KEY.currency1, POOL_KEY.fee, POOL_KEY.tickSpacing, POOL_KEY.hooks]
  )
)

// Command and Action constants from Uniswap
const Commands = {
  V4_SWAP: 0x10,
}

const Actions = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SETTLE_ALL: 0x0c,
  TAKE_ALL: 0x0f,  // Fixed: was 0x0d, should be 0x0f
}

// ERC20 ABI for approvals
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// Permit2 ABI for router approval
const PERMIT2_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
    stateMutability: 'view',
  },
] as const

// Universal Router ABI
const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const

// Helper to encode the V4 swap using the Universal Router format
// Following: https://docs.uniswap.org/contracts/v4/quickstart/swap
function encodeV4Swap(
  poolKey: typeof POOL_KEY,
  zeroForOne: boolean,
  amountIn: bigint,
  minAmountOut: bigint
): { commands: `0x${string}`, inputs: `0x${string}`[] } {
  // Command: V4_SWAP (0x10)
  const commands = toHex(new Uint8Array([Commands.V4_SWAP]))

  // Actions packed as bytes: abi.encodePacked(uint8, uint8, uint8)
  const actions = toHex(new Uint8Array([
    Actions.SWAP_EXACT_IN_SINGLE,  // 0x06
    Actions.SETTLE_ALL,             // 0x0c
    Actions.TAKE_ALL,               // 0x0f
  ]))

  // Params[0]: abi.encode(IV4Router.ExactInputSingleParams)
  // struct ExactInputSingleParams { PoolKey poolKey; bool zeroForOne; uint128 amountIn; uint128 amountOutMinimum; bytes hookData; }
  // PoolKey is a tuple: (address, address, uint24, int24, address)
  const swapParams = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            type: 'tuple',
            name: 'poolKey',
            components: [
              { type: 'address', name: 'currency0' },
              { type: 'address', name: 'currency1' },
              { type: 'uint24', name: 'fee' },
              { type: 'int24', name: 'tickSpacing' },
              { type: 'address', name: 'hooks' },
            ],
          },
          { type: 'bool', name: 'zeroForOne' },
          { type: 'uint128', name: 'amountIn' },
          { type: 'uint128', name: 'amountOutMinimum' },
          { type: 'bytes', name: 'hookData' },
        ],
      },
    ],
    [
      {
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        zeroForOne: zeroForOne,
        amountIn: amountIn,
        amountOutMinimum: minAmountOut,
        hookData: '0x' as `0x${string}`,
      },
    ]
  )

  // Params[1]: abi.encode(key.currency0, amountIn) for SETTLE_ALL
  const inputCurrency = zeroForOne ? poolKey.currency0 : poolKey.currency1
  const settleParams = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [inputCurrency, amountIn]
  )

  // Params[2]: abi.encode(key.currency1, minAmountOut) for TAKE_ALL
  const outputCurrency = zeroForOne ? poolKey.currency1 : poolKey.currency0
  const takeParams = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [outputCurrency, minAmountOut]
  )

  // Final input: abi.encode(actions, params)
  const input = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, [swapParams, settleParams, takeParams]]
  )

  return {
    commands,
    inputs: [input],
  }
}

export default function Home() {
  const { address, isConnected } = useAccount()
  const [recentSwaps, setRecentSwaps] = useState<Array<{
    amount0: bigint
    amount1: bigint
    timestamp: bigint
    txHash: string
    logIndex: number
  }>>([])
  const [swapDirection, setSwapDirection] = useState<'wethToMolt' | 'moltToWeth'>('wethToMolt')
  const [swapAmount, setSwapAmount] = useState('0.0001')
  const [swapStep, setSwapStep] = useState<'idle' | 'approving' | 'swapping' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const addresses = ADDRESSES[8453] // Base Mainnet

  const { data: stats, refetch } = useReadContract({
    address: addresses.swapStats,
    abi: SWAPSTATS_ABI,
    functionName: 'getPoolStats',
    args: [POOL_KEY],
    chainId: base.id,
    query: {
      refetchInterval: 5000, // Refresh every 5s
    },
  })

  // Check allowance for the input token to Permit2
  const inputToken = swapDirection === 'wethToMolt' ? POOL_KEY.currency0 : POOL_KEY.currency1
  const { data: erc20Allowance, refetch: refetchErc20Allowance } = useReadContract({
    address: inputToken,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, PERMIT2] : undefined,
    query: {
      enabled: !!address,
    },
  })

  // Check Permit2 allowance for the Universal Router
  const { data: permit2Allowance, refetch: refetchPermit2Allowance } = useReadContract({
    address: PERMIT2,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: address ? [address, inputToken, UNIVERSAL_ROUTER] : undefined,
    query: {
      enabled: !!address,
    },
  })

  // Watch for new swap events
  useWatchContractEvent({
    address: addresses.swapStats,
    abi: SWAPSTATS_ABI,
    eventName: 'SwapRecorded',
    chainId: base.id,
    onLogs(logs) {
      logs.forEach((log) => {
        if (log.args && log.transactionHash) {
          const txHash = log.transactionHash
          const logIndex = log.logIndex ?? 0

          // Deduplicate by txHash + logIndex
          setRecentSwaps((prev) => {
            const isDuplicate = prev.some(
              (swap) => swap.txHash === txHash && swap.logIndex === logIndex
            )
            if (isDuplicate) return prev

            return [
              {
                amount0: log.args.amount0 as bigint,
                amount1: log.args.amount1 as bigint,
                timestamp: log.args.timestamp as bigint,
                txHash,
                logIndex,
              },
              ...prev.slice(0, 4),
            ]
          })
        }
      })
      refetch()
    },
  })

  // ERC20 Approval transaction (token -> Permit2)
  const { writeContract: writeErc20Approve, data: erc20ApproveHash, isPending: isErc20ApprovePending } = useWriteContract()
  const { isLoading: isErc20ApproveConfirming, isSuccess: isErc20ApproveSuccess } = useWaitForTransactionReceipt({ hash: erc20ApproveHash })

  // Permit2 Approval transaction (Permit2 -> Router)
  const { writeContract: writePermit2Approve, data: permit2ApproveHash, isPending: isPermit2ApprovePending } = useWriteContract()
  const { isLoading: isPermit2ApproveConfirming, isSuccess: isPermit2ApproveSuccess } = useWaitForTransactionReceipt({ hash: permit2ApproveHash })

  // Swap transaction
  const { writeContract: writeSwap, data: swapHash, isPending: isSwapPending } = useWriteContract()
  const { isLoading: isSwapConfirming, isSuccess: isSwapSuccess } = useWaitForTransactionReceipt({ hash: swapHash })

  // Handle ERC20 approval success -> check Permit2 approval
  useEffect(() => {
    if (isErc20ApproveSuccess && swapStep === 'approving') {
      refetchErc20Allowance()
      // Now approve Permit2 for the router
      setTimeout(() => approvePermit2ForRouter(), 1000)
    }
  }, [isErc20ApproveSuccess])

  // Handle Permit2 approval success -> execute swap
  useEffect(() => {
    if (isPermit2ApproveSuccess && swapStep === 'approving') {
      refetchPermit2Allowance()
      setTimeout(() => executeSwap(), 1000)
    }
  }, [isPermit2ApproveSuccess])

  const approvePermit2ForRouter = () => {
    if (!address) return
    const amountIn = parseEther(swapAmount)
    // Expiration: 30 days from now
    const expiration = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

    writePermit2Approve({
      address: PERMIT2,
      abi: PERMIT2_ABI,
      functionName: 'approve',
      args: [inputToken, UNIVERSAL_ROUTER, BigInt(amountIn), expiration],
    }, {
      onError: (error) => {
        console.error('Permit2 approval error:', error)
        setSwapStep('error')
        setErrorMessage(error.message.slice(0, 150))
        setTimeout(() => setSwapStep('idle'), 5000)
      }
    })
  }

  // Handle swap success
  useEffect(() => {
    if (isSwapSuccess && swapStep === 'swapping') {
      setSwapStep('success')
      refetch()
      setTimeout(() => setSwapStep('idle'), 3000)
    }
  }, [isSwapSuccess])

  const executeSwap = () => {
    if (!address) return
    setSwapStep('swapping')

    const amountIn = parseEther(swapAmount)
    const zeroForOne = swapDirection === 'wethToMolt'
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800) // 30 minutes

    const { commands, inputs } = encodeV4Swap(POOL_KEY, zeroForOne, amountIn, 0n)

    writeSwap({
      address: UNIVERSAL_ROUTER,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: 'execute',
      args: [commands, inputs, deadline],
    }, {
      onError: (error) => {
        console.error('Swap error:', error)
        setSwapStep('error')
        setErrorMessage(error.message.slice(0, 150))
        setTimeout(() => setSwapStep('idle'), 5000)
      }
    })
  }

  const handleSwap = () => {
    if (!address) return
    setErrorMessage('')

    const amountIn = parseEther(swapAmount)

    // Step 1: Check if ERC20 approval to Permit2 is needed
    const erc20AllowanceAmount = (erc20Allowance as bigint | undefined) ?? 0n
    if (erc20AllowanceAmount < amountIn) {
      setSwapStep('approving')
      writeErc20Approve({
        address: inputToken,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [PERMIT2, maxUint256],
      }, {
        onError: (error) => {
          console.error('ERC20 Approval error:', error)
          setSwapStep('error')
          setErrorMessage(error.message.slice(0, 150))
          setTimeout(() => setSwapStep('idle'), 5000)
        }
      })
      return
    }

    // Step 2: Check if Permit2 approval for router is needed
    const permit2Data = permit2Allowance as readonly [bigint, number, number] | undefined
    const permit2Amount = permit2Data ? permit2Data[0] : 0n
    if (permit2Amount < amountIn) {
      setSwapStep('approving')
      approvePermit2ForRouter()
      return
    }

    // Step 3: Execute swap
    executeSwap()
  }

  const isLoading = swapStep === 'approving' || swapStep === 'swapping' ||
    isErc20ApprovePending || isErc20ApproveConfirming ||
    isPermit2ApprovePending || isPermit2ApproveConfirming ||
    isSwapPending || isSwapConfirming

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border py-6">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <a href="/" className="font-mono text-lg font-bold text-cyan flex items-center gap-2">
            <span className="opacity-50">&gt;</span>
            afterSwap
          </a>
          <div className="flex items-center gap-4">
            <a
              href="https://basescan.org/address/0x0b9bD21322063AA5e8eE09a54AeA4C90a4A08040"
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary hover:text-cyan font-mono text-sm hidden md:block"
            >
              View Contract &rarr;
            </a>
            <a
              href="https://github.com/igoryuzo/afterSwap"
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary hover:text-cyan font-mono text-sm hidden md:block"
            >
              GitHub &rarr;
            </a>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="hero-label mb-6">Uniswap V4 Hook Demo</div>
          <h1 className="font-mono text-4xl md:text-5xl font-bold leading-tight mb-6 max-w-4xl">
            See <span className="text-cyan">afterSwap</span> in action
          </h1>
          <p className="text-secondary text-lg max-w-2xl leading-relaxed font-light">
            This is a live demo of a Uniswap V4 hook tracking swap statistics onchain.
            Swap below and watch the stats update in real-time!
          </p>
        </div>
      </section>

      {/* Live Stats Section */}
      <section className="py-12 border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 mb-8">
            <span className="w-3 h-3 rounded-full bg-cyan animate-pulse"></span>
            <h2 className="section-title">Live Pool Statistics</h2>
          </div>

          {/* Pool Info */}
          <div className="card mb-6">
            <div className="flex flex-wrap items-center gap-4 text-sm font-mono">
              <div className="flex items-center gap-2">
                <span className="text-dim">Pool:</span>
                <span className="text-primary">WETH / MOLT</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-dim">Fee:</span>
                <span className="text-primary">0.10%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-dim">Network:</span>
                <span className="text-cyan">Base Mainnet</span>
              </div>
            </div>

            {/* Contract Addresses */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 pt-3 border-t border-border text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-dim">Hook:</span>
                <a
                  href={`https://basescan.org/address/${POOL_KEY.hooks}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan hover:underline"
                >
                  {POOL_KEY.hooks.slice(0, 6)}...{POOL_KEY.hooks.slice(-4)}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-dim">Pool Manager:</span>
                <a
                  href={`https://basescan.org/address/${POOL_MANAGER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan hover:underline"
                >
                  {POOL_MANAGER.slice(0, 6)}...{POOL_MANAGER.slice(-4)}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-dim">PoolId:</span>
                <a
                  href={`https://dexscreener.com/base/${POOL_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan hover:underline"
                >
                  {POOL_ID.slice(0, 10)}...{POOL_ID.slice(-6)}
                </a>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-dim">WETH:</span>
                <a
                  href={`https://basescan.org/address/${POOL_KEY.currency0}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan hover:underline"
                >
                  {POOL_KEY.currency0.slice(0, 6)}...{POOL_KEY.currency0.slice(-4)}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-dim">MOLT:</span>
                <a
                  href={`https://basescan.org/address/${POOL_KEY.currency1}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan hover:underline"
                >
                  {POOL_KEY.currency1.slice(0, 6)}...{POOL_KEY.currency1.slice(-4)}
                </a>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card text-center py-8">
              <div className="text-secondary text-sm mb-3 font-mono">Total Swaps</div>
              <div className="stat-value">{stats?.totalSwaps?.toString() || '0'}</div>
            </div>
            <div className="card text-center py-8">
              <div className="text-secondary text-sm mb-3 font-mono">WETH Volume</div>
              <div className="font-mono text-2xl font-bold text-cyan">
                {stats?.totalVolume0 ? Number(formatEther(stats.totalVolume0)).toFixed(6) : '0'}
              </div>
            </div>
            <div className="card text-center py-8">
              <div className="text-secondary text-sm mb-3 font-mono">MOLT Volume</div>
              <div className="font-mono text-2xl font-bold text-cyan">
                {stats?.totalVolume1 ? Number(formatEther(stats.totalVolume1)).toFixed(2) : '0'}
              </div>
            </div>
            <div className="card text-center py-8">
              <div className="text-secondary text-sm mb-3 font-mono">Last Swap</div>
              <div className="font-mono text-xl text-primary">
                {stats?.lastSwapTimestamp && stats.lastSwapTimestamp > 0n
                  ? new Date(Number(stats.lastSwapTimestamp) * 1000).toLocaleTimeString()
                  : 'Never'}
              </div>
            </div>
          </div>

          {/* Recent Swaps Feed */}
          {recentSwaps.length > 0 && (
            <div className="card">
              <h3 className="font-mono font-bold text-primary mb-4">Live Feed</h3>
              <div className="space-y-2">
                {recentSwaps.map((swap, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-3 bg-elevated rounded border border-border"
                  >
                    <div className="font-mono text-sm">
                      <span className={swap.amount0 < 0n ? 'text-red-alert' : 'text-green-400'}>
                        {Number(formatEther(swap.amount0 < 0n ? -swap.amount0 : swap.amount0)).toFixed(6)} WETH
                      </span>
                      <span className="text-dim mx-2">&harr;</span>
                      <span className={swap.amount1 < 0n ? 'text-red-alert' : 'text-green-400'}>
                        {Number(formatEther(swap.amount1 < 0n ? -swap.amount1 : swap.amount1)).toFixed(2)} MOLT
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
      </section>

      {/* Try It Section */}
      <section className="py-12 border-b border-border bg-surface">
        <div className="max-w-6xl mx-auto px-6">
          <div className="section-label">Try It Yourself</div>
          <h2 className="section-title mb-2">Trigger the hook with a swap</h2>
          <p className="text-secondary text-sm mb-8">
            Swap directly through the V4 pool to trigger the <span className="text-cyan">afterSwap</span> hook. Use small amounts — limited liquidity.
          </p>

          <div className="card max-w-md mx-auto">
            {!isConnected ? (
              <div className="text-center py-8">
                <p className="text-secondary mb-4 font-mono text-sm">Connect your wallet to swap</p>
                <ConnectButton />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Direction Toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSwapDirection('wethToMolt')}
                    disabled={isLoading}
                    className={`flex-1 py-3 px-4 rounded font-mono text-sm transition-all ${
                      swapDirection === 'wethToMolt'
                        ? 'bg-cyan text-deep font-bold'
                        : 'bg-elevated text-secondary hover:text-primary'
                    }`}
                  >
                    WETH → MOLT
                  </button>
                  <button
                    onClick={() => setSwapDirection('moltToWeth')}
                    disabled={isLoading}
                    className={`flex-1 py-3 px-4 rounded font-mono text-sm transition-all ${
                      swapDirection === 'moltToWeth'
                        ? 'bg-cyan text-deep font-bold'
                        : 'bg-elevated text-secondary hover:text-primary'
                    }`}
                  >
                    MOLT → WETH
                  </button>
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-secondary text-sm mb-2 font-mono">
                    Amount ({swapDirection === 'wethToMolt' ? 'WETH' : 'MOLT'})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={swapAmount}
                      onChange={(e) => setSwapAmount(e.target.value)}
                      disabled={isLoading}
                      className="flex-1"
                      placeholder="0.0001"
                    />
                    <div className="flex gap-1">
                      {swapDirection === 'wethToMolt' ? (
                        <>
                          <button
                            onClick={() => setSwapAmount('0.0001')}
                            disabled={isLoading}
                            className="px-3 py-2 bg-elevated rounded text-xs font-mono text-secondary hover:text-cyan"
                          >
                            0.0001
                          </button>
                          <button
                            onClick={() => setSwapAmount('0.0005')}
                            disabled={isLoading}
                            className="px-3 py-2 bg-elevated rounded text-xs font-mono text-secondary hover:text-cyan"
                          >
                            0.0005
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setSwapAmount('100')}
                            disabled={isLoading}
                            className="px-3 py-2 bg-elevated rounded text-xs font-mono text-secondary hover:text-cyan"
                          >
                            100
                          </button>
                          <button
                            onClick={() => setSwapAmount('500')}
                            disabled={isLoading}
                            className="px-3 py-2 bg-elevated rounded text-xs font-mono text-secondary hover:text-cyan"
                          >
                            500
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Swap Button */}
                <button
                  onClick={handleSwap}
                  disabled={isLoading || !swapAmount}
                  className={`btn w-full py-4 font-mono text-sm font-bold ${
                    swapStep === 'success'
                      ? 'bg-green-500 text-white'
                      : swapStep === 'error'
                      ? 'bg-red-alert text-white'
                      : 'btn-primary'
                  }`}
                >
                  {swapStep === 'approving' && 'Approving...'}
                  {swapStep === 'swapping' && 'Swapping...'}
                  {swapStep === 'success' && 'Swap Successful!'}
                  {swapStep === 'error' && 'Error - Try Again'}
                  {swapStep === 'idle' && `Swap ${swapDirection === 'wethToMolt' ? 'WETH → MOLT' : 'MOLT → WETH'}`}
                </button>

                {errorMessage && (
                  <p className="text-red-alert text-xs font-mono text-center break-all">{errorMessage}</p>
                )}

                <p className="text-dim text-xs text-center font-mono">
                  Swaps via Universal Router directly to V4 pool with hook
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-12 border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="section-label">How It Works</div>
          <h2 className="section-title mb-8">The afterSwap hook lifecycle</h2>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="card">
              <div className="font-mono text-3xl text-cyan mb-4">01</div>
              <h3 className="font-mono font-bold mb-2">User Swaps</h3>
              <p className="text-secondary text-sm leading-relaxed">
                A user swaps WETH for MOLT (or vice versa) on the Uniswap V4 pool that has our hook attached.
              </p>
            </div>
            <div className="card">
              <div className="font-mono text-3xl text-cyan mb-4">02</div>
              <h3 className="font-mono font-bold mb-2">Hook Triggers</h3>
              <p className="text-secondary text-sm leading-relaxed">
                After the swap executes, the PoolManager calls our <code className="text-cyan">afterSwap</code> function with the swap details.
              </p>
            </div>
            <div className="card">
              <div className="font-mono text-3xl text-cyan mb-4">03</div>
              <h3 className="font-mono font-bold mb-2">Stats Updated</h3>
              <p className="text-secondary text-sm leading-relaxed">
                We record the swap count, volumes, and timestamp. An event is emitted for off-chain indexing.
              </p>
            </div>
          </div>

          {/* Code Preview */}
          <div className="terminal">
            <div className="terminal-header">
              <span className="terminal-dot"></span>
              <span className="terminal-dot"></span>
              <span className="terminal-dot"></span>
              <span className="font-mono text-xs text-dim ml-4">SwapStats.sol</span>
            </div>
            <div className="p-6 font-mono text-sm leading-relaxed overflow-x-auto">
              <div className="text-dim">{'/// @notice Called after every swap'}</div>
              <div><span className="text-pink-400">function</span> <span className="text-green-400">_afterSwap</span>(...) <span className="text-pink-400">internal override</span> {'{'}</div>
              <div className="pl-4">PoolStats <span className="text-pink-400">storage</span> stats = poolStats[poolId];</div>
              <div className="pl-4"></div>
              <div className="pl-4 text-dim">// Update statistics</div>
              <div className="pl-4">stats.totalSwaps<span className="text-cyan">++</span>;</div>
              <div className="pl-4">stats.totalVolume0 <span className="text-cyan">+=</span> _abs(amount0);</div>
              <div className="pl-4">stats.totalVolume1 <span className="text-cyan">+=</span> _abs(amount1);</div>
              <div className="pl-4">stats.lastSwapTimestamp <span className="text-cyan">=</span> block.timestamp;</div>
              <div className="pl-4"></div>
              <div className="pl-4"><span className="text-pink-400">emit</span> <span className="text-green-400">SwapRecorded</span>(poolId, ...);</div>
              <div className="pl-4"><span className="text-pink-400">return</span> (selector, <span className="text-purple-400">0</span>); <span className="text-dim">// No delta modification</span></div>
              <div>{'}'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Concepts Section */}
      <section className="py-12 border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="section-label">Key Concepts</div>
          <h2 className="section-title mb-8">Understanding V4 Hooks</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="font-mono font-bold mb-3 text-cyan">Hook Permissions</h3>
              <p className="text-secondary text-sm leading-relaxed mb-4">
                Hooks declare which lifecycle events they want to intercept. This hook only uses <code className="text-cyan">afterSwap</code> —
                the minimal permission needed for read-only analytics.
              </p>
              <div className="bg-elevated rounded p-3 font-mono text-xs">
                <div className="text-green-400">✓ afterSwap: true</div>
                <div className="text-dim">✗ beforeSwap: false</div>
                <div className="text-dim">✗ beforeSwapReturnDelta: false</div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-mono font-bold mb-3 text-cyan">Return Delta</h3>
              <p className="text-secondary text-sm leading-relaxed mb-4">
                Hooks can modify swap amounts by returning a non-zero delta. This hook returns <code className="text-cyan">0</code> —
                it observes swaps without modifying them.
              </p>
              <div className="bg-elevated rounded p-3 font-mono text-xs">
                <div><span className="text-pink-400">return</span> (selector, <span className="text-cyan">0</span>);</div>
                <div className="text-dim mt-1">// Safe: no rug risk, pure analytics</div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-mono font-bold mb-3 text-cyan">Onchain Storage</h3>
              <p className="text-secondary text-sm leading-relaxed mb-4">
                Stats are stored directly in the hook contract. No external indexer needed —
                query the blockchain directly for real-time data.
              </p>
              <div className="bg-elevated rounded p-3 font-mono text-xs">
                <div><span className="text-pink-400">mapping</span>(PoolId =&gt; PoolStats) poolStats;</div>
              </div>
            </div>

            <div className="card">
              <h3 className="font-mono font-bold mb-3 text-cyan">Event Emission</h3>
              <p className="text-secondary text-sm leading-relaxed mb-4">
                Events enable off-chain tracking and live updates. This UI listens for <code className="text-cyan">SwapRecorded</code> events
                to show real-time swap activity.
              </p>
              <div className="bg-elevated rounded p-3 font-mono text-xs">
                <div><span className="text-pink-400">event</span> <span className="text-green-400">SwapRecorded</span>(</div>
                <div className="pl-4">PoolId poolId, uint256 totalSwaps, ...</div>
                <div>);</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="font-mono text-sm text-dim">
            Built by{' '}
            <a href="https://github.com/igoryuzo" className="text-secondary hover:text-cyan">
              Igor Yuzovitskiy
            </a>
            {' '}• Part of{' '}
            <a href="https://v4hooks.dev" className="text-secondary hover:text-cyan">
              v4hooks.dev
            </a>
            {' '}•{' '}
            <a href="https://github.com/igoryuzo/afterSwap" className="text-secondary hover:text-cyan">
              View Source
            </a>
          </p>
        </div>
      </footer>
    </main>
  )
}
