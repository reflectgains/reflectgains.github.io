# Reflect Gains App

A small app to calculate the gains you've made from smart contract tokens that support transaction cost sharing, i.e. token reflection.

Currently supported:

- Binance BSC-based smart contracts

## How does this work?

First, you can connect your wallet to the app to get the **public** address and number of tokens held, or you can choose to enter the wallet address manually if you like.

Next, the app scans the **public** history of your wallet address and looks for transactions related to the smart contract token address. It tallies up the purchases and sales to get a final number of how many tokens you purchased.

Finally, the app displays how many tokens you have earned as well as the dollar value estimate along with a short history of purchases.

## Why trust and use this app?

First off, is it safe to share your **public** wallet address? Yes. Crypto wallets are composed of two parts:

1. Public key or address
2. Private key

You can share the public key anywhere you want without worry of losing money. No transaction can be made from your wallet without the private key. **NEVER** share the private key with anyone, ever. You may know the private key as a 12 or 24 word mnemonic.

What this app does is all stuff you can do by hand. Why use the app?

1. It makes checking this information convenient and fast.
2. It's open source. All the code is right here to see.
3. The wallet integration is _read-only_, meaning the app cannot send or receive tokens on your behalf. It will never ask to sign a transaction request.

This app does not store any information about you or your wallet address permanently.

## Development

The app is split into two parts:

1. Cloud functions written in Go to create a simple backend API.
2. A React-based frontent app written in TypeScript.

To run the app locally:

```sh
$ npm install
$ npm start
```

Then open the browser to e.g. http://localhost:8000/#0xaad87f47cdea777faf87e7602e91e3a6afbe4d57

## Support the Author

If you would like to thank or support the author, you may send any ERC-20/BEP-20 (Ethereum or Binance) compatible token to `0x75289376fC9eB00833C6EDa235e019E286E1eeFD`. Thank you!
