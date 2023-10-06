import { Contract } from '@ethersproject/contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers, waffle } from 'hardhat';
import { FlashBot } from '../typechain/FlashBot';
import { IWETH } from '../typechain/IWETH';

describe('Flashswap', () => {
  let weth: IWETH;
  let flashBot: FlashBot;

  const WETH = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619';
  const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

  beforeEach(async () => {
    const wethFactory = (await ethers.getContractAt('IWETH', WETH)) as IWETH;
    weth = wethFactory.attach(WETH) as IWETH;
    const fbFactory = await ethers.getContractFactory('FlashBot');
    flashBot = (await fbFactory.deploy(WETH)) as FlashBot;
    console.log(`flashBot.owner(): ${await flashBot.owner()} `);
  });

  describe('flash swap arbitrage', () => {
    let signer: SignerWithAddress;

    
    const uniFactoryAbi = ['function getPool(address, address, uint24) view returns (address pool)'];
    const quickswapFactoryAbi = ['function poolByPair(address, address) view returns (address pool)'];

    const uniPairAbi = ['function sync()'];
    const uniswapV3FactoryAddr = '0x1f98431c8ad98523631ae4a59f267346ea31f984';

    const uniswapV3Factory = new ethers.Contract(uniswapV3FactoryAddr, uniFactoryAbi, waffle.provider);
    let uniswapV3airAddr: any;
    let uniswapV3Pair: Contract;

    const sushiswapV3FactoryAddr = '0x917933899c6a5f8e37f31e19f92cdbff7e8ff0e2';
    const sushiswapV3Factory = new ethers.Contract(sushiswapV3FactoryAddr, uniFactoryAbi, waffle.provider);
    let sushiswapV3PairAddr: any;

    before(async () => {
      [signer] = await ethers.getSigners();
      uniswapV3airAddr = await uniswapV3Factory.getPool(WETH, USDC, 3000);
      uniswapV3Pair = new ethers.Contract(uniswapV3airAddr, uniPairAbi, waffle.provider);
      sushiswapV3PairAddr = await sushiswapV3Factory.getPool(WETH, USDC, 3000);
    });

    it('do flash swap between UniswapV3 and SushiswapV3', async () => {
      // transfer 1000 to Uniswap pair
      const amountEth = ethers.utils.parseEther('1000');
      await weth.deposit({ value: amountEth });
      await weth.transfer(uniswapV3airAddr, amountEth);
      await uniswapV3Pair.connect(signer).sync();

      const balanceBefore = await ethers.provider.getBalance(flashBot.address);
      await flashBot.flashArbitrage(uniswapV3airAddr, sushiswapV3PairAddr);
      const balanceAfter = await ethers.provider.getBalance(flashBot.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it('calculate how much profit we get', async () => {
      // transfer 1000 to Uniswap pair
      const amountEth = ethers.utils.parseEther('1000');
      await weth.deposit({ value: amountEth });
      await weth.transfer(uniswapV3airAddr, amountEth);
      await uniswapV3Pair.connect(signer).sync();

      const res = await flashBot.getProfit(uniswapV3airAddr, sushiswapV3PairAddr);
      expect(res.profit).to.be.gt(ethers.utils.parseEther('500'));
      expect(res.baseToken).to.be.eq(WETH);
    });

    it('revert if callback is called from address without permission', async () => {
      await expect(
        flashBot.uniswapV3Call(flashBot.address, ethers.utils.parseEther('1000'), 0, '0xabcd')
      ).to.be.revertedWith('Non permissioned address call');
    });
  });
});
