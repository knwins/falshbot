import { BigNumber, BigNumberish, utils } from 'ethers';

interface Config {
  contractAddr: string;
  logLevel: string;
  minimumProfit: number;
  gasPrice: BigNumber;
  gasLimit: BigNumberish;
  scanUrl: string;
  concurrency: number;
}

const contractAddr = '0x0731ee3500945898ff0869b1c4ed6e89aee5e4c9'; // flash bot polygon contract address 
const gasPrice = utils.parseUnits('10', 'gwei');
const gasLimit = 350000;

const polygonScanApiKey = '8IG7J7CWN6XZQGSJU8ZGP7Z1CVVGENMR6B'; //  API key
const polygonScanUrl = `https://api.polygonscan.com/api?module=stats&action=maticprice&apikey=${polygonScanApiKey}`;

const config: Config = {
  contractAddr: contractAddr,
  logLevel: 'info',
  concurrency: 1,
  minimumProfit: 1, // in USD
  gasPrice: gasPrice,
  gasLimit: gasLimit,
  scanUrl: polygonScanUrl,
};

export default config;
