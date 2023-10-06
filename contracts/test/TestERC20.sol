// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '../dependencies/openzeppelin/contracts/ERC20.sol';
import '../dependencies/openzeppelin/contracts/IERC20.sol';
import '../dependencies/openzeppelin/contracts/Ownable.sol';
import '../dependencies/openzeppelin/contracts/SafeMath.sol';

contract TestERC20 is ERC20, Ownable {
    using SafeMath for IERC20;
    using SafeMath for uint256;

    constructor(string memory name_, string memory sybmol_) ERC20(name_, sybmol_) {}

    function mint(address account_, uint256 amount_) external onlyOwner returns (bool) {
        _mint(account_, amount_);
        return true;
    }

    function burn(uint256 amount) public {
        _burn(msg.sender, amount);
    }
}

// pragma solidity ^0.8.0;

// import {ERC20PresetMinterPauser} from '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol';

// contract TestERC20 is ERC20PresetMinterPauser {
//     constructor(string memory name, string memory symbol) ERC20PresetMinterPauser(name, symbol) {}
// }
