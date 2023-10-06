import { ethers } from 'hardhat';
import { FlashBot } from '../typechain/FlashBot';

// 测试添加BaseToken
async function main() {
  const token = '0xa6fa4fb5f76172d178d61b04b0ecd319c5d1c0aa';

  const [signer] = await ethers.getSigners();
  const flashBot: FlashBot = (await ethers.getContractAt(
    'FlashBot',
    '0x56fCF97De8Aac2e5036092AD8c2439eE5cCFbe6F', // your contract address
    signer
  )) as FlashBot;

  await flashBot.addBaseToken(token);
  console.log(`Base token added: ${token}`);
}

const args = process.argv.slice(2);

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
