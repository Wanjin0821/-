(() => {
  'use strict';
  const STORAGE_KEY = 'zhilian-recite-state-v1';
  const bank = window.RECITATION_BANK || { questions: [], topics: [], note: '', source: '' };
  const byId = new Map(bank.questions.map(question => [question.id, question]));
  const labels = { new: '未背', review: '需巩固', mastered: '已掌握' };
  const symbols = { new: '○', review: '◐', mastered: '✓' };
  const layers = { tips: '先把关键词串起来，建立记忆线索。', summary: '保留核心关键词，再给每点补上一句解释。', standard: '按文档原文对照，补齐作用、场景、区别和措施。' };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const state = load();
  let revealed = false;
  let storageFailed = false;
  let notice = '';

  function load() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { saved = {}; }
    saved = saved && typeof saved === 'object' ? saved : {};
    const records = {}, drafts = {};
    for (const question of bank.questions) {
      const record = saved.records?.[question.id];
      if (record && Object.hasOwn(labels, record.status)) records[question.id] = { status: record.status, at: Number(record.at) || 0 };
      if (typeof saved.drafts?.[question.id] === 'string') drafts[question.id] = saved.drafts[question.id];
    }
    return {
      currentId: byId.has(saved.currentId) ? saved.currentId : bank.questions[0]?.id,
      topic: bank.topics.some(topic => topic.id === saved.topic) ? saved.topic : 'all',
      filter: Object.hasOwn(labels, saved.filter) ? saved.filter : 'all',
      search: typeof saved.search === 'string' ? saved.search : '',
      view: saved.view === 'quick' ? 'quick' : 'cards',
      layer: Object.hasOwn(layers, saved.layer) ? saved.layer : 'tips',
      selfTest: saved.selfTest === true, records, drafts,
    };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageFailed = false; }
    catch { storageFailed = true; }
    $('#reciteNotice').textContent = storageFailed ? '浏览器存储不可用，本次背诵仍可继续，但进度无法在关闭后保留。' : notice;
  }

  function statusOf(question) { return state.records[question.id]?.status || 'new'; }

  function filtered() {
    const query = state.search.trim().toLowerCase();
    return bank.questions.filter(question => (state.topic === 'all' || question.topic === state.topic)
      && (state.filter === 'all' || statusOf(question) === state.filter)
      && (!query || [question.number, question.title, question.question, question.tips, question.summary, question.standard].join(' ').toLowerCase().includes(query)));
  }

  function render() {
    const list = filtered();
    if (!list.some(question => question.id === state.currentId)) { state.currentId = list[0]?.id || null; revealed = false; }
    const current = byId.get(state.currentId);
    const mastered = bank.questions.filter(question => statusOf(question) === 'mastered').length;
    const percent = bank.questions.length ? Math.round(mastered / bank.questions.length * 100) : 0;
    $('#reciteMasteredCount').textContent = `${mastered} / ${bank.questions.length}`;
    $('#recitePercent').textContent = `${percent}%`;
    $('#reciteMasteryBar').style.width = `${percent}%`;
    $('#reciteSearch').value = state.search;
    $('#reciteTopic').value = state.topic;
    $('#reciteFilter').value = state.filter;
    $('#reciteCards').classList.toggle('hidden', !current || state.view !== 'cards');
    $('#reciteQuick').classList.toggle('hidden', !current || state.view !== 'quick');
    $('#reciteEmpty').classList.toggle('hidden', Boolean(current));
    $$('[data-recite-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reciteView === state.view)));
    $('#reciteDirectoryCount').textContent = `${list.length} 题`;
    $('#reciteDirectoryList').innerHTML = list.map(question => {
      const status = statusOf(question);
      return `<button type="button" data-recite-id="${question.id}" aria-current="${question.id === state.currentId ? 'true' : 'false'}" aria-label="第 ${question.number} 题 ${escapeHtml(question.title)}，${labels[status]}"><span class="recite-item-number">${String(question.number).padStart(2, '0')}</span><span>${escapeHtml(question.title)}</span><span class="recite-status-icon ${status}" aria-hidden="true">${symbols[status]}</span></button>`;
    }).join('');
    if (state.view === 'quick') {
      $('#reciteQuickList').innerHTML = list.map(question => `<button type="button" data-recite-id="${question.id}" class="recite-quick-row"><span class="recite-item-number">${String(question.number).padStart(2, '0')}</span><span><span class="recite-quick-title">${escapeHtml(question.title)}</span><strong>${inlineMarkdown(question.cue)}</strong></span><span class="recite-quick-status ${statusOf(question)}">${labels[statusOf(question)]} <span aria-hidden="true">↗</span></span></button>`).join('');
    }
    if (current) renderCard(current, list);
    save();
  }

  function renderCard(question, list) {
    const index = list.findIndex(item => item.id === question.id);
    const topic = bank.topics.find(item => item.id === question.topic);
    $('#reciteQuestionMeta').textContent = `${topic?.name || '论述题'} · 原题号 ${question.number}`;
    $('#recitePosition').textContent = `${index + 1} / ${list.length}`;
    $('#reciteTitle').textContent = question.title;
    $('#reciteQuestion').textContent = question.question;
    $$('[data-recite-layer]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reciteLayer === state.layer)));
    $('#reciteLayerHint').textContent = layers[state.layer];
    const hidden = state.selfTest && !revealed;
    $('#reciteAnswer').classList.toggle('hidden', hidden);
    // Hidden self-test answers are absent from the rendered DOM, not merely blurred.
    $('#reciteAnswer').innerHTML = hidden ? '' : renderMarkdown(question[state.layer]);
    $('#reciteRecall').classList.toggle('hidden', !hidden);
    $('#reciteSelfTest').textContent = state.selfTest ? '退出自测' : '遮住自测';
    $('#reciteSelfTest').setAttribute('aria-pressed', String(state.selfTest));
    $('#reciteDraft').value = state.drafts[question.id] || '';
    const compare = state.selfTest && revealed && Boolean(state.drafts[question.id]);
    $('#reciteDraftCompare').classList.toggle('hidden', !compare);
    $('#reciteDraftText').textContent = compare ? state.drafts[question.id] : '';
    $('#reciteDraftCompare').open = compare;
    const status = statusOf(question);
    $('#reciteStatusLabel').textContent = `当前：${labels[status]} · 按自己的掌握程度标记`;
    $$('[data-recite-rate]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reciteRate === status)));
    $('#recitePrev').disabled = index <= 0;
    $('#reciteNext').disabled = index >= list.length - 1;
    $('#reciteNext').textContent = index >= list.length - 1 ? '已到最后一题' : '下一题 →';
  }

  function goTo(id, scroll = true) {
    if (!filtered().some(question => question.id === id)) return;
    state.currentId = id;
    state.view = 'cards';
    revealed = false;
    notice = '';
    render();
    if (scroll) $('#reciteCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function move(delta) {
    const list = filtered();
    const index = list.findIndex(question => question.id === state.currentId);
    const next = list[index + delta];
    if (next) goTo(next.id);
  }

  function rate(status) {
    const question = byId.get(state.currentId);
    if (!question || !Object.hasOwn(labels, status)) return;
    const before = filtered();
    const index = before.findIndex(item => item.id === question.id);
    state.records[question.id] = { status, at: Date.now() };
    notice = `第 ${question.number} 题已标记为「${labels[status]}」。`;
    const after = filtered();
    if (!after.some(item => item.id === question.id)) {
      state.currentId = after[Math.min(index, after.length - 1)]?.id || null;
      revealed = false;
      if (state.currentId) notice += '已切换到当前筛选中的下一题。';
    }
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function inlineMarkdown(text) {
    return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map(part => part.startsWith('`') ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
      : part.startsWith('**') ? `<strong>${escapeHtml(part.slice(2, -2))}</strong>` : escapeHtml(part)).join('');
  }

  function renderList(lines) {
    let html = '';
    const stack = [];
    const close = () => { const item = stack.pop(); html += `</li></${item.tag}>`; };
    for (const line of lines) {
      const match = line.match(/^(\s*)(\d+\.|-)\s+(.+)$/);
      if (!match) { html += `<br>${inlineMarkdown(line)}`; continue; }
      const indent = match[1].length, tag = match[2] === '-' ? 'ul' : 'ol';
      while (stack.length && (stack.at(-1).indent > indent || (stack.at(-1).indent === indent && stack.at(-1).tag !== tag))) close();
      if (!stack.length || stack.at(-1).indent < indent) { html += `<${tag}>`; stack.push({ tag, indent }); }
      else html += '</li>';
      html += `<li${tag === 'ol' ? ` value="${parseInt(match[2], 10)}"` : ''}>${inlineMarkdown(match[3])}`;
    }
    while (stack.length) close();
    return html;
  }

  function renderMarkdown(text) {
    return text.split(/\n\s*\n/).map(block => /^\s*(\d+\.|-)\s/.test(block)
      ? renderList(block.split('\n')) : `<p>${block.split('\n').map(inlineMarkdown).join('<br>')}</p>`).join('');
  }

  $('#reciteTopic').innerHTML += bank.topics.map(topic => `<option value="${topic.id}">${escapeHtml(topic.name)}（${topic.to - topic.from + 1}）</option>`).join('');
  $('#reciteSourceNote').textContent = `${bank.source}。${bank.note}`;
  $('#reciteDirectory').open = window.matchMedia('(min-width: 1101px)').matches;
  $('#recitationModule').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.reciteId) goTo(button.dataset.reciteId);
    if (button.dataset.reciteView) { state.view = button.dataset.reciteView; notice = ''; render(); }
    if (button.dataset.reciteLayer) { state.layer = button.dataset.reciteLayer; render(); }
    if (button.dataset.reciteRate) rate(button.dataset.reciteRate);
  });
  $('#recitePrev').addEventListener('click', () => move(-1));
  $('#reciteNext').addEventListener('click', () => move(1));
  $('#reciteSelfTest').addEventListener('click', () => { state.selfTest = !state.selfTest; revealed = false; render(); });
  $('#reciteReveal').addEventListener('click', () => { revealed = true; render(); });
  $('#reciteDraft').addEventListener('input', () => { if (state.currentId) { state.drafts[state.currentId] = $('#reciteDraft').value; save(); } });
  for (const [id, field, event] of [['reciteSearch', 'search', 'input'], ['reciteTopic', 'topic', 'change'], ['reciteFilter', 'filter', 'change']]) {
    $(`#${id}`).addEventListener(event, () => { state[field] = $(`#${id}`).value; revealed = false; notice = ''; render(); });
  }
  $('#reciteClearFilters').addEventListener('click', () => { state.topic = state.filter = 'all'; state.search = ''; notice = ''; revealed = false; render(); });
  document.addEventListener('keydown', event => {
    if (document.body.dataset.mode !== 'recite' || state.view !== 'cards' || event.altKey || event.ctrlKey || event.metaKey
      || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SUMMARY'].includes(document.activeElement.tagName)) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
  });
  window.Recitation = { open() { revealed = false; render(); } };
})();
