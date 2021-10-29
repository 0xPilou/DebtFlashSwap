/**
*  Dependencies
*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const truffleAssert = require('truffle-assertions');

describe("DebtFlashSwap Unit Tests on Avalanche Mainnet", function () {  
  this.timeout(40000);
    
  /* ABIs */
  const LendingPoolAbi = require("../../external_abi/LendingPool.json");
  const WETHabi = require("../../external_abi/WETH.json");
  const WAVAXabi = require("../../external_abi/WAVAX.json");
  const WBTCabi = require("../../external_abi/WBTC.json");
  const USDCabi = require("../../external_abi/USDC.json");
  const DAIabi = require("../../external_abi/DAI.json");
  const variableDebtTokenABI = require("../../external_abi/variableDebtToken.json");

  /* Addresses */
  // USDC
  const USDC = "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664";
  const USDCdebt = "0x848c080d2700CBE1B894a3374AD5E887E5cCb89c";

  // DAI
  const DAI = "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70";     
  const DAIdebt = "0x1852DC24d1a8956a0B356AA18eDe954c7a0Ca5ae";


  // WETH
  const WETH = "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB";
  const WETHdebt = "0x4e575CacB37bc1b5afEc68a0462c4165A5268983";

  // WAVAX
  const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";
  const WAVAXdebt = "0x66A0FE52Fb629a6cB4D10B8580AFDffE888F5Fd4";
  
  // WBTC
  const WBTC = "0x50b7545627a5162F82A992c33b87aDc75187B218";
  const WBTCdebt = "0x2dc0E35eC3Ab070B8a175C829e23650Ee604a9eB";

  // AAVE Lending Pool 
  const LENDINGPOOL = "0x4F01AeD16D97E3aB5ab2B501154DC9bb0F1A5A2C";
  // AAVE Data Provider
  const DATAPROVIDER = "0x65285E9dfab318f57051ab2b139ccCf232945451";
  // UNISWAP Factory (TraderJoe)
  const UNISWAPFACTORY = "0x9Ad6C38BE94206cA50bb0d90783181662f0Cfa10";


  /* Provider */
  const provider = new ethers.providers.JsonRpcProvider();

  // Instantiating the existing mainnet fork contracts
  aave = new ethers.Contract(LENDINGPOOL, LendingPoolAbi, provider);
  wavax = new ethers.Contract(WAVAX, WAVAXabi, provider);
  wavaxDebt = new ethers.Contract(WAVAXdebt, variableDebtTokenABI, provider);
  weth = new ethers.Contract(WETH, WETHabi, provider);
  wethDebt = new ethers.Contract(WETHdebt, variableDebtTokenABI, provider);
  wbtc = new ethers.Contract(WBTC, WBTCabi, provider);
  wbtcDebt = new ethers.Contract(WBTCdebt, variableDebtTokenABI, provider);
  dai = new ethers.Contract(DAI, DAIabi, provider);
  daiDebt = new ethers.Contract(DAIdebt, variableDebtTokenABI, provider);
  usdc = new ethers.Contract(USDC, USDCabi, provider);
  usdcDebt = new ethers.Contract(USDCdebt, variableDebtTokenABI, provider);

  let debtFlashSwap;
  let DebtFlashSwap;

  before(async function () {

    // Resetting the Avalanche Hardhat Mainnet Fork Network to block 6263382
    await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: `https://api.avax.network/ext/bc/C/rpc`,
              blockNumber: 6263382
            },
          },
        ],
    });

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0xe7D96B5FdaB3DCb6AB5Cb8B14b291E03A8AC496b"],
      });
    whaleWAVAX = await ethers.getSigner("0xe7D96B5FdaB3DCb6AB5Cb8B14b291E03A8AC496b");   
    
    // Define the signers required for the tests
    [deployer, user, _] = await ethers.getSigners();   

    // Deploy UniV2OptimizerFactory
    DebtFlashSwap = await ethers.getContractFactory("DebtFlashSwap");
    debtFlashSwap = await DebtFlashSwap.connect(deployer).deploy(
      DATAPROVIDER,
      LENDINGPOOL,
      UNISWAPFACTORY
    );

    const amountToTransfer = 30;
    const amountToDeposit = 30;
    const amountToBorrow = 500;
    const weiAmountToTransfer = ethers.utils.parseEther(amountToTransfer.toString());
    const weiAmountToDeposit = ethers.utils.parseEther(amountToDeposit.toString());
    const weiAmountToBorrow = ethers.utils.parseEther(amountToBorrow.toString());

    await wavax.connect(whaleWAVAX).transfer(user.address, weiAmountToTransfer);
    await wavax.connect(user).approve(LENDINGPOOL, weiAmountToDeposit);
    await aave.connect(user).deposit(WAVAX, weiAmountToDeposit, user.address, 0);
    await aave.connect(user).borrow(DAI, weiAmountToBorrow, 2, 0, user.address);
  });

  // Mine an empty block in between each test case
  // This step ensures that the StakingReward contract accrues Reward in between test cases
  beforeEach(async function () {
      await network.provider.send("evm_mine");
  });

  it("should swap the full DAI debt into an WETH debt", async () => {
    
    const amountToApprove = 20000;
    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());

    const daiDebtBalBefore = await daiDebt.balanceOf(user.address);
    const wethDebtBalBefore = await wethDebt.balanceOf(user.address);

    console.log("--------------------------------------------------------------------------------");
    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalBefore));
    console.log("WETH Debt : ", ethers.utils.formatEther(wethDebtBalBefore));
    console.log("--------------------------------------------------------------------------------");

    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
    console.log("--------------------------------------------------------------------------------");
    await wethDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
    console.log("Swapping DAI debt for WETH debt")
    console.log("--------------------------------------------------------------------------------");
    await debtFlashSwap.connect(user).swapFullDebt(dai.address, weth.address, 2);

    const daiDebtBalAfter = await daiDebt.balanceOf(user.address);
    const wethDebtBalAfter = await wethDebt.balanceOf(user.address);

    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalAfter));
    console.log("WETH Debt : ", ethers.utils.formatEther(wethDebtBalAfter));
    console.log("--------------------------------------------------------------------------------");

    expect(daiDebtBalAfter).to.equal(0)
    expect(wethDebtBalAfter > 0).to.equal(true)
  });

//  it("should swap the full DAI debt into USDC debt", async () => {
//    
//    const amountToApprove = 100000;
//    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());
//
//    const daiDebtBalBefore = await daiDebt.balanceOf(user.address);
//    const usdcDebtBalBefore = await usdcDebt.balanceOf(user.address);
//    const usdcDebtDecimals = await usdcDebt.decimals();
//
//    console.log("--------------------------------------------------------------------------------");
//    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalBefore));
//    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalBefore, usdcDebtDecimals));
//    console.log("--------------------------------------------------------------------------------");
//
//    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
//    console.log("--------------------------------------------------------------------------------");
//    await usdcDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
//    console.log("Swapping DAI debt for USDC debt")
//    console.log("--------------------------------------------------------------------------------");
//    await debtFlashSwap.connect(user).swapFullDebt(dai.address, usdc.address, 2);
//
//    const daiDebtBalAfter = await daiDebt.balanceOf(user.address);
//    const usdcDebtBalAfter = await usdcDebt.balanceOf(user.address);
//
//    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalAfter));
//    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalAfter, usdcDebtDecimals));
//    console.log("--------------------------------------------------------------------------------");
//    console.log("--------------------------------------------------------------------------------");
//
//    expect(daiDebtBalAfter).to.equal(0)
//    expect(usdcDebtBalAfter > 0).to.equal(true)
//  });
//
//  it("should swap the 50% of the USDC debt into WAVAX debt", async () => {
//    
//    const amountToApprove = 20000;
//    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());
//
//    const wmaticDebtBalBefore = await wmaticDebt.balanceOf(user.address);
//    const usdcDebtBalBefore = await usdcDebt.balanceOf(user.address);
//    const usdcDebtDecimals = await usdcDebt.decimals();
//
//    console.log("--------------------------------------------------------------------------------");
//    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalBefore, usdcDebtDecimals));
//    console.log("WAVAX Debt : ", ethers.utils.formatEther(wmaticDebtBalBefore));
//    console.log("--------------------------------------------------------------------------------");
//
//    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
//    console.log("--------------------------------------------------------------------------------");
//    await wmaticDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
//
//    console.log("Swapping 50% of USDC debt for WAVAX debt")
//    console.log("--------------------------------------------------------------------------------");
//    await debtFlashSwap.connect(user).swapPartialDebt(usdc.address, wmatic.address, 5000, 2);
//
//    const usdcDebtBalAfter = await usdcDebt.balanceOf(user.address);
//    const wmaticDebtBalAfter = await wmaticDebt.balanceOf(user.address);
//
//    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalAfter, usdcDebtDecimals));
//    console.log("WAVAX Debt : ", ethers.utils.formatEther(wmaticDebtBalAfter));
//    console.log("--------------------------------------------------------------------------------");
//    console.log("--------------------------------------------------------------------------------");
//
//    expect(wmaticDebtBalAfter > 0).to.equal(true)
//    expect(usdcDebtBalAfter > usdcDebtBalBefore.mul(4900).div(10000)).to.equal(true)
//    expect(usdcDebtBalAfter < usdcDebtBalBefore.mul(5100).div(10000)).to.equal(true)
//  });
//
//  it("should swap the 90% of the WAVAX debt into WBTC debt", async () => {
//    
//    const amountToApprove = 20000;
//    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());
//
//    const wmaticDebtBalBefore = await wmaticDebt.balanceOf(user.address);
//    const wbtcDebtBalBefore = await wbtcDebt.balanceOf(user.address);
//    const wbtcDebtDecimals = await wbtcDebt.decimals();
//    const usdcDebtBalBefore = await usdcDebt.balanceOf(user.address);
//    const usdcDebtDecimals = await usdcDebt.decimals();
//
//    console.log("--------------------------------------------------------------------------------");
//    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalBefore, usdcDebtDecimals));
//    console.log("WBTC Debt : ", ethers.utils.formatUnits(wbtcDebtBalBefore, wbtcDebtDecimals));
//    console.log("WAVAX Debt : ", ethers.utils.formatEther(wmaticDebtBalBefore));
//    console.log("--------------------------------------------------------------------------------");
//
//    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
//    console.log("--------------------------------------------------------------------------------");
//    await wbtcDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
//
//    console.log("Swapping 90% of the WAVAX debt into WBTC debt")
//    console.log("--------------------------------------------------------------------------------");
//    await debtFlashSwap.connect(user).swapPartialDebt(wmatic.address, wbtc.address, 9000, 2);
//
//    const usdcDebtBalAfter = await usdcDebt.balanceOf(user.address);
//    const wmaticDebtBalAfter = await wmaticDebt.balanceOf(user.address);
//    const wbtcDebtBalAfter = await wbtcDebt.balanceOf(user.address);
//
//    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalAfter, usdcDebtDecimals));
//    console.log("WBTC Debt : ", ethers.utils.formatUnits(wbtcDebtBalAfter, wbtcDebtDecimals));
//    console.log("WAVAX Debt : ", ethers.utils.formatEther(wmaticDebtBalAfter));
//    console.log("--------------------------------------------------------------------------------");
//    console.log("--------------------------------------------------------------------------------");
//
//    expect(wbtcDebtBalAfter > 0).to.equal(true)
//    expect(wmaticDebtBalAfter > wmaticDebtBalBefore.mul(900).div(10000)).to.equal(true)
//    expect(wmaticDebtBalAfter < wmaticDebtBalBefore.mul(1100).div(10000)).to.equal(true)
//  });
});

