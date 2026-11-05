const db = require('../db')

function verificationError(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function normalizeTelebirrNumber(value, allowMask = false) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  let number = String(value).replace(allowMask ? /[^0-9*]/g : /[^0-9]/g, '')
  if (number.startsWith('251')) number = number.slice(3)
  if (number.startsWith('0')) number = number.slice(1)
  return number
}

function isAccountMatch(maskedReceiptAccount, expectedTeleBirrNumber) {
  const cleanMasked = normalizeTelebirrNumber(maskedReceiptAccount, true)
  const cleanExpected = normalizeTelebirrNumber(expectedTeleBirrNumber)
  if (!cleanMasked || !cleanExpected) return false
  if (!cleanMasked.includes('*')) return cleanMasked === cleanExpected

  const parts = cleanMasked.split('*').filter(Boolean)
  if (parts.length === 0 || !parts[0] || !parts[parts.length - 1]) return false
  if (!cleanExpected.startsWith(parts[0]) || !cleanExpected.endsWith(parts[parts.length - 1])) return false

  let searchIndex = parts[0].length
  for (let i = 1; i < parts.length - 1; i++) {
    const index = cleanExpected.indexOf(parts[i], searchIndex)
    if (index === -1) return false
    searchIndex = index + parts[i].length
  }
  return true
}

function parseTelebirrAmount(value) {
  const match = String(value ?? '').match(/[\d,]+(?:\.\d+)?/)
  if (!match) return NaN
  return Number(match[0].replace(/,/g, ''))
}

function parseTelebirrPaymentDate(value) {
  const match = typeof value === 'string'
    ? value.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/)
    : null
  if (!match) throw verificationError('Receipt payment date is missing or invalid.')

  const [, dayText, monthText, yearText, hourText, minuteText, secondText] = match
  const day = Number(dayText)
  const month = Number(monthText)
  const year = Number(yearText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const localTime = Date.UTC(year, month - 1, day, hour, minute, second)
  const parsed = new Date(localTime)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    throw verificationError('Receipt payment date is missing or invalid.')
  }

  // Telebirr timestamps are Ethiopia local time (UTC+03:00).
  return localTime - (3 * 60 * 60 * 1000)
}

function parseTelebirrSMS(smsText) {
  if (!smsText) return null

  const idMatch = smsText.match(/Your transaction number is\s+([A-Z0-9]+)/i)
  const transactionId = idMatch ? idMatch[1] : null

  const amountMatch = smsText.match(/(?:paid|transferred)\s+ETB\s+([0-9.]+)/i)
  const amount = amountMatch ? parseFloat(amountMatch[1]) : null

  const payerMatch = smsText.match(/Dear\s+([A-Za-z\s]+)/i)
  const payerName = payerMatch ? payerMatch[1].trim() : null

  const receiverMatch = smsText.match(/to\s+([A-Za-z\s]+)\s+\(([0-9*]+)\)/i)
  const receiverName = receiverMatch ? receiverMatch[1].trim() : null
  const receiverNumber = receiverMatch ? receiverMatch[2] : null

  if (!transactionId || !amount || !receiverName) {
    return null
  }

  return {
    transactionId,
    amount,
    payerName,
    receiverName,
    receiverNumber,
    rawText: smsText,
  }
}

