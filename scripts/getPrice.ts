import { ethers } from 'hardhat';
import { FlashBot } from '../typechain/FlashBot';


async function main() {
  
  const pool0="0x5645dCB64c059aa11212707fbf4E7F984440a8Cf";
  const pool1="0x4646E8A5e1d14E2DA01577822D6346c7883C6890";
  const [signer] = await ethers.getSigners();
  const flashBot: FlashBot = (await ethers.getContractAt(
    'FlashBot',
    '0x635fcA577C5b6e1772acef04C2D1afbEe0Bc1efe', // your contract address //0x56fCF97De8Aac2e5036092AD8c2439eE5cCFbe6F(test network)
    signer
  )) as FlashBot;

  const result =await flashBot.getOrderedReserves(pool0,pool1);

  console.log(`pool0: ${pool0}`);
  console.log(`pool1: ${pool1}`);
  console.log(`result: ${result}`);
}

const args = process.argv.slice(2);

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
