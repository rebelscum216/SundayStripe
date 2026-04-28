const http = require('http')
const https = require('https')
const url = require('url')
const fs = require('fs')
const os = require('os')
const path = require('path')

const API_KEY = process.env.SHOPIFY_API_KEY
const API_SECRET = process.env.SHOPIFY_API_SECRET
const SHOP = process.env.SHOPIFY_SHOP
if (!API_KEY || !API_SECRET || !SHOP) {
  console.error('Missing required env vars: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SHOP')
  process.exit(1)
}
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || `http://localhost:${PORT}`
const TOKEN_PATH = path.join(os.homedir(), '.config', 'shopify', 'token.json')
const SCOPES = 'read_products,write_products,read_content,write_content,read_orders'

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true)

  if (parsed.pathname === '/auth/callback' && parsed.query.code) {
    const code = parsed.query.code
    const shop = parsed.query.shop || SHOP
    const postData = JSON.stringify({ client_id: API_KEY, client_secret: API_SECRET, code })

    const options = {
      hostname: shop,
      path: '/admin/oauth/access_token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }

    const tokenReq = https.request(options, tokenRes => {
      let body = ''
      tokenRes.on('data', chunk => body += chunk)
      tokenRes.on('end', () => {
        const data = JSON.parse(body)
        if (data.access_token) {
          fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true })
          fs.writeFileSync(TOKEN_PATH, JSON.stringify({ shop, access_token: data.access_token }, null, 2))
          console.log('\n✅ Access token saved to', TOKEN_PATH)
          console.log('Token:', data.access_token)
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<h1>✅ Done! Token saved. You can close this tab.</h1>')
          setTimeout(() => process.exit(0), 500)
        } else {
          console.error('Error getting token:', body)
          res.writeHead(500)
          res.end('Error: ' + body)
        }
      })
    })
    tokenReq.on('error', err => { console.error(err); res.writeHead(500); res.end(err.message) })
    tokenReq.write(postData)
    tokenReq.end()

  } else {
    const redirectUri = encodeURIComponent(`${HOST}/auth/callback`)
    const authUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${API_KEY}&scope=${SCOPES}&redirect_uri=${redirectUri}&state=shopify_oauth`
    res.writeHead(302, { Location: authUrl })
    res.end()
  }
})

server.listen(PORT, () => {
  console.log(`\nOAuth server running on port ${PORT}`)
  console.log(`Open this in your browser to authorize:\nhttp://localhost:${PORT}\n`)
})
