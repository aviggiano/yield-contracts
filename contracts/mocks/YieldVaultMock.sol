// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity 0.8.17;

import "../vaults/BaseVault.sol";
import "./YieldSourceMock.sol";

contract YieldVaultMock is BaseVault {
    YieldSourceMock public yieldSource;

    constructor(
        IConfigurationManager _configuration,
        IERC20Metadata _asset,
        address _yieldSource
    ) BaseVault(_configuration, _asset, "YieldVaultMock", "YVM") {
        yieldSource = YieldSourceMock(_yieldSource);
    }

    function assetsOf(address owner) public view override returns (uint256) {
        uint256 shares = balanceOf(owner);
        return convertToAssets(shares) + idleAssetsOf(owner);
    }

    function totalAssets() public view override(ERC4626, IERC4626) returns (uint256) {
        return yieldSource.convertToAssets(yieldSource.balanceOf(address(this))) + vaultState.processedDeposits;
    }

    function _beforeWithdraw(uint256, uint256 assets) internal override {
        yieldSource.withdraw(assets, address(this), address(this));
    }

    function _afterRoundStart() internal override {
        if (yieldSource.previewDeposit(vaultState.processedDeposits) > 0) {
            IERC20Metadata(yieldSource.asset()).approve(address(yieldSource), vaultState.processedDeposits);
            yieldSource.deposit(vaultState.processedDeposits, address(this));
        }
    }
}
