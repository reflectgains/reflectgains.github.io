import * as ReactDOM from 'react-dom'

import React, {useEffect, useState} from 'react'

import Number from './number'
import { ethers } from 'ethers'

const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };

// Well-known contract addresses for simpler URIs.
const CONTRACTS = {
  pye: '0xaad87f47cdea777faf87e7602e91e3a6afbe4d57',
}

const ABI: string[] = [
  // Get the account balance
  "function balanceOf(address) view returns (uint)",

  // Get the number of decimals for the number of tokens
  "function decimals() view returns (uint)",

  // Get the total number of tokens that exist
  "function totalSupply() view returns (uint)"
]

// Load the wallet if allowed by the user. This returns the wallet account ID.
async function loadWallet(): Promise<string> {
  const accts = await window.ethereum.request({method: "eth_requestAccounts"})
  return accts[0]
}

// Get the balance of a smart contract from the wallet account. If the smart
// contract implements the `decimals` function this will also return the number
// of decimals.
async function getWalletBalance(account: string, contract: string): Promise<[ethers.BigNumber, ethers.BigNumber]> {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const ct = new ethers.Contract(contract, ABI, provider)
  const balance = await ct.balanceOf(account)
  const decimals = await ct.decimals()

  return [balance, decimals]
}

// Get the current circulating supply of tokens from the contract, subtracting
// any balances of known dead wallets that tokens may have been "burned" to.
async function getCirculatingSupply(contract: string): Promise<ethers.BigNumber> {
  const provider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed3.binance.org/', 56)
  const ct = new ethers.Contract(contract, ABI, provider)

  const total = await ct.totalSupply()
  const dead = await ct.balanceOf('0x000000000000000000000000000000000000dead')

  return total.sub(dead)
}

// Get the balance of a smart contract from an API call.
async function getBalance(account: string, contract: string): Promise<[ethers.BigNumber, ethers.BigNumber]> {
  const resp = await fetch('https://us-central1-reflectgains.cloudfunctions.net/get-balances ', {
    method: "post",
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chain_id: 56,
      address: account,
    })
  })
  const parsed = await resp.json()
  for (const token of parsed.data.items) {
    if (token.contract_address === contract) {
      return [ethers.BigNumber.from(token.balance), ethers.BigNumber.from(token.contract_decimals)]
    }
  }
}

// Represents a single transfer of tokens from one address to another.
interface Transaction {
  blockHash: string
  blockNumber: string
  confirmations: string
  contractAddress: string
  cumulativeGasUsed: string
  from: string
  gas: string
  gasPrice: string
  gasUsed: string
  hash: string
  timeStamp: string
  to: string
  tokenDecimal: string
  tokenName: string
  tokenSymbol: string
  value: string
}

// Get a list of transactions for a smart contract where the given wallet
// address is either the sender or receiver.
async function getTransactions(account: string, contract: string): Promise<Transaction[]> {
  const resp = await fetch('https://us-central1-reflectgains.cloudfunctions.net/get-transactions', {
    method: "post",
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contract,
      wallet: account,
    })
  })
  return await resp.json()
}

// Describes information about the token, such as the name and current price.
interface TokenInfo {
  name: string
  symbol: string
  price: string
  price_BNB: string
  supply: ethers.BigNumber
}

// Get the token info from a smart contract address.
async function getTokenInfo(contract: string): Promise<TokenInfo> {
  const resp = await fetch('https://api.pancakeswap.info/api/v2/tokens/' + contract)
  const data = (await resp.json()).data

  data.supply = await getCirculatingSupply(contract)

  return data
}

interface TopCoin {
  name: string
  code: string
  cap: number
}

async function getTopCoins(): Promise<TopCoin[]> {
  const resp = await fetch('https://us-central1-reflectgains.cloudfunctions.net/top-coins', {
    method: "post",
    headers: {
      'content-type': 'application/json',
    },
  })
  return await resp.json()
}

