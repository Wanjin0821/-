const STORAGE_KEY = "zhilian-quiz-state-v2";
const ALL_TYPES = ["single", "multiple", "judge", "essay"];
const SHUFFLED_MODES = ["random", "speed", "exam"];
const MAX_SAVED_SEARCHES = 40;
const MODE_COPY = {
  sequence: ["顺序练习", "稳稳向前，每题都算数", "按题库顺序稳步推进，适合系统复习。"],
  learn: ["学习模式", "先看答案，再理解题目", "答案直接展示，适合第一次过题和快速回顾。"],
  recite: ["理论背诵", "每天记一点，考场多一分底气", "50 道论述题，分层背诵、遮挡自测。"],
  random: ["随机练习", "打乱顺序，保持新鲜", "题目随机出现，帮你摆脱顺序记忆。"],
  speed: ["速刷模式", "快一点，手感正热", "确认后自动前进，适合碎片时间集中刷题。"],
  exam: ["模拟考试", "专注作答，最后见分晓", "随机抽取 20 题，作答过程不显示对错。"],
  wrong: ["错题重练", "再见一次，这次拿下", "历史错题持续保留，答对或重置练习进度都不会删除；可单独清空错题。"],
  favorite: ["我的收藏", "重要的题，值得再看", "集中回顾你主动收藏的题目。"],
};

const state = loadState();
let questionBank = [];
let filteredQuestions = [];
let speedTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const els = {
  sideNav: $(".side-nav"),
  modeButtons: $$(".mode-button"),
  typeFilters: $$(".type-filters input"),
  mobileMenuButton: $("#mobileMenuButton"),
  modeEyebrow: $("#modeEyebrow"),
  modeTitle: $("#modeTitle"),
  modeHint: $("#modeHint"),
  settingsButton: $("#settingsButton"),
  settingsPanel: $("#settingsPanel"),
  searchInput: $("#searchInput"),
  jumpInput: $("#jumpInput"),
  jumpButton: $("#jumpButton"),
  resetProgressButton: $("#resetProgressButton"),
  questionShell: $("#questionShell"),
  wrongReviewBar: $("#wrongReviewBar"),
  wrongReviewTitle: $("#wrongReviewTitle"),
  wrongReviewHint: $("#wrongReviewHint"),
  restartWrongButton: $("#restartWrongButton"),
  clearWrongButton: $("#clearWrongButton"),
  typeBadge: $("#typeBadge"),
  positionText: $("#positionText"),
  questionTitle: $("#questionTitle"),
  favoriteButton: $("#favoriteButton"),
  optionList: $("#optionList"),
  essayArea: $("#essayArea"),
  essayDraft: $("#essayDraft"),
  markEssayWrong: $("#markEssayWrong"),
  feedbackBox: $("#feedbackBox"),
  answerPanel: $("#answerPanel"),
  answerText: $("#answerText"),
  prevButton: $("#prevButton"),
  submitButton: $("#submitButton"),
  nextButton: $("#nextButton"),
  streakCount: $("#streakCount"),
  doneCount: $("#doneCount"),
  accuracyText: $("#accuracyText"),
  wrongCount: $("#wrongCount"),
  favCount: $("#favCount"),
  goalText: $("#goalText"),
  goalProgress: $("#goalProgress"),
  todayDate: $("#todayDate"),
};

init();

function init() {
  questionBank = window.QUESTION_BANK || [];
  restoreModeProgress(true);
  wireEvents();
  syncControls();
  applyFilters();
  els.todayDate.textContent = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date());
  registerOfflineCache();
}

