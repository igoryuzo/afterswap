// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";

import {SwapStats} from "../src/SwapStats.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract SwapStatsTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    Currency currency0;
    Currency currency1;

    PoolKey poolKey;

    SwapStats hook;
    PoolId poolId;

    uint256 tokenId;
    int24 tickLower;
    int24 tickUpper;

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();

        address flags = address(
            uint160(Hooks.AFTER_SWAP_FLAG) ^ (0x4444 << 144)
        );
        bytes memory constructorArgs = abi.encode(poolManager);
        deployCodeTo("SwapStats.sol:SwapStats", constructorArgs, flags);
        hook = SwapStats(flags);

        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);

        uint128 liquidityAmount = 100e18;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );

        (tokenId,) = positionManager.mint(
            poolKey, tickLower, tickUpper, liquidityAmount,
            amount0Expected + 1, amount1Expected + 1,
            address(this), block.timestamp, Constants.ZERO_BYTES
        );
    }

    function test_InitialStatsAreZero() public view {
        SwapStats.PoolStats memory stats = hook.getPoolStats(poolKey);
        assertEq(stats.totalSwaps, 0);
        assertEq(stats.totalVolume0, 0);
    }

    function test_SwapUpdatesStats() public {
        swapRouter.swapExactTokensForTokens({
            amountIn: 1e18, amountOutMin: 0, zeroForOne: true,
            poolKey: poolKey, hookData: Constants.ZERO_BYTES,
            receiver: address(this), deadline: block.timestamp + 1
        });

        SwapStats.PoolStats memory stats = hook.getPoolStats(poolKey);
        assertEq(stats.totalSwaps, 1);
        assertGt(stats.totalVolume0, 0);
    }

    function test_MultipleSwapsAccumulate() public {
        for (uint256 i = 0; i < 3; i++) {
            swapRouter.swapExactTokensForTokens({
                amountIn: 1e18, amountOutMin: 0, zeroForOne: true,
                poolKey: poolKey, hookData: Constants.ZERO_BYTES,
                receiver: address(this), deadline: block.timestamp + 1
            });
        }
        assertEq(hook.getTotalSwaps(poolId), 3);
    }
}
