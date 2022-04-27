//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../libs/FixedPointMath.sol";
import "./Underlying.sol";

contract InterestPool is ERC20("Interest Pool", "INTP") {
    using FixedPointMath for uint;

    Underlying public immutable underlying;

    constructor(address _underlying) {
        underlying = Underlying(_underlying);
    }

    function generateInterest(uint amount) external {
        underlying.mint(amount);
    }

    function deposit(uint amount, address receiver) external returns(uint shares) {
        shares = previewDeposit(amount);

        // Check for rounding error since we round down in previewDeposit.
        require(amount != 0, "Shares too low");

        underlying.transferFrom(msg.sender, address(this), amount);
        _mint(receiver, shares);
    }

    function withdraw(uint amount) external returns(uint shares) {
        shares = previewWithdraw(amount);

        _burn(msg.sender, shares);
        underlying.transfer(msg.sender, amount);
    }

    function redeem(uint shares) external returns(uint amount) {
        amount = previewRedeem(shares);

        // Check for rounding error since we round down in previewRedeem.
        require(amount != 0, "Shares too low");

        _burn(msg.sender, shares);
        underlying.transfer(msg.sender, amount);
    }

    function previewDeposit(uint amount) public view returns (uint) {
        return convertToShares(amount);
    }

    function previewWithdraw(uint amount) public view returns (uint) {
        uint supply = totalSupply();
        return supply == 0 ? amount : amount.mulDivUp(supply, totalAssets());
    }

    function previewRedeem(uint shares) public view returns (uint) {
        return convertToAssets(shares);
    }

    function totalAssets() public view returns(uint) {
        return underlying.balanceOf(address(this));
    }

    function convertToShares(uint amount) public view returns (uint) {
        uint supply = totalSupply();
        return supply == 0 ? amount : amount.mulDivDown(supply, totalAssets());
    }

    function convertToAssets(uint shares) public view returns (uint) {
        uint supply = totalSupply();
        return supply == 0 ? shares : shares.mulDivDown(totalAssets(), supply);
    }
}
