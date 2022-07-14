// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import hre, { ethers } from 'hardhat'
import verifyContract from './verify'
import { BigNumber } from 'ethers'

const WAIT_CONFIRMATIONS = 5

async function main (): Promise<void> {
  const [deployer] = await ethers.getSigners()

  const ConfigurationManager = await ethers.getContractFactory('ConfigurationManager')
  const configurationManager = await ConfigurationManager.deploy()
  await configurationManager.deployTransaction.wait(WAIT_CONFIRMATIONS)
  console.log(`\nConfigurationManager deployed at: ${configurationManager.address}\n`)

  await verifyContract(hre, configurationManager.address, [])

  const assetName = 'stETH'
  const assetSymbol = 'stETH'

  const Asset = await ethers.getContractFactory('Asset')
  const asset = await Asset.deploy(assetName, assetSymbol)
  await asset.deployTransaction.wait(WAIT_CONFIRMATIONS)
  console.log(`\n${await asset.symbol()} deployed at: ${asset.address}\n`)
  await verifyContract(hre, asset.address, [assetName, assetSymbol])

  const InvestorActorMock = await ethers.getContractFactory('InvestorActorMock')
  const investor = await InvestorActorMock.deploy(asset.address)
  await investor.deployTransaction.wait(WAIT_CONFIRMATIONS)
  console.log(`\nInvestor deployed at: ${investor.address}\n`)
  await verifyContract(hre, investor.address, [asset.address])

  const Vault = await ethers.getContractFactory('STETHVault')
  const vaultConstructorArguments = [
    configurationManager.address,
    asset.address,
    investor.address
  ] as const

  const vault = await Vault.deploy(...vaultConstructorArguments)
  await vault.deployTransaction.wait(WAIT_CONFIRMATIONS)
  console.log(`\nVault deployed at: ${vault.address}\n`)
  await verifyContract(hre, vault.address, vaultConstructorArguments)

  await configurationManager.setParameter(
    vault.address,
    ethers.utils.formatBytes32String('VAULT_CONTROLLER'),
    deployer.address
  )
  await configurationManager.setParameter(
    vault.address,
    ethers.utils.formatBytes32String('WITHDRAW_FEE_RATIO'),
    BigNumber.from('100')
  )

  await (await investor.approveVaultToPull(vault.address)).wait(WAIT_CONFIRMATIONS)

  console.table({
    ConfigurationManager: configurationManager.address,
    Asset: asset.address,
    InvestorActorMock: investor.address,
    PrincipalProtectedMock: vault.address
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
