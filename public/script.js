const form = document.getElementById('mail-form');
const button = document.getElementById('send');
const label = document.getElementById('send-label');
const notice = document.getElementById('notice');
const area = document.getElementById('message');
const linkStatus = document.getElementById('link-status');
const fileInput = document.getElementById('files');
const fileList = document.getElementById('file-list');
document.getElementById('year').textContent = new Date().getFullYear();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HAS_HTML_RE = /<\/?[a-z][^>]*>/i;
const MAX_MESSAGE = 5000;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx']);

/** @type {File[]} */
let selectedFiles = [];

function linkFromEvent(e) {
  const node = e.target && e.target.nodeType === 3 ? e.target.parentElement : e.target;
  if (!node || !node.closest) return null;
  const a = node.closest('a');
  return a && area.contains(a) ? a : null;
}

function showLinkStatus(url) {
  if (!url) {
    linkStatus.hidden = true;
    linkStatus.textContent = '';
    return;
  }
  linkStatus.textContent = url;
  linkStatus.hidden = false;
}

area.addEventListener('mouseover', (e) => {
  const a = linkFromEvent(e);
  if (a && a.href) showLinkStatus(a.href);
});
area.addEventListener('mouseout', (e) => {
  const a = linkFromEvent(e);
  if (!a) return;
  const next = e.relatedTarget;
  if (next && a.contains(next)) return;
  showLinkStatus('');
});
area.addEventListener('click', (e) => {
  const a = linkFromEvent(e);
  if (!a) return;
  e.preventDefault();
});

function messageText() {
  return (area.innerText || '').replace(/\u00a0/g, ' ').trim();
}

function messageHtml() {
  return area.innerHTML.trim();
}

function isMessageEmpty() {
  return !messageText();
}

function applyEnteredHtml() {
  const text = area.innerText.replace(/\u00a0/g, ' ');
  if (!HAS_HTML_RE.test(text)) return false;
  if (!/&lt;\/?[a-z]/i.test(area.innerHTML)) return false;
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

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileExt(name) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function isAllowedClientFile(file) {
  return ALLOWED_EXT.has(fileExt(file.name));
}

function totalSelectedBytes() {
  return selectedFiles.reduce((sum, f) => sum + f.size, 0);
}

function sameFile(a, b) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

function renderFiles() {
  fileList.innerHTML = '';
  if (!selectedFiles.length) {
    fileList.hidden = true;
    return;
  }
  fileList.hidden = false;
  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');
    li.className = 'file-item';

    const ext = fileExt(file.name).replace('.', '').toUpperCase() || 'FILE';
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.className = 'file-thumb';
      img.alt = '';
      img.src = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(img.src);
      li.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'file-icon';
      icon.textContent = ext.slice(0, 4);
      li.appendChild(icon);
    }

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.innerHTML = `<span class="file-name"></span><span class="file-size"></span>`;
    meta.querySelector('.file-name').textContent = file.name;
    meta.querySelector('.file-size').textContent = formatBytes(file.size);
    li.appendChild(meta);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'file-remove';
    remove.setAttribute('aria-label', 'Remove ' + file.name);
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      selectedFiles = selectedFiles.filter((_, i) => i !== index);
      renderFiles();
    });
    li.appendChild(remove);
    fileList.appendChild(li);
  });
}

fileInput.addEventListener('change', () => {
  const incoming = Array.from(fileInput.files || []);
  fileInput.value = '';
  notice.hidden = true;

  for (const file of incoming) {
    if (!isAllowedClientFile(file)) {
      return show('error', `"${file.name}" is not allowed. Use photos or PDF/DOC/DOCX.`);
    }
    if (file.size > MAX_FILE_BYTES) {
      return show('error', `"${file.name}" is too large. Each file must be 3 MB or smaller.`);
    }
    if (selectedFiles.some((f) => sameFile(f, file))) continue;
    if (selectedFiles.length >= MAX_FILES) {
      return show('error', 'You can attach up to 5 files.');
    }
    if (totalSelectedBytes() + file.size > MAX_TOTAL_BYTES) {
      return show('error', 'Total attachment size must be 8 MB or less.');
    }
    selectedFiles.push(file);
  }
  renderFiles();
});

let applyTimer = 0;
function scheduleApply() {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(applyEnteredHtml, 250);
}

area.addEventListener('input', () => {
  syncEmptyClass();
  grow();
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

  const recipientEmail = form.recipientEmail.value;
  const recipientName = form.recipientName.value;
  const senderEmail = form.senderEmail.value;
  const website = form.website.value;
  const message = messageHtml();

  if (!recipientEmail.trim() || !recipientName.trim() || !senderEmail.trim()) {
    return show('error', 'Please fill in all fields.');
  }
  if (isMessageEmpty()) return show('error', 'Please fill in all fields.');
  if (message.length > MAX_MESSAGE) return show('error', 'Message is too long (max 5000 characters).');
  if (!EMAIL_RE.test(recipientEmail.trim())) return show('error', 'Enter a valid recipient email address.');
  if (!EMAIL_RE.test(senderEmail.trim())) return show('error', 'Enter a valid sender email address.');

  const body = new FormData();
  body.append('recipientEmail', recipientEmail);
  body.append('recipientName', recipientName);
  body.append('senderEmail', senderEmail);
  body.append('message', message);
  body.append('website', website);
  selectedFiles.forEach((file) => body.append('files', file, file.name));

  button.disabled = true;
  button.classList.add('loading');
  label.textContent = 'Sending…';

  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      body,
    });
    const result = await res.json().catch(() => ({}));
    if (res.ok && result.success) {
      show('success', selectedFiles.length ? 'Email sent with attachments.' : 'Email sent.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const sender = form.senderEmail.value;
      form.reset();
      area.innerHTML = '';
      selectedFiles = [];
      renderFiles();
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
