// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";

/// @title SwapStats Hook
/// @notice A simple Uniswap v4 hook that tracks swap statistics per pool
/// @dev Showcases the power of hooks for on-chain analytics without external indexers
contract SwapStats is BaseHook {
    using PoolIdLibrary for PoolKey;

    /// @notice Swap statistics for a pool
    struct PoolStats {
        uint256 totalSwaps;
        uint256 totalVolume0;  // Cumulative absolute volume in token0
        uint256 totalVolume1;  // Cumulative absolute volume in token1
        uint256 lastSwapTimestamp;
        int256 lastSwapAmount;
    }

    /// @notice Mapping from pool ID to its statistics
    mapping(PoolId => PoolStats) public poolStats;

    /// @notice Emitted when a swap occurs
    event SwapRecorded(
        PoolId indexed poolId,
        uint256 totalSwaps,
        int256 amount0,
        int256 amount1,
        uint256 timestamp
    );

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    /// @notice Returns the hook permissions - only afterSwap is enabled
    /// @dev Minimal permissions for security: we only need to observe swaps, not modify them
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,  // Only hook we need - observe completed swaps
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,  // CRITICAL: Never enable without understanding rug risk
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice Called after every swap on pools using this hook
    /// @dev Updates swap statistics for the pool
    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();

        int256 amount0 = delta.amount0();
        int256 amount1 = delta.amount1();

        // Update statistics
        PoolStats storage stats = poolStats[poolId];
        stats.totalSwaps++;
        stats.totalVolume0 += _abs(amount0);
        stats.totalVolume1 += _abs(amount1);
        stats.lastSwapTimestamp = block.timestamp;
        stats.lastSwapAmount = amount0;

        emit SwapRecorded(poolId, stats.totalSwaps, amount0, amount1, block.timestamp);

        // Return 0 delta - we don't modify swap amounts
        return (BaseHook.afterSwap.selector, 0);
    }

    /// @notice Get complete statistics for a pool
    /// @param key The pool key
    /// @return stats The pool statistics
    function getPoolStats(PoolKey calldata key) external view returns (PoolStats memory) {
        return poolStats[key.toId()];
    }

    /// @notice Get total swap count for a pool
    /// @param poolId The pool ID
    /// @return Total number of swaps
    function getTotalSwaps(PoolId poolId) external view returns (uint256) {
        return poolStats[poolId].totalSwaps;
    }

    /// @notice Helper to get absolute value
    function _abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }
}
