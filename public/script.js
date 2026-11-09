const form = document.getElementById('mail-form');
const button = document.getElementById('send');
const label = document.getElementById('send-label');
const notice = document.getElementById('notice');
const area = document.getElementById('message');
document.getElementById('year').textContent = new Date().getFullYear();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HAS_HTML_RE = /<\/?[a-z][^>]*>/i;
const MAX_MESSAGE = 5000;

function messageText() {
  return (area.innerText || '').replace(/\u00a0/g, ' ').trim();
}

function messageHtml() {
  return area.innerHTML.trim();
}

function isMessageEmpty() {
  return !messageText();
}

// Turn typed/pasted tag text (e.g. <b>hi</b>) into real HTML so formatting is applied.
function applyEnteredHtml() {
  const text = area.innerText.replace(/\u00a0/g, ' ');
  if (!HAS_HTML_RE.test(text)) return false;
  // Only reparse when tags are still literal text (escaped in the DOM).
  if (!/&lt;\/?[a-z]/i.test(area.innerHTML)) return false;
  // Preserve line breaks when converting typed tags into HTML.
  area.innerHTML = text.replace(/\r\n|\r|\n/g, '<br>');
  syncEmptyClass();
  grow();
  return true;
}

function syncEmptyClass() {
  area.classList.toggle('is-empty', isMessageEmpty());
}

function grow() {
  area.style.minHeight = '0';
  area.style.minHeight = Math.max(120, area.scrollHeight) + 'px';
}

function show(type, text) {
  notice.className = 'notice ' + type;
  notice.textContent = text;
  notice.hidden = false;
}

let applyTimer = 0;
function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyEnteredHtml, 250);
}

area.addEventListener('input', () => {
  syncEmptyClass();
  grow();
  // Apply once a full tag like <b>…</b> is present as literal text.
  if (/&lt;\/?[a-z]/i.test(area.innerHTML)) scheduleApply();
});
area.addEventListener('focusout', applyEnteredHtml);
area.addEventListener('paste', () => {
  requestAnimationFrame(() => {
    applyEnteredHtml();
    syncEmptyClass();
    grow();
  });
});

syncEmptyClass();
grow();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  notice.hidden = true;
  applyEnteredHtml();

  const data = Object.fromEntries(new FormData(form));
  data.message = messageHtml();

  for (const key of ['recipientEmail', 'recipientName', 'senderEmail']) {
    if (!data[key] || !data[key].trim()) return show('error', 'Please fill in all fields.');
  }
  if (isMessageEmpty()) return show('error', 'Please fill in all fields.');
  if (messageHtml().length > MAX_MESSAGE) return show('error', 'Message is too long (max 5000 characters).');
  if (!EMAIL_RE.test(data.recipientEmail.trim())) return show('error', 'Enter a valid recipient email address.');
  if (!EMAIL_RE.test(data.senderEmail.trim())) return show('error', 'Enter a valid sender email address.');

  button.disabled = true;
  button.classList.add('loading');
  label.textContent = 'Sending…';

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok && result.success) {
      show('success', 'Email sent.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const sender = form.senderEmail.value;
      form.reset();
      area.innerHTML = '';
      syncEmptyClass();
      grow();
      form.senderEmail.value = sender;
    } else {
      show('error', result.error || 'Something went wrong. Please try again.');
    }
  } catch {
    show('error', 'Could not reach the server. Check your connection and try again.');
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
    label.textContent = 'Send';
  }
});
