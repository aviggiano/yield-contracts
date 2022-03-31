import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber, Signer } from 'ethers'

describe('StrategyVault', () => {
  let underlying: Contract, vault: Contract
  let user0: Signer, user1: Signer, strategist: Signer
  let snapshotId: number

  before(async () => {
    [, user0, user1, strategist] = await ethers.getSigners()
    const Underlying = await ethers.getContractFactory('Underlying')
    underlying = await Underlying.deploy()

    const Vault = await ethers.getContractFactory('StrategyVault')
    vault = await Vault.deploy(underlying.address, await strategist.getAddress())

    await underlying.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await underlying.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await underlying.connect(strategist).approve(vault.address, ethers.constants.MaxUint256)
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('should add collateral and receive shares', async () => {
    const underlyingAmount = ethers.utils.parseEther('10')

    await underlying.connect(user0).mint(underlyingAmount)
    expect(await underlying.balanceOf(await user0.getAddress()))
      .to.be.equal(underlyingAmount)

    await vault.connect(user0).deposit(underlyingAmount)
    expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(0)
    expect(await underlying.balanceOf(vault.address)).to.be.equal(underlyingAmount)

    let user0UnlockedShares: BigNumber, user0LockedShares: BigNumber

    ;[user0UnlockedShares, user0LockedShares] = await vault.sharesOf(await user0.getAddress())
    expect(user0UnlockedShares).to.be.equal(0)
    expect(user0LockedShares).to.be.equal(underlyingAmount)

    await vault.connect(strategist).closeRound(await underlying.balanceOf(await strategist.getAddress()))

    ;[user0UnlockedShares, user0LockedShares] = await vault.sharesOf(await user0.getAddress())
    expect(user0UnlockedShares).to.be.equal(underlyingAmount)
    expect(user0LockedShares).to.be.equal(0)
  })

  it('withdraws proportionally', async () => {
    const underlyingAmount = ethers.utils.parseEther('10')
    await underlying.connect(user0).mint(underlyingAmount.mul(2))
    await underlying.connect(user1).mint(underlyingAmount)

    await vault.connect(user0).deposit(underlyingAmount)
    await vault.connect(user0).deposit(underlyingAmount)
    await vault.connect(user1).deposit(underlyingAmount)
    expect(await underlying.balanceOf(vault.address)).to.be.equal(underlyingAmount.mul(3))
    expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(0)
    expect(await underlying.balanceOf(await user1.getAddress())).to.be.equal(0)

    let user0UnlockedShares: BigNumber, user0LockedShares: BigNumber,
      user1UnlockedShares: BigNumber, user1LockedShares: BigNumber

    ;[user0UnlockedShares, user0LockedShares] = await vault.sharesOf(await user0.getAddress())
    expect(user0UnlockedShares).to.be.equal(0)
    expect(user0LockedShares).to.be.equal(underlyingAmount.mul(2))

    ;[user1UnlockedShares, user1LockedShares] = await vault.sharesOf(await user1.getAddress())
    expect(user1UnlockedShares).to.be.equal(0)
    expect(user1LockedShares).to.be.equal(underlyingAmount)

    await vault.connect(strategist).prepareRound()
    await vault.connect(user0).requestWithdraw(await user0.getAddress())
    await vault.connect(user1).requestWithdraw(await user1.getAddress())

    await vault.connect(strategist).closeRound(await underlying.balanceOf(await strategist.getAddress()))

    await vault.connect(user0).withdraw()
    expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(underlyingAmount.mul(2))
    ;[user0UnlockedShares, user0LockedShares] = await vault.sharesOf(await user0.getAddress())
    expect(user0UnlockedShares).to.be.equal(0)
    expect(user0LockedShares).to.be.equal(0)

    await vault.connect(user1).withdraw()
    expect(await underlying.balanceOf(await user1.getAddress())).to.be.equal(underlyingAmount)
    ;[user1UnlockedShares, user1LockedShares] = await vault.sharesOf(await user1.getAddress())
    expect(user1UnlockedShares).to.be.equal(0)
    expect(user1LockedShares).to.be.equal(0)

    expect(await underlying.balanceOf(vault.address)).to.be.equal(0)
  })

  it('redeposit test case', async () => {
    const underlyingAmount = ethers.utils.parseEther('100')
    await underlying.connect(user0).mint(underlyingAmount.mul(2))
    await underlying.connect(user1).mint(underlyingAmount)
    await underlying.connect(strategist).mint(underlyingAmount.mul(100))

    await vault.connect(user0).deposit(underlyingAmount)
    await vault.connect(user1).deposit(underlyingAmount)

    let user0UnlockedShares: BigNumber, user0LockedShares: BigNumber,
      user1UnlockedShares: BigNumber, user1LockedShares: BigNumber

    // Round 1
    await vault.connect(strategist).prepareRound()
    await vault.connect(strategist).closeRound(underlyingAmount.mul(3))

    // Round 2
    await vault.connect(user0).deposit(underlyingAmount)

    await vault.connect(strategist).prepareRound()
    await vault.connect(user0).requestWithdraw(await user0.getAddress())
    await vault.connect(user1).requestWithdraw(await user1.getAddress())
    await vault.connect(strategist).closeRound(underlyingAmount.mul(6))

    const expectedUser0Amount = ethers.utils.parseEther('375')
    const expectedUser1Amount = ethers.utils.parseEther('225')

    await vault.connect(user0).withdraw()
    expect(await underlying.balanceOf(await user0.getAddress())).to.be.equal(expectedUser0Amount)
    ;[user0UnlockedShares, user0LockedShares] = await vault.sharesOf(await user0.getAddress())
    expect(user0UnlockedShares).to.be.equal(0)
    expect(user0LockedShares).to.be.equal(0)

    await vault.connect(user1).withdraw()
    expect(await underlying.balanceOf(await user1.getAddress())).to.be.equal(expectedUser1Amount)
    ;[user1UnlockedShares, user1LockedShares] = await vault.sharesOf(await user1.getAddress())
    expect(user1UnlockedShares).to.be.equal(0)
    expect(user1LockedShares).to.be.equal(0)

    expect(await underlying.balanceOf(vault.address)).to.be.equal(0)
  })
})
