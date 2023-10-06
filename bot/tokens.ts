import fs from 'fs';
import path from 'path';
import 'lodash.combinations';
import lodash from 'lodash';
import { Contract } from '@ethersproject/contracts';
import { ethers } from 'hardhat';

import log from './log';
import { LogDescription } from 'ethers/lib/utils';

export enum Network {
  polygon = 'polygon',
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

//polygon主网
const polygonBaseTokens: Tokens = {
  weth: { symbol: 'WETH', address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619' },
};

//polygon主网
const polygonQuoteTokens: Tokens = {
  usdc: { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
  dai: { symbol: 'DAI', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063' },
  usdt: { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
  matic: { symbol: 'MATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' },
  // weth: { symbol: 'WETH', address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619' },
  wbtc: { symbol: 'WBTC', address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6' },
  link: { symbol: 'LINK', address: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39' },
  aave: { symbol: 'AAVE', address: '0xd6df932a45c0f255f85145f286ea0b292b21c90b' },
  crv: { symbol: 'CRV', address: '0x172370d5cd63279efa6d502dab29171933a610af' },
  ape: { symbol: 'APE', address: '0xB7b31a6BC18e48888545CE79e83E06003bE70930' },
  bnb: { symbol: 'BNB', address: '0x5c4b7CCBF908E64F32e12c6650ec0C96d717f03F' },
};

//polygon主网
const polygonDexes: AmmFactories = {
  uniswapV3: '0x1f98431c8ad98523631ae4a59f267346ea31f984', //getpool(address,address,uint24)
  sushiswapV3: '0x917933899c6a5f8e37f31e19f92cdbff7e8ff0e2', //getpool(address,address,uint24)
  // quickswapV3: '0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28', //poolByPair(address,address) AlgebraFactory
};

const polygonFees: Fees = {
  '0x1f98431c8ad98523631ae4a59f267346ea31f984': {
    'DAI-USDC': {
      fee: 100,
    },
    'USDT-USDC': {
      fee: 100,
    },
    'Matic-USDC': {
      fee: 100,
    },
    'WETH-USDC': {
      fee: 100,
    },
    'WBTC-USDC': {
      fee: 100,
    },
    'LINK-USDC': {
      fee: 500,
    },
    'AAVE-USDC': {
      fee: 100,
    },
    'CRV-USDC': {
      fee: 100,
    },
    'APE-USDC': {
      fee: 500,
    },
    'NBN-USDC': {
      fee: 100,
    },
  },
  '0x917933899c6a5f8e37f31e19f92cdbff7e8ff0e2': {
    'DAI-USDC': {
      fee: 100,
    },
    'USDT-USDC': {
      fee: 100,
    },
    'Matic-USDC': {
      fee: 100,
    },
    'WETH-USDC': {
      fee: 100,
    },
    'WBTC-USDC': {
      fee: 100,
    },
    'LINK-USDC': {
      fee: 500,
    },
    'AAVE-USDC': {
      fee: 500,
    },
    'CRV-USDC': {
      fee: 500,
    },
    'APE-USDC': {
      fee: 500,
    },
    'NBN-USDC': {
      fee: 100,
    },
  },
  '0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28': {
    'DAI-USDC': {
      fee: 100,
    },
    'USDT-USDC': {
      fee: 100,
    },
    'Matic-USDC': {
      fee: 100,
    },
    'WETH-USDC': {
      fee: 100,
    },
    'WBTC-USDC': {
      fee: 100,
    },
    'LINK-USDC': {
      fee: 500,
    },
    'AAVE-USDC': {
      fee: 500,
    },
    'CRV-USDC': {
      fee: 500,
    },
    'APE-USDC': {
      fee: 500,
    },
    'NBN-USDC': {
      fee: 100,
    },
  },
};

// const polygonBaseTokens: Tokens = {
// weth: { symbol: 'WETH', address: '0xc199807af4fedb02ee567ed0feb814a077de4802' },
// };

// const polygonQuoteTokens: Tokens = {
// usdc: { symbol: 'USDC', address: '0x52d800ca262522580cebad275395ca6e7598c014' },//

// dai: { symbol: 'DAI', address: '0xc8c0Cf9436F4862a8F60Ce680Ca5a9f0f99b5ded' },//
// usdt: { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
// matic: { symbol: 'Matic', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' },
// weth: { symbol: 'WETH', address: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619' },
// wbtc: { symbol: 'WBTC', address: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6' },
// link : { symbol: 'LINK', address: '0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39' },
// aave: { symbol: 'AAVE', address: '0xd6df932a45c0f255f85145f286ea0b292b21c90b' },
// crv: { symbol: 'CRV', address: '0x172370d5cd63279efa6d502dab29171933a610af' },
// APE: { symbol: 'APE', address: '0x3a58a54c066fdc0f2d55fc9c89f0415c92ebf3c4' },
// };

// const polygonDexes: AmmFactories = {
//   uniswapV2: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
//   sushiswapV2: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'
//   // quickswap: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
// };

function getFactories(network: Network): AmmFactories {
  switch (network) {
    case Network.polygon:
      return polygonDexes;
    default:
      throw new Error(`Unsupported network:${network}`);
  }
}

export function getTokens(network: Network): [Tokens, Tokens] {
  switch (network) {
    case Network.polygon:
      return [polygonBaseTokens, polygonQuoteTokens];
    default:
      throw new Error(`Unsupported network:${network}`);
  }
}

async function updatePairs(network: Network): Promise<ArbitragePair[]> {
  log.info('Updating arbitrage token pairs');
  const [baseTokens, quoteTokens] = getTokens(network);
  const factoryAddrs = getFactories(network);

  const factoryAbi = ['function getPool(address, address, uint24) view returns (address pool)'];
  const quickswapFactoryAbi = ['function poolByPair(address, address) view returns (address pool)'];

  // const factoryAbi = ['function getPair(address, address) view returns (address pair)'];

  let factories: Contract[] = [];

  log.info(`Fetch from dexes: ${Object.keys(factoryAddrs)}`);
  for (const key in factoryAddrs) {
    const addr = factoryAddrs[key];
    log.info(`addr: ${addr}`);
    if (key == 'quickswapV3') {
      const factory = new ethers.Contract(addr, quickswapFactoryAbi, ethers.provider);
      factories.push(factory);
    } else {
      const factory = new ethers.Contract(addr, factoryAbi, ethers.provider);
      factories.push(factory);
    }
  }

  let tokenPairs: TokenPair[] = [];
  for (const key in baseTokens) {
    const baseToken = baseTokens[key];
    for (const quoteKey in quoteTokens) {
      const quoteToken = quoteTokens[quoteKey];
      let tokenPair: TokenPair = { symbols: `${quoteToken.symbol}-${baseToken.symbol}`, fee: 100, pairs: [] };

      for (const factory of factories) {
        // const pair = await factory.getPair(baseToken.address, quoteToken.address); //V2
        if (factory.address == '0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28') {
          const pool = await factory.poolByPair(baseToken.address, quoteToken.address);
          // log.info(`-------------------------------------`);
          // log.info(`symbols: ${tokenPair.symbols}`);
          // log.info(`factory address: ${factory.address}`);
          // log.info(`baseToken: ${baseToken.address}`);
          // log.info(`quoteToken: ${quoteToken.address}`);
          // log.info(`pool: ${pool}`);
          if (pool != ZERO_ADDRESS) {
            tokenPair.pairs.push(pool);
          }
        } else {
          const poolFee = getPoolFee(factory.address, tokenPair.symbols);
          tokenPair.fee = poolFee;
          log.info(`poolFee: ${poolFee}`);
          const pool = await factory.getPool(baseToken.address, quoteToken.address, poolFee);
          // log.info(`-------------------------------------`);
          // log.info(`symbols: ${tokenPair.symbols}`);
          // log.info(`factory address: ${factory.address}`);
          // log.info(`baseToken: ${baseToken.address}`);
          // log.info(`quoteToken: ${quoteToken.address}`);
          // log.info(`pool: ${pool}`);
          if (pool != ZERO_ADDRESS) {
            tokenPair.pairs.push(pool);
          }
        }
      }
      if (tokenPair.pairs.length >= 2) {
        tokenPairs.push(tokenPair);
      }
    }
  }

  let allPairs: ArbitragePair[] = [];
  for (const tokenPair of tokenPairs) {
    if (tokenPair.pairs.length < 2) {
      continue;
    } else if (tokenPair.pairs.length == 2) {
      allPairs.push(tokenPair as ArbitragePair);
    } else {
      // @ts-ignore
      const combinations = lodash.combinations(tokenPair.pairs, 2);
      for (const pair of combinations) {
        const arbitragePair: ArbitragePair = {
          symbols: tokenPair.symbols,
          pairs: pair,
          fee: tokenPair.fee,
        };
        allPairs.push(arbitragePair);
      }
    }
  }
  return allPairs;
}

function getPoolFee(factoryAddress: string, symbol: string) {
  for (const key in polygonFees) {
    if (factoryAddress == key) {
      const factories: Factory = polygonFees[key];
      for (const key in factories) {
        if (symbol == key) {
          const fee: Fee = factories[key];
          return fee.fee;
        }
      }
    }
  }
  return 3000;
}

function getPairsFile(network: Network) {
  return path.join(__dirname, `../pairs-${network}.json`);
}

export async function tryLoadPairs(network: Network): Promise<ArbitragePair[]> {
  let pairs: ArbitragePair[] | null;
  const pairsFile = getPairsFile(network);
  try {
    pairs = JSON.parse(fs.readFileSync(pairsFile, 'utf-8'));
    log.info('Load pairs from json');
  } catch (err) {
    pairs = null;
  }

  if (pairs) {
    return pairs;
  }
  pairs = await updatePairs(network);

  fs.writeFileSync(pairsFile, JSON.stringify(pairs, null, 2));
  return pairs;
}