async function verifyTelebirrReference({ reference, expectedAmount, userId } = {}) {
  if (typeof reference !== 'string' || !/^[A-Z0-9]{6,20}$/.test(reference)) {
    throw verificationError('Invalid Telebirr transaction reference.')
  }

  const amountToMatch = Number(expectedAmount)
  if (!Number.isFinite(amountToMatch) || amountToMatch <= 0) {
    throw verificationError('A valid deposit amount is required.')
  }

  const normalizedUserId = Number(userId)
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    throw verificationError('A valid user is required for receipt verification.')
  }

  const apiKey = process.env.LINKS_ET_API_KEY
  if (!apiKey) {
    throw new Error('Receipt verification service is not configured.')
  }

  let response
  try {
    response = await fetch('https://links.et/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Idempotency-Key': `verify-${reference}-${normalizedUserId}`,
      },
      body: JSON.stringify({ reference }),
    })
  } catch {
    throw verificationError('Unable to reach the receipt verification service.')
  }

  if (!response.ok) {
    throw verificationError(`Receipt verification service returned HTTP ${response.status}.`)
  }

  let data
  try {
    data = await response.json()
  } catch {
    throw verificationError('Receipt verification service returned an invalid response.')
  }

  if (data?.ok !== true || !data.receipt || typeof data.receipt !== 'object') {
    throw verificationError('Receipt was not found or could not be verified.')
  }

  const receipt = data.receipt
  if (receipt.source !== 'telebirr-html') {
    throw verificationError('This is not a valid Telebirr receipt.')
  }
  if (receipt.transactionStatus !== 'Completed') {
    throw verificationError('Telebirr transaction is not completed.')
  }

  const receiverNumber = process.env.TELEBIRR_RECEIVER_NUMBER
  if (!receipt.creditedPartyAccountNo || !isAccountMatch(receipt.creditedPartyAccountNo, receiverNumber)) {
    throw verificationError('Receipt was not paid to the configured Telebirr account. Please send to the correct number.')
  }

  const parsedAmount = parseTelebirrAmount(receipt.settledAmount)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw verificationError('Could not extract a valid amount from the receipt.')
  }
  const amountDifference = Math.abs(parsedAmount - amountToMatch)
  const floatingPointTolerance = Number.EPSILON * Math.max(parsedAmount, amountToMatch) * 2
  if (amountDifference > 0.01 + floatingPointTolerance) {
    throw verificationError('Receipt amount does not match the deposit amount.')
  }

  const paymentTime = parseTelebirrPaymentDate(receipt.paymentDate)
  const maxAgeMinutes = process.env.TELEBIRR_MAX_AGE_MINUTES === undefined
    ? 15
    : Number(process.env.TELEBIRR_MAX_AGE_MINUTES)
  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0) {
    throw new Error('TELEBIRR_MAX_AGE_MINUTES configuration is invalid.')
  }

  const ageMilliseconds = Date.now() - paymentTime
  if (ageMilliseconds > maxAgeMinutes * 60 * 1000) {
    throw verificationError('Telebirr receipt has expired.')
  }
  if (ageMilliseconds < -2 * 60 * 1000) {
    throw verificationError('Telebirr receipt payment date is in the future.')
  }

  return { reference, amount: parsedAmount, rawResponse: data }
}

async function creditVerifiedDeposit({ userId, reference, amount }) {
  const verification = await verifyTelebirrReference({ reference, expectedAmount: amount, userId })
  let newBalance

  await db.transaction(async (trx) => {
    const user = await trx('users').where({ id: userId }).forUpdate().first()
    if (!user) {
      const error = new Error('User not found.')
      error.statusCode = 404
      throw error
    }

    await trx('verified_transactions').insert({
      reference: verification.reference,
      user_id: userId,
      amount: verification.amount,
      provider: 'telebirr',
      raw_response: verification.rawResponse,
    })
    await trx('users').where({ id: userId }).increment('wallet_balance', verification.amount)
    await trx('financial_ledger').insert({
      user_id: userId,
      type: 'deposit',
      amount: verification.amount,
      reference: verification.reference,
    })
    await trx('payments').insert({
      user_id: userId,
      type: 'deposit',
      provider: 'telebirr',
      amount: verification.amount,
      status: 'approved',
      transaction_reference: verification.reference,
      provider_response: verification.rawResponse,
    })

    const updatedUser = await trx('users').where({ id: userId }).first()
    newBalance = updatedUser.wallet_balance
  })

  return { ...verification, newBalance }
}

async function verifyTelebirrReceipt(reference, expectedAmount, userId) {
  try {
    const verified = await verifyTelebirrReference({ reference, expectedAmount, userId })
    const receipt = verified.rawResponse.receipt
    return {
      success: true,
      amount: verified.amount,
      payerName: receipt.payerName || 'Unknown',
      receiverName: receipt.creditedPartyName || '',
      transactionId: receipt.receiptNo || reference,
      status: 'Completed',
      rawResponse: verified.rawResponse,
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function processDeposit(userId, amount, reference) {
  try {
    const result = await creditVerifiedDeposit({ userId, amount, reference })
    return { success: true, newBalance: result.newBalance }
  } catch (error) {
    return { error: error.message, code: error.code }
  }
}

module.exports = {
  verifyTelebirrReference,
  verifyTelebirrReceipt,
  creditVerifiedDeposit,
  processDeposit,
  parseTelebirrSMS,
  isAccountMatch,
}