// Format a numeric string as a fixed two-decimal point number. No rounding
// is performed and no currency symbol is added. Examples:
// `1.23456` => `1.23`
// `5` => `5.00`
function formatCurrency(value: string): string {
  const parts = value.split('.')
  if (parts.length < 2) {
    parts.push('00')
  }
  if (parts[1].length < 2) {
    parts[1] += '0'
  }
  return ethers.utils.commify(parts[0]) + '.' + parts[1].substr(0, 2)
}

// This is the entrypoint to the main application.
function App() {
  const hash = window.location.hash.substr(1)
  const contract = CONTRACTS[hash] || hash

  // Contract address or short-name must be passed in the URI!
  if (!contract) {
    return (
      <div>No contract specified in URL.<br/>Usage: {location.toString()}#0xabc123...</div>
    )
  }

  const [error, setError] = useState()
  const [manual, setManual] = useState<boolean>(false)
  const [account, setAccount] = useState<string>('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [balance, setBalance] = useState<string>('0')
  const [bought, setBought] = useState<string>('0')
  const [totalBought, setTotalBought] = useState<string>('0')
  const [totalSold, setTotalSold] = useState<string>('0')
  const [decimals, setDecimals] = useState<number>(18)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo|null>(null)
  const [topCoins, setTopCoins] = useState<TopCoin[]>([])
  const [topCoin, setTopCoin] = useState<number>(49)
  const [analyze, setAnalyze] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)

  // Find the minimum length of the token numbers we will display.
  let min = Infinity;
  if (balance.length < min) {
    min = balance.length
  }
  if (bought.length < min) {
    min = bought.length
  }
  for (const tx of transactions) {
    if (tx.value.length < min) {
      min = tx.value.length
    }
  }

  // Use the minimum length to determine if we should use a suffix to make
  // the numbers easier to read.
  let suffix = ''
  if (min - decimals > 6) {
    suffix = 'M'
  } else if (min - decimals > 3) {
    suffix = 'K'
  }

  // Try to get the token info anytime the contract address changes.
  useEffect(async () => {
    try {
      const info = await getTokenInfo(contract)
      const top = await getTopCoins()

      setTokenInfo(info)
      setTopCoins(top)
      setLoading(false)
    } catch (e) {
      setError(e)
    }
  }, [contract])

  // Run the transaction analysis when asked, either by clicking the wallet
  // button or manually entering details.
  useEffect(async () => {
    if (!analyze) {
      return
    }

    const transactions = await getTransactions(account, contract)

    let count = ethers.BigNumber.from(0)
    let positive = ethers.BigNumber.from(0)
    let negative = ethers.BigNumber.from(0)
    for (const txn of transactions) {
      const value = ethers.BigNumber.from(txn.value)
      if (txn.to.toLowerCase() === account.toLowerCase()) {
        // Moving tokens to this wallet.
        count = count.add(value)
        positive = positive.add(value)
      } else {
        // Moving tokens away from this wallet.
        count = count.sub(value)
        negative = negative.sub(value)
      }
    }

    setTransactions(transactions)
    setBought(count.toString())
    setTotalBought(positive.toString())
    setTotalSold(negative.toString())
    setLoading(false)

    if (transactions.length === 0) {
      setError("No transactions found")
    }
  }, [analyze])

  if (error) {
    return (
      <div>Error: {error}<br/><a href="#" onClick={(e) => {e.preventDefault(); window.location.reload()}}>Try again</a></div>
    )
  }

  // Show a loading spinner until we get the token info.
  if (!tokenInfo) {
    return (
      <div style={{textAlign: 'center', margin: '2em auto'}}>
        <div className="loader">Loading Token Contract...</div>
      </div>
    )
  }

  // Turns manual mode on and off when things get clicked.
  const toggleManual = (e: Event) => {
    e.preventDefault()
    setManual(!manual)
  }

  // Handler for wallet mode. Get the wallet and token info, then sets analyze
  // so that the transaction analysis runs and reports the results.
  const onConnectWallet = async (e: Event) => {
    setLoading(true)

    const act = await loadWallet()
    const [bal, dec] = await getWalletBalance(act, contract)

    setAccount(act)
    setBalance(bal.toString())
    setDecimals(dec.toNumber())
    setAnalyze(true)
  }

  // Handler for manual mode. Convert manual balance and run the transaction
  // analysis.
  const onAnalyze = async (e: Event) => {
    e.preventDefault()
    setLoading(true)
    const [bal, dec] = await getBalance(account, contract)
    setBalance(bal.toString())
    setDecimals(dec.toNumber())
    setAnalyze(true)
  }

  const price = tokenInfo && ethers.utils.parseEther(tokenInfo.price.substr(0, 18)) || '0'
  const mcap = tokenInfo && tokenInfo.supply.mul(price) || '1'

  // Convert a number of tokens into USD at the current price.
  const getUSD = (tokens: ethers.BigNumberish): string => {
    return formatCurrency(ethers.utils.formatUnits(ethers.BigNumber.from(tokens).mul(price), decimals + 18))
  }

  const scaleBalance = (newMCap: ethers.BigNumberish): string => {
    // Multiply the current balance by the ratio of the new to old market cap
    // values as big numbers.
    let multiplyer = ethers.BigNumber.from('1000000000000000000')
    for (let i = 0; i < decimals; i++) {
      multiplyer = multiplyer.mul(10)
    }
    return getUSD(ethers.BigNumber.from(newMCap).mul(multiplyer).div(mcap.toString() === '0' ? '1' : mcap).mul(balance))
  }

  // Get the difference and balances if possible.
  let diff: ethers.BigNumber = ethers.BigNumber.from('0')
  let diffUSD = '0'
  let balanceUSD = '0'
  if (balance !== '0') {
    diff = ethers.BigNumber.from(balance).sub(ethers.BigNumber.from(bought))
    diffUSD = getUSD(diff)
    balanceUSD = getUSD(balance)
  }

  // Draw the page!
  return (
    <div className="col" style={{maxWidth: '800px', margin: 'auto'}}>
      <h1>Calculate {tokenInfo.symbol} Gains</h1>
      <div className="contract">Contract address: {contract}</div>
      <p>
        Some crypto coins have a tax on transactions, part of which may be reflected back to the user in the form of more tokens. This tool calculates how many tokens you have made and how much they are currently worth.
      </p>
      {!manual && !loading && transactions.length === 0 && (
      <div className="col mb1" style={{textAlign: 'center'}}>
        <a className="button" onClick={onConnectWallet}>Connect Wallet</a>
        <a href="#" style={{textTransform: 'uppercase'}} onClick={toggleManual}>enter manually instead</a>
      </div>
      )}
      {manual && !loading && transactions.length === 0 && (
        <div className="col mb1">
          <div className="row mb1">
            <div className="col" style={{width: "100%"}}>
              <div className="row">
                <label htmlFor="wallet">Public address</label>
                <input id="wallet" type="text" placeholder="Enter PUBLIC token wallet address..." value={account} onChange={(e) => setAccount(e.target.value)}/>
              </div>
            </div>
          </div>
          <button onClick={onAnalyze} disabled={!account}>Analyze</button>
        </div>
      )}
      {loading && transactions.length == 0 && (
        <div className="loader">Loading Transactions...</div>
      )}
      {transactions.length > 0 && (
        <>
          <table style={{textAlign: 'left'}}>
          <thead>
            <tr>
              <th></th>
              <th className="num">Tokens</th>
              <th className="num">Current USD</th>
            </tr>
          </thead>
          <tbody>
            {totalSold != '0' && (
              <tr>
                <th>Total Bought</th>
                <td className="num"><Number value={totalBought} decimals={decimals} suffix={suffix}/></td>
                <td className="num">-</td>
              </tr>
            )}
            {totalSold != '0' && (
              <tr>
                <th>Total Sold</th>
                <td className="num"><Number value={totalSold} decimals={decimals} suffix={suffix}/></td>
                <td className="num">-</td>
              </tr>
            )}
            <tr>
              <th>Net Bought</th>
              <td className="num"><Number value={bought} decimals={decimals} suffix={suffix}/></td>
              <td className="num">-</td>
            </tr>
            <tr>
              <th>Current Balance</th>
              <td className="num"><Number value={balance} decimals={decimals} suffix={suffix}/></td>
              <td className="num">${balanceUSD}</td>
            </tr>
            <tr>
              <th>Gains</th>
              <td className="num"><Number value={diff} decimals={decimals} suffix={suffix}/></td>
              <td className="num">${diffUSD}</td>
            </tr>
          </tbody>
        </table>
        <h2>Top Coins Comparison</h2>
        <p>
          See how your current balance in USD scales if this coin makes it into the top list by market cap. The current market cap is ${tokenInfo && getUSD(tokenInfo.supply).split('.')[0] || 0} with a circulating supply of <Number value={tokenInfo && tokenInfo.supply || '0'} decimals={decimals} suffix={suffix}/> tokens. You own {tokenInfo && ethers.utils.formatUnits(ethers.BigNumber.from(balance).mul('10000000').div(tokenInfo.supply), '3')}<span title="per ten thousand">‱</span> of the circulating supply.
        </p>
        <table style={{width: '100%'}}>
          <thead>
            <tr>
              <th style={{width: '14%'}}></th>
              <th style={{width: '26%'}}>Token</th>
              <th style={{width: '30%'}}>Market Cap</th>
              <th style={{width: '30%'}}>Potential USD</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Top {topCoin+1}</th>
              <td><a href={'https://www.livecoinwatch.com/price/' + topCoins[topCoin].name + '-' + topCoins[topCoin].code}>{topCoins[topCoin].name}</a></td>
                <td className="num">${formatCurrency(topCoins[topCoin].cap.toString()).split('.')[0]}</td>
                <td className="num">${scaleBalance(topCoins[topCoin].cap.toString())}</td>
            </tr>
          </tbody>
        </table>
        <input type="range" min="0" max="99" value={topCoin} onChange={(e) => setTopCoin(parseInt(e.target.value))}/>
        <p className="sliderLabel">
          Move the slider to pick the top coin to compare against.
        </p>
        <h2>Your Transactions</h2>
        <p>
          The following transactions were found for the given wallet address.
        </p>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Short Hash</th>
              <th className="num">Block</th>
              <th className="num">Tokens</th>
              <th className="num">Current USD</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx: Transaction, index: number) => {
              const d = new Date(parseInt(tx.timeStamp) * 1000)
              return (
                <tr key={index}>
                  <td title={d.toISOString()}>{d.toLocaleString(navigator.language, dateOptions)}</td>
                  <td><a href={"https://bscscan.com/tx/" + tx.hash}>{tx.hash.substr(0, 8)}</a></td>
                  <td className="num"><a href={"https://bscscan.com/block/" + tx.blockNumber}>{tx.blockNumber}</a></td>
                  <td className={`num ${tx.to.toLowerCase() === account.toLowerCase() ? '' : 'sell'}`}><Number value={ethers.BigNumber.from(tx.value)} decimals={decimals} suffix={suffix}/></td>
                  <td className="num">${getUSD(tx.value)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </>
      )}
      <div className="tips">
        Like the tool? Tips appreciated! Send ERC-20/BEP-20 to:
        <br/>
        <span title="Click to copy" onClick={() => {navigator.clipboard.writeText("0x75289376fC9eB00833C6EDa235e019E286E1eeFD").then(() => {setCopied(true)})}} style={{cursor: "pointer"}}>0x75289376fC9eB00833C6EDa235e019E286E1eeFD {!copied && '📋' || '✅'}</span>
      </div>
    </div>
  )
}

ReactDOM.render(<App />, document.querySelector("#app"))
