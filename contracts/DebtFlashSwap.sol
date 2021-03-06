pragma solidity ^0.8.0;


import './interfaces/IUniswapV2Callee.sol';
import './interfaces/IUniswapV2Pair.sol';
import './interfaces/IUniswapV2Factory.sol';
import './interfaces/ILendingPool.sol';
import './interfaces/IProtocolDataProvider.sol';
import './interfaces/IVariableDebtToken.sol';
import './interfaces/IStableDebtToken.sol';
import './libraries/UniswapV2Library.sol';

import 'openzeppelin-solidity/contracts/token/ERC20/utils/SafeERC20.sol';
import 'openzeppelin-solidity/contracts/utils/math/SafeMath.sol';


contract DebtFlashSwap is IUniswapV2Callee {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct FlashParams {
        address debtToken;
        address newDebtToken;
        address user;
        uint amount;
        uint amountRequired;
        uint8 rateMode;
    }

    // Address of AAVE Data Provider contract
    address private AAVE_DATA_PROVIDER;
    
    // Address of AAVE Lending Pool contract
    address private AAVE_LENDING_POOL;

    // Address of UniswapV2 Factory (fork) contract
    address private UNISWAP_FACTORY; 

    constructor(address _dataProvider, address _lendingPool, address _uniswapFactory) {
        AAVE_DATA_PROVIDER = _dataProvider;
        AAVE_LENDING_POOL = _lendingPool;
        UNISWAP_FACTORY = _uniswapFactory;
    }

    function swapFullDebt(address _debtToken, address _newDebtToken, uint8 _rateMode) external {
        require(_rateMode == 1 || _rateMode == 2, "Incorrect Interest Rate Mode");

        // Get address of UniswapV2Pair contract
        address pair = IUniswapV2Factory(UNISWAP_FACTORY).getPair(_debtToken, _newDebtToken);

        // Check that the pair exists
        require(pair != address(0), "!! This pair does not exists !!");

        // Get the address of the AAVE Variable Debt Token corresponding to the underlying token
        (, address sDebtTokenAddr, address vDebtTokenAddr) = IProtocolDataProvider(AAVE_DATA_PROVIDER).getReserveTokensAddresses(_debtToken);

        // Assign the total debt amount depending on the interest rate mode (Stable = 1 / Variable = 2)
        uint amount;

        if(_rateMode == 1){
            amount = IStableDebtToken(sDebtTokenAddr).balanceOf(msg.sender);
        } else {
            amount = IVariableDebtToken(vDebtTokenAddr).balanceOf(msg.sender);
        }

        // Define the trade direction
        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        uint amount0Out = _debtToken == token0 ? amount : 0;
        uint amount1Out = _debtToken == token1 ? amount : 0;
        address[] memory path = new address[](2);
        path[0] = _newDebtToken;
        path[1] = _debtToken;

        // Get the exact amount of _newDebtToken to be returned to the Uniswap Pool
        uint amountRequired = UniswapV2Library.getAmountsIn(
            UNISWAP_FACTORY,
            amount,
            path
        )[0];

        FlashParams memory fp;

        fp.debtToken = _debtToken;
        fp.newDebtToken = _newDebtToken;
        fp.user = msg.sender;
        fp.amount = amount;
        fp.amountRequired = amountRequired;
        fp.rateMode = _rateMode;

        // Encode the data required for the callback function operations
        bytes memory data = abi.encode(fp);

        // Initiate the flash swap
        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);
    }

    function swapPartialDebt(address _debtToken, address _newDebtToken, uint256 _basisPoint, uint8 _rateMode) external {
        require(_rateMode == 1 || _rateMode == 2, "Incorrect Interest Rate Mode");
        require(_basisPoint <= 10000, "Incorrect Basis Point parameter");

        // Get address of UniswapV2Pair contract
        address pair = IUniswapV2Factory(UNISWAP_FACTORY).getPair(_debtToken, _newDebtToken);

        // Check that the pair exists
        require(pair != address(0), "!! This pair does not exists !!");

        // Get the address of the AAVE Variable Debt Token corresponding to the underlying token
        (, address sDebtTokenAddr, address vDebtTokenAddr) = IProtocolDataProvider(AAVE_DATA_PROVIDER).getReserveTokensAddresses(_debtToken);

        // Assign the total debt amount depending on the interest rate mode (Stable = 1 / Variable = 2)
        uint totalDebtAmount;

        if(_rateMode == 1){
            totalDebtAmount = IStableDebtToken(sDebtTokenAddr).balanceOf(msg.sender);
        } else {
            totalDebtAmount = IVariableDebtToken(vDebtTokenAddr).balanceOf(msg.sender);
        }


        // Calculate the amount of debt to be swapped based on the basis point parameter
        // Friendly Reminder : 1000 basis point = 10 %
        // amount to repay = total debt amount * basis point / 10000
        uint amount = totalDebtAmount.mul(_basisPoint).div(10000);

        // Define the trade direction
        address token0 = IUniswapV2Pair(pair).token0();
        address token1 = IUniswapV2Pair(pair).token1();
        uint amount0Out = _debtToken == token0 ? amount : 0;
        uint amount1Out = _debtToken == token1 ? amount : 0;
        address[] memory path = new address[](2);
        path[0] = _newDebtToken;
        path[1] = _debtToken;

        // Get the exact amount of _newDebtToken to be returned to the Uniswap Pool
        uint amountRequired = UniswapV2Library.getAmountsIn(
            UNISWAP_FACTORY,
            amount,
            path
        )[0];

        FlashParams memory fp;

        fp.debtToken = _debtToken;
        fp.newDebtToken = _newDebtToken;
        fp.user = msg.sender;
        fp.amount = amount;
        fp.amountRequired = amountRequired;
        fp.rateMode = _rateMode;

        // Encode the data required for the callback function operations
        bytes memory data = abi.encode(fp);

        // Initiate the flash swap
        IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);
    }

    function uniswapV2Call(
        address _sender,
        uint _amount0,
        uint _amount1,
        bytes calldata _data
    ) external override {

        // Get the necessary contract addresses
        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        address pair = IUniswapV2Factory(UNISWAP_FACTORY).getPair(token0, token1);
        
        // Check that the callback is being called by the UniswapV2Pair contract
        require(msg.sender == pair, "Not UniswapV2Pair Smart Contract");
        
        // Check that the flashswap originiated from DebtFlashSwap contract
        require(_sender == address(this), "Not originated from DebtFlashSwap Smart Contract");
        
        // Check that only one asset is borrowed
        require(_amount0 == 0 || _amount1 == 0, "!! Cannot borrow two currencies at the same time !!");
        
        FlashParams memory fp;
        // Decode the encoded data required for the operations
        fp = abi.decode(_data, (FlashParams));

        // Approve AAVE Lending Pool to spend 'amount' of Debt Token
        IERC20(fp.debtToken).approve(AAVE_LENDING_POOL, fp.amount);

        // Repay the amount of Debt Token on behalf of the user
        ILendingPool(AAVE_LENDING_POOL).repay(fp.debtToken, fp.amount, fp.rateMode, address(fp.user));

        // Borrow the amount required of New Debt Token on behalf of the user
        ILendingPool(AAVE_LENDING_POOL).borrow(fp.newDebtToken, fp.amountRequired, fp.rateMode, 0, address(fp.user));

        // Pay back amount required of New Debt Token to UniswapV2Pair
        IERC20(fp.newDebtToken).transfer(msg.sender, fp.amountRequired);
    }
}