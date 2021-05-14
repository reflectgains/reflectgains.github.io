import * as ReactDOM from 'react-dom'

import { BigNumber, ethers } from 'ethers'
import React, {useEffect, useState} from 'react'

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
]

// Load the wallet if allowed by the user. This returns the wallet account ID.
async function loadWallet(): Promise<string> {
  const accts = await window.ethereum.request({method: "eth_requestAccounts"})
  return accts[0]
}

// Get the balance of a smart contract from the wallet account. If the smart
// contract implements the `decimals` function this will also return the number
// of decimals.
async function getBalance(account: string, contract: string): Promise<[BigNumber, BigNumber]> {
  const provider = new ethers.providers.Web3Provider(window.ethereum)
  const ct = new ethers.Contract(contract, ABI, provider)
  const balance = await ct.balanceOf(account)
  const decimals = await ct.decimals()

  return [balance, decimals]
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
  const resp = await fetch('https://us-central1-reflectgains.cloudfunctions.net/get-transactions ', {
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
}

// Get the token info from a smart contract address.
async function getTokenInfo(contract: string): Promise<TokenInfo> {
  const resp = await fetch('https://api.pancakeswap.info/api/v2/tokens/' + contract)
  return (await resp.json()).data
}

// Format a BigNumber to a number with two decimal places given the number
// of decimals from a smart contract token.
function formatNum(value: ethers.BigNumberish, decimals: number): string {
  const tmp = ethers.utils.commify(ethers.utils.formatUnits(value, decimals))
  const parts = tmp.split('.')
  if (parts.length === 1) {
    return `${parts[0]}.00`
  }
  if (parts[1].length < 2) {
    parts[1] += '0'
  }
  return `${parts[0]}.${parts[1].substr(0, 2)}`
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
  const [manualBalance, setManualBalance] = useState<string>('0')
  const [bought, setBought] = useState<string>('0')
  const [decimals, setDecimals] = useState<number>(18)
  const [tokenInfo, setTokenInfo] = useState<TokenInfo|null>(null)
  const [analyze, setAnalyze] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)

  if (error) {
    return (
      <div>Error: {error}</div>
    )
  }

  // Try to get the token info anytime the contract address changes.
  useEffect(async () => {
    try {
      const info = await getTokenInfo(contract)
      setTokenInfo(info)
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
    for (const txn of transactions) {
      if (txn.to.toLowerCase() === account.toLowerCase()) {
        // Moving tokens to this wallet.
        count = count.add(ethers.BigNumber.from(txn.value))
      } else {
        // Moving tokens away from this wallet.
        count = count.sub(ethers.BigNumber.from(txn.value))
      }
    }

    setTransactions(transactions)
    setBought(count.toString())
  }, [analyze])

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
    const act = await loadWallet()
    setAccount(act)
    setAnalyze(true)

    const [bal, dec] = await getBalance(act, contract)
    setBalance(bal.toString())
    setDecimals(dec.toNumber())
  }

  // Handler for manual mode. Convert manual balance and run the transaction
  // analysis.
  const onAnalyze = async (e: Event) => {
    e.preventDefault()
    setAnalyze(true)
    // Update the balance from the manual balance. This converts from the normal
    // human decimal representation to the large integer used internally.
    setBalance(ethers.utils.parseUnits(manualBalance, decimals.toString()).toString())
  }

  // Convert a number of tokens into USD at the current price.
  const getUSD = (value: ethers.BigNumberish): string => {
    const p = ethers.utils.parseEther(tokenInfo.price.substr(0, 18))
    return formatCurrency(ethers.utils.formatUnits(ethers.BigNumber.from(value).mul(p), decimals + 18))
  }

  // Get the difference and balances if possible.
  let diff = '0'
  let diffUSD = '0'
  let balanceUSD = '0'
  if (balance !== '0') {
    const d = ethers.BigNumber.from(balance).sub(ethers.BigNumber.from(bought))
    diff = formatNum(d, decimals)
    diffUSD = getUSD(d)
    balanceUSD = getUSD(balance)
  }

  // Draw the page!
  return (
    <div className="col" style={{maxWidth: '800px', margin: 'auto'}}>
      <h1>Calculate {tokenInfo.symbol} Gains</h1>
      <p>
        Some crypto coins have a tax on transactions, part of which may be reflected back to the user in the form of more tokens. This tool calculates how many tokens you have made and how much they are currently worth.
      </p>
      {!manual && !analyze && (
      <div className="col mb1" style={{textAlign: 'center'}}>
        <a className="button" onClick={onConnectWallet}>Connect Wallet</a>
        <a href="#" style={{textTransform: 'uppercase'}} onClick={toggleManual}>enter manually instead</a>
      </div>
      )}
      {manual && !analyze && (
        <div className="col mb1">
          <div className="row mb1">
            <div className="col" style={{width: "100%"}}>
              <div className="row">
                <label htmlFor="wallet">Public address</label>
                <input id="wallet" type="text" placeholder="Enter PUBLIC token wallet address..." value={account} onChange={(e) => setAccount(e.target.value)}/>
              </div>
              <div className="row">
                <label htmlFor="balance">Balance</label>
                <input id="balance" type="number" placeholder="Token balance..." value={manualBalance} onChange={(e) => setManualBalance(e.target.value)}/>
              </div>
              <div className="row">
                <label htmlFor="decimals">Decimals</label>
                <input id="decimals" type="number" placeholder="Decimal places..." value={decimals} onChange={(e) => setDecimals(parseInt(e.target.value || '0'))}/>
              </div>
            </div>
          </div>
          <button onClick={onAnalyze} disabled={!account}>Analyze</button>
        </div>
      )}
      {analyze && transactions.length == 0 && (
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
            <tr>
              <th>Balance</th>
              <td className="num">{formatNum(balance, decimals)}</td>
              <td className="num">${balanceUSD}</td>
            </tr>
            <tr>
              <th>Bought</th>
              <td className="num">{formatNum(bought, decimals)}</td>
              <td className="num">-</td>
            </tr>
            <tr>
              <th>Difference</th>
              <td className="num">{diff}</td>
              <td className="num">${diffUSD}</td>
            </tr>
          </tbody>
        </table>
        <h2>Transactions</h2>
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
                  <td className={`num ${tx.to.toLowerCase() === account.toLowerCase() ? '' : 'sell'}`}>{formatNum(tx.value, decimals)}</td>
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
