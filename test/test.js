const { expect } = require("chai");
const { ethers } = require("hardhat");
const { copyOverrides } = require("../../app/node_modules/ethers/lib.commonjs/contract/contract");

describe("Minter contract", function () {
    let Minter, minter;
    let MockChainlinkOracle, mockChainlinkOracle;
    let owner, addr1; // Additional accounts can be named as needed

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        
        // Deploy MockChainlinkOracle
        MockChainlinkOracle = await ethers.getContractFactory("MockChainlinkOracle");
        mockChainlinkOracle = await MockChainlinkOracle.deploy();
       
        // Deploy SimulatedERC20Token
        SimulatedERC20Token = await ethers.getContractFactory("SimulatedERC20Token");
        simulatedERC20Token = await SimulatedERC20Token.deploy("SimulatedToken", "SIM", 18, ethers.parseEther("1000000"));

        // Deploy Minter with the address of the mock oracle
        Minter = await ethers.getContractFactory("Minter");
        minter = await Minter.deploy(mockChainlinkOracle.target, simulatedERC20Token.target);

        // Set a dummy price (e.g., 1.15 EUR/USD)
        await mockChainlinkOracle.setLatestPrice(ethers.parseUnits("1.15", 8));
        
        // Transfer some tokens to addr1 for testing
        await simulatedERC20Token.transfer(minter.target, ethers.parseEther("1000"));
    });

    it("Should return the correct latest EUR/USD price", async function () {
        const latestPrice = await minter.getLatestPriceEURUSD();
        console.log(latestPrice)
        expect(latestPrice).to.equal(ethers.parseUnits("1.15", 8));
    });


    it("Should calculate the correct payoff for the option", async function () {
        // Option parameters
        function roundToNearest(value, precision = 0.001) {
            return Math.round(value / precision) * precision;
        }
        const lowerStrikePrice = ethers.parseUnits("1.10", 8);
        const higherStrikePrice = ethers.parseUnits("1.20", 8);
        const premium = ethers.parseUnits("50", 8); // Example premium
        const multiplier = 1; // Example multiplier
        const expiryDate = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // Example expiry date (1 day from now)
    
        // Set the latest price to be equal to the higher strike price
        await mockChainlinkOracle.setLatestPrice(ethers.parseUnits("1.20", 8));
    
        // Mint an option NFT
        const tokenUri = "example-uri";
        await minter.safeMint(owner.address, tokenUri, lowerStrikePrice, higherStrikePrice, premium, multiplier, expiryDate);
        
        // Get the current price from the mock oracle
        const currentPrice = await minter.getLatestPriceEURUSD();
    
        // Calculate the expected payoff based on the current price
        const expectedPayoffValue = (parseFloat(ethers.formatUnits(currentPrice, 8)) - parseFloat(ethers.formatUnits(lowerStrikePrice, 8))) * multiplier;
        
        // The payoff should not exceed the cap, which is the difference between the higher and lower strike prices
        const cap = parseFloat(higherStrikePrice+lowerStrikePrice);
        const adjustedExpectedPayoffValue = roundToNearest(Math.min(expectedPayoffValue, cap));
    
        // Convert it back to a BigNumber
        const expectedPayoff = adjustedExpectedPayoffValue;
    
        // Calculate the actual payoff
        const tokenId = 0; // Assuming this is the first minted token
        const actualPayoff = await minter.calculatePayoff(tokenId);
        const expectedPayoffBigInt = ethers.parseUnits(expectedPayoff.toString(),8);
        const tolerance = BigInt(1);
        console.log(actualPayoff,expectedPayoffBigInt)
        // Assert that the actual payoff is equal to the expected payoff
        expect(BigInt(actualPayoff.toString())).to.be.closeTo(expectedPayoffBigInt, tolerance, "Payoff is not within the expected range");
    });

  
    it("should execute payout correctly", async function () {
        await mockChainlinkOracle.setLatestPrice(ethers.parseUnits("1.20", 8));

        const lowerStrikePrice = ethers.parseUnits("1.10", 8);
        const higherStrikePrice = ethers.parseUnits("1.20", 8);
        const premium = ethers.parseUnits("50", 8); // Example premium
        const multiplier = 100; // Example multiplier
        const expiryDate = Math.floor(Date.now() / 1000) + 20; // Expiry date 10 seconds from now
        const tokenUri = "example-uri";
        await minter.safeMint(addr1.address, tokenUri, lowerStrikePrice, higherStrikePrice, premium, multiplier, expiryDate);
        const tokenId = 0;
        await simulatedERC20Token.approve(minter, 1000000);

        const optionHolderInitialBalance = await simulatedERC20Token.balanceOf(addr1.address);
        await network.provider.send("evm_increaseTime", [20]);
        await network.provider.send("evm_mine");
    
        // Execute the payout
        const tx = await minter.executePayout();
        const receipt = await tx.wait();
        const optionHolderFinalBalance = await simulatedERC20Token.balanceOf(addr1.address);

        console.log(optionHolderInitialBalance)
        console.log(optionHolderFinalBalance)
        console.log(optionHolderFinalBalance-optionHolderInitialBalance)
        // expect(optionHolderFinalBalance-optionHolderInitialBalance).to.equal(sendAmount);
    });


    it("should receive tokens from an address", async function () {
        const sendAmount = 5

        // Approve Minter contract to spend tokens on behalf of addr1
        await simulatedERC20Token.approve(minter, sendAmount);

        // Check initial token balance of the Minter contract
        const initialBalance = await simulatedERC20Token.balanceOf(addr1.address);
        // Send tokens from addr1 to Minter contract
        await minter.sendToken(addr1.address, sendAmount);

        // Check final token balance of the Minter contract
        const finalBalance = await simulatedERC20Token.balanceOf(addr1.address);
        console.log("hello",finalBalance-initialBalance)
        // expect(finalBalance).to.equal(initialBalance-sendAmount);
    });
    
    it("should withdraw Ether to a specific address", async function () {
        // Arrange: Deploy contract and send some Ether to it
        // Assume minter is your deployed Minter contract instance
        const depositAmount = ethers.parseEther("1.0");
        const depositTx = await minter.connect(owner).deposit({ value: depositAmount });
        await depositTx.wait();

        const recipient = owner; // addr1 is another account from getSigners
        const withdrawAmount = ethers.parseEther("0.5");
        const initialBalance = await ethers.provider.getBalance(recipient.address);
    
        // Act: Execute the withdraw function
        await minter.withdraw(withdrawAmount);
    
        // Assert: Check the recipient's balance increased by the withdrawAmount
        const finalBalance = await ethers.provider.getBalance(recipient.address);

        // expect(finalBalance-initialBalance).to.equal(withdrawAmount);
    });
    
    it("should withdraw ERC-20 tokens to a specific address", async function () {
        // Arrange: Deploy ERC-20 token and Minter contract, and send some tokens to Minter
        const withdrawAmount = ethers.parseEther("500");
        const initialBalance = await simulatedERC20Token.balanceOf(owner.address);

        // Approve Minter contract to spend tokens on behalf of addr1
        await simulatedERC20Token.approve(minter, withdrawAmount);

        // Act: Execute the withdrawToken function
        await minter.withdrawAllTokens();

        // Assert: Check the recipient's token balance increased by the withdrawAmount
        const finalBalance = await simulatedERC20Token.balanceOf(owner.address);
        console.log("initalbalance",initialBalance, "finalbalance",finalBalance)

    });

    it("should correctly identify options where the due date has passed", async function() {
        
        await mockChainlinkOracle.setLatestPrice(ethers.parseUnits("1.15", 8));
        const sendAmount = ethers.parseEther("10000000000");

        const lowerStrikePrice = ethers.parseUnits("1.10", 8);
        const higherStrikePrice = ethers.parseUnits("1.20", 8);
        const premium = ethers.parseUnits("50", 8); // Example premium
        const multiplier = 100; // Example multiplier
        const expiryDate = Math.floor(Date.now() / 1000) + 20; // Expiry date 10 seconds from now
        const tokenUri = "example-uri";
        await minter.safeMint(addr1.address, tokenUri, lowerStrikePrice, higherStrikePrice, premium, multiplier, expiryDate);
        const tokenId = 0;
        console.log("optionnHolder:", addr1.address)
        await simulatedERC20Token.approve(minter, sendAmount);

        const optionHolderInitialBalance = await simulatedERC20Token.balanceOf(addr1.address);
        await network.provider.send("evm_increaseTime", [20]);
        await network.provider.send("evm_mine");
    
        // Execute the payout
        const tx = await minter.executePayout();
        const receipt = await tx.wait();
        
        const optionHolderFinalBalance = await simulatedERC20Token.balanceOf(addr1.address);

        console.log(optionHolderInitialBalance)
        console.log(optionHolderFinalBalance)
        console.log(optionHolderFinalBalance-optionHolderInitialBalance)
    });
});
