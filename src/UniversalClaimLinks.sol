// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";

contract UniversalClaimLinks is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint8 internal constant STATUS_OPEN = 0;
    uint8 internal constant STATUS_EXECUTED = 1;
    uint8 internal constant STATUS_CANCELLED = 2;
    address internal constant TOKEN_NATIVE = address(0);
    uint256 internal constant MAX_EXPIRY_DURATION = 30 days;

    struct Claim {
        uint128 amountIn;
        uint40 expiry;
        uint8 status;
        address sender;
        address receiver; // address(0) for open claims until executed
        address tokenIn;
        bytes32 secretHash; // bytes32(0) for address-locked claims
    }

    mapping(uint256 => Claim) private _claims;

    address public owner;
    uint256 public nextClaimId;

    event ClaimCreated(
        uint256 indexed claimId,
        address indexed sender,
        address indexed receiver,
        address tokenIn,
        uint256 amountIn,
        uint40 expiry,
        bool isOpen
    );
    event ClaimExecuted(
        uint256 indexed claimId,
        address indexed receiver,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address swapTo
    );
    event ClaimCancelled(uint256 indexed claimId, address indexed sender, address tokenIn, uint256 amountIn);

    error ZeroAddress();
    error InvalidReceiver();
    error InvalidAmount();
    error InvalidExpiry();
    error InvalidSecret();
    error ClaimNotFound();
    error NotReceiver();
    error NotSender();
    error NotOpen();
    error ClaimExpired();
    error NotExpired();
    error InvalidSwapTarget();
    error InvalidSwapValue();
    error SwapFailed();
    error TransferFailed();
    error NotOwner();
    error TokenOutMismatch();

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
    }

    constructor() {
        owner = msg.sender;
        nextClaimId = 1;
    }

    receive() external payable {}

    /// @dev Aggregators (e.g. Uniswap) return `transaction.{to,calldata,value}` for the swap executor — use this contract’s address when requesting quotes.
    function _toUint128(uint256 x) internal pure returns (uint128 r) {
        if (x > type(uint128).max) revert InvalidAmount();
        unchecked {
            // forge-lint: disable-next-line(unsafe-typecast)
            r = uint128(x);
        }
    }

    function createClaim(address receiver, IERC20 tokenIn, uint128 amountIn, uint40 expiry)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 claimId)
    {
        if (receiver == address(0) || receiver == msg.sender || receiver == address(this)) revert InvalidReceiver();
        if (amountIn == 0) revert InvalidAmount();
        _validateExpiry(expiry);
        if (address(tokenIn) == TOKEN_NATIVE) revert ZeroAddress();

        uint256 received = _pullTokens(tokenIn, amountIn);

        claimId = _createClaim(msg.sender, receiver, address(tokenIn), _toUint128(received), expiry, bytes32(0), false);
    }

    function createClaimNative(address receiver, uint40 expiry)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 claimId)
    {
        if (receiver == address(0) || receiver == msg.sender || receiver == address(this)) revert InvalidReceiver();
        if (msg.value == 0 || msg.value > type(uint128).max) revert InvalidAmount();
        _validateExpiry(expiry);

        claimId = _createClaim(msg.sender, receiver, TOKEN_NATIVE, _toUint128(msg.value), expiry, bytes32(0), false);
    }

    function createClaimOpen(IERC20 tokenIn, uint128 amountIn, uint40 expiry, bytes32 secretHash)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 claimId)
    {
        if (secretHash == bytes32(0)) revert InvalidSecret();
        if (amountIn == 0) revert InvalidAmount();
        _validateExpiry(expiry);
        if (address(tokenIn) == TOKEN_NATIVE) revert ZeroAddress();

        uint256 received = _pullTokens(tokenIn, amountIn);

        claimId = _createClaim(msg.sender, address(0), address(tokenIn), _toUint128(received), expiry, secretHash, true);
    }

    function createClaimNativeOpen(uint40 expiry, bytes32 secretHash)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 claimId)
    {
        if (secretHash == bytes32(0)) revert InvalidSecret();
        if (msg.value == 0 || msg.value > type(uint128).max) revert InvalidAmount();
        _validateExpiry(expiry);

        claimId = _createClaim(msg.sender, address(0), TOKEN_NATIVE, _toUint128(msg.value), expiry, secretHash, true);
    }

    /// @notice Payout escrow to `recipient` in the **same** asset as `tokenIn` (`tokenOut` must equal `tokenIn`). No DEX call.
    function executeClaim(uint256 claimId, address tokenOut, address recipient) external nonReentrant {
        _executeClaimPayout(claimId, tokenOut, bytes(""), recipient);
    }

    /// @notice Open claim: `secret` must satisfy `keccak256(secret) == claim.secretHash`.
    function executeClaim(uint256 claimId, address tokenOut, bytes calldata secret, address recipient) external nonReentrant {
        _executeClaimPayout(claimId, tokenOut, secret, recipient);
    }

    function _executeClaimPayout(uint256 claimId, address tokenOut, bytes memory secret, address recipient)
        internal
        whenNotPaused
    {
        if (recipient == address(0)) revert InvalidReceiver();

        Claim storage c = _claims[claimId];
        if (c.sender == address(0)) revert ClaimNotFound();
        if (c.status != STATUS_OPEN) revert NotOpen();
        if (block.timestamp >= c.expiry) revert ClaimExpired();

        if (c.secretHash == bytes32(0)) {
            if (msg.sender != c.receiver) revert NotReceiver();
        } else {
            if (keccak256(secret) != c.secretHash) revert InvalidSecret();
            c.receiver = msg.sender;
        }

        address tokenIn = c.tokenIn;
        if (tokenIn != tokenOut) revert TokenOutMismatch();

        address receiver = c.receiver;
        uint256 amountIn = uint256(c.amountIn);
        c.status = STATUS_EXECUTED;

        uint256 amountOut = _payoutSameToken(tokenIn, amountIn, recipient);
        emit ClaimExecuted(claimId, receiver, tokenIn, tokenOut, amountIn, amountOut, address(0));
    }

    function _payoutSameToken(address token, uint256 amount, address recipient) internal returns (uint256) {
        if (token == TOKEN_NATIVE) {
            (bool sent,) = payable(recipient).call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
        return amount;
    }

    /// @notice Locked claim: `swapTo` / `swapCalldata` / `swapValue` from the aggregator quote (executor = this contract).
    function executeClaimAndSwap(
        uint256 claimId,
        address tokenOut,
        address swapTo,
        bytes calldata swapCalldata,
        uint256 swapValue,
        address recipient
    ) external nonReentrant {
        _executeClaimAndSwap(claimId, tokenOut, bytes(""), swapTo, swapCalldata, swapValue, recipient);
    }

    /// @notice Open claim: `secret` must satisfy `keccak256(secret) == claim.secretHash`.
    function executeClaimAndSwap(
        uint256 claimId,
        address tokenOut,
        bytes calldata secret,
        address swapTo,
        bytes calldata swapCalldata,
        uint256 swapValue,
        address recipient
    ) external nonReentrant {
        _executeClaimAndSwap(claimId, tokenOut, secret, swapTo, swapCalldata, swapValue, recipient);
    }

    function _executeClaimAndSwap(
        uint256 claimId,
        address tokenOut,
        bytes memory secret,
        address swapTo,
        bytes calldata swapCalldata,
        uint256 swapValue,
        address recipient
    ) internal whenNotPaused {
        if (swapTo == address(0)) revert InvalidSwapTarget();
        if (recipient == address(0)) revert InvalidReceiver();

        Claim storage c = _claims[claimId];
        if (c.sender == address(0)) revert ClaimNotFound();
        if (c.status != STATUS_OPEN) revert NotOpen();
        if (block.timestamp >= c.expiry) revert ClaimExpired();

        if (c.secretHash == bytes32(0)) {
            if (msg.sender != c.receiver) revert NotReceiver();
        } else {
            if (keccak256(secret) != c.secretHash) revert InvalidSecret();
            c.receiver = msg.sender;
        }

        address tokenIn = c.tokenIn;
        address receiver = c.receiver;
        uint256 amountIn = uint256(c.amountIn);
        c.status = STATUS_EXECUTED;
        uint256 amountOut = _swapAndForward(tokenIn, tokenOut, amountIn, swapTo, swapCalldata, swapValue, recipient);
        emit ClaimExecuted(claimId, receiver, tokenIn, tokenOut, amountIn, amountOut, swapTo);
    }

    function _swapAndForward(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address swapTo,
        bytes calldata swapCalldata,
        uint256 swapValue,
        address recipient
    ) internal returns (uint256 amountOut) {
        uint256 outBefore = tokenOut == TOKEN_NATIVE
            ? address(this).balance - (tokenIn == TOKEN_NATIVE ? amountIn : 0)
            : IERC20(tokenOut).balanceOf(address(this));

        if (tokenIn == TOKEN_NATIVE) {
            if (swapValue != amountIn) revert InvalidSwapValue();
            (bool ok,) = swapTo.call{value: swapValue}(swapCalldata);
            if (!ok) revert SwapFailed();
        } else {
            if (swapValue != 0) revert InvalidSwapValue();
            IERC20(tokenIn).forceApprove(swapTo, amountIn);
            (bool ok,) = swapTo.call(swapCalldata);
            IERC20(tokenIn).forceApprove(swapTo, 0);
            if (!ok) revert SwapFailed();
        }

        uint256 outAfter =
            tokenOut == TOKEN_NATIVE ? address(this).balance : IERC20(tokenOut).balanceOf(address(this));
        if (outAfter <= outBefore) return 0;

        amountOut = outAfter - outBefore;
        if (tokenOut == TOKEN_NATIVE) {
            (bool sent,) = payable(recipient).call{value: amountOut}("");
            if (!sent) revert TransferFailed();
        } else {
            IERC20(tokenOut).safeTransfer(recipient, amountOut);
        }
    }

    function cancelClaim(uint256 claimId) external nonReentrant {
        Claim storage c = _claims[claimId];
        if (c.sender == address(0)) revert ClaimNotFound();
        if (c.status != STATUS_OPEN) revert NotOpen();
        if (block.timestamp < c.expiry) revert NotExpired();
        if (msg.sender != c.sender) revert NotSender();

        c.status = STATUS_CANCELLED;

        if (c.tokenIn == TOKEN_NATIVE) {
            (bool ok,) = payable(c.sender).call{value: c.amountIn}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(c.tokenIn).safeTransfer(c.sender, c.amountIn);
        }

        emit ClaimCancelled(claimId, c.sender, c.tokenIn, c.amountIn);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return _claims[claimId];
    }

    function _createClaim(
        address sender,
        address receiver,
        address tokenIn,
        uint128 amountIn,
        uint40 expiry,
        bytes32 secretHash,
        bool isOpen
    ) internal returns (uint256 claimId) {
        claimId = nextClaimId++;
        _claims[claimId] = Claim({
            amountIn: amountIn,
            expiry: expiry,
            status: STATUS_OPEN,
            sender: sender,
            receiver: receiver,
            tokenIn: tokenIn,
            secretHash: secretHash
        });

        emit ClaimCreated(claimId, sender, receiver, tokenIn, amountIn, expiry, isOpen);
    }

    function _validateExpiry(uint40 expiry) internal view {
        if (expiry <= block.timestamp || expiry > block.timestamp + MAX_EXPIRY_DURATION) revert InvalidExpiry();
    }

    function _pullTokens(IERC20 token, uint128 amount) internal returns (uint256 received) {
        uint256 balBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - balBefore;
        if (received == 0 || received > type(uint128).max) revert InvalidAmount();
    }
}
