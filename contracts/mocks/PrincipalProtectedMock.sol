//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "../vaults/BaseVault.sol";
import "../mocks/YieldSourceMock.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract PrincipalProtectedMock is BaseVault {
    using TransferUtils for IERC20Metadata;
    using FixedPointMath for uint256;

    uint256 public constant DENOMINATOR = 10000;

    uint256 public lastRoundAssets;
    uint256 public lastSharePrice;
    uint256 public investorRatio = 5000;
    address public investor;

    YieldSourceMock public yieldSource;

    event RoundData(uint256 indexed roundId, uint256 roundAccruedInterest, uint256 investmentYield, uint256 idleAssets);

    constructor(
        address _underlying,
        address _strategist,
        address _investor,
        address _yieldSource
    ) BaseVault(_underlying, _strategist) {
        investor = _investor;
        yieldSource = YieldSourceMock(_yieldSource);
    }

    /**
     * @dev See {IVault-name}.
     */
    function name() external pure override returns (string memory) {
        return "Principal Protected Mock";
    }

    function _afterRoundStart(uint256 assets) internal override {
        if (assets > 0) {
            asset.approve(address(yieldSource), assets);
            yieldSource.deposit(assets, address(this));
        }
        lastRoundAssets = totalAssets();
        lastSharePrice = totalShares == 0 ? 0 : lastRoundAssets / totalShares;
    }

    function _afterRoundEnd() internal override {
        uint256 roundAccruedInterest;
        uint256 investmentYield = asset.balanceOf(investor);
        uint256 idleAssets = asset.balanceOf(address(this));

        if (totalShares != 0) {
            roundAccruedInterest = totalAssets() - lastRoundAssets;

            // Pulls the yields from investor
            if (investmentYield > 0) {
                asset.safeTransferFrom(investor, address(this), investmentYield);
            }

            // Redeposit to Yield source
            uint256 redepositAmount = asset.balanceOf(address(this)) - idleAssets;
            if (redepositAmount > 0) {
                asset.approve(address(yieldSource), redepositAmount);
                yieldSource.deposit(redepositAmount, address(this));
            }

            // Sends another batch to Investor
            uint256 investmentAmount = (roundAccruedInterest * investorRatio) / DENOMINATOR;
            if (investmentAmount > 0) {
                yieldSource.withdraw(investmentAmount);
                asset.safeTransfer(investor, investmentAmount);
            }
        }

        emit RoundData(currentRoundId, roundAccruedInterest, investmentYield, idleAssets);
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        return yieldSource.previewRedeem(yieldSource.balanceOf(address(this)));
    }

    function _beforeWithdraw(uint256 shares, uint256 assets) internal override {
        lastRoundAssets -= shares * lastSharePrice;
        yieldSource.withdraw(assets);
    }
}
