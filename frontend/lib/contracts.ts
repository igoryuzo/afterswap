export const SWAPSTATS_ABI = [
  {
    type: 'function',
    name: 'getPoolStats',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
    ],
    outputs: [
      {
        name: 'stats',
        type: 'tuple',
        components: [
          { name: 'totalSwaps', type: 'uint256' },
          { name: 'totalVolume0', type: 'uint256' },
          { name: 'totalVolume1', type: 'uint256' },
          { name: 'lastSwapTimestamp', type: 'uint256' },
          { name: 'lastSwapAmount', type: 'int256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTotalSwaps',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'SwapRecorded',
    inputs: [
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'totalSwaps', type: 'uint256', indexed: false },
      { name: 'amount0', type: 'int256', indexed: false },
      { name: 'amount1', type: 'int256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
] as const

// Deployment addresses - update after deploying
export const ADDRESSES = {
  // Base Sepolia
  84532: {
    swapStats: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    poolManager: '0x7Da1D65F8B249183667cdE74C5CBD46dD38AA829' as `0x${string}`,
  },
  // Base Mainnet
  8453: {
    swapStats: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    poolManager: '0x498581fF718922c3f8e6A244956aF099B2652b2b' as `0x${string}`,
  },
} as const

export type SupportedChainId = keyof typeof ADDRESSES
