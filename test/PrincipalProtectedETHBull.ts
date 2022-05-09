import { Contract } from '@ethersproject/contracts'
import { expect } from 'chai'
import hre, { ethers } from 'hardhat'
import { BigNumber, Signer } from 'ethers'
import { describe } from 'mocha'
import { NetworkConfig } from 'hardhat/src/types/config'

function describeIfForking(title: string, suite: () => void) {
  const localNetwork: NetworkConfig = hre.network.config

  return 'forking' in localNetwork && localNetwork.forking?.enabled
    ? describe.only(title, suite)
    : describe.skip(title, suite)
}

function negate (value: BigNumber) {
  return ethers.utils.parseUnits('0').sub(value)
}

describeIfForking('PrincipalProtectedETHBull', () => {
  let asset: Contract, vault: Contract, yieldSource: Contract, investor: Contract
  let user0: Signer, user1: Signer, user2: Signer, vaultController: Signer
  let user0Address: string, user1Address: string
  let snapshotId: BigNumber

  before(async () => {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xCFFAd3200574698b78f32232aa9D63eABD290703"],
    })

    user0 = await ethers.getSigner('0xCFFAd3200574698b78f32232aa9D63eABD290703')

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0x15abb66bA754F05cBC0165A64A11cDed1543dE48"],
    })

    user1 = await ethers.getSigner('0x15abb66bA754F05cBC0165A64A11cDed1543dE48')

    ;[, , , user2, vaultController] = await ethers.getSigners()
    ;[user0Address, user1Address] = await Promise.all([
      user0.getAddress(),
      user1.getAddress()
    ])
    const DepositQueueLib = await ethers.getContractFactory('DepositQueueLib')
    const depositQueueLib = await DepositQueueLib.deploy()

    asset = await ethers.getContractAt('ERC20', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')

    const YieldSourceMock = await ethers.getContractFactory('YieldSourceMock')
    yieldSource = await YieldSourceMock.deploy(asset.address)

    const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
    investor = await InvestorActorMock.deploy(asset.address)

    const PrincipalProtectedETHBull = await ethers.getContractFactory('PrincipalProtectedETHBull', {
      libraries: {
        DepositQueueLib: depositQueueLib.address
      }
    })
    vault = await PrincipalProtectedETHBull.deploy(asset.address, await vaultController.getAddress(), investor.address, '0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE')

    // Give approval upfront that the vault can pull money from the investor contract
    await investor.approveVaultToPull(vault.address, ethers.constants.MaxUint256)

    await asset.connect(user0).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user1).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(user2).approve(vault.address, ethers.constants.MaxUint256)
    await asset.connect(vaultController).approve(vault.address, ethers.constants.MaxUint256)

  })

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId])
  })

  it('should add collateral and receive shares', async () => {
    const assetAmount = ethers.utils.parseUnits('100', 6)

    // User0 deposits to vault
    await expect(() => vault.connect(user0).deposit(assetAmount))
      .to.changeTokenBalances(
        asset,
        [user0, vault],
        [negate(assetAmount), assetAmount]
      )
    expect(await vault.depositQueueSize()).to.be.equal(1)
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(assetAmount)


    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)
    expect(await vault.sharesOf(user0Address)).to.be.equal(assetAmount)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(0)

    // Start round
    await vault.connect(vaultController).startRound()
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('cannot withdraw between a round\'s end and the beginning of the next', async () => {
    const assetAmount = ethers.utils.parseUnits('100', 6)

    await vault.connect(user0).deposit(assetAmount)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    await expect(vault.connect(user0).withdraw()).to.be.revertedWith('IVault__ForbiddenDuringProcessDeposits()')
  })

  it('cannot deposit between a round\'s end and the beginning of the next', async () => {
    const assetAmount = ethers.utils.parseUnits('10', 6)

    await vault.connect(vaultController).endRound()
    await expect(vault.connect(user0).deposit(assetAmount)).to.be.revertedWith('IVault__ForbiddenDuringProcessDeposits()')
  })

  it('cannot processQueue After round started', async () => {
    const assetAmount = ethers.utils.parseUnits('100', 6)

    await vault.connect(user0).deposit(assetAmount)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).startRound()
    await expect(vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())).to.be.revertedWith('IVault__NotProcessingDeposits()')
  })

  it('withdraws proportionally', async () => {
    const assetAmount = ethers.utils.parseUnits('100', 6)

    // Users deposits to vault
    await vault.connect(user0).deposit(assetAmount)
    await vault.connect(user0).deposit(assetAmount)
    await vault.connect(user1).deposit(assetAmount)

    expect(await asset.balanceOf(vault.address)).to.be.equal(assetAmount.mul(3))
    // expect(await asset.balanceOf(user0Address)).to.be.equal(0)
    // expect(await asset.balanceOf(user1Address)).to.be.equal(0)
    expect(await vault.depositQueueSize()).to.be.equal(2)
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(assetAmount.mul(2))
    expect(await vault.sharesOf(user1Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1Address)).to.be.equal(assetAmount)

    // Process deposits
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())
    expect(await vault.depositQueueSize()).to.be.equal(0)

    // Starts round 1
    await vault.connect(vaultController).startRound()

    // User0 withdraws
    await vault.connect(user0).withdraw()
    // expect(await asset.balanceOf(user0Address)).to.be.equal(assetAmount.mul(2))
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(0)

    // User1 withdraws
    await vault.connect(user1).withdraw()
    // expect(await asset.balanceOf(user1Address)).to.be.equal(assetAmount)
    expect(await vault.sharesOf(user1Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1Address)).to.be.equal(0)

    // Vault is empty
    expect(await asset.balanceOf(vault.address)).to.be.equal(0)
  })

  it('full cycle test case', async () => {
    // This test will only work if InvestRatio = 50%
    const assetAmount = ethers.utils.parseUnits('100', 6)
    await asset.connect(user0).mint(assetAmount)
    await asset.connect(user1).mint(assetAmount)

    // Round 0
    await vault.connect(user0).deposit(assetAmount)
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 1
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('20'))
    await vault.connect(vaultController).endRound()

    // Round 2
    await vault.connect(vaultController).startRound()
    await vault.connect(user1).deposit(assetAmount)
    await yieldSource.generateInterest(ethers.utils.parseEther('20'))
    await investor.generatePremium(ethers.utils.parseEther('1300'))
    await vault.connect(vaultController).endRound()
    await vault.connect(vaultController).processQueuedDeposits(0, await vault.depositQueueSize())

    // Round 3
    await vault.connect(vaultController).startRound()
    await yieldSource.generateInterest(ethers.utils.parseEther('70'))

    await vault.connect(user0).withdraw()
    await vault.connect(user1).withdraw()

    const expectedUser0Amount = '1495424836601307189542'
    const expectedUser1Amount = '104575163398692810458'

    expect(await asset.balanceOf(user0Address)).to.be.equal(expectedUser0Amount)
    expect(await vault.sharesOf(user0Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user0Address)).to.be.equal(0)

    expect(await asset.balanceOf(user1Address)).to.be.equal(expectedUser1Amount)
    expect(await vault.sharesOf(user1Address)).to.be.equal(0)
    expect(await vault.idleAmountOf(user1Address)).to.be.equal(0)

    expect(await vault.totalAssets()).to.be.equal(0)
  })
})
