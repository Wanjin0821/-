const STORAGE_KEY = "zhilian-quiz-state-v2";
const ALL_TYPES = ["single", "multiple", "judge", "essay"];
const MODE_COPY = {
  sequence: ["顺序练习", "稳稳向前，每题都算数", "按题库顺序稳步推进，适合系统复习。"],
  learn: ["学习模式", "先看答案，再理解题目", "答案直接展示，适合第一次过题和快速回顾。"],
  random: ["随机练习", "打乱顺序，保持新鲜", "题目随机出现，帮你摆脱顺序记忆。"],
  speed: ["速刷模式", "快一点，手感正热", "确认后自动前进，适合碎片时间集中刷题。"],
  exam: ["模拟考试", "专注作答，最后见分晓", "随机抽取 20 题，作答过程不显示对错。"],
  wrong: ["错题重练", "再见一次，这次拿下", "只练曾经答错的题，答对后自动移出。"],
  favorite: ["我的收藏", "重要的题，值得再看", "集中回顾你主动收藏的题目。"],
};

const state = loadState();
let questionBank = [];
let filteredQuestions = [];
let randomOrder = [];
let randomSignature = "";
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
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...fallback, ...saved, activeTypes: saved.activeTypes || fallback.activeTypes };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function wireEvents() {
  els.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  els.typeFilters.forEach((checkbox) => checkbox.addEventListener("change", () => {
    state.activeTypes = els.typeFilters.filter((item) => item.checked).map((item) => item.value);
    if (!state.activeTypes.length) {
      checkbox.checked = true;
      state.activeTypes = [checkbox.value];
    }
    state.currentIndex = 0;
    resetOrder();
    applyFilters();
    saveState();
  }));
  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value.trim();
    state.currentIndex = 0;
    resetOrder();
    applyFilters();
    saveState();
  });
  els.settingsButton.addEventListener("click", () => els.settingsPanel.classList.toggle("hidden"));
  els.mobileMenuButton.addEventListener("click", () => els.sideNav.classList.toggle("open"));
  els.jumpButton.addEventListener("click", jumpToNumber);
  els.jumpInput.addEventListener("keydown", (event) => event.key === "Enter" && jumpToNumber());
  els.prevButton.addEventListener("click", () => moveQuestion(-1));
  els.nextButton.addEventListener("click", () => moveQuestion(1));
  els.submitButton.addEventListener("click", submitCurrent);
  els.favoriteButton.addEventListener("click", toggleFavorite);
  els.markEssayWrong.addEventListener("click", markEssayForReview);
  els.essayDraft.addEventListener("input", () => {
    const question = currentQuestion();
    if (!question) return;
    state.essayDrafts[question.id] = els.essayDraft.value;
    saveState();
  });
  els.resetProgressButton.addEventListener("click", resetProgress);
  document.addEventListener("keydown", handleKeyboard);
}

function setMode(mode) {
  window.clearTimeout(speedTimer);
  state.mode = mode;
  state.currentIndex = 0;
  resetOrder();
  syncControls();
  applyFilters();
  saveState();
  els.sideNav.classList.remove("open");
}

function resetOrder() {
  randomOrder = [];
  randomSignature = "";
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
}

function applyFilters() {
  const query = state.search.toLowerCase();
  filteredQuestions = questionBank.filter((question) => {
    if (!state.activeTypes.includes(question.type)) return false;
    if (state.mode === "wrong" && !state.wrong[question.id]) return false;
    if (state.mode === "favorite" && !state.favorites[question.id]) return false;
    if (!query) return true;
    return [question.typeName, question.number, question.question, question.answer, ...question.options.map((option) => option.text)]
      .join(" ").toLowerCase().includes(query);
  });

  const shuffledMode = ["random", "speed", "exam"].includes(state.mode);
  if (shuffledMode) {
    const signature = `${state.mode}:${filteredQuestions.map((question) => question.id).join("|")}`;
    if (signature !== randomSignature) {
      randomSignature = signature;
      randomOrder = shuffle(filteredQuestions.map((_, index) => index));
    }
    if (state.mode === "exam") randomOrder = randomOrder.slice(0, 20);
  }
  state.currentIndex = clamp(state.currentIndex, 0, Math.max(visibleLength() - 1, 0));
  renderQuestion();
  renderStats();
}

