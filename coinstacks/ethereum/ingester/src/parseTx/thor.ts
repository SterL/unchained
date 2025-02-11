import { ethers } from 'ethers'
import { Tx } from '@shapeshiftoss/blockbook'
import { ParseTxUnique, Refund, Trade } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { Thorchain } from '@shapeshiftoss/thorchain'
import { InternalTx } from '../types'
import ABI from './abi/thor'
import { aggregateSell, getSigHash } from './utils'

const MIDGARD_URL = process.env.MIDGARD_URL as string
const NODE_ENV = process.env.NODE_ENV
const RPC_URL = process.env.RPC_URL as string

if (NODE_ENV !== 'test') {
  if (!MIDGARD_URL) throw new Error('MIDGARD_URL env var not set')
  if (!RPC_URL) throw new Error('RPC_URL env var not set')
}

const thorchain = new Thorchain({ midgardUrl: MIDGARD_URL })
const abiInterface = new ethers.utils.Interface(ABI)

export const ROUTER_CONTRACT = '0x42A5Ed456650a09Dc10EBc6361A7480fDd61f27B'
export const DEPOSIT_SIG_HASH = abiInterface.getSighash('deposit')
export const TRANSFEROUT_SIG_HASH = abiInterface.getSighash('transferOut')

const SWAP_TYPES = ['SWAP', '=', 's']

// detect address associated with transferOut internal transaction
export const getInternalAddress = (inputData: string): string | undefined => {
  if (getSigHash(inputData) !== TRANSFEROUT_SIG_HASH) return

  const result = abiInterface.decodeFunctionData(TRANSFEROUT_SIG_HASH, inputData)

  const [type] = result.memo.split(':')
  if (type !== 'OUT' || type !== 'REFUND') return

  return result.to
}

export const parse = async (
  tx: Tx,
  address: string,
  internalTxs?: Array<InternalTx>
): Promise<ParseTxUnique | undefined> => {
  if (!tx.ethereumSpecific?.data) return

  let result: ethers.utils.Result
  switch (getSigHash(tx.ethereumSpecific.data)) {
    case DEPOSIT_SIG_HASH:
      result = abiInterface.decodeFunctionData(DEPOSIT_SIG_HASH, tx.ethereumSpecific.data)
      break
    case TRANSFEROUT_SIG_HASH: {
      result = abiInterface.decodeFunctionData(TRANSFEROUT_SIG_HASH, tx.ethereumSpecific.data)
      break
    }
    default:
      return
  }

  const [type, ...memo] = result.memo.split(':')

  // sell side
  if (SWAP_TYPES.includes(type)) {
    const [buyAsset] = memo
    const { sellAmount, sellAsset } = aggregateSell(tx, address, internalTxs)

    if (result.amount.toString() !== sellAmount) {
      logger.warn(`swap amount specified differs from amount sent for tx: ${tx.txid}`)
    }

    const trade: Trade = {
      dexName: 'thor',
      buyAmount: '',
      buyAsset,
      feeAsset: '',
      feeAmount: '',
      memo: result.memo,
      sellAmount,
      sellAsset,
    }

    return { trade }
  }

  // buy side
  if (type === 'OUT') {
    const { input, fee, output, liquidityFee } = await thorchain.getTxDetails(memo, 'swap')

    const trade: Trade = {
      dexName: 'thor',
      buyAmount: output.amount,
      buyAsset: output.asset,
      buyNetwork: output.network,
      feeAmount: fee.amount,
      feeAsset: fee.asset,
      feeNetwork: fee.network,
      memo: result.memo,
      sellAmount: input.amount,
      sellAsset: input.asset,
      sellNetwork: input.network,
      liquidityFee,
    }

    return { trade }
  }

  // trade refund
  if (type === 'REFUND') {
    const { input, fee, output } = await thorchain.getTxDetails(memo, 'refund')

    const refund: Refund = {
      dexName: 'thor',
      feeAmount: fee.amount,
      feeAsset: fee.asset,
      feeNetwork: fee.network,
      memo: result.memo,
      refundAmount: output.amount,
      refundAsset: output.asset,
      refundNetwork: output.network,
      sellAmount: input.amount,
      sellAsset: input.asset,
      sellNetwork: input.network,
    }

    return { refund }
  }

  return
}
