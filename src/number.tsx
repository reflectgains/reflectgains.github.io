import React from 'react';
import { ethers } from 'ethers'

// Format a BigNumber with the given decimals and an optional divider used to
// display smaller rounded numbers with suffixes like `K` and `M`.
function formatNum(value: ethers.BigNumberish, decimals: number, div: number = 1): string {
  const tmp = ethers.utils.commify(ethers.utils.formatUnits(ethers.BigNumber.from(value).div(div.toString()), decimals))
  const parts = tmp.split('.')

  if (div > 1) {
    return parts[0]
  }

  if (parts.length === 1) {
    return `${parts[0]}.00`
  }
  if (parts[1].length < 2) {
    parts[1] += '0'
  }
  return `${parts[0]}.${parts[1].substr(0, 2)}`
}

export default function Number({value, decimals, suffix}: {value: ethers.BigNumber, decimals: number, suffix: string}) {
  const div = {
    'M': 1000000,
    'K': 1000,
  }[suffix] || 1

  return (
    <span title={ethers.utils.commify(ethers.utils.formatUnits(value, decimals))}>{formatNum(value, decimals, div)}{suffix}</span>
  )
}
