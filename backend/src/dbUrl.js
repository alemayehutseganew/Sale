const weakSslModes = new Set(['prefer', 'require', 'verify-ca'])

function normalizeDatabaseUrl(databaseUrl) {
  if (!databaseUrl) return databaseUrl

  const parsedUrl = new URL(databaseUrl)
  const sslMode = parsedUrl.searchParams.get('sslmode')
  if (sslMode && weakSslModes.has(sslMode.toLowerCase())) {
    parsedUrl.searchParams.set('sslmode', 'verify-full')
    return parsedUrl.toString()
  }

  return databaseUrl
}

module.exports = normalizeDatabaseUrl
