const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("Minter", (m) => {
  const minter = m.contract("Minter", ["0x7d7356bF6Ee5CDeC22B216581E48eCC700D0497A", "0x4ecc07Dc7141a09B4160306C46c95F8663D0A41F"]);
  return { minter };
});