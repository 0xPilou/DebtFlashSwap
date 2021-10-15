/**
*  Dependencies
*/
const { expect } = require("chai");
const { ethers } = require("hardhat");
const truffleAssert = require('truffle-assertions');
const fs = require('fs');

const polygonAlchemyKey = fs.readFileSync("secretPolygon").toString().trim();

describe("DebtFlashSwap Unit Tests", function () {  
  this.timeout(40000);
    
  /* ABIs */
  const LendingPoolAbi = require("../external_abi/LendingPool.json");
  const WETHabi = require("../external_abi/WETH.json");
  const WMATICabi = require("../external_abi/WMATIC.json");
  const WBTCabi = require("../external_abi/WBTC.json");
  const USDCabi = require("../external_abi/USDC.json");
  const DAIabi = require("../external_abi/DAI.json");
  const variableDebtTokenABI = require("../external_abi/variableDebtToken.json");

  /* Adresses */
  // USDC
  const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
  const USDCdebt = "0x248960A9d75EdFa3de94F7193eae3161Eb349a12";

  // DAI
  const DAI = "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";     
  const DAIdebt = "0x75c4d1Fb84429023170086f06E682DcbBF537b7d";


  // WETH
  const WETH = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";
  const WETHdebt = "0xeDe17e9d79fc6f9fF9250D9EEfbdB88Cc18038b5";

  // WMATIC
  const WMATIC = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270";
  const WMATICdebt = "0x59e8E9100cbfCBCBAdf86b9279fa61526bBB8765";
  
  // WBTC
  const WBTC = "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6";
  const WBTCdebt = "0xF664F50631A6f0D72ecdaa0e49b0c019Fa72a8dC";

  // AAVE Lending Pool 
  const LENDINGPOOL = "0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf";
  // AAVE Data Provider
  const DATAPROVIDER = "0x7551b5D2763519d4e37e8B81929D336De671d46d";
  // UNISWAP Factory (QuickSwap)
  const UNISWAPFACTORY = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";


  /* Provider */
  const provider = new ethers.providers.JsonRpcProvider();

  // Instantiating the existing mainnet fork contracts
  aave = new ethers.Contract(LENDINGPOOL, LendingPoolAbi, provider);
  weth = new ethers.Contract(WETH, WETHabi, provider);
  wethDebt = new ethers.Contract(WETHdebt, variableDebtTokenABI, provider);
  wmatic = new ethers.Contract(WMATIC, WMATICabi, provider);
  wmaticDebt = new ethers.Contract(WMATICdebt, variableDebtTokenABI, provider);
  wbtc = new ethers.Contract(WBTC, WBTCabi, provider);
  wbtcDebt = new ethers.Contract(WBTCdebt, variableDebtTokenABI, provider);
  dai = new ethers.Contract(DAI, DAIabi, provider);
  daiDebt = new ethers.Contract(DAIdebt, variableDebtTokenABI, provider);
  usdc = new ethers.Contract(USDC, USDCabi, provider);
  usdcDebt = new ethers.Contract(USDCdebt, variableDebtTokenABI, provider);

  let debtFlashSwap;
  let DebtFlashSwap;

  before(async function () {

    // Resetting the Hardhat Mainnet Fork Network to block 19146010
    await network.provider.request({
        method: "hardhat_reset",
        params: [
          {
            forking: {
              jsonRpcUrl: `${polygonAlchemyKey}`,
              blockNumber: 19146010
            },
          },
        ],
    });

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0xd3d176F7e4b43C70a68466949F6C64F06Ce75BB9"],
      });
    whaleWETH = await ethers.getSigner("0xd3d176F7e4b43C70a68466949F6C64F06Ce75BB9");   
    
    // Define the signers required for the tests
    [deployer, user, _] = await ethers.getSigners();   

    // Deploy UniV2OptimizerFactory
    DebtFlashSwap = await ethers.getContractFactory("DebtFlashSwap");
    debtFlashSwap = await DebtFlashSwap.connect(deployer).deploy(
      DATAPROVIDER,
      LENDINGPOOL,
      UNISWAPFACTORY
    );

    const amountToTransfer = 10;
    const weiAmountToTransfer = ethers.utils.parseEther(amountToTransfer.toString());
    await weth.connect(whaleWETH).transfer(user.address, weiAmountToTransfer);
  });

  // Mine an empty block in between each test case
  // This step ensures that the StakingReward contract accrues Reward in between test cases
  beforeEach(async function () {
      await network.provider.send("evm_mine");
  });

  it("should have the correct balance of DAI", async () => {

    const amountToDeposit = 10;
    const amountToBorrow = 1;
    const weiAmountToDeposit = ethers.utils.parseEther(amountToDeposit.toString());
    const weiAmountToBorrow = ethers.utils.parseEther(amountToBorrow.toString());

    await weth.connect(user).approve(LENDINGPOOL, weiAmountToDeposit);
    await aave.connect(user).deposit(WETH, weiAmountToDeposit, user.address, 0);
    await aave.connect(user).borrow(WETH, weiAmountToBorrow, 2, 0, user.address);

    await weth.connect(user).transfer(whaleWETH.address, weiAmountToBorrow);
  });

  it("should swap the full WETH debt into an DAI debt", async () => {
    
    const amountToApprove = 20000;
    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());

    const wethDebtBalBefore = await wethDebt.balanceOf(user.address);
    const daiDebtBalBefore = await daiDebt.balanceOf(user.address);

    console.log("--------------------------------------------------------------------------------");
    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalBefore));
    console.log("WETH Debt : ", ethers.utils.formatEther(wethDebtBalBefore));
    console.log("--------------------------------------------------------------------------------");

    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
    console.log("--------------------------------------------------------------------------------");
    await daiDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
    console.log("Swapping WETH debt for DAI debt")
    console.log("--------------------------------------------------------------------------------");
    await debtFlashSwap.connect(user).swapFullDebt(weth.address, dai.address);

    const wethDebtBalAfter = await wethDebt.balanceOf(user.address);
    const daiDebtBalAfter = await daiDebt.balanceOf(user.address);

    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalAfter));
    console.log("WETH Debt : ", ethers.utils.formatEther(wethDebtBalAfter));
    console.log("--------------------------------------------------------------------------------");

    expect(wethDebtBalAfter).to.equal(0)
    expect(daiDebtBalAfter > 0).to.equal(true)
  });

  it("should swap the full DAI debt into USDC debt", async () => {
    
    const amountToApprove = 100000;
    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());

    const daiDebtBalBefore = await daiDebt.balanceOf(user.address);
    const usdcDebtBalBefore = await usdcDebt.balanceOf(user.address);
    const usdcDebtDecimals = await usdcDebt.decimals();

    console.log("--------------------------------------------------------------------------------");
    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalBefore));
    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalBefore, usdcDebtDecimals));
    console.log("--------------------------------------------------------------------------------");

    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
    console.log("--------------------------------------------------------------------------------");
    await usdcDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
    console.log("Swapping DAI debt for USDC debt")
    console.log("--------------------------------------------------------------------------------");
    await debtFlashSwap.connect(user).swapFullDebt(dai.address, usdc.address);

    const daiDebtBalAfter = await daiDebt.balanceOf(user.address);
    const usdcDebtBalAfter = await usdcDebt.balanceOf(user.address);

    console.log("DAI Debt : ", ethers.utils.formatEther(daiDebtBalAfter));
    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalAfter, usdcDebtDecimals));
    console.log("--------------------------------------------------------------------------------");

    expect(daiDebtBalAfter).to.equal(0)
    expect(usdcDebtBalAfter > 0).to.equal(true)
  });

  it("should swap the 50% of the USDC debt into WMATIC debt", async () => {
    
    const amountToApprove = 20000;
    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());

    const wmaticDebtBalBefore = await wmaticDebt.balanceOf(user.address);
    const usdcDebtBalBefore = await usdcDebt.balanceOf(user.address);
    const usdcDebtDecimals = await usdcDebt.decimals();

    console.log("--------------------------------------------------------------------------------");
    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalBefore, usdcDebtDecimals));
    console.log("WMATIC Debt : ", ethers.utils.formatEther(wmaticDebtBalBefore));
    console.log("--------------------------------------------------------------------------------");

    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
    console.log("--------------------------------------------------------------------------------");
    await wmaticDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)

    console.log("Swapping 50% of USDC debt for WMATIC debt")
    console.log("--------------------------------------------------------------------------------");
    await debtFlashSwap.connect(user).swapPartialDebt(usdc.address, wmatic.address, 5000);

    const usdcDebtBalAfter = await usdcDebt.balanceOf(user.address);
    const wmaticDebtBalAfter = await wmaticDebt.balanceOf(user.address);

    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalAfter, usdcDebtDecimals));
    console.log("WMATIC Debt : ", ethers.utils.formatEther(wmaticDebtBalAfter));
    console.log("--------------------------------------------------------------------------------");

    expect(wmaticDebtBalAfter > 0).to.equal(true)
    expect(usdcDebtBalAfter > usdcDebtBalBefore.mul(4900).div(10000)).to.equal(true)
    expect(usdcDebtBalAfter < usdcDebtBalBefore.mul(5100).div(10000)).to.equal(true)
  });

  it("should swap the 90% of the WMATIC debt into WBTC debt", async () => {
    
    const amountToApprove = 20000;
    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());

    const wmaticDebtBalBefore = await wmaticDebt.balanceOf(user.address);
    const wbtcDebtBalBefore = await wbtcDebt.balanceOf(user.address);
    const wbtcDebtDecimals = await wbtcDebt.decimals();
    const usdcDebtBalBefore = await usdcDebt.balanceOf(user.address);
    const usdcDebtDecimals = await usdcDebt.decimals();

    console.log("--------------------------------------------------------------------------------");
    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalBefore, usdcDebtDecimals));
    console.log("WBTC Debt : ", ethers.utils.formatUnits(wbtcDebtBalBefore, wbtcDebtDecimals));
    console.log("WMATIC Debt : ", ethers.utils.formatEther(wmaticDebtBalBefore));
    console.log("--------------------------------------------------------------------------------");

    console.log("Approving %d for delegation to %s.", amountToApprove, debtFlashSwap.address);
    console.log("--------------------------------------------------------------------------------");
    await wbtcDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)

    console.log("Swapping 90% of the WMATIC debt into WBTC debt")
    console.log("--------------------------------------------------------------------------------");
    await debtFlashSwap.connect(user).swapPartialDebt(wmatic.address, wbtc.address, 9000);

    const usdcDebtBalAfter = await usdcDebt.balanceOf(user.address);
    const wmaticDebtBalAfter = await wmaticDebt.balanceOf(user.address);
    const wbtcDebtBalAfter = await wbtcDebt.balanceOf(user.address);

    console.log("USDC Debt : ", ethers.utils.formatUnits(usdcDebtBalAfter, usdcDebtDecimals));
    console.log("WBTC Debt : ", ethers.utils.formatUnits(wbtcDebtBalAfter, wbtcDebtDecimals));
    console.log("WMATIC Debt : ", ethers.utils.formatEther(wmaticDebtBalAfter));
    console.log("--------------------------------------------------------------------------------");

    expect(wbtcDebtBalAfter > 0).to.equal(true)
    expect(wmaticDebtBalAfter > wmaticDebtBalBefore.mul(900).div(10000)).to.equal(true)
    expect(wmaticDebtBalAfter < wmaticDebtBalBefore.mul(1100).div(10000)).to.equal(true)
  });
});