function visibleLength() {
  return ["random", "speed", "exam"].includes(state.mode) ? randomOrder.length : filteredQuestions.length;
}

function currentQuestion() {
  if (!filteredQuestions.length) return null;
  const index = ["random", "speed", "exam"].includes(state.mode) ? randomOrder[state.currentIndex] : state.currentIndex;
  return filteredQuestions[index];
}

function renderQuestion() {
  window.clearTimeout(speedTimer);
  const question = currentQuestion();
  const total = visibleLength();
  if (!question) return renderEmpty();

  const submitted = state.submitted[question.id];
  const selected = state.selected[question.id] || [];
  const isEssay = question.type === "essay";
  const isLearning = state.mode === "learn";
  const isExam = state.mode === "exam";
  const answerVisible = isLearning || (Boolean(submitted) && !isExam);

  els.typeBadge.textContent = question.typeName;
  els.positionText.textContent = `${state.currentIndex + 1} / ${total}`;
  els.questionShell.style.setProperty("--question-progress", `${Math.max(2, Math.round(((state.currentIndex + 1) / total) * 100))}%`);
  els.questionShell.classList.toggle("learning", isLearning);
  els.questionTitle.textContent = question.question;
  els.favoriteButton.textContent = state.favorites[question.id] ? "★" : "☆";
  els.favoriteButton.classList.toggle("active", Boolean(state.favorites[question.id]));
  els.favoriteButton.setAttribute("aria-pressed", String(Boolean(state.favorites[question.id])));
  els.essayArea.classList.toggle("hidden", !isEssay);
  els.optionList.classList.toggle("hidden", isEssay);
  els.essayDraft.value = state.essayDrafts[question.id] || "";

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
  if (state.submitted[question.id]) return;
  const selected = new Set(state.selected[question.id] || []);
  if (question.type === "multiple") selected.has(label) ? selected.delete(label) : selected.add(label);
  else { selected.clear(); selected.add(label); }
  state.selected[question.id] = Array.from(selected).sort();
  saveState();
  renderQuestion();
}

function submitCurrent() {
  const question = currentQuestion();
  if (!question || state.submitted[question.id]) return;
  if (question.type === "essay") {
    state.submitted[question.id] = { selected: ["已完成"], correct: true, at: Date.now() };
    state.streak += 1;
  } else {
    const selected = state.selected[question.id] || [];
    if (!selected.length) return flashFeedback("先选一个答案吧", false);
    const correct = selected.join("") === answerLabelsFor(question).join("");
    state.submitted[question.id] = { selected, correct, at: Date.now() };
    if (correct) { delete state.wrong[question.id]; state.streak += 1; }
    else { state.wrong[question.id] = true; state.streak = 0; }
  }
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
  window.setTimeout(() => renderFeedback(currentQuestion(), state.submitted[currentQuestion()?.id], state.mode === "learn", state.mode === "exam"), 1400);
}

function moveQuestion(delta) {
  const next = state.currentIndex + delta;
  if (next < 0 || next >= visibleLength()) return;
  state.currentIndex = next;
  saveState();
  renderQuestion();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function jumpToNumber() {
  const target = Number.parseInt(els.jumpInput.value, 10);
  if (!Number.isFinite(target)) return;
  const sourceIndex = filteredQuestions.findIndex((question) => question.number === target);
  const index = ["random", "speed", "exam"].includes(state.mode) ? randomOrder.indexOf(sourceIndex) : sourceIndex;
  if (index < 0) return flashFeedback("当前范围里没有这个题号", false);
  state.currentIndex = index;
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
  flashFeedback("已加入错题重练", true);
}

function resetProgress() {
  if (!window.confirm("确定清空答题、错题和收藏记录吗？")) return;
  Object.assign(state, { currentIndex: 0, selected: {}, submitted: {}, wrong: {}, favorites: {}, essayDrafts: {}, streak: 0 });
  saveState();
  applyFilters();
  els.settingsPanel.classList.add("hidden");
}

function handleKeyboard(event) {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
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
