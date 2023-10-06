import { expect } from 'chai';
import { ethers, waffle } from 'hardhat';
import { TestERC20 } from '../typechain/TestERC20';
import { FlashBot } from '../typechain/FlashBot';

import { flashBotFixture } from './shared/fixtures';

describe('FlashBot access control', () => {
  let weth: TestERC20;
  let flashBot: FlashBot;

  //部署WETH代币合约/FlashBot合约
  beforeEach(async () => {
    ({ weth, flashBot } = await waffle.loadFixture(flashBotFixture)); //weth TestERC20, flashBot FlashBot
  });

  //验证WETH代币合约/FlashBot合约Owner为同一个Owner
  it('Should set owner to deployer', async () => {
    const [owner] = await ethers.getSigners();
    const fbOwner = await flashBot.owner();
    console.log('Owner:' + fbOwner);
    expect(fbOwner).to.be.equal(owner.address);
  });

  //owner给FlashBot合约Send ETH
  it('Should be receivable', async () => {
    const [owner] = await ethers.getSigners();
    const Ownerbalance0 = await owner.getBalance();
    console.log(`owner ETH balanceBefore :${ethers.utils.formatEther(Ownerbalance0)}`);
    const amount = ethers.utils.parseEther('5.1');
    await owner.sendTransaction({
      to: flashBot.address,
      value: amount,
    });
    console.log(`Owner Send EtH ${amount} to ${flashBot.address}`);

    const Ownerbalance1 = await owner.getBalance();
    console.log(`owner ETH BlanceAfter:${ethers.utils.formatEther(Ownerbalance1)}`);

    const balance = await ethers.provider.getBalance(flashBot.address);
    console.log(`FlashBot contract ETH balance: ${balance}`);
    expect(balance).to.be.eq(amount);
  });

  //owner给FlashBot合约Send WETH代币
  it('Should be withdrawable', async () => {

    const flashBotBalanceBefore = await ethers.provider.getBalance(flashBot.address);
    console.log(`FlashBot contract ETH flashBotBalanceBefore: ${flashBotBalanceBefore}`);


    const [owner, addr1] = await ethers.getSigners();
    console.log(`owner: ${owner.address}`);
    console.log(`addr1: ${addr1.address}`);

    const amount = ethers.utils.parseEther('5.1');
    await addr1.sendTransaction({
      to: flashBot.address,
      value: amount,
    });
    console.log(`addr1 Send EtH ${amount} to ${flashBot.address}`);
    const flashBotBalanceAfter = await ethers.provider.getBalance(flashBot.address);
    console.log(`FlashBot contract ETH flashBotBalanceAfter: ${flashBotBalanceAfter}`);


    const wethAmount = ethers.utils.parseEther('100.1');
    await weth.mint(flashBot.address, wethAmount);
    console.log(`FlashBot contract mint WETH: ${wethAmount}`);

    const balanceBefore = await owner.getBalance();
    console.log(`owner ETH balanceBefore:${balanceBefore}`);

    const wethBlanceBefore = await weth.balanceOf(owner.address);
    console.log(`owner WETH BlanceBefore: ${wethAmount}`);

    // let addr1 withdraw so the gas not spend on owner
    expect(await flashBot.connect(addr1).withdraw())
      .to.emit(flashBot, 'Withdrawn')
      .withArgs(owner.address, amount);

    const balanceAfter = await owner.getBalance();
    const wethBlanceAfter = await weth.balanceOf(owner.address);
    expect(balanceAfter).to.be.eq(balanceBefore.add(amount));
    expect(wethBlanceAfter).to.be.eq(wethBlanceBefore.add(wethAmount));
  });
});
