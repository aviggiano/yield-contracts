// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";
import "../interfaces/IVaultMetadata.sol";
import "../libs/TransferUtils.sol";

contract Migration {
    using TransferUtils for IERC20;

    function migrate(IVaultMetadata from, IVaultMetadata to) external {
        require(from.asset() == to.asset(), "Vault assets must be the same");

        IERC20 asset = IERC20(from.asset());

        from.redeem(from.balanceOf(msg.sender), address(this), msg.sender);

        asset.approve(address(to), asset.balanceOf(address(this)));
        to.deposit(asset.balanceOf(address(this)), msg.sender);
    }

    function migrateWithPermit(
        IVaultMetadata from,
        IVaultMetadata to,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(from.asset() == to.asset(), "Vault assets must be the same");
        uint256 shares = from.balanceOf(msg.sender);

        IERC20 asset = IERC20(from.asset());

        IERC20Permit(address(from)).permit(msg.sender, address(this), shares, deadline, v, r, s);
        from.redeem(shares, address(this), msg.sender);

        asset.approve(address(to), asset.balanceOf(address(this)));
        to.deposit(asset.balanceOf(address(this)), msg.sender);
    }
}
