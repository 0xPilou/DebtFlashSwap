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

  // AAVE Lending Pool 
  const LENDINGPOOL = "0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf";


  /* Provider */
  const provider = new ethers.providers.JsonRpcProvider();

  // Instantiating the existing mainnet fork contracts
  aave = new ethers.Contract(LENDINGPOOL, LendingPoolAbi, provider);
  weth = new ethers.Contract(WETH, WETHabi, provider);
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

    const daiBalBefore = await dai.balanceOf(user.address);
    expect(daiBalBefore).to.equal(0)


    const amountToBorrow = 10;
    const weiAmountToBorrow = ethers.utils.parseEther(amountToBorrow.toString());

    await weth.connect(user).approve(LENDINGPOOL, weiAmountToBorrow);
    await aave.connect(user).deposit(WETH, weiAmountToBorrow, user.address, 0);
    await aave.connect(user).borrow(DAI, weiAmountToBorrow, 2, 0, user.address);

    const daiBal = await dai.balanceOf(user.address);
    expect(daiBal).to.equal(weiAmountToBorrow)

    await dai.connect(user).transfer(whaleWETH.address, weiAmountToBorrow);
    const daiBalAfter = await dai.balanceOf(user.address);
    expect(daiBalAfter).to.equal(0)


    const daiDebtBal = await daiDebt.balanceOf(user.address);
    expect(daiDebtBal > 0).to.equal(true)
  });

  it("should swap the DAI debt into an USDC debt", async () => {
    
    const amount = 10;
    const weiAmount = ethers.utils.parseEther(amount.toString());

    await debtFlashSwap.connect(user).swapDebtToken(dai.address, usdc.address, weiAmount);

    const daiDebtBal = await daiDebt.balanceOf(user.address);
    expect(daiDebtBal).to.equal(0)

    const usdcDebtBal = await usdcDebt.balanceOf(user.address);
    expect(usdcDebtBal > 0).to.equal(true)
  });



