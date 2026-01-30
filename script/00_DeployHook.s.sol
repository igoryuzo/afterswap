// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console} from "forge-std/console.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {BaseScript} from "./base/BaseScript.sol";

import {SwapStats} from "../src/SwapStats.sol";

/// @notice Mines the address and deploys the SwapStats Hook contract
contract DeployHookScript is BaseScript {
    function run() public {
        // SwapStats only needs AFTER_SWAP_FLAG
        uint160 flags = uint160(Hooks.AFTER_SWAP_FLAG);

        // Mine a salt that will produce a hook address with the correct flags
        bytes memory constructorArgs = abi.encode(poolManager);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(SwapStats).creationCode, constructorArgs);

        // Deploy the hook using CREATE2
        vm.startBroadcast();
        SwapStats swapStats = new SwapStats{salt: salt}(poolManager);
        vm.stopBroadcast();

        require(address(swapStats) == hookAddress, "DeployHookScript: Hook Address Mismatch");

        console.log("SwapStats Hook deployed to:", address(swapStats));
    }
}
