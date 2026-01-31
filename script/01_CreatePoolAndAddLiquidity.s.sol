// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {BaseScript} from "./base/BaseScript.sol";
import {LiquidityHelpers} from "./base/LiquidityHelpers.sol";

contract CreatePoolAndAddLiquidityScript is BaseScript, LiquidityHelpers {
    using CurrencyLibrary for Currency;

    /////////////////////////////////////
    // --- Configure These ---
    /////////////////////////////////////

    uint24 lpFee = 1000; // 0.10% fee tier
    int24 tickSpacing = 20; // appropriate for 0.10% fee

    // --- liquidity position configuration --- //
    // Current market price: 1 WETH = 3,098,610 MOLT
    // For ~$10 each side:
    uint256 public token0Amount = 0.004 ether;  // WETH (~$10)
    uint256 public token1Amount = 12395e18;     // MOLT (~$10 at market price: 0.004 * 3,098,610)

    // Starting price: sqrtPriceX96 = sqrt(price) * 2^96
    // price = MOLT/WETH = 3,098,610
    // sqrt(3,098,610) = 1760.2869
    // sqrtPriceX96 = 1760.2869 * 2^96 = 139,458,766,000,000,000,000,000,000,000,000
    uint160 startingPrice = 139458766000000000000000000000000;

    // range of the position, must be a multiple of tickSpacing
    int24 tickLower;
    int24 tickUpper;
    /////////////////////////////////////

    function run() external {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: lpFee,
            tickSpacing: tickSpacing,
            hooks: hookContract
        });

        bytes memory hookData = new bytes(0);

        int24 currentTick = TickMath.getTickAtSqrtPrice(startingPrice);

        tickLower = truncateTickSpacing((currentTick - 750 * tickSpacing), tickSpacing);
        tickUpper = truncateTickSpacing((currentTick + 750 * tickSpacing), tickSpacing);

        // Converts token amounts to liquidity units
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            startingPrice,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            token0Amount,
            token1Amount
        );

        // slippage limits
        uint256 amount0Max = token0Amount + 1;
        uint256 amount1Max = token1Amount + 1;

        (bytes memory actions, bytes[] memory mintParams) = _mintLiquidityParams(
            poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, deployerAddress, hookData
        );

        // multicall parameters
        bytes[] memory params = new bytes[](2);

        // Initialize Pool
        params[0] = abi.encodeWithSelector(positionManager.initializePool.selector, poolKey, startingPrice, hookData);

        // Mint Liquidity
        params[1] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector, abi.encode(actions, mintParams), block.timestamp + 3600
        );

        // If the pool is an ETH pair, native tokens are to be transferred
        uint256 valueToPass = currency0.isAddressZero() ? amount0Max : 0;

        vm.startBroadcast();
        tokenApprovals();

        // Multicall to atomically create pool & add liquidity
        positionManager.multicall{value: valueToPass}(params);
        vm.stopBroadcast();
    }
}
