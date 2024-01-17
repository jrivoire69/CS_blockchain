// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

// Importing OpenZeppelin contracts
import "../node_modules/@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "../node_modules/@openzeppelin/contracts/access/Ownable.sol";
import "../node_modules/@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../node_modules/hardhat/console.sol";
import "../node_modules/@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";

contract Minter is ERC721, ERC721URIStorage, ERC721Burnable, Ownable {
    
    uint256 private _nextTokenId;    
    AggregatorV3Interface internal priceFeedEURUSD;
    address tokenAddress;
    uint256 public numberOfOptions;
    address bank;

    struct Option {
        uint256 lowerStrikePrice;
        uint256 higherStrikePrice;
        uint256 premium;
        uint256 multiplier;
        uint256 expiryDate;
        uint256 potentialGain;
        bool isActive;
    }

    // Mapping from tokenId to Option
    mapping(uint256 => Option) public options;

    constructor(address chainlinkOracleAddress, address _tokenAddress) ERC721("MyNFT", "NFT") Ownable(msg.sender) {
        priceFeedEURUSD = AggregatorV3Interface(chainlinkOracleAddress);
        tokenAddress = _tokenAddress;
        numberOfOptions = 0;
    }

    // Function to get the latest EUR/USD price
    function getLatestPriceEURUSD() public view returns (int256) {
        (,int256 price,,,) = priceFeedEURUSD.latestRoundData();
        return price;
    }

    function getOptionDetails(uint256 tokenId) public view returns (uint256 lowerStrikePrice, uint256 higherStrikePrice, uint256 premium, uint256 multiplier, uint256 expiryDate) {
        require(exists(tokenId), "Option does not exist");

        Option memory option = options[tokenId];
        return (option.lowerStrikePrice, option.higherStrikePrice, option.premium, option.multiplier, option.expiryDate);
    }
    
    function deposit() public payable onlyOwner {}
    
    
    function safeMint(address to, string memory uri, uint256 lowerStrikePrice, uint256 higherStrikePrice, uint256 premium, uint256 multiplier, uint256 expiryDate, uint256 potentialGain) public onlyOwner {
        uint256 tokenId = _nextTokenId++;
        bank = msg.sender;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        options[tokenId] = Option(lowerStrikePrice, higherStrikePrice, premium, multiplier, expiryDate, potentialGain, true);
        numberOfOptions++;
    }

    function getNextTokenId() public view returns (uint256) {
        return _nextTokenId;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
    
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }
    
    function exists(uint256 tokenId) public view returns (bool) {
        try this.ownerOf(tokenId) {
            return true;
        } catch {
            return false;
        }
    }

    function calculatePayoff(uint256 tokenId) public view returns (uint256) {
        Option memory option = options[tokenId];
        int256 latestPrice = getLatestPriceEURUSD();
        uint256 payoff;
        if (uint256(latestPrice) <= option.lowerStrikePrice) {
            payoff = 0;
        } else if (uint256(latestPrice) > option.lowerStrikePrice && uint256(latestPrice) <= option.higherStrikePrice) {
            payoff = (uint256(latestPrice) - option.lowerStrikePrice) * option.multiplier;
        } else {
            payoff = (option.higherStrikePrice - option.lowerStrikePrice) * option.multiplier;
        }
        return payoff;
    }

    function sendToken(address recipient, uint256 amount) public {
        IERC20 token = IERC20(tokenAddress);
        require(token.balanceOf(address(this)) >= amount, "Insufficient token balance");
        token.transfer(recipient, amount);
    }

    function executePayout() external {
        IERC20 token = IERC20(tokenAddress);
        for (uint256 i = 0; i < numberOfOptions; i++) {
            if (options[i].isActive && block.timestamp > options[i].expiryDate) {
                require(options[i].isActive == true, "Option not active anymore");
        
                require(block.timestamp >= options[i].expiryDate, "Option not yet expired");
                
                options[i].isActive = false;

                uint256 payoff = calculatePayoff(i);
            
                require(payoff > 0, "No payoff due");

                address optionHolder = ownerOf(i);
                require(optionHolder != address(0), "Invalid option holder");

                sendToken(optionHolder, uint256(payoff));                    
                if(token.balanceOf(address(this)) > 0) {
                    withdrawAllTokens();
                }
            }
        }
    }

    function withdraw(uint256 amount) public onlyOwner {
        require(address(this).balance >= amount, "Insufficient funds in contract");
        (bool sent, ) = payable(owner()).call{value: amount}("");
        require(sent, "Failed to send Ether");
    }
    
    function withdrawAllTokens() public {
        IERC20 token = IERC20(tokenAddress);
        uint256 amount = token.balanceOf(address(this));
        require(amount > 0, "No tokens to withdraw");
        token.transfer(owner(), amount);
    }
}
