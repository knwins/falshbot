//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
pragma abicoder v2;

import {SafeCast} from '@uniswap/v3-core/contracts/libraries/SafeCast.sol';

//openzeppelin
import {IERC20} from './dependencies/openzeppelin/contracts/IERC20.sol';
import {Ownable} from './dependencies/openzeppelin/contracts/Ownable.sol';
import {SafeMath} from './dependencies/openzeppelin/contracts/SafeMath.sol';
import {EnumerableSet} from './dependencies/openzeppelin/contracts/EnumerableSet.sol';

//uniswap
import {GPv2SafeERC20} from './dependencies/gnosis/contracts/GPv2SafeERC20.sol';
import {IERC20Minimal} from './dependencies/uniswap-v3-core/IERC20Minimal.sol';
import {OracleLibrary} from './dependencies/uniswap-v3-periphery/OracleLibrary.sol';

import 'hardhat/console.sol';
import {IWETH} from './interfaces/IWETH.sol';
import {IUniswapV3Pool} from './interfaces/IUniswapV3Pool.sol';
import {IUniswapV3Callee} from './interfaces/IUniswapV3Callee.sol';

struct OrderedReserves {
    uint256 a1; // base asset
    uint256 b1;
    uint256 a2;
    uint256 b2;
}

struct PoolDetail {
    bool zeroForOne;
    address baseToken;
    address quoteToken;
    uint8 baseDecimals;
    uint8 quoteDecimals;
    uint24 fee;
}

struct CallbackData {
    address debtPool;
    address targetPool;
    bool debtZoreForOne;
    address borrowedToken;
    address debtToken;
    uint256 debtAmount;
    uint256 debtTokenOutAmount;
}

