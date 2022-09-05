// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.9;

import "./BaseVault.sol";

/**
 * @title A Vault that use variable weekly yields to buy calls
 * @author Pods Finance
 */
contract STETHVault is BaseVault {
    using TransferUtils for IERC20Metadata;
    using FixedPointMath for uint256;
    using FixedPointMath for FixedPointMath.Fractional;
    using DepositQueueLib for DepositQueueLib.DepositQueue;

    uint8 public immutable sharePriceDecimals;
    uint256 public lastRoundAssets;
    FixedPointMath.Fractional public lastSharePrice;

    uint256 public constant investorRatio = 5000;
    address public immutable investor;

    event StartRoundData(uint256 indexed roundId, uint256 lastRoundAssets, uint256 sharePrice);
    event EndRoundData(
        uint256 indexed roundId,
        uint256 roundAccruedInterest,
        uint256 investmentYield,
        uint256 idleAssets
    );
    event SharePrice(uint256 indexed roundId, uint256 startSharePrice, uint256 endSharePrice);

    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _investor
    ) BaseVault(_configuration, _asset) {
        investor = _investor;
        sharePriceDecimals = asset.decimals();
    }

    /**
     * @inheritdoc ERC20
     */
    function name() public view override returns (string memory) {
        return string(abi.encodePacked(asset.symbol(), " Volatility Vault"));
    }

    /**
     * @inheritdoc ERC20
     */
    function symbol() public view override returns (string memory) {
        return string(abi.encodePacked(asset.symbol(), "vv"));
    }

    function _afterRoundStart(uint256) internal override {
        uint256 supply = totalSupply();

        lastRoundAssets = totalAssets();
        lastSharePrice = FixedPointMath.Fractional({
            numerator: supply == 0 ? 0 : lastRoundAssets,
            denominator: supply
        });

        uint256 sharePrice = lastSharePrice.denominator == 0 ? 0 : lastSharePrice.mulDivDown(10**sharePriceDecimals);
        emit StartRoundData(currentRoundId, lastRoundAssets, sharePrice);
    }

    function _afterRoundEnd() internal override {
        uint256 roundAccruedInterest = 0;
        uint256 endSharePrice = 0;
        uint256 investmentYield = asset.balanceOf(investor);
        uint256 supply = totalSupply();

        if (supply != 0) {
            roundAccruedInterest = totalAssets() - lastRoundAssets;
            uint256 investmentAmount = (roundAccruedInterest * investorRatio) / DENOMINATOR;

            // Pulls the yields from investor
            if (investmentYield > 0) {
                asset.safeTransferFrom(investor, address(this), investmentYield);
            }

            if (investmentAmount > 0) {
                asset.safeTransfer(investor, investmentAmount);
            }

            // End Share price needs to be calculated after the transfers between investor and vault
            endSharePrice = (totalAssets()).mulDivDown(10**sharePriceDecimals, supply);
        }
        uint256 startSharePrice = lastSharePrice.denominator == 0
            ? 0
            : lastSharePrice.mulDivDown(10**sharePriceDecimals);

        emit EndRoundData(currentRoundId, roundAccruedInterest, investmentYield, totalIdleAssets());
        emit SharePrice(currentRoundId, startSharePrice, endSharePrice);
    }

    function _beforeWithdraw(uint256 shares, uint256) internal override {
        lastRoundAssets -= shares.mulDivDown(lastSharePrice);
    }

    /**
     * @dev See {BaseVault-totalAssets}.
     */
    function totalAssets() public view override returns (uint256) {
        return asset.balanceOf(address(this)) - totalIdleAssets();
    }

    /**
     * @dev Pull assets from the caller and create shares to the receiver
     */
    function _deposit(
        uint256 assets,
        uint256 shares,
        address receiver
    ) internal override {
        _spendCap(shares);

        assets = _tryTransferSTETH(msg.sender, assets);
        depositQueue.push(DepositQueueLib.DepositEntry(receiver, assets));

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    /**
     * @dev Moves `amount` of stETH from `from` to this contract using the
     * allowance mechanism.
     *
     * Note that due to division rounding, not always is not possible to move
     * the entire amount, hence transfer is attempted, returning the
     * `effectiveAmount` transferred.
     *
     * For more information refer to: https://docs.lido.fi/guides/steth-integration-guide#1-wei-corner-case
     */
    function _tryTransferSTETH(address from, uint256 amount) internal returns (uint256 effectiveAmount) {
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(from, address(this), amount);
        return asset.balanceOf(address(this)) - balanceBefore;
    }
}
