// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

contract MockChainlinkOracle {
    int256 private _price;

    function setLatestPrice(int256 price) public {
        _price = price;
    }

    function latestRoundData() public view returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (0, _price, 0, 0, 0);
    }
}
