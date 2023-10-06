import { ethers, run } from 'hardhat';

//WETH address on polygon main 0x7ceb23fd6bc0add59e62ac25578270cff1b9f619
//WETH address on polygon mumbai 0x52d800ca262522580cebad275395ca6e7598c014
const WETHAddr = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'; //WETH 

//AAVE pool address provider  <https://docs.aave.com/developers/deployed-contracts/v3-mainnet/polygon> PoolAddressesProvider
//polygon-main 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb
// const poolAddressesProvider = '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb';
// const uniswapV3Router='0xE592427A0AEce92De3Edee1F18E0157C05861564';

async function main() {
  await run('compile');
  const FlashBot = await ethers.getContractFactory('FlashBot');
  const flashBot = await FlashBot.deploy(WETHAddr);
  console.log(`FlashBot deployed to ${flashBot.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
