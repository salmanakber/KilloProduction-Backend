/** Viewer-facing amounts for money transfer APIs (send vs receive currency). */

export type MoneyTransferDisplayRow = {
  sendAmount: number
  sendCurrency: string
  receiveAmount: number
  receiveCurrency: string
  displayAmount: number
  displayCurrency: string
  counterAmount: number
  counterCurrency: string
  showCounter: boolean
}

function norm(code: string | null | undefined): string {
  return String(code || "USD")
    .trim()
    .toUpperCase()
    .slice(0, 3)
}

export function buildMoneyTransferDisplayRow(
  transfer: {
    amount: number
    currency: string
    receiveAmount?: number | null
    receiveCurrency?: string | null
  },
  isSender: boolean,
): MoneyTransferDisplayRow {
  const sendAmount = transfer.amount
  const sendCurrency = norm(transfer.currency)
  const receiveAmount =
    transfer.receiveAmount != null && transfer.receiveAmount > 0
      ? transfer.receiveAmount
      : sendAmount
  const receiveCurrency = norm(transfer.receiveCurrency || sendCurrency)

  const displayAmount = isSender ? sendAmount : receiveAmount
  const displayCurrency = isSender ? sendCurrency : receiveCurrency
  const counterAmount = isSender ? receiveAmount : sendAmount
  const counterCurrency = isSender ? receiveCurrency : sendCurrency
  const showCounter =
    displayCurrency !== counterCurrency ||
    Math.abs(displayAmount - counterAmount) > 0.009

  return {
    sendAmount,
    sendCurrency,
    receiveAmount,
    receiveCurrency,
    displayAmount,
    displayCurrency,
    counterAmount,
    counterCurrency,
    showCounter,
  }
}
