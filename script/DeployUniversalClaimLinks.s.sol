// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {UniversalClaimLinks} from "../src/UniversalClaimLinks.sol";

/// @notice Deploy `UniversalClaimLinks` (no constructor args). Set deployer key via `forge script` flags or env.
contract DeployUniversalClaimLinks is Script {
    function run() external {
        vm.startBroadcast();
        UniversalClaimLinks claimLinks = new UniversalClaimLinks();
        vm.stopBroadcast();

        console2.log("UniversalClaimLinks deployed at:", address(claimLinks));
        console2.log("Set frontend VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS to the address above.");
    }
}
