import { ethers, run } from 'hardhat';
import { FlashBot } from '../typechain/FlashBot';

async function main() {
  await run('compile');
  const flashBot: FlashBot = (await ethers.getContractAt(
    'FlashBot',
    '0x56fCF97De8Aac2e5036092AD8c2439eE5cCFbe6F' // contract address
  )) as FlashBot;

  const owner = await flashBot.owner();
  console.log(`Owner: ${owner}`);

  const tokens = await flashBot.getBaseTokens();
  console.log('Base tokens: ', tokens);

  
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
