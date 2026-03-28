// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {UniversalClaimLinks} from "../src/UniversalClaimLinks.sol";

contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockSwapRouter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient,
        bool payToRecipient
    ) external payable {
        if (tokenIn == address(0)) {
            require(msg.value == amountIn, "bad msg.value");
        } else {
            require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "transferFrom");
        }

        address dst = payToRecipient ? recipient : msg.sender;
        if (tokenOut == address(0)) {
            (bool ok,) = payable(dst).call{value: amountOut}("");
            require(ok, "native transfer failed");
        } else {
            require(IERC20(tokenOut).transfer(dst, amountOut), "transfer");
        }
    }

    receive() external payable {}
}

contract UniversalClaimLinksTest is Test {
    UniversalClaimLinks internal claimLinks;
    MockSwapRouter internal router;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal sender = makeAddr("sender");
    address internal receiver = makeAddr("receiver");
    address internal random = makeAddr("random");

    function _amount128(uint256 x) internal pure returns (uint128) {
        assertLe(x, uint256(type(uint128).max));
        unchecked {
            // forge-lint: disable-next-line(unsafe-typecast)
            return uint128(x);
        }
    }

    function setUp() public {
        claimLinks = new UniversalClaimLinks();
        router = new MockSwapRouter();
        tokenA = new MockERC20("Token A", "TA");
        tokenB = new MockERC20("Token B", "TB");

        tokenA.mint(sender, 1_000_000 ether);
        tokenB.mint(address(router), 1_000_000 ether);
        vm.deal(address(router), 1_000_000 ether);
        vm.deal(sender, 100 ether);
    }

    function testLockedClaim_ERC20In_SwapToERC20_ForwardedToRecipient() public {
        uint256 amountIn = 100 ether;
        vm.startPrank(sender);
        tokenA.approve(address(claimLinks), amountIn);
        uint256 claimId = claimLinks.createClaim(receiver, tokenA, _amount128(amountIn), uint40(block.timestamp + 1 days));
        vm.stopPrank();

        uint256 amountOut = 240 ether;
        bytes memory swapData = abi.encodeWithSelector(
            MockSwapRouter.swap.selector, address(tokenA), address(tokenB), amountIn, amountOut, receiver, false
        );

        vm.prank(receiver);
        claimLinks.executeClaimAndSwap(claimId, address(tokenB), address(router), swapData, 0, receiver);

        assertEq(tokenB.balanceOf(receiver), amountOut);
        UniversalClaimLinks.Claim memory c = claimLinks.getClaim(claimId);
        assertEq(c.status, 1);
    }

    function testOpenClaim_NativeIn_SwapToERC20_WithSecret() public {
        bytes memory secret = bytes("my-secret");
        bytes32 secretHash = keccak256(secret);

        vm.prank(sender);
        uint256 claimId =
            claimLinks.createClaimNativeOpen{value: 1 ether}(uint40(block.timestamp + 1 days), secretHash);

        uint256 amountOut = 500 ether;
        bytes memory swapData = abi.encodeWithSelector(
            MockSwapRouter.swap.selector, address(0), address(tokenB), 1 ether, amountOut, receiver, true
        );

        vm.prank(receiver);
        claimLinks.executeClaimAndSwap(claimId, address(tokenB), secret, address(router), swapData, 1 ether, receiver);

        assertEq(tokenB.balanceOf(receiver), amountOut);
        UniversalClaimLinks.Claim memory c = claimLinks.getClaim(claimId);
        assertEq(c.status, 1);
    }

    function testWrongReceiverCannotExecuteLockedClaim() public {
        uint256 amountIn = 50 ether;
        vm.startPrank(sender);
        tokenA.approve(address(claimLinks), amountIn);
        uint256 claimId = claimLinks.createClaim(receiver, tokenA, _amount128(amountIn), uint40(block.timestamp + 1 days));
        vm.stopPrank();

        bytes memory swapData = abi.encodeWithSelector(
            MockSwapRouter.swap.selector, address(tokenA), address(tokenB), amountIn, 10 ether, receiver, false
        );

        vm.prank(random);
        vm.expectRevert(UniversalClaimLinks.NotReceiver.selector);
        claimLinks.executeClaimAndSwap(claimId, address(tokenB), address(router), swapData, 0, receiver);
    }

    function testCancelAfterExpiryReturnsEscrow() public {
        uint256 amountIn = 12 ether;
        vm.startPrank(sender);
        tokenA.approve(address(claimLinks), amountIn);
        uint256 claimId = claimLinks.createClaim(receiver, tokenA, _amount128(amountIn), uint40(block.timestamp + 100));
        vm.stopPrank();

        vm.warp(block.timestamp + 101);
        uint256 balBefore = tokenA.balanceOf(sender);
        vm.prank(sender);
        claimLinks.cancelClaim(claimId);
        uint256 balAfter = tokenA.balanceOf(sender);

        assertEq(balAfter - balBefore, amountIn);
        UniversalClaimLinks.Claim memory c = claimLinks.getClaim(claimId);
        assertEq(c.status, 2);
    }

    function testExecuteClaim_ERC20SameToken() public {
        uint256 amountIn = 77 ether;
        vm.startPrank(sender);
        tokenA.approve(address(claimLinks), amountIn);
        uint256 claimId = claimLinks.createClaim(receiver, tokenA, _amount128(amountIn), uint40(block.timestamp + 1 days));
        vm.stopPrank();

        uint256 before = tokenA.balanceOf(receiver);
        vm.prank(receiver);
        claimLinks.executeClaim(claimId, address(tokenA), receiver);

        assertEq(tokenA.balanceOf(receiver) - before, amountIn);
        assertEq(claimLinks.getClaim(claimId).status, 1);
    }

    function testExecuteClaim_NativeOpenWithSecret() public {
        bytes memory secret = bytes("s");
        bytes32 secretHash = keccak256(secret);

        vm.prank(sender);
        uint256 claimId =
            claimLinks.createClaimNativeOpen{value: 2 ether}(uint40(block.timestamp + 1 days), secretHash);

        uint256 bal0 = receiver.balance;
        vm.prank(receiver);
        claimLinks.executeClaim(claimId, address(0), secret, receiver);

        assertEq(receiver.balance - bal0, 2 ether);
        assertEq(claimLinks.getClaim(claimId).status, 1);
    }

    function testExecuteClaim_RevertsIfTokenOutMismatch() public {
        uint256 amountIn = 10 ether;
        vm.startPrank(sender);
        tokenA.approve(address(claimLinks), amountIn);
        uint256 claimId = claimLinks.createClaim(receiver, tokenA, _amount128(amountIn), uint40(block.timestamp + 1 days));
        vm.stopPrank();

        vm.prank(receiver);
        vm.expectRevert(UniversalClaimLinks.TokenOutMismatch.selector);
        claimLinks.executeClaim(claimId, address(tokenB), receiver);
    }
}
