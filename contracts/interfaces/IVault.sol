//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.6;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IVault is IERC20Metadata {
    error IVault__CallerIsNotTheStrategist();
    error IVault__NotProcessingDeposits();
    error IVault__ForbiddenWhileProcessingDeposits();

    event Deposit(address indexed owner, uint amountDeposited);
    event Withdraw(address indexed owner, uint sharesBurnt, uint amountWithdrawn);
    event StartRound(uint indexed roundId, uint amountAddedToStrategy);
    event EndRound(uint indexed roundId);
    event DepositProcessed(address indexed owner, uint indexed roundId, uint assets, uint shares);

    /**
     * @dev Deposits underlying tokens, generating shares.
     * @param amount The amount of underlying tokens to deposit
     */
    function deposit(uint amount) external;

    /**
     * @dev Burn shares, withdrawing underlying tokens.
     */
    function withdraw() external;
}
