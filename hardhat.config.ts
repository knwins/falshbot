import { task, HardhatUserConfig } from 'hardhat/config';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-contract-sizer';

import deployer from './.secret';

// const ALCHEMY_POLYGON_MUMBAI_ENDPOINT = 'https://polygon-mumbai.g.alchemy.com/v2/u26FQtmGy9cw89gGVjJnoDc7v0ODftp5';
/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const config: HardhatUserConfig = {
  solidity: { version: '0.8.10' },
  networks: {
    hardhat: {
      forking: {
        url: deployer.infura_polygon_mumbai,
        enabled: true,
      },
      accounts: {
        accountsBalance: '1000000000000000000000000', // 1 mil ether
      },
    },
    polygon_mumbai: {
      url: deployer.infura_polygon_mumbai,
      accounts: [deployer.private],
      // allowUnlimitedContractSize: true,
      // gas: 6000000, //units of gas you are willing to pay, aka gas limit
      // gasPrice: 60000000000, //gas is typically in units of gwei, but you must enter it as wei here
    },
    polygon: {
      url: deployer.infura_polygon_main,
      accounts: [deployer.private],
    },
    optimism_goerli: {
      url: deployer.infure_optimism_goerli,
      accounts: [deployer.private],
    },
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: [':Flash'],
  },
  mocha: {
    timeout: 40000,
  },
  etherscan: {
    apiKey: deployer.polygonscan_verification_api_key,
  },
};

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = config;
