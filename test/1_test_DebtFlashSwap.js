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

  

  // AAVE Lending Pool 
  const LENDINGPOOL = "0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf";


  /* Provider */
  const provider = new ethers.providers.JsonRpcProvider();

  // Instantiating the existing mainnet fork contracts
  aave = new ethers.Contract(LENDINGPOOL, LendingPoolAbi, provider);
  weth = new ethers.Contract(WETH, WETHabi, provider);
  wethDebt = new ethers.Contract(WETHdebt, variableDebtTokenABI, provider);
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
    debtFlashSwap = await DebtFlashSwap.connect(deployer).deploy();

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

  it("should swap the WETH debt into an DAI debt", async () => {
    
    const weiAmount = await wethDebt.balanceOf(user.address);
    const amountToApprove = 20000;
    const weiAmountToApprove = ethers.utils.parseEther(amountToApprove.toString());

    const wethDebtBalBefore = await wethDebt.balanceOf(user.address);
    const daiDebtBalBefore = await daiDebt.balanceOf(user.address);

    await daiDebt.connect(user).approveDelegation(debtFlashSwap.address, weiAmountToApprove)
    await debtFlashSwap.connect(user).swapDebtToken(weth.address, dai.address, weiAmount);

    const wethDebtBalAfter = await wethDebt.balanceOf(user.address);
    const daiDebtBalAfter = await daiDebt.balanceOf(user.address);

    console.log("DAI Debt Before", daiDebtBalBefore)
    console.log("WETH Debt Before", wethDebtBalBefore)
    console.log("DAI Debt After", daiDebtBalAfter)
    console.log("WETH Debt After", wethDebtBalAfter)

    expect(wethDebtBal).to.equal(0)
    expect(daiDebtBal > 0).to.equal(true)
  });
});