contract FlashBot is Ownable {
    // using
    using SafeMath for uint256;
    using GPv2SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ACCESS CONTROL
    // Only the `permissionedPairAddress` may call the `uniswapV3Call` function
    address permissionedPairAddress = address(1);

    // WETH on polygon
    address immutable WETH;

    // calculate borrow quoteToken default decimals 18;
    uint8 immutable defaultDecimals = 18;

    // AVAILABLE BASE TOKENS
    EnumerableSet.AddressSet baseTokens;

    event Withdrawn(address indexed to, uint256 indexed value);
    event BaseTokenAdded(address indexed token);
    event BaseTokenRemoved(address indexed token);
    event SwapCallback(int256 amount0Delta, int256 amount1Delta);

    constructor(address _WETH) {
        WETH = _WETH;
        baseTokens.add(_WETH);
    }

    /// @dev Redirect uniswap callback function
    /// The callback function on different DEX are not same, so use a fallback to redirect to uniswapV3SwapCallback
    fallback(bytes calldata _input) external returns (bytes memory) {
        (int256 amount0Delta, int256 amount1Delta, ) = abi.decode(_input[3:], (int256, int256, bytes));
        uniswapV3SwapCallback(amount0Delta, amount1Delta, _input);
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) public {
        address sender = abi.decode(data, (address));
        emit SwapCallback(amount0Delta, amount1Delta);

        // access control
        require(msg.sender == permissionedPairAddress, 'Non permissioned address call');
        require(sender == address(this), 'Not from this contract');

        int256 borrowedAmount = amount0Delta > 0 ? amount0Delta : amount1Delta;

        CallbackData memory callbackData = abi.decode(data, (CallbackData));

        IERC20(callbackData.borrowedToken).safeTransfer(callbackData.targetPool, uint256(borrowedAmount));

        uint160 sqrtPriceLimitX96 = (
            callbackData.debtZoreForOne
                ? uint160(4295128739) + 1
                : uint160(1461446703485210103287273052203988822378723970342) - 1
        );
        IUniswapV3Pool(callbackData.targetPool).swap(
            address(this),
            callbackData.debtZoreForOne,
            int256(callbackData.debtTokenOutAmount),
            sqrtPriceLimitX96,
            new bytes(0)
        );

        IERC20(callbackData.debtToken).safeTransfer(callbackData.debtPool, callbackData.debtAmount);
    }

    /// @notice Do an arbitrage between two Uniswap-like AMM pools
    /// @dev Two pools must contains same token pair
    function flashArbitrage(address pool0, address pool1) external {
        PoolDetail memory poolDetail = getPoolDetail(pool0);

        (address lowerPool, address higherPool, OrderedReserves memory orderedReserves) = getOrderedReserves(
            pool0,
            pool1
        );

        // this must be updated every transaction for callback origin authentication
        permissionedPairAddress = lowerPool;

        uint256 balanceBefore = IERC20(poolDetail.baseToken).balanceOf(address(this));

        // avoid stack too deep error
        {
            //borrow quote token
            uint256 _borrowAmount = calcBorrowAmount(orderedReserves);

            uint256 borrowAmount = poolDetail.quoteDecimals <= defaultDecimals
                ? _borrowAmount / (10 ** (defaultDecimals - poolDetail.quoteDecimals))
                : _borrowAmount * (10 ** (poolDetail.quoteDecimals - defaultDecimals));

            uint256 lowerPoolDebtAmount = getAmountOut(lowerPool, poolDetail.quoteToken, uint128(borrowAmount), 10);
            uint256 higherPoolDebtAmount = getAmountOut(higherPool, poolDetail.quoteToken, uint128(borrowAmount), 10);
            require(higherPoolDebtAmount > lowerPoolDebtAmount, 'Arbitrage fail, no profit');
            console.log('Profit:', (higherPoolDebtAmount - lowerPoolDebtAmount) / (10 ** poolDetail.baseDecimals)); // baseToken Decimals is  10**18;

            // can only initialize this way to avoid stack too deep error
            CallbackData memory callbackData;
            callbackData.debtPool = lowerPool;
            callbackData.targetPool = higherPool;
            callbackData.debtZoreForOne = poolDetail.zeroForOne;
            callbackData.borrowedToken = poolDetail.quoteToken;
            callbackData.debtToken = poolDetail.baseToken;
            callbackData.debtAmount = lowerPoolDebtAmount;
            callbackData.debtTokenOutAmount = higherPoolDebtAmount;
            bytes memory data = abi.encode(callbackData);

            uint160 sqrtPriceLimitX96 = (
                poolDetail.zeroForOne
                    ? uint160(4295128739) + 1
                    : uint160(1461446703485210103287273052203988822378723970342) - 1
            );
            IUniswapV3Pool(lowerPool).swap(
                address(this),
                poolDetail.zeroForOne,
                int256(_borrowAmount),
                sqrtPriceLimitX96,
                data
            );
        }

        uint256 balanceAfter = IERC20(poolDetail.baseToken).balanceOf(address(this));
        require(balanceAfter > balanceBefore, 'Losing money');

        if (poolDetail.baseToken == WETH) {
            IWETH(poolDetail.baseToken).withdraw(balanceAfter);
        }

        permissionedPairAddress = address(1);
    }

    receive() external payable {}

    /// @notice Calculate how much profit we can by arbitraging between two pools
    function getProfit(
        address pool0,
        address pool1
    ) external view returns (uint256 profit, address borrowToken, uint256 borrowAmount) {
        PoolDetail memory poolDetail = getPoolDetail(pool0);
        borrowToken = poolDetail.quoteToken;

        (address lowerPool, address higherPool, OrderedReserves memory orderedReserves) = getOrderedReserves(
            pool0,
            pool1
        );
        //borrow quote token
        uint256 _borrowAmount = calcBorrowAmount(orderedReserves);

        uint256 borrowAmountTemp = poolDetail.quoteDecimals <= defaultDecimals
            ? _borrowAmount / (10 ** (defaultDecimals - poolDetail.quoteDecimals))
            : _borrowAmount * (10 ** (poolDetail.quoteDecimals - defaultDecimals));

        borrowAmount = borrowAmountTemp / (10 ** poolDetail.quoteDecimals);

        uint256 lowerPoolDebtAmount = getAmountOut(lowerPool, poolDetail.quoteToken, uint128(borrowAmountTemp), 10);

        uint256 higherPoolDebtAmount = getAmountOut(higherPool, poolDetail.quoteToken, uint128(borrowAmountTemp), 10);

        if (higherPoolDebtAmount < lowerPoolDebtAmount) {
            profit = 0;
        } else {
            profit = (higherPoolDebtAmount - lowerPoolDebtAmount) / (10 ** poolDetail.baseDecimals);
        }
    }

    function withdraw() external {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(owner()).transfer(balance);
            emit Withdrawn(owner(), balance);
        }

        for (uint256 i = 0; i < baseTokens.length(); i++) {
            address token = baseTokens.at(i);
            balance = IERC20(token).balanceOf(address(this));
            if (balance > 0) {
                // do not use safe transfer here to prevents revert by any shitty token
                IERC20(token).transfer(owner(), balance);
            }
        }
    }

    function addBaseToken(address token) external onlyOwner {
        baseTokens.add(token);
        emit BaseTokenAdded(token);
    }

    function removeBaseToken(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            // do not use safe transfer to prevents revert by any shitty token
            IERC20(token).transfer(owner(), balance);
        }
        baseTokens.remove(token);
        emit BaseTokenRemoved(token);
    }

    function getBaseTokens() external view returns (address[] memory tokens) {
        uint256 length = baseTokens.length();
        tokens = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            tokens[i] = baseTokens.at(i);
        }
    }

    function baseTokensContains(address token) public view returns (bool) {
        return baseTokens.contains(token);
    }

    //form OracleLibrary contracts/libraries/OracleLibrary.sol
    function getAmountOut(
        address pool,
        address tokenIn,
        uint128 amountIn,
        uint32 secondsAgo
    ) public view returns (uint256) {
        PoolDetail memory poolDetail = getPoolDetail(pool);

        require(tokenIn == poolDetail.baseToken || tokenIn == poolDetail.quoteToken, 'invalid token');
        address tokenOut = tokenIn == poolDetail.baseToken ? poolDetail.quoteToken : poolDetail.baseToken;
        // (int24 tick, ) = OracleLibrary.consult(pool, secondsAgo);

        // Code copied from OracleLibrary.sol, consult()
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = secondsAgo;
        secondsAgos[1] = 0;

        // int56 since tick * time = int24 * uint32
        // 56 = 24 + 32
        (int56[] memory tickCumulatives, ) = IUniswapV3Pool(pool).observe(secondsAgos);

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];

        // int56 / uint32 = int24
        // int24 tick = int24(tickCumulativesDelta / secondsAgo);
        int24 tick = int24(tickCumulativesDelta / int56(int32(secondsAgo)));
        // Always round to negative infinity

        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % int56(int32(secondsAgo)) != 0)) tick--;

        return OracleLibrary.getQuoteAtTick(tick, amountIn, tokenIn, tokenOut);
    }

    function getPoolPrice(
        address pool0,
        address pool1,
        address tokenIn,
        uint8 tokenInDecimals
    ) public view returns (uint256, uint256) {
        return (
            getAmountOut(pool0, tokenIn, uint128(10 ** tokenInDecimals), 10),
            getAmountOut(pool1, tokenIn, uint128(10 ** tokenInDecimals), 10)
        );
    }

    function getPoolDetail(address pool) public view returns (PoolDetail memory poolDetail) {
        //获取tokens
        (address token0, address token1) = (IUniswapV3Pool(pool).token0(), IUniswapV3Pool(pool).token1());

        (uint8 decimals0, uint8 decimals1) = (IWETH(token0).decimals(), IWETH(token1).decimals());

        require(baseTokensContains(token0) || baseTokensContains(token1), 'No base token in pair');

        (
            poolDetail.zeroForOne,
            poolDetail.baseToken,
            poolDetail.baseDecimals,
            poolDetail.quoteToken,
            poolDetail.quoteDecimals,
            poolDetail.fee
        ) = baseTokensContains(token0)
            ? (true, token0, decimals0, token1, decimals1, IUniswapV3Pool(pool).fee())
            : (false, token1, decimals1, token0, decimals0, IUniswapV3Pool(pool).fee());
    }

    // @dev Get the pool's balance of token0,uint is 10**18
    function getBalance0(address pool) private view returns (uint256) {
        (bool success, bytes memory data) = IUniswapV3Pool(pool).token0().staticcall(
            abi.encodeWithSelector(IERC20Minimal.balanceOf.selector, pool)
        );
        require(success && data.length >= 32);
        return abi.decode(data, (uint256));
    }

    // @dev Get the pool's balance of token1
    function getBalance1(address pool) private view returns (uint256) {
        (bool success, bytes memory data) = IUniswapV3Pool(pool).token1().staticcall(
            abi.encodeWithSelector(IERC20Minimal.balanceOf.selector, pool)
        );
        require(success && data.length >= 32);
        return abi.decode(data, (uint256));
    }

    // @dev Compare price denominated in quote token between two pools
    // We borrow base token by using flash swap from lower price pool and sell them to higher price pool
    // a1 baseToken,a2 quoteToken,b1 baseToken,b2 baseToken
    function getOrderedReserves(
        address pool0,
        address pool1
    ) public view returns (address lowerPool, address higherPool, OrderedReserves memory orderedReserves) {
        require(pool0 != pool1, 'Same pool address');

        (uint256 _pool0balance0, uint256 _pool0balance1, uint256 _pool1balance0, uint256 _pool1balance1) = (
            getBalance0(pool0),
            getBalance1(pool0),
            getBalance0(pool1),
            getBalance1(pool1)
        );

        //Pool Detail
        PoolDetail memory poolDetail = getPoolDetail(pool0);

        //get pool0 and pool1 price
        (uint256 price0, uint256 price1) = getPoolPrice(pool0, pool1, poolDetail.baseToken, poolDetail.baseDecimals);

        {
            // get a1, b1, a2, b2 with following rule:
            // 1. (a1, b1) represents the pool with lower price, denominated in quote asset token
            // 2. (a1, a2) are the base tokens in two pools
            if (price0 < price1) {
                (lowerPool, higherPool) = (pool0, pool1);
            } else {
                (lowerPool, higherPool) = (pool1, pool0);
            }

            (
                uint256 pool0Reserve0,
                uint256 pool0Reserve1,
                uint256 pool1Reserve0,
                uint256 pool1Reserve1
            ) = getPoolReserves(
                    poolDetail.zeroForOne,
                    price0,
                    price1,
                    _pool0balance0,
                    _pool0balance1,
                    _pool1balance0,
                    _pool1balance1
                );

            orderedReserves = balanceDecimals(pool0Reserve0, pool0Reserve1, pool1Reserve0, pool1Reserve1, poolDetail);
        }
    }

    function balanceDecimals(
        uint256 _pool0balance0,
        uint256 _pool0balance1,
        uint256 _pool1balance0,
        uint256 _pool1balance1,
        PoolDetail memory poolDetail
    ) internal pure returns (OrderedReserves memory orderedReserves) {
        if (
            poolDetail.baseDecimals != poolDetail.quoteDecimals ||
            (poolDetail.baseDecimals == poolDetail.quoteDecimals && poolDetail.baseDecimals != defaultDecimals)
        ) {
            //baseDecimals<=18
            if (poolDetail.baseDecimals <= defaultDecimals) {
                uint8 _baseDecimals = defaultDecimals - poolDetail.baseDecimals;
                (orderedReserves.a1, orderedReserves.b1) = (
                    _pool0balance0 * (10 ** _baseDecimals),
                    _pool1balance0 * (10 ** _baseDecimals)
                );
            }
            //baseDecimals>18
            else {
                uint8 _baseDecimals = poolDetail.baseDecimals - defaultDecimals;
                (orderedReserves.a1, orderedReserves.b1) = (
                    _pool0balance0 / (10 ** _baseDecimals),
                    _pool1balance0 / (10 ** _baseDecimals)
                );
            }
            //quoteDecimals<=18
            if (poolDetail.quoteDecimals <= defaultDecimals) {
                uint8 _quoteDecimals = defaultDecimals - poolDetail.quoteDecimals;
                (orderedReserves.a2, orderedReserves.b2) = (
                    _pool0balance1 * (10 ** _quoteDecimals),
                    _pool1balance1 * (10 ** _quoteDecimals)
                );
            }
            //quoteDecimals>18
            else {
                uint8 _quoteDecimals = poolDetail.quoteDecimals - defaultDecimals;
                (orderedReserves.a2, orderedReserves.b2) = (
                    _pool0balance1 / (10 ** _quoteDecimals),
                    _pool1balance1 / (10 ** _quoteDecimals)
                );
            }
        } else {
            (orderedReserves.a1, orderedReserves.a2, orderedReserves.b1, orderedReserves.b2) = (
                _pool0balance0,
                _pool0balance1,
                _pool1balance0,
                _pool1balance1
            );
        }
    }

    function getPoolReserves(
        bool _zeroForOne,
        uint256 _price0,
        uint256 _price1,
        uint256 _pool0Reserve0,
        uint256 _pool0Reserve1,
        uint256 _pool1Reserve0,
        uint256 _pool1Reserve1
    )
        internal
        pure
        returns (uint256 pool0Reserve0, uint256 pool0Reserve1, uint256 pool1Reserve0, uint256 pool1Reserve1)
    {
        if (_price0 < _price1) {
            (pool0Reserve0, pool0Reserve1, pool1Reserve0, pool1Reserve1) = _zeroForOne
                ? (_pool0Reserve0, _pool0Reserve1, _pool1Reserve0, _pool1Reserve1)
                : (_pool0Reserve1, _pool0Reserve0, _pool1Reserve1, _pool1Reserve0);
        } else {
            (pool0Reserve0, pool0Reserve1, pool1Reserve0, pool1Reserve1) = _zeroForOne
                ? (_pool1Reserve0, _pool1Reserve1, _pool0Reserve0, _pool0Reserve1)
                : (_pool1Reserve1, _pool1Reserve0, _pool0Reserve1, _pool0Reserve0);
        }
    }

    /// @dev calculate the maximum base asset amount to borrow in order to get maximum profit during arbitrage
    function calcBorrowAmount(OrderedReserves memory reserves) internal pure returns (uint256 amount) {
        // we can't use a1,b1,a2,b2 directly, because it will result overflow/underflow on the intermediate result
        // so we:
        //    1. divide all the numbers by d to prevent from overflow/underflow
        //    2. calculate the result by using above numbers
        //    3. multiply d with the result to get the final result
        // Note: this workaround is only suitable for ERC20 token with 18 decimals, which I believe most tokens do

        uint256 min1 = reserves.a1 < reserves.b1 ? reserves.a1 : reserves.b1;
        uint256 min2 = reserves.a2 < reserves.b2 ? reserves.a2 : reserves.b2;
        uint256 min = min1 < min2 ? min1 : min2;

        // choose appropriate number to divide based on the minimum number
        uint256 d;
        if (min > 1e24) {
            d = 1e20;
        } else if (min > 1e23) {
            d = 1e19;
        } else if (min > 1e22) {
            d = 1e18;
        } else if (min > 1e21) {
            d = 1e17;
        } else if (min > 1e20) {
            d = 1e16;
        } else if (min > 1e19) {
            d = 1e15;
        } else if (min > 1e18) {
            d = 1e14;
        } else if (min > 1e17) {
            d = 1e13;
        } else if (min > 1e16) {
            d = 1e12;
        } else if (min > 1e14) {
            d = 1e11;
        } else if (min > 1e13) {
            d = 1e10;
        } else if (min > 1e12) {
            d = 1e9;
        } else if (min > 1e11) {
            d = 1e8;
        } else if (min > 1e10) {
            d = 1e7;
        } else if (min > 1e9) {
            d = 1e6;
        } else if (min > 1e8) {
            d = 1e5;
        } else if (min > 1e7) {
            d = 1e4;
        } else if (min > 1e6) {
            d = 1e3;
        } else if (min > 1e5) {
            d = 1e2;
        } else {
            d = 1e1;
        }

        (int256 a1, int256 a2, int256 b1, int256 b2) = (
            int256(reserves.a1 / d),
            int256(reserves.a2 / d),
            int256(reserves.b1 / d),
            int256(reserves.b2 / d)
        );

        int256 a = a1 * b1 - a2 * b2;
        int256 b = 2 * b1 * b2 * (a1 + a2);
        int256 c = b1 * b2 * (a1 * b2 - a2 * b1);

        (int256 x1, int256 x2) = calcSolutionForQuadratic(a, b, c);

        // 0 < x < b1 and 0 < x < b2
        require((x1 > 0 && x1 < b1 && x1 < b2) || (x2 > 0 && x2 < b1 && x2 < b2), 'Wrong input order');
        amount = (x1 > 0 && x1 < b1 && x1 < b2) ? uint256(x1) * d : uint256(x2) * d;
    }

    /// @dev find solution of quadratic equation: ax^2 + bx + c = 0, only return the positive solution
    function calcSolutionForQuadratic(int256 a, int256 b, int256 c) internal pure returns (int256 x1, int256 x2) {
        int256 m = b ** 2 - 4 * a * c;
        // m < 0 leads to complex number
        require(m > 0, 'Complex number');

        int256 sqrtM = int256(sqrt(uint256(m)));
        x1 = (-b + sqrtM) / (2 * a);
        x2 = (-b - sqrtM) / (2 * a);
    }

    /// @dev Newton’s method for caculating square root of n
    function sqrt(uint256 n) internal pure returns (uint256 res) {
        assert(n > 1);

        // The scale factor is a crude way to turn everything into integer calcs.
        // Actually do (n * 10 ^ 4) ^ (1/2)
        uint256 _n = n * 10 ** 6;
        uint256 c = _n;
        res = _n;

        uint256 xi;
        while (true) {
            xi = (res + c / res) / 2;
            // don't need be too precise to save gas
            if (res - xi < 1000) {
                break;
            }
            res = xi;
        }
        res = res / 10 ** 3;
    }
}
