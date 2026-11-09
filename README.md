# sendgrid-mailer

A small web app for sending email through SendGrid. Node.js, Express, vanilla JS.

## Setup

1. Install Node.js 18 or newer.
2. Install dependencies: `npm install`
3. Create your SendGrid API key:
   - Sign in at https://app.sendgrid.com
   - Settings > API Keys > Create API Key
   - Choose "Restricted Access" and enable **Mail Send**
   - Copy the key (it is shown once)
4. Verify your sender in SendGrid:
   - Settings > Sender Authentication
   - Verify a single sender address, or authenticate your whole domain (recommended for production)
5. Edit `.env`:
   ```
   SENDGRID_API_KEY=SG.xxxxxxxx
   VERIFIED_SENDERS=support@tokenbricklabs.com
   PORT=3000
   ```
   `VERIFIED_SENDERS` is a comma-separated allowlist. The server rejects any sender not on it.
6. Start: `npm start`, then open http://localhost:3000

## Notes

- The API key lives only in `.env` on the server. `.env` is git-ignored.
- Rate limits: 5 sends/minute and 30/hour per IP, plus a hidden honeypot field.
- Frontend and API share one origin, so CORS is not needed. If you host the frontend elsewhere, add the `cors` package restricted to that origin.
- Behind a proxy (Render, Heroku, nginx), add `app.set('trust proxy', 1)` in `server.js` so rate limiting sees real client IPs.
- SendGrid errors are logged on the server only; users see a generic message.
