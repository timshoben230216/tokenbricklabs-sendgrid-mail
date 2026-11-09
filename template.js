// TokenBrickLabs email template. `name` is escaped; `message` HTML is inserted exactly as entered.
const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HAS_HTML_RE = /<\/?[a-z][^>]*>/i;

const stripHtml = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

function formatMessageBody(message) {
  // Keep intentional HTML (e.g. <b>), but always normalize line breaks for email clients.
  let html = HAS_HTML_RE.test(message) ? message : escapeHtml(message);

  // Contenteditable Enter often yields <div>…</div> or bare \n; emails need <br>.
  html = html
    .replace(/\r\n|\r|\n/g, '<br>')
    .replace(/<div><br\s*\/?><\/div>/gi, '<br>')
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br><br>')
    .replace(/<\/div>\s*<div[^>]*>/gi, '<br>')
    .replace(/^<div[^>]*>/i, '')
    .replace(/<\/div>$/i, '')
    .replace(/<div[^>]*>/gi, '<br>')
    .replace(/<\/div>/gi, '')
    .replace(/^<p[^>]*>/i, '')
    .replace(/<\/p>$/i, '')
    .replace(/<p[^>]*>/gi, '<br><br>')
    .replace(/<\/p>/gi, '')
    .replace(/^(<br\s*\/?>)+/i, '');

  return html;
}

function buildEmail(name, message, assets = {}) {
  const n = escapeHtml(name);
  const m = formatMessageBody(message);
  const year = new Date().getFullYear();
  const logoUrl = assets.logoUrl || '';
  const headerBgUrl = assets.headerBgUrl || '';

  // Gmail ignores CSS background-image; HTML background= + <img> are reliable.
  const safeBg = headerBgUrl ? escapeHtml(headerBgUrl) : '';
  const safeLogo = logoUrl ? escapeHtml(logoUrl) : '';
  const headerBgAttr = safeBg ? ` background="${safeBg}"` : '';
  const headerBgCss = safeBg
    ? `background-image:url('${headerBgUrl.replace(/'/g, '%27')}');background-size:cover;background-position:center right;background-repeat:no-repeat;`
    : '';
  const logoImg = safeLogo
    ? `<img src="${safeLogo}" alt="TokenBrickLabs" width="48" height="48" style="display:block;border:0;outline:none;width:48px;height:48px;">`
    : '';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f7fb;padding:40px 0;">
<tbody><tr><td align="center">
<table width="650" cellpadding="0" cellspacing="0" role="presentation" style="max-width:650px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 5px 15px rgba(0,0,0,.08);">
<tbody>
<tr>
<td${headerBgAttr} bgcolor="#081A33" style="background-color:#081A33;${headerBgCss}padding:0;text-align:center;">
<!--[if gte mso 9]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:650px;">
<v:fill type="frame" src="${safeBg}" color="#081A33"/>
<v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0">
<![endif]-->
<div style="background-color:rgba(8,26,51,0.45);padding:35px 24px;text-align:center;">
<table cellpadding="0" cellspacing="0" border="0" role="presentation" align="center" style="margin:8px auto 5px;">
<tbody><tr>
<td style="vertical-align:middle;padding-right:12px;">${logoImg}</td>
<td style="vertical-align:middle;">
<h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;text-shadow:0 1px 3px rgba(0,0,0,.45);">TokenBrickLabs</h1>
</td>
</tr></tbody></table>
<p style="margin:0;color:#7bdc8d;font-size:15px;text-shadow:0 1px 3px rgba(0,0,0,.45);">Building the Future of Blockchain &amp; Web3</p>
</div>
<!--[if gte mso 9]>
</v:textbox>
</v:rect>
<![endif]-->
</td>
</tr>
<tr><td style="padding:40px 45px 20px;">
<p style="font-size:16px;color:#333;">Hello <b>${n}</b>,</p>
<div style="font-size:16px;line-height:1.8;color:#555;">${m}</div>
</td></tr>
<tr><td style="padding:30px 45px;color:#555;font-size:15px;line-height:1.8;">
Best regards,<br><br>
<b>TokenBrickLabs Team</b><br><br>
📧 support@tokenbricklabs.com<br>
🌐 https://tokenbricklabs.com
</td></tr>
<tr><td style="background:#081A33;padding:25px;text-align:center;color:#aab7cf;font-size:13px;line-height:1.7;">
© ${year} TokenBrick Labs. All rights reserved.<br>
Building Secure • Scalable • Future-Ready Blockchain Solutions
</td></tr>
</tbody></table>
</td></tr></tbody></table>
</body></html>`;

  const text =
    `Hello ${name},\n\n${stripHtml(message)}\n\nBest regards,\nTokenBrickLabs Team\n` +
    `support@tokenbricklabs.com\nhttps://tokenbricklabs.com`;

  return { subject: 'Message from TokenBrickLabs', html, text };
}

module.exports = { buildEmail };