function loadState() {
  const fallback = {
    mode: "sequence",
    activeTypes: [...ALL_TYPES],
    search: "",
    currentIndex: 0,
    selected: {},
    submitted: {},
    wrong: {},
    favorites: {},
    essayDrafts: {},
    streak: 0,
    modeProgress: {},
    wrongReview: null,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const loaded = { ...fallback, ...saved };
    loaded.mode = Object.hasOwn(MODE_COPY, loaded.mode) ? loaded.mode : "sequence";
    loaded.activeTypes = validTypes(loaded.activeTypes);
    loaded.search = typeof loaded.search === "string" ? loaded.search : "";
    loaded.currentIndex = Number.isInteger(loaded.currentIndex) && loaded.currentIndex >= 0 ? loaded.currentIndex : 0;
    loaded.modeProgress = isRecord(loaded.modeProgress) ? loaded.modeProgress : {};
    const review = loaded.wrongReview;
    if (!isRecord(review) || !Array.isArray(review.ids) || !isRecord(review.selected)
      || !isRecord(review.submitted) || !isRecord(review.essayDrafts)) loaded.wrongReview = null;
    return loaded;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validTypes(types) {
  const valid = ALL_TYPES.filter((type) => Array.isArray(types) && types.includes(type));
  return valid.length ? valid : [...ALL_TYPES];
}

function scopeKey() {
  return JSON.stringify([validTypes(state.activeTypes), state.search.trim().toLowerCase()]);
}

function restoreModeProgress(migrateLegacy = false) {
  let progress = state.modeProgress[state.mode];
  if (!isRecord(progress)) {
    progress = { activeTypes: [...state.activeTypes], search: state.search, positions: {} };
    state.modeProgress[state.mode] = progress;
    // Old random queues were never saved. Keep ordered-mode positions; random
    // practice will resume from unanswered questions when its first queue is built.
    if (migrateLegacy && !SHUFFLED_MODES.includes(state.mode)) {
      progress.positions[scopeKey()] = { index: state.currentIndex, questionId: null };
    }
  }
  state.activeTypes = validTypes(progress.activeTypes);
  state.search = typeof progress.search === "string" ? progress.search : "";
  progress.positions = isRecord(progress.positions) ? progress.positions : {};
}

function rememberPosition() {
  if (state.mode === "recite") return;
  const progress = state.modeProgress[state.mode];
  progress.activeTypes = [...state.activeTypes];
  progress.search = state.search;
  const question = currentQuestion();
  if (!question) return;
  const key = scopeKey();
  // Reinsert for recency. Keep all 15 type combinations; bound only transient searches.
  delete progress.positions[key];
  progress.positions[key] = { questionId: question.id, index: state.currentIndex };
  const searchKeys = Object.keys(progress.positions).filter((item) => JSON.parse(item)[1]);
  searchKeys.slice(0, Math.max(0, searchKeys.length - MAX_SAVED_SEARCHES))
    .forEach((item) => delete progress.positions[item]);
}

function orderedIds(progress) {
  const bankIds = new Set(questionBank.map((question) => question.id));
  const saved = Array.isArray(progress.orderIds) ? progress.orderIds : [];
  const remaining = [...new Set(saved)].filter((id) => bankIds.has(id));
  const known = new Set(remaining);
  const added = shuffle([...bankIds].filter((id) => !known.has(id)));
  if (!saved.length && ["random", "speed"].includes(state.mode)) {
    progress.orderIds = [
      ...added.filter((id) => state.submitted[id]),
      ...added.filter((id) => !state.submitted[id]),
    ];
  } else {
    // A changed bank must not reshuffle existing questions; append only new IDs.
    progress.orderIds = [...remaining, ...added];
  }
  return progress.orderIds;
}

function wireEvents() {
  els.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  els.typeFilters.forEach((checkbox) => checkbox.addEventListener("change", () => {
    rememberPosition();
    state.activeTypes = els.typeFilters.filter((item) => item.checked).map((item) => item.value);
    if (!state.activeTypes.length) {
      checkbox.checked = true;
      state.activeTypes = [checkbox.value];
    }
    applyFilters();
  }));
  els.searchInput.addEventListener("input", () => {
    rememberPosition();
    state.search = els.searchInput.value.trim();
    applyFilters();
  });
  els.settingsButton.addEventListener("click", () => els.settingsPanel.classList.toggle("hidden"));
  els.mobileMenuButton.addEventListener("click", () => els.sideNav.classList.toggle("open"));
  els.jumpButton.addEventListener("click", jumpToNumber);
  els.jumpInput.addEventListener("keydown", (event) => event.key === "Enter" && jumpToNumber());
  els.prevButton.addEventListener("click", () => moveQuestion(-1));
  els.nextButton.addEventListener("click", () => moveQuestion(1));
  els.submitButton.addEventListener("click", submitCurrent);
  els.restartWrongButton.addEventListener("click", startWrongReview);
  els.clearWrongButton.addEventListener("click", clearWrongQuestions);
  els.favoriteButton.addEventListener("click", toggleFavorite);
  els.markEssayWrong.addEventListener("click", markEssayForReview);
  els.essayDraft.addEventListener("input", () => {
    const question = currentQuestion();
    if (!question) return;
    attemptState(question).essayDrafts[question.id] = els.essayDraft.value;
    saveState();
  });
  els.resetProgressButton.addEventListener("click", resetProgress);
  document.addEventListener("keydown", handleKeyboard);
}

function setMode(mode) {
  if (!Object.hasOwn(MODE_COPY, mode)) return;
  window.clearTimeout(speedTimer);
  rememberPosition();
  state.mode = mode;
  restoreModeProgress();
  syncControls();
  applyFilters();
  saveState();
  els.sideNav.classList.remove("open");
}

function syncControls() {
  els.modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
  els.typeFilters.forEach((checkbox) => { checkbox.checked = state.activeTypes.includes(checkbox.value); });
  els.searchInput.value = state.search;
  const [eyebrow, title, hint] = MODE_COPY[state.mode] || MODE_COPY.sequence;
  els.modeEyebrow.textContent = eyebrow;
  els.modeTitle.textContent = title;
  els.modeHint.textContent = hint;
  document.body.dataset.mode = state.mode;
  const isReciting = state.mode === "recite";
  $("#quizContentGrid").classList.toggle("hidden", isReciting);
  $("#quizTopActions").classList.toggle("hidden", isReciting);
  $("#recitationModule").classList.toggle("hidden", !isReciting);
  if (isReciting) els.settingsPanel.classList.add("hidden");
}

function matchesCurrentFilters(question) {
  const query = state.search.toLowerCase();
  if (!state.activeTypes.includes(question.type)) return false;
  if (!query) return true;
  return [question.typeName, question.number, question.question, question.answer, ...question.options.map((option) => option.text)]
    .join(" ").toLowerCase().includes(query);
}

function activeWrongReview() {
  return state.mode === "wrong" && state.wrongReview?.scope === scopeKey() ? state.wrongReview : null;
}

function attemptState(question) {
  const review = activeWrongReview();
  return question && review?.ids.includes(question.id) ? review : state;
}

function startWrongReview() {
  if (state.mode !== "wrong") return;
  const ids = questionBank.filter((question) => state.wrong[question.id] && matchesCurrentFilters(question))
    .map((question) => question.id);
  if (!ids.length) return;
  state.wrongReview = { scope: scopeKey(), ids, selected: {}, submitted: {}, essayDrafts: {} };
  state.currentIndex = 0;
  state.modeProgress.wrong.positions[scopeKey()] = { questionId: ids[0], index: 0 };
  applyFilters();
}

function renderWrongReviewControls() {
  els.wrongReviewBar.classList.toggle("hidden", state.mode !== "wrong");
  if (state.mode !== "wrong") return;
  const matchingCount = questionBank.filter((question) => state.wrong[question.id] && matchesCurrentFilters(question)).length;
  const review = activeWrongReview();
  const results = review ? review.ids.map((id) => review.submitted[id]).filter(Boolean) : [];
  const complete = review && results.length === review.ids.length;
  els.wrongReviewTitle.textContent = complete ? "本轮已完成" : review ? "本轮错题练习" : "再练一次，巩固易错点";
  els.wrongReviewHint.textContent = complete
    ? `本轮答对 ${results.filter((result) => result.correct).length} / ${review.ids.length} 题。历史错题仍保留，可以再次重练。`
    : review ? `已完成 ${results.length} / ${review.ids.length} 题。答对不会删除，只有“清空错题”才会移除记录。`
    : matchingCount ? `当前筛选有 ${matchingCount} 道历史错题，重练或重置练习进度都不会删除。` : "当前筛选没有错题，可调整筛选条件。";
  els.restartWrongButton.disabled = !matchingCount;
  els.restartWrongButton.textContent = matchingCount ? `重新练习（${matchingCount} 题）` : "暂无错题";
  els.clearWrongButton.disabled = !Object.keys(state.wrong).length;
}

function applyFilters() {
  if (state.mode === "recite") {
    saveState();
    window.Recitation?.open();
    return;
  }
  const review = activeWrongReview();
  const reviewIds = review ? new Set(review.ids) : null;
  filteredQuestions = questionBank.filter((question) => {
    if (!matchesCurrentFilters(question)) return false;
    if (state.mode === "wrong" && !(reviewIds ? reviewIds.has(question.id) : state.wrong[question.id])) return false;
    if (state.mode === "favorite" && !state.favorites[question.id]) return false;
    return true;
  });

  const progress = state.modeProgress[state.mode];
  if (SHUFFLED_MODES.includes(state.mode)) {
    const byId = new Map(filteredQuestions.map((question) => [question.id, question]));
    filteredQuestions = orderedIds(progress).filter((id) => byId.has(id)).map((id) => byId.get(id));
    if (state.mode === "exam") filteredQuestions = filteredQuestions.slice(0, 20);
  }
  const bookmark = progress.positions[scopeKey()];
  const bookmarkedIndex = bookmark ? filteredQuestions.findIndex((question) => question.id === bookmark.questionId) : -1;
  const firstUnanswered = ["random", "speed"].includes(state.mode)
    ? filteredQuestions.findIndex((question) => !state.submitted[question.id]) : 0;
  state.currentIndex = bookmarkedIndex >= 0 ? bookmarkedIndex
    : Number.isInteger(bookmark?.index) ? bookmark.index : Math.max(0, firstUnanswered);
  state.currentIndex = clamp(state.currentIndex, 0, Math.max(visibleLength() - 1, 0));
  rememberPosition();
  saveState();
  renderQuestion();
  renderStats();
}

function visibleLength() {
  return filteredQuestions.length;
}

function currentQuestion() {
  if (state.mode === "recite") return null;
  if (!filteredQuestions.length) return null;
  return filteredQuestions[state.currentIndex];
}

function renderQuestion() {
  window.clearTimeout(speedTimer);
  renderWrongReviewControls();
  const question = currentQuestion();
  const total = visibleLength();
  if (!question) return renderEmpty();

  const attempt = attemptState(question);
  const submitted = attempt.submitted[question.id];
  const selected = attempt.selected[question.id] || [];
  const isEssay = question.type === "essay";
  const isLearning = state.mode === "learn";
  const isExam = state.mode === "exam";
  const answerVisible = isLearning || (Boolean(submitted) && !isExam);

  els.typeBadge.textContent = `${question.typeName} · 原题号 ${question.number}`;
  els.positionText.textContent = `${state.currentIndex + 1} / ${total}`;
  els.questionShell.style.setProperty("--question-progress", `${Math.max(2, Math.round(((state.currentIndex + 1) / total) * 100))}%`);
  els.questionShell.classList.toggle("learning", isLearning);
  els.questionTitle.textContent = question.question;
  els.favoriteButton.textContent = state.favorites[question.id] ? "★" : "☆";
  els.favoriteButton.classList.toggle("active", Boolean(state.favorites[question.id]));
  els.favoriteButton.setAttribute("aria-pressed", String(Boolean(state.favorites[question.id])));
  els.essayArea.classList.toggle("hidden", !isEssay);
  els.optionList.classList.toggle("hidden", isEssay);
  els.essayDraft.value = attempt.essayDrafts[question.id] || "";

  if (!isEssay) {
    els.optionList.innerHTML = question.options.map((option) => optionTemplate(question, option, selected, submitted, answerVisible, isExam)).join("");
    $$(".option-row").forEach((row) => row.addEventListener("click", () => toggleOption(question, row.dataset.option)));
  }

  renderFeedback(question, submitted, isLearning, isExam);
  els.answerPanel.classList.toggle("hidden", !answerVisible);
  els.answerText.textContent = answerVisible ? formatAnswer(question) : "";
  els.prevButton.disabled = state.currentIndex <= 0;
  els.nextButton.disabled = state.currentIndex >= total - 1;
  els.submitButton.classList.toggle("hidden", isLearning);
  els.submitButton.disabled = Boolean(submitted);
  els.submitButton.textContent = submitted ? (isExam ? "已记录" : "已完成") : isEssay ? "完成本题" : "确认答案";
}

function renderEmpty() {
  els.typeBadge.textContent = "空空如也";
  els.positionText.textContent = "0 / 0";
  els.questionTitle.textContent = state.mode === "wrong" ? "太棒了，暂时没有错题" : state.mode === "favorite" ? "还没有收藏题目" : "没有匹配到题目";
  els.optionList.innerHTML = `<div class="empty-state"><span>✓</span><strong>换个模式或筛选条件试试</strong></div>`;
  els.optionList.classList.remove("hidden");
  els.essayArea.classList.add("hidden");
  els.feedbackBox.classList.add("hidden");
  els.answerPanel.classList.add("hidden");
  els.prevButton.disabled = true;
  els.nextButton.disabled = true;
  els.submitButton.disabled = true;
  els.questionShell.style.setProperty("--question-progress", "0%");
}

function optionTemplate(question, option, selected, submitted, answerVisible, isExam) {
  const selectedNow = selected.includes(option.label);
  const correct = answerVisible && answerLabelsFor(question).includes(option.label);
  const wrong = answerVisible && submitted && selectedNow && !correct;
  const classes = ["option-row", selectedNow ? "selected" : "", correct ? "correct" : "", wrong ? "wrong" : ""].filter(Boolean);
  return `<button class="${classes.join(" ")}" type="button" data-option="${escapeHtml(option.label)}" ${submitted && !isExam ? "disabled" : ""}>
    <span class="option-label">${escapeHtml(option.label)}</span><span class="option-text">${escapeHtml(option.text)}</span><span class="option-state">${correct ? "✓" : wrong ? "×" : ""}</span>
  </button>`;
}

function toggleOption(question, label) {
  const attempt = attemptState(question);
  if (attempt.submitted[question.id]) return;
  const selected = new Set(attempt.selected[question.id] || []);
  if (question.type === "multiple") selected.has(label) ? selected.delete(label) : selected.add(label);
  else { selected.clear(); selected.add(label); }
  attempt.selected[question.id] = Array.from(selected).sort();
  saveState();
  renderQuestion();
}

function submitCurrent() {
  const question = currentQuestion();
  if (!question) return;
  const attempt = attemptState(question);
  if (attempt.submitted[question.id]) return;
  let result;
  if (question.type === "essay") {
    result = { selected: ["已完成"], correct: true, at: Date.now() };
  } else {
    const selected = attempt.selected[question.id] || [];
    if (!selected.length) return flashFeedback("先选一个答案吧", false);
    const correct = selected.join("") === answerLabelsFor(question).join("");
    result = { selected, correct, at: Date.now() };
  }
  attempt.submitted[question.id] = result;
  state.submitted[question.id] = result;
  state.selected[question.id] = [...result.selected];
  if (question.type === "essay") state.essayDrafts[question.id] = attempt.essayDrafts[question.id] || "";
  // The wrong-question library is a history, independent of the latest result.
  // Only its dedicated clear action may remove these records.
  if (result.correct) { state.streak += 1; }
  else { state.wrong[question.id] = true; state.streak = 0; }
  saveState();
  renderQuestion();
  renderStats();
  if (state.mode === "speed" && state.currentIndex < visibleLength() - 1) speedTimer = window.setTimeout(() => moveQuestion(1), 720);
}

function renderFeedback(question, submitted, isLearning, isExam) {
  if (isLearning) {
    els.feedbackBox.textContent = "学习模式 · 答案已直接标出";
    els.feedbackBox.className = "feedback-box learn";
  } else if (!submitted) {
    els.feedbackBox.className = "feedback-box hidden";
  } else if (isExam) {
    els.feedbackBox.textContent = "答案已记录，继续下一题";
    els.feedbackBox.className = "feedback-box neutral";
  } else if (question.type === "essay" || submitted.correct) {
    els.feedbackBox.textContent = question.type === "essay" ? "本题已完成" : "漂亮，答对了！";
    els.feedbackBox.className = "feedback-box ok";
  } else {
    els.feedbackBox.textContent = `再想一步，正确答案是 ${answerLabelsFor(question).join("")}`;
    els.feedbackBox.className = "feedback-box bad";
  }
}

function flashFeedback(message, ok) {
  els.feedbackBox.textContent = message;
  els.feedbackBox.className = `feedback-box ${ok ? "ok" : "bad"}`;
  window.setTimeout(() => {
    const question = currentQuestion();
    if (question) renderFeedback(question, attemptState(question).submitted[question.id], state.mode === "learn", state.mode === "exam");
  }, 1400);
}

function moveQuestion(delta) {
  const next = state.currentIndex + delta;
  if (next < 0 || next >= visibleLength()) return;
  state.currentIndex = next;
  rememberPosition();
  saveState();
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function jumpToNumber() {
  const target = Number.parseInt(els.jumpInput.value, 10);
  if (!Number.isFinite(target)) return;
  const index = filteredQuestions.findIndex((question) => question.number === target);
  if (index < 0) return flashFeedback("当前范围里没有这个题号", false);
  state.currentIndex = index;
  rememberPosition();
  saveState();
  renderQuestion();
  els.settingsPanel.classList.add("hidden");
}

function toggleFavorite() {
  const question = currentQuestion();
  if (!question) return;
  if (state.favorites[question.id]) delete state.favorites[question.id];
  else state.favorites[question.id] = true;
  saveState();
  if (state.mode === "favorite") applyFilters();
  else { renderQuestion(); renderStats(); }
}

function markEssayForReview() {
  const question = currentQuestion();
  if (!question) return;
  state.wrong[question.id] = true;
  saveState();
  renderStats();
  renderWrongReviewControls();
  flashFeedback("已加入错题重练", true);
}

function resetProgress() {
  if (!window.confirm("确定重置练习进度吗？将清空答题记录、作答草稿和练习位置，保留历史错题、收藏及理论背诵进度。")) return;
  window.clearTimeout(speedTimer);
  Object.assign(state, { currentIndex: 0, selected: {}, submitted: {}, essayDrafts: {}, streak: 0, modeProgress: {}, wrongReview: null });
  restoreModeProgress();
  saveState();
  applyFilters();
  els.settingsPanel.classList.add("hidden");
}

function clearWrongQuestions() {
  const count = Object.keys(state.wrong).length;
  if (!count || !window.confirm(`确定清空全部 ${count} 道历史错题吗？此操作不受当前筛选限制，且无法撤销。不会清除其他模式的答题进度、收藏或理论背诵记录。`)) return;
  state.wrong = {};
  state.wrongReview = null;
  delete state.modeProgress.wrong;
  if (state.mode === "wrong") {
    state.currentIndex = 0;
    restoreModeProgress();
    applyFilters();
  } else {
    saveState();
    renderStats();
  }
}

function handleKeyboard(event) {
  if (["INPUT", "TEXTAREA", "BUTTON", "SELECT", "SUMMARY"].includes(document.activeElement.tagName)
    || document.activeElement.isContentEditable) return;
  const question = currentQuestion();
  if (!question) return;
  if (/^[1-4]$/.test(event.key) && question.type !== "essay") {
    const option = question.options[Number(event.key) - 1];
    if (option) toggleOption(question, option.label);
  }
  if (event.key === "Enter") submitCurrent();
  if (event.key === "ArrowLeft") moveQuestion(-1);
  if (event.key === "ArrowRight") moveQuestion(1);
}

function renderStats() {
  const submissions = Object.values(state.submitted);
  const objective = submissions.filter((item) => typeof item.correct === "boolean");
  const correct = objective.filter((item) => item.correct).length;
  const accuracy = objective.length ? Math.round((correct / objective.length) * 100) : 0;
  els.doneCount.innerHTML = `${submissions.length} <small>题</small>`;
  els.accuracyText.textContent = `${accuracy}%`;
  els.wrongCount.textContent = Object.keys(state.wrong).length;
  els.favCount.textContent = Object.keys(state.favorites).length;
  els.streakCount.textContent = state.streak || 0;
  els.goalText.textContent = `${Math.min(submissions.length, 30)} / 30`;
  els.goalProgress.style.width = `${Math.min(100, (submissions.length / 30) * 100)}%`;
}

function answerLabelsFor(question) {
  if (question.type === "judge") return [String(question.answer)];
  return String(question.answer || "").split("").sort();
}

function formatAnswer(question) {
  if (question.type === "essay") return question.answer;
  const labels = answerLabelsFor(question);
  const text = question.options.filter((option) => labels.includes(option.label)).map((option) => `${option.label}. ${option.text}`).join("\n");
  return text || labels.join("");
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function escapeHtml(value) {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '\"': "&quot;" })[char]);
}

function registerOfflineCache() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js").catch(() => {});
}
