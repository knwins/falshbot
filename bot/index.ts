import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import pool from '@ricokahler/pool';
import AsyncLock from 'async-lock';

import { Network, tryLoadPairs, getTokens } from './tokens';
import { getBnbPrice } from './basetoken-price';
import log from './log';
import config from './config';
import { syslog } from 'winston/lib/winston/config';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function calcNetProfit(profitWei: BigNumber, address: string, baseTokens: Tokens): Promise<number> {
  let price = 1;
  if (baseTokens.wbnb.address == address) {
    price = await getBnbPrice();
  }
  let profit = parseFloat(ethers.utils.formatEther(profitWei));
  profit = profit * price;

  const gasCost = price * parseFloat(ethers.utils.formatEther(config.gasPrice)) * (config.gasLimit as number);
  return profit - gasCost;
}

function arbitrageFunc(flashBot: FlashBot, baseTokens: Tokens) {
  const lock = new AsyncLock({ timeout: 10000, maxPending: 10 });
  return async function arbitrage(pair: ArbitragePair) {
    const [pair0, pair1] = pair.pairs;

    let res: [BigNumber, string] & {
      profit: BigNumber;
      baseToken: string;
      borrowAmount:BigNumber;
    };
    try {
      // log.info(`pair0: ${pair0}`);
      // log.info(`pair1: ${pair1}`);
      res = await flashBot.getProfit(pair0, pair1);
      log.info(`${pair.symbols}:borrow amount ${res.borrowAmount} qutoe token, profit:${res.profit} base token.`);
    } catch (err) {
      // log.info(err);
      return;
    }

    if (res.profit.gt(BigNumber.from('0'))) {
      const netProfit = await calcNetProfit(res.profit, res.baseToken, baseTokens);
      if (netProfit < config.minimumProfit) {
        return;
      }

      log.info(`Calling flash arbitrage, net profit: ${netProfit}`);
      try {
        // lock to prevent tx nonce overlap
        await lock.acquire('flash-bot', async () => {
          const response = await flashBot.aaveFlashArbitrage(pair0, pair1, {
            gasPrice: config.gasPrice,
            gasLimit: config.gasLimit,
          });
          const receipt = await response.wait(1);
          log.info(`Tx: ${receipt.transactionHash}`);
        });
      } catch (err) {
        if (err.message === 'Too much pending tasks' || err.message === 'async-lock timed out') {
          return;
        }
        log.error(err);
      }
    }
  };
}

async function main() {
  const pairs = await tryLoadPairs(Network.polygon);

  const flashBot = (await ethers.getContractAt('FlashBot', config.contractAddr)) as FlashBot;

  const [baseTokens] = getTokens(Network.polygon);

  log.info(`Start arbitraging contract: ${config.contractAddr}-${Network.polygon}`);
  while (true) {
    await pool({
      collection: pairs,
      task: arbitrageFunc(flashBot, baseTokens),
      // maxConcurrency: config.concurrency,
    });
    await sleep(1000);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error(err);
    process.exit(1);
  });
