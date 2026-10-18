// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Стейблкоїн. Випускати та спалювати може лише власник (StableEngine).
contract StableCoin is ERC20, Ownable {
    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Спалює токени з балансу викликача (тобто з балансу Engine).
    function burn(uint256 amount) external onlyOwner {
        _burn(msg.sender, amount);
    }
}
