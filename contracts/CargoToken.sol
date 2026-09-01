// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CARGO (C.)
/// @notice A fixed-rate, ETH-backed settlement token for CargoChain.
///
/// The contract has no owner and no administrative mint or withdrawal path.
/// CARGO can only enter circulation through an explicit ETH deposit, and ETH
/// can only leave through a divisible token redemption.
contract CargoToken is ERC20, ReentrancyGuard {
    uint256 public constant CARGO_PER_ETH = 10_000;
    uint256 public constant REDEMPTION_UNIT = CARGO_PER_ETH;

    event CargoMinted(
        address indexed account,
        uint256 ethDeposited,
        uint256 cargoMinted
    );

    event CargoRedeemed(
        address indexed account,
        uint256 cargoBurned,
        uint256 ethReturned
    );

    constructor() ERC20("CARGO", "C.") {}

    /// @notice Deposit ETH and mint CARGO at the fixed deployment rate.
    function deposit() external payable nonReentrant {
        require(msg.value > 0, "deposit must be greater than zero");

        uint256 cargoAmount = msg.value * CARGO_PER_ETH;
        _mint(msg.sender, cargoAmount);
        emit CargoMinted(msg.sender, msg.value, cargoAmount);
    }

    /// @notice Burn divisible CARGO and return the matching amount of ETH.
    function redeem(uint256 cargoAmount) external nonReentrant {
        require(cargoAmount > 0, "redemption must be greater than zero");
        require(cargoAmount % REDEMPTION_UNIT == 0, "amount is not redeemable");
        require(cargoAmount <= balanceOf(msg.sender), "insufficient CARGO balance");

        uint256 ethAmount = cargoAmount / CARGO_PER_ETH;
        require(address(this).balance >= ethAmount, "insufficient ETH reserve");

        _burn(msg.sender, cargoAmount);
        (bool success, ) = payable(msg.sender).call{value: ethAmount}("");
        require(success, "ETH transfer failed");

        emit CargoRedeemed(msg.sender, cargoAmount, ethAmount);
    }

    /// @notice Return the ETH reserve held by the token contract.
    function reserveBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Return the largest divisible CARGO amount in an account.
    function redeemableBalance(address account) external view returns (uint256) {
        return balanceOf(account) - (balanceOf(account) % REDEMPTION_UNIT);
    }

    function cargoForEth(uint256 ethAmount) external pure returns (uint256) {
        return ethAmount * CARGO_PER_ETH;
    }

    function ethForCargo(uint256 cargoAmount) external pure returns (uint256) {
        require(cargoAmount % REDEMPTION_UNIT == 0, "amount is not redeemable");
        return cargoAmount / CARGO_PER_ETH;
    }

    /// @dev Deposits must be explicit so an accidental transfer cannot create
    /// an opaque conversion transaction or leave ETH without a mint event.
    receive() external payable {
        revert("use deposit");
    }

    fallback() external payable {
        revert("use deposit");
    }
}
