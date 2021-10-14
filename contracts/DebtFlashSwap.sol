pragma solidity ^0.8.0;


import './interfaces/IUniswapV2Callee.sol';
import './interfaces/IUniswapV2Pair.sol';
import './interfaces/IUniswapV2Factory.sol';
import './interfaces/ILendingPool.sol';
import './interfaces/IProtocolDataProvider.sol';
import './interfaces/IVariableDebtToken.sol';
import './libraries/UniswapV2Library.sol';

import 'openzeppelin-solidity/contracts/token/ERC20/utils/SafeERC20.sol';

import 'hardhat/console.sol';


contract DebtFlashSwap is IUniswapV2Callee {
    using SafeERC20 for IERC20;

    address private constant AAVE_DATA_PROVIDER = 0x7551b5D2763519d4e37e8B81929D336De671d46d;
    address private constant AAVE_LENDING_POOL = 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf;
    address private constant QUICKSWAP_FACTORY = 0xc35DADB65012eC5796536bD9864eD8773aBc74C4;

    function swapDebtToken(address _debtToken, address _newDebtToken) external {
        address pair = IUniswapV2Factory(QUICKSWAP_FACTORY).getPair(_debtToken, _newDebtToken);
        require(pair != address(0), "!! This pair does not exists !!");

        (,, address vDebtTokenAddr) = IProtocolDataProvider(AAVE_DATA_PROVIDER).getReserveTokensAddresses(_debtToken);

        uint amount = IVariableDebtToken(vDebtTokenAddr).balanceOf(msg.sender);

        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        uint amount0Out = _debtToken == token0 ? amount : 0;
        uint amount1Out = _debtToken == token1 ? amount : 0;

        address[] memory path = new address[](2);
        path[0] = _newDebtToken;
        path[1] = _debtToken;

        uint amountRequired = UniswapV2Library.getAmountsIn(
            QUICKSWAP_FACTORY,
            amount,
            path
        )[0];

        bytes memory data = abi.encode(_debtToken, _newDebtToken, msg.sender, amount, amountRequired);

        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);

    }

    function uniswapV2Call(
        address _sender,
        uint _amount0,
        uint _amount1,
        bytes calldata _data
    ) external override {

        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        
        address pair = IUniswapV2Factory(QUICKSWAP_FACTORY).getPair(token0, token1);
        
        require(msg.sender == pair, "!! You are not QuickSwap Pair Smart Contract !!");
        require(_sender == address(this), "!! This flashloan is not originated from DebtFlashSwap Smart Contract !!");
        require(_amount0 == 0 || _amount1 == 0, "!! Cannot borrow two currencies at the same time !!");
        (address debtToken, address newDebtToken, address user, uint amount, uint amountRequired) = abi.decode(_data, (address, address, address, uint, uint));

        IERC20(debtToken).approve(AAVE_LENDING_POOL, amount);
        ILendingPool(AAVE_LENDING_POOL).repay(debtToken, amount, 2, address(user));
        ILendingPool(AAVE_LENDING_POOL).borrow(newDebtToken, amountRequired, 2, 0, address(user));

        IERC20(newDebtToken).transfer(msg.sender, amountRequired);
    }

}