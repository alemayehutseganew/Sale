const express = require('express')
const router = express.Router()

const notImplemented = (_req, res) => res.status(501).json({ error: 'Not implemented' })

router.post('/initiate', notImplemented)
router.post('/cbe/initiate', notImplemented)
router.post('/telebirr/webhook', notImplemented)
router.post('/cbe/webhook', notImplemented)

module.exports = router
