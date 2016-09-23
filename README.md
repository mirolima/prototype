
#Here you'll find the source code for the Arcade City front end app prototype.


## compiling and deploying the Ethereum DAPP
### Prerequisites
#### create a wallet
- Make a lightwallet wallet with some ether on it - copy it to scripts/wallet.json

``cd truffle``

``node scripts/makewallet.js``

This script will output the first account in your wallet - together with it's private key:

``Your main account is  e3b29238498e55dc5723fd43912036c5293bdef9``
``your PK =  <you PK will appear here>``


You can use that PK to start testrpc with that account filled with ether to perform your tests.
After that you can migrate to the morden testnet using the same wallet.
Get some ether on your account by visiting out testnet faucet
http://faucet.ma.cx:3000/ and put some ether for your transactions.

## Build the contracts

``cd truffle``

``truffle compile``

``truffle migrate``

## copy the DAPP contracts to the web frontend

`` cd truffle``

``node ./scripts/copycontracts.js`` will extract the bytecode/abi/address in a JSON file and copy it to the polymer app/contracts folder. The frontend will pick it up from there.

## Installing the front-end webapp

The frontend app is a Polymer web-app. After you have compiled and deployed the DAPP contracts, you can try running the app itself.

``npm install``

``bower install``

``gulp serve``

## Minting tokens

``cd truffle``
``node ./scripts/mint.js getlc "e3b29238498e55dc5723fd43912036c5293bdef9" 100``

will mint 1 token to your account. Your token balance will appear in the app after the next mined block.

Make sure your account also had some ether to perform your transactions ( again : use our testnet faucet )

