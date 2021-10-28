/**
*  Dependencies
*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const truffleAssert = require('truffle-assertions');
const fs = require('fs');

const ethereumAlchemyKey = fs.readFileSync("secretEthereum").toString().trim();

describe("DebtFlashSwap Unit Tests on Ethereum Mainnet", function () {  
  this.timeout(40000);
    
  /* ABIs */
  const LendingPoolAbi = require("../../external_abi/LendingPool.json");
  const USDCabi = require("../../external_abi/USDC.json");
  const DAIabi = require("../../external_abi/DAI.json");
  const LINKabi = require("../../external_abi/LINK.json");
  const WETHabi = require("../../external_abi/WETH.json");
  const variableDebtTokenABI = require("../../external_abi/variableDebtToken.json");
  const stableDebtTokenABI = require("../../external_abi/stableDebtToken.json");

  /* Addresses */
  // USDC
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const USDCvDebt = "0x619beb58998eD2278e08620f97007e1116D5D25b";
  const USDCsDebt = "0xE4922afAB0BbaDd8ab2a88E0C79d884Ad337fcA6";

  // DAI
  const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";     
  const DAIvDebt = "0x6C3c78838c761c6Ac7bE9F59fe808ea2A6E4379d";
  const DAIsDebt = "0x778A13D3eeb110A4f7bb6529F99c000119a08E92";

  // LINK
  const LINK = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
  const LINKvDebt = "0x0b8f12b1788BFdE65Aa1ca52E3e9F3Ba401be16D";
  const LINKsDebt = "0xFB4AEc4Cc858F2539EBd3D37f2a43eAe5b15b98a";

  // WETH
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const WETHvDebt = "0xF63B34710400CAd3e044cFfDcAb00a0f32E33eCf";
  const WETHsDebt = "0x4e977830ba4bd783C0BB7F15d3e243f73FF57121";

  // AAVE Lending Pool 
  const LENDINGPOOL = "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9";
  // AAVE Data Provider
  const DATAPROVIDER = "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d";
  // UNISWAP Factory (UniswapV2)
  const UNISWAPFACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";

  const STABLE_RATE = 1;
  const VARIABLE_RATE = 2;

  /* Provider */
  const provider = new ethers.providers.JsonRpcProvider();

  // Instantiating the existing mainnet fork contracts
  aave = new ethers.Contract(LENDINGPOOL, LendingPoolAbi, provider);

  dai = new ethers.Contract(DAI, DAIabi, provider);
  daiVdebt = new ethers.Contract(DAIvDebt, variableDebtTokenABI, provider);
  daiSdebt = new ethers.Contract(DAIsDebt, stableDebtTokenABI, provider);

  link = new ethers.Contract(LINK, LINKabi, provider);
  linkVdebt = new ethers.Contract(LINKvDebt, variableDebtTokenABI, provider);
  linkSdebt = new ethers.Contract(LINKsDebt, stableDebtTokenABI, provider);

  weth = new ethers.Contract(WETH, WETHabi, provider);
  wethVdebt = new ethers.Contract(WETHvDebt, variableDebtTokenABI, provider);
  wethSdebt = new ethers.Contract(WETHsDebt, stableDebtTokenABI, provider);  
  
  usdc = new ethers.Contract(USDC, USDCabi, provider);
  usdcVdebt = new ethers.Contract(USDCvDebt, variableDebtTokenABI, provider);
  usdcSdebt = new ethers.Contract(USDCsDebt, stableDebtTokenABI, provider);

  let debtFlashSwap;
  let DebtFlashSwap;

  before(async function () {

    // Resetting the Hardhat ETH Mainnet Fork Network to block 13498690
    await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: `${ethereumAlchemyKey}`,
              blockNumber: 13498690
            },
          },
        ],
    });

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0x036B96EEA235880a9e82fb128E5f6c107dFe8f57"],
      });
    whaleUSDC = await ethers.getSigner("0x036B96EEA235880a9e82fb128E5f6c107dFe8f57");   
    
    // Define the signers required for the tests
    [deployer, user, _] = await ethers.getSigners();   

    // Deploy UniV2OptimizerFactory
    DebtFlashSwap = await ethers.getContractFactory("DebtFlashSwap");
    debtFlashSwap = await DebtFlashSwap.connect(deployer).deploy(
      DATAPROVIDER,
      LENDINGPOOL,
      UNISWAPFACTORY
    );

    const USDCdecimals = await usdc.decimals();

    const amountToTransfer = 20000;
    const amountToDeposit = 10000;
    const amountToBorrowUSDC = 100;
    const amountToBorrowLINK = 10;

    const weiAmountToTransfer = ethers.utils.parseUnits(amountToTransfer.toString(), USDCdecimals);
    const weiAmountToDeposit = ethers.utils.parseUnits(amountToDeposit.toString(), USDCdecimals);
    const weiAmountToBorrowUSDC = ethers.utils.parseUnits(amountToBorrowUSDC.toString(), USDCdecimals);
    const weiAmountToBorrowLINK = ethers.utils.parseEther(amountToBorrowLINK.toString());

    await usdc.connect(whaleUSDC).transfer(user.address, weiAmountToTransfer);

    await usdc.connect(user).approve(LENDINGPOOL, weiAmountToDeposit);
    await aave.connect(user).deposit(USDC, weiAmountToDeposit, user.address, 0);
    await aave.connect(user).borrow(USDC, weiAmountToBorrowUSDC, VARIABLE_RATE, 0, user.address);
    await aave.connect(user).borrow(LINK, weiAmountToBorrowLINK, STABLE_RATE, 0, user.address);
    
    await usdc.connect(user).transfer(whaleUSDC.address, weiAmountToBorrowUSDC);
    await link.connect(user).transfer(whaleUSDC.address, weiAmountToBorrowLINK);
  });

  // Mine an empty block in between each test case
  // This step ensures that the StakingReward contract accrues Reward in between test cases
  beforeEach(async function () {
      await network.provider.send("evm_mine");
  });

  it("should swap the full USDC variable rate debt into a DAI debt", async () => {
    
    const amountToApprove = 20000;
    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());

    const usdcDebtBalBefore = await usdcVdebt.balanceOf(user.address);
    const daiDebtBalBefore = await daiVdebt.balanceOf(user.address);
    const USDCvDebtDecimals = await usdcVdebt.decimals();

    console.log("--------------------------------------------------------------------------------");
    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalBefore));
    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalBefore, USDCvDebtDecimals));
    console.log("--------------------------------------------------------------------------------");

    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
    console.log("--------------------------------------------------------------------------------");
    await daiVdebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
    console.log("Swapping USDC debt for DAI debt")
    console.log("--------------------------------------------------------------------------------");
    await debtFlashSwap.connect(user).swapFullDebt(usdc.address, dai.address, VARIABLE_RATE);

    const usdcDebtBalAfter = await usdcVdebt.balanceOf(user.address);
    const daiDebtBalAfter = await daiVdebt.balanceOf(user.address);

    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalAfter));
    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalAfter, USDCvDebtDecimals));
    console.log("--------------------------------------------------------------------------------");

    expect(usdcDebtBalAfter).to.equal(0)
    expect(daiDebtBalAfter > 0).to.equal(true)
  });

  it("should swap the full LINK stable rate debt into a WETH debt", async () => {
    
    const amountToApprove = 20000;
    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());

    const linkDebtBalBefore = await linkSdebt.balanceOf(user.address);
    const wethDebtBalBefore = await wethSdebt.balanceOf(user.address);

    console.log("--------------------------------------------------------------------------------");
    console.log("LINK Debt : ", ethers.utils.formatEther(linkDebtBalBefore));
    console.log("WETH Debt : ", ethers.utils.formatEther(wethDebtBalBefore));
    console.log("--------------------------------------------------------------------------------");

    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
    console.log("--------------------------------------------------------------------------------");
    await wethSdebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
    console.log("Swapping USDC debt for DAI debt")
    console.log("--------------------------------------------------------------------------------");
    await debtFlashSwap.connect(user).swapFullDebt(link.address, weth.address, STABLE_RATE);

    const linkDebtBalAfter = await linkSdebt.balanceOf(user.address);
    const wethDebtBalAfter = await wethSdebt.balanceOf(user.address);

    console.log("LINK Debt : ", ethers.utils.formatEther(linkDebtBalAfter));
    console.log("WETH Debt : ", ethers.utils.formatEther(wethDebtBalAfter));
    console.log("--------------------------------------------------------------------------------");

    expect(linkDebtBalAfter).to.equal(0)
    expect(wethDebtBalAfter > 0).to.equal(true)
  });  
});