//    it("should stake 10 LP tokens to the Staking Reward Pool", async () => {
//
//        // Quantity to deposit for this test
//        const amountToDeposit = 10;
//        const weiAmountToDeposit = ethers.utils.parseEther(amountToDeposit.toString());
//
//        // Transfering 10 LP tokens from a whale address to the UniV2Optimizer owner address
//        await staking.connect(whaleLP).transfer(owner.address, weiAmountToDeposit);
//
//        // Checking the balances before the staking operation
//        const userBalBefore = await staking.balanceOf(owner.address);      
//        const poolBalBefore = await staking.balanceOf(stakingReward.address);
//        
//        // Approving the 10 LP tokens to be spent by the UniV2Optimizer
//        await staking.connect(owner).approve(uniV2Optimizer.address, weiAmountToDeposit);
//
//        // Staking the 10 LP tokens on the UniV2Optimizer
//        await uniV2Optimizer.connect(owner).stake(weiAmountToDeposit);
//        
//        // Checking the balances after the staking operation
//        const userBalAfter = await staking.balanceOf(owner.address);      
//        const poolBalAfter = await staking.balanceOf(stakingReward.address);      
//
//        // Assertion #1 : Staking Pool Balance After = Staking Pool Balance Before + 10
//        expect(poolBalAfter).to.equal(poolBalBefore.add(weiAmountToDeposit))
//
//        // Assertion #2 : User Balance Before = User Balance Before - 10
//        expect(userBalAfter).to.equal(userBalBefore.sub(weiAmountToDeposit))
//    });
//  
//   it("should not be able to withdraw 20 LP token from the Staking Reward Pool", async () => { 
//       
//        // Quantity to withdraw for this test
//        const amountToWithdraw = 20;
//        const weiAmountToWithdraw = ethers.utils.parseEther(amountToWithdraw.toString());
//        
//        // Assertion : Transaction should revert as the owner staked balance is lower than the quantity withdrawn
//        await truffleAssert.reverts(uniV2Optimizer.connect(owner).withdraw(weiAmountToWithdraw));
//    });
//  
//    
//    it("should compound the Reward into more staked LP token", async () => {
//       
//        // Checking the balances before the compounding operation
//        const poolBalBefore = ethers.utils.formatEther(await staking.balanceOf(stakingReward.address));
//        const feeBalBefore = await feeCollector.staked();
//        const dividendBalBefore = ethers.utils.formatEther(await staking.balanceOf(dividendRecipient.address));
//
//        // Compounding operation
//        await uniV2Optimizer.connect(owner).harvest();
//
//        // Checking the balances after the compounding operation
//        const poolBalAfter = ethers.utils.formatEther(await staking.balanceOf(stakingReward.address));
//        const feeBalAfter = await feeCollector.staked();
//        const dividendBalAfter = ethers.utils.formatEther(await staking.balanceOf(dividendRecipient.address));
//
//
//        // Assertion #1 : Staking Pool Balance Before < Staking Pool Balance After
//        expect(poolBalBefore < poolBalAfter).to.equal(true);
//
//        // Assertion #2 : Fee Collector Balance Before < Fee Collector Balance After
//        expect(feeBalBefore < feeBalAfter).to.equal(true, "Fees not accrued");
//
//        // Assertion #3 : Dividend Recipient Balance Before < Dividend Recipient Balance After
//        expect(dividendBalBefore < dividendBalAfter).to.equal(true, "Dividends not accrued");
//    });
//
//    it("should return the quantity of pending reward to be claimed from the StakingReward contract", async () => {
//
//        pendingReward = await uniV2Optimizer.connect(owner).getPendingRewards();
//
//        // Assertion : Pending Reward should be greater than 0
//        expect(pendingReward.toNumber() > 0).to.equal(true);
//    });
//
//    it("should withdraw 10 LP tokens from the Staking Reward Pool", async () => {
//        
//        // Quantity to withdraw for this test
//        const amountToWithdraw = 10;
//        const weiAmountToWithdraw = ethers.utils.parseEther(amountToWithdraw.toString());
//
//        // Checking the balances before the withdrawal operation
//        const userBalBefore = await staking.balanceOf(owner.address);
//        const poolBalBefore = await staking.balanceOf(stakingReward.address);
//        const feeBalBefore = await feeCollector.staked();
//        const dividendBalBefore = ethers.utils.formatEther(await staking.balanceOf(dividendRecipient.address));
//
//        // Withdraw operation
//        await uniV2Optimizer.connect(owner).withdraw(weiAmountToWithdraw);
//
//        // Checking the balances after the withdrawal operation
//        const userBalAfter = await staking.balanceOf(owner.address);
//        const poolBalAfter = await staking.balanceOf(stakingReward.address);
//        const feeBalAfter = await feeCollector.staked();
//        const dividendBalAfter = ethers.utils.formatEther(await staking.balanceOf(dividendRecipient.address));
//
//
//        // Assertion #1 : User Balance After - User Balance Before = Withdraw Amount
//        expect(userBalAfter.sub(userBalBefore)).to.equal(weiAmountToWithdraw, "User balance incorrect");
//
//        // Assertion #2 : Staking Pool Balance Before > Staking Pool Balance After
//        expect(poolBalBefore > poolBalAfter).to.equal(true, "Pool balance incorrect");
//
//        // Assertion #3 : Fee Collector Balance Before < Fee Collector Balance After
//        expect(feeBalBefore.toNumber() < feeBalAfter.toNumber()).to.equal(true, "Fees not accrued");
//
//        // Assertion #4: Dividend Recipient Balance Before < Dividend Recipient Balance After
//        expect(dividendBalBefore < dividendBalAfter).to.equal(true, "Dividends not accrued");
//    });
//
//    it("should withdraw all Staking and Reward tokens form the Staking Reward Pool", async () => {
//
//        // Checking the balances before the withdrawal operation
//        const userLPBalBefore = await staking.balanceOf(owner.address);
//        const userRewardBalBefore = await reward.balanceOf(owner.address);
//        const poolBalBefore = await staking.balanceOf(stakingReward.address);
//        const feeBalBefore = await feeCollector.staked();
//        const dividendBalBefore = ethers.utils.formatEther(await staking.balanceOf(dividendRecipient.address));
//
//        // Exit Avalanche operation
//        await uniV2Optimizer.connect(owner).exitAvalanche();
//
//        // Checking the balances after the withdrawal operation
//        const userLPBalAfter = await staking.balanceOf(owner.address);
//        const userRewardBalAfter = await reward.balanceOf(owner.address);
//        const poolBalAfter = await staking.balanceOf(stakingReward.address);
//        const feeBalAfter = await feeCollector.staked();
//        const dividendBalAfter = ethers.utils.formatEther(await staking.balanceOf(dividendRecipient.address));
//
//        // Assertion #1 : User LP Balance After > User LP Balance Before
//        expect(userLPBalAfter > userLPBalBefore).to.equal(true);
//       
//        // Assertion #2 : User Reward Balance After > User Reward Balance Before
//        expect(userRewardBalAfter >= userRewardBalBefore).to.equal(true);
//        
//        // Assertion #3 : Staking Pool Balance Before > Staking Pool Balance After
//        expect(poolBalBefore > poolBalAfter).to.equal(true);
//
//        // Assertion #4 : Fee Collector Balance Before < Fee Collector Balance After
//        expect(feeBalBefore < feeBalAfter).to.equal(true, "Fees not accrued");
//        
//        // Assertion #5: Dividend Recipient Balance Before < Dividend Recipient Balance After
//        expect(dividendBalBefore < dividendBalAfter).to.equal(true, "Dividends not accrued");
//    });
//
//    it("should zap WETH into MUST-WMATIC LP and stake it to the Staking Reward Pool", async () => {
//        // Quantity to zap and stake for this test
//        const amountToZapAndStake = 10;
//        const weiAmountToZapAndStake = ethers.utils.parseEther(amountToZapAndStake.toString());
//        const ammZapAddr = await uniV2Optimizer.ammZapAddr();
//
//        // Transfering 10 LP tokens from a whale address to the UniV2Optimizer owner address
//        await tokenC.connect(whaleWETH).transfer(owner.address, weiAmountToZapAndStake);
//
//        // Checking the balances before the zapping and staking operation
//        const userWETHBalBefore = await tokenC.balanceOf(owner.address);      
//        const poolBalBefore = await staking.balanceOf(stakingReward.address);
//        
//        // Approving the 10 LP tokens to be spent by the UniV2Optimizer
//        await tokenC.connect(owner).approve(uniV2Optimizer.address, weiAmountToZapAndStake);
//
//        // Staking the 10 LP tokens on the UniV2Optimizer
//        await uniV2Optimizer.connect(owner).zapAndStake(tokenC.address, weiAmountToZapAndStake);
//        
//        // Checking the balances after the staking operation
//        const userWETHBalAfter = await tokenC.balanceOf(owner.address);      
//        const poolBalAfter = await staking.balanceOf(stakingReward.address);      
//
//        // Assertion #1 : Staking Pool Balance After > Staking Pool Balance Before
//        expect(poolBalAfter > poolBalBefore).to.equal(true)
//
//        // Assertion #2 : User WETH Balance After = User WETH Balance Before - 10
//        expect(userWETHBalAfter).to.equal(userWETHBalBefore.sub(weiAmountToZapAndStake))
//
//    });
//
//    it("should recover the lost / airdropped TokenC from the UniV2Optimizer contract", async () => {
//
//        const amountToTransfer = 10;
//        const weiAmountToTransfer = ethers.utils.parseEther(amountToTransfer.toString());
//        await tokenC.connect(whaleWETH).transfer(uniV2Optimizer.address, weiAmountToTransfer);
//
//        // Checking the balances before the recovery operation
//        const optiTokenCBalBefore = await tokenC.balanceOf(uniV2Optimizer.address);
//        const userTokenCBalBefore = await tokenC.balanceOf(owner.address);
//
//        // ERC20 Recovery Operation
//        await uniV2Optimizer.connect(owner).recoverERC20(tokenC.address);
//
//        // Checking the balances after the recovery operation
//        const optiTokenCBalAfter = await tokenC.balanceOf(uniV2Optimizer.address);
//        const userTokenCBalAfter = await tokenC.balanceOf(owner.address);
//
//        // Assertion #1 : Optimizer Token C Balance Before > Optimizer Token C Balance After
//        expect(optiTokenCBalBefore > optiTokenCBalAfter).to.equal(true, "Optimizer Balance of WETH is incorrect");
//        
//        // Assertion #2 : User Token C Balance Before < User Token C Balance After
//        expect(userTokenCBalBefore < userTokenCBalAfter).to.equal(true, "User Balance of WETH is incorrect");
//        
//    });
//
//    it("should not be able to interact with the contract (as a non-owner)", async () => { 
//       
//
//        const amount = 10;
//        const weiAmount = ethers.utils.parseEther(amount.toString());
//
//        // Assertion : Transaction should revert as the caller is not the owner of the contract
//        await truffleAssert.reverts(uniV2Optimizer.connect(nonOwner).stake(weiAmount));
//
//        // Assertion : Transaction should revert as the caller is not the owner of the contract
//        await truffleAssert.reverts(uniV2Optimizer.connect(nonOwner).withdraw(weiAmount));
//        
//        // Assertion : Transaction should revert as the caller is not the owner of the contract
//        await truffleAssert.reverts(uniV2Optimizer.connect(nonOwner).harvest());
//
//        // Assertion : Transaction should revert as the caller is not the owner of the contract
//        await truffleAssert.reverts(uniV2Optimizer.connect(nonOwner).exitAvalanche());
//
//        // Assertion : Transaction should revert as the caller is not the owner of the contract
//        await truffleAssert.reverts(uniV2Optimizer.connect(nonOwner).recoverERC20(tokenC.address));
//    });
});

