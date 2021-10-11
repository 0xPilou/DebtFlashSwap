pragma solidity ^0.8.0;


import './interfaces/IUniswapV2Callee.sol';
import './interfaces/IUniswapV2Pair.sol';
import './interfaces/IUniswapV2Factory.sol';
import './interfaces/ILendingPool.sol';
import './libraries/UniswapV2Library.sol';

import 'openzeppelin-solidity/contracts/token/ERC20/utils/SafeERC20.sol';


contract DebtFlashSwap is IUniswapV2Callee {
    using SafeERC20 for IERC20;

    address private constant AAVE_LENDING_POOL = 0x6A8730F54b8C69ab096c43ff217CA0a350726ac7;
    address private constant QUICKSWAP_ROUTER = 0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff;
    address private constant QUICKSWAP_FACTORY = 0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32;
    
    function swapDebtToken(address _debtToken, address _newDebtToken, uint _amount) external {
        address pair = IUniswapV2Factory(QUICKSWAP_FACTORY).getPair(_debtToken, _newDebtToken);
        require(pair != address(0), "!! This pair does not exists !!");

        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        uint amount0Out = _newDebtToken == token0 ? _amount : 0;
        uint amount1Out = _newDebtToken == token1 ? _amount : 0;

        bytes memory data = abi.encode(_debtToken, _newDebtToken, _amount, msg.sender);

        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);

    }

    function uniswapV2Call(
        address _sender,
        uint _amount0,
        uint _amount1,
        bytes calldata _data
    ) external override {

        address[] memory path = new address[](2);

        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        
        address pair = IUniswapV2Factory(QUICKSWAP_FACTORY).getPair(token0, token1);
        
        require(msg.sender == pair, "!! You are not QuickSwap Pair Smart Contract !!");
        require(_sender == address(this), "!! This flashloan is not originated from DebtFlashSwap Smart Contract !!");
        require(_amount0 == 0 || _amount1 == 0, "!! Cannot borrow two currencies at the same time !!");
        (address debtToken, address newDebtToken, address user, uint amount) = abi.decode(_data, (address, address, address, uint));

        path[0] = _amount0 == 0 ? token1 : token0;
        path[1] = _amount0 == 0 ? token0 : token1;

        uint amountRequired = UniswapV2Library.getAmountsIn(
            QUICKSWAP_FACTORY,
            amount,
            path
        )[0];

        IERC20(debtToken).approve(AAVE_LENDING_POOL, amount);
        ILendingPool(AAVE_LENDING_POOL).repay(debtToken, amount, 2, user);
        ILendingPool(AAVE_LENDING_POOL).borrow(newDebtToken, amountRequired, 2, 0, user);

        IERC20(newDebtToken).transfer(pair, amountRequired);
    }

}