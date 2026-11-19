function getWebhookBaseUrl(env = process.env) {
  const baseUrl = env.WEBHOOK_URL || env.BACKEND_URL
  if (!baseUrl) {
    throw new Error('Set WEBHOOK_URL or BACKEND_URL to the public backend URL.')
  }
  return baseUrl.replace(/\/+$/, '')
}

function getBotWebhookUrl(baseUrl, secretPath) {
  return `${baseUrl.replace(/\/+$/, '')}/telegraf/${secretPath}`
}

module.exports = { getWebhookBaseUrl, getBotWebhookUrl }
