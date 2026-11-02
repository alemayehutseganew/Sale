const express = require('express')
const router = express.Router()
const {
  initiateTelebirrPayment,
  initiateCBEBirrPayment,
  handleTelebirrWebhook,
  handleCBEWebhook,
} = require('../services/paymentService')

router.post('/initiate', async (req, res) => {
  try {
    const { amount, userId, provider = 'telebirr' } = req.body || {}
    if (!amount || !userId) {
      return res.status(400).json({ error: 'amount and userId are required' })
    }
    if (provider === 'cbe') {
      const result = await initiateCBEBirrPayment(Number(amount), Number(userId))
      return res.json(result)
    }
    const result = await initiateTelebirrPayment(Number(amount), Number(userId))
    return res.json(result)
  } catch (err) {
    console.error('Payment initiate error:', err)
    return res.status(500).json({ error: 'server error' })
  }
})

router.post('/cbe/initiate', async (req, res) => {
  try {
    const { amount, userId } = req.body || {}
    if (!amount || !userId) {
      return res.status(400).json({ error: 'amount and userId are required' })
    }
    const result = await initiateCBEBirrPayment(Number(amount), Number(userId))
    return res.json(result)
  } catch (err) {
    console.error('CBE initiate error:', err)
    return res.status(500).json({ error: 'server error' })
  }
})

router.post('/telebirr/webhook', async (req, res) => {
  try {
    const result = await handleTelebirrWebhook(req.body)
    return res.json(result)
  } catch (err) {
    console.error('Telebirr webhook error:', err)
    return res.status(500).json({ error: 'server error' })
  }
})

router.post('/cbe/webhook', async (req, res) => {
  try {
    const result = await handleCBEWebhook(req.body)
    return res.json(result)
  } catch (err) {
    console.error('CBE webhook error:', err)
    return res.status(500).json({ error: 'server error' })
  }
})

module.exports = router
