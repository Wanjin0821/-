const STORAGE_KEY = "ai-power-quiz-state-v1";

const state = loadState();
let questionBank = [];
let filteredQuestions = [];
let randomOrder = [];
let randomSignature = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  modeButtons: $$(".mode-button"),
  typeFilters: $$(".filter-block input[type='checkbox']"),
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
  showEssayAnswer: $("#showEssayAnswer"),
  markEssayWrong: $("#markEssayWrong"),
  feedbackBox: $("#feedbackBox"),
  answerText: $("#answerText"),
  explanationPanel: $("#explanationPanel"),
  explanationText: $("#explanationText"),
  prevButton: $("#prevButton"),
  submitButton: $("#submitButton"),
  nextButton: $("#nextButton"),
  accuracyText: $("#accuracyText"),
  doneCount: $("#doneCount"),
  wrongCount: $("#wrongCount"),
  favCount: $("#favCount"),
  noteCount: $("#noteCount"),
  noteInput: $("#noteInput"),
  distribution: $("#distribution"),
  offlineStatus: $("#offlineStatus"),
};

init();

function init() {
  questionBank = window.QUESTION_BANK || [];
  applyDetailedExplanations();
  wireEvents();
  syncControlsFromState();
  renderDistribution();
  applyFilters();
  registerOfflineCache();
}

function applyDetailedExplanations() {
  const explanationMap = window.QUESTION_EXPLANATIONS || {};
  questionBank = questionBank.map((question) => ({
    ...question,
    detailedExplanation: explanationMap[question.id] || question.detailedExplanation,
  }));
}

function loadState() {
  const fallback = {
    mode: "sequence",
    activeTypes: ["single", "multiple", "judge", "essay"],
    search: "",
    currentIndex: 0,
    selected: {},
    submitted: {},
    wrong: {},
    favorites: {},
    notes: {},
    essayDrafts: {},
    revealedEssayAnswers: {},
  };

  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function wireEvents() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      state.currentIndex = 0;
      randomOrder = [];
      syncControlsFromState();
      applyFilters();
      saveState();
    });
  });

  els.typeFilters.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.activeTypes = els.typeFilters.filter((item) => item.checked).map((item) => item.value);
      state.currentIndex = 0;
      randomOrder = [];
      applyFilters();
      saveState();
    });
  });

  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value.trim();
    state.currentIndex = 0;
    randomOrder = [];
    applyFilters();
    saveState();
  });

  els.jumpButton.addEventListener("click", jumpToNumber);
  els.jumpInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") jumpToNumber();
  });

  els.prevButton.addEventListener("click", () => moveQuestion(-1));
  els.nextButton.addEventListener("click", () => moveQuestion(1));
  els.submitButton.addEventListener("click", submitCurrent);
  els.favoriteButton.addEventListener("click", toggleFavorite);
  els.showEssayAnswer.addEventListener("click", revealEssayAnswer);
  els.markEssayWrong.addEventListener("click", markEssayForReview);

  els.noteInput.addEventListener("input", () => {
    const current = currentQuestion();
    if (!current) return;
    state.notes[current.id] = els.noteInput.value;
    if (!els.noteInput.value.trim()) delete state.notes[current.id];
    saveState();
    renderStats();
  });

  els.essayDraft.addEventListener("input", () => {
    const current = currentQuestion();
    if (!current) return;
    state.essayDrafts[current.id] = els.essayDraft.value;
    if (!els.essayDraft.value.trim()) delete state.essayDrafts[current.id];
    saveState();
  });

  els.resetProgressButton.addEventListener("click", () => {
    const confirmed = window.confirm("确定清空答题记录、错题、收藏和笔记吗？");
    if (!confirmed) return;
    Object.assign(state, {
      selected: {},
      submitted: {},
      wrong: {},
      favorites: {},
      notes: {},
      essayDrafts: {},
      revealedEssayAnswers: {},
      currentIndex: 0,
    });
    saveState();
    applyFilters();
  });
}

function syncControlsFromState() {
  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
  els.typeFilters.forEach((checkbox) => {
    checkbox.checked = state.activeTypes.includes(checkbox.value);
  });
  els.searchInput.value = state.search;
}

function applyFilters() {
  const query = state.search.toLowerCase();
  filteredQuestions = questionBank.filter((question) => {
    if (!state.activeTypes.includes(question.type)) return false;
    if (state.mode === "wrong" && !state.wrong[question.id]) return false;
    if (state.mode === "favorite" && !state.favorites[question.id]) return false;
    if (!query) return true;
    const haystack = [
      question.typeName,
      question.number,
      question.question,
      question.answer,
      question.explanation || "",
      ...question.options.map((option) => `${option.label}.${option.text}`),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  if (state.mode === "random") {
    const signature = filteredQuestions.map((question) => question.id).join("|");
    if (signature !== randomSignature || randomOrder.length !== filteredQuestions.length) {
      randomSignature = signature;
      randomOrder = shuffle(filteredQuestions.map((_, index) => index));
    }
  }

  state.currentIndex = clamp(state.currentIndex, 0, Math.max(filteredQuestions.length - 1, 0));
  renderQuestion();
  renderStats();
}

function currentQuestion() {
  if (!filteredQuestions.length) return null;
  const index = state.mode === "random" ? randomOrder[state.currentIndex] : state.currentIndex;
  return filteredQuestions[index] || filteredQuestions[0];
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) {
    els.typeBadge.textContent = "无题目";
    els.positionText.textContent = "0 / 0";
    els.questionTitle.textContent = "当前筛选条件下没有题目";
    els.optionList.innerHTML = `<div class="empty-state"><strong>没有匹配题目</strong><span>换一个模式、题型或搜索词试试</span></div>`;
    els.essayArea.classList.add("hidden");
    els.feedbackBox.classList.add("hidden");
    els.answerText.textContent = "暂无";
    els.explanationPanel.classList.add("hidden");
    els.explanationText.textContent = "";
    els.noteInput.value = "";
    els.prevButton.disabled = true;
    els.nextButton.disabled = true;
    els.submitButton.disabled = true;
    els.questionShell.classList.remove("is-answered");
    els.questionShell.style.setProperty("--question-progress", "0%");
    return;
  }

  const submitted = state.submitted[question.id];
  const selected = state.selected[question.id] || [];
  const isEssay = question.type === "essay";
  const answerVisible = submitted || state.revealedEssayAnswers[question.id];

  els.typeBadge.textContent = `${question.typeName} ${question.number}`;
  els.positionText.textContent = `第 ${state.currentIndex + 1} / ${filteredQuestions.length} 题`;
  els.questionShell.classList.toggle("is-answered", Boolean(answerVisible));
  els.questionShell.style.setProperty("--question-progress", `${Math.max(1, Math.round(((state.currentIndex + 1) / filteredQuestions.length) * 100))}%`);
  els.questionTitle.textContent = question.question;
  els.favoriteButton.textContent = state.favorites[question.id] ? "★" : "☆";
  els.favoriteButton.classList.toggle("active", Boolean(state.favorites[question.id]));
  els.favoriteButton.setAttribute("aria-pressed", String(Boolean(state.favorites[question.id])));
  els.noteInput.value = state.notes[question.id] || "";

  els.essayArea.classList.toggle("hidden", !isEssay);
  els.optionList.classList.toggle("hidden", isEssay);
  els.submitButton.textContent = submitted ? "已提交" : isEssay ? "完成本题" : "提交答案";

  if (isEssay) {
    els.essayDraft.value = state.essayDrafts[question.id] || "";
    els.optionList.innerHTML = "";
  } else {
    els.optionList.innerHTML = question.options
      .map((option) => optionTemplate(question, option, selected, submitted))
      .join("");
    $$(".option-row").forEach((row) => {
      row.addEventListener("click", () => toggleOption(question, row.dataset.option));
    });
  }

  renderFeedback(question);
  els.answerText.textContent = answerVisible ? formatAnswer(question) : isEssay ? "可先写下自己的作答要点，再查看参考答案" : "提交后显示答案";
  renderExplanation(question, submitted, answerVisible);
  els.prevButton.disabled = state.currentIndex <= 0;
  els.nextButton.disabled = state.currentIndex >= filteredQuestions.length - 1;
  els.submitButton.disabled = Boolean(submitted);
}

function optionTemplate(question, option, selected, submitted) {
  const isSelected = selected.includes(option.label);
  const answerLabels = answerLabelsFor(question);
  const isCorrectOption = submitted && answerLabels.includes(option.label);
  const isWrongOption = submitted && isSelected && !answerLabels.includes(option.label);
  const classes = ["option-row"];
  if (isSelected) classes.push("selected");
  if (isCorrectOption) classes.push("correct");
  if (isWrongOption) classes.push("wrong");

  return `
    <button class="${classes.join(" ")}" type="button" data-option="${escapeHtml(option.label)}">
      <span class="option-label">${escapeHtml(option.label)}</span>
      <span class="option-text">${escapeHtml(option.text)}</span>
    </button>
  `;
}

function toggleOption(question, label) {
  if (state.submitted[question.id]) return;
  const selected = new Set(state.selected[question.id] || []);

  if (question.type === "multiple") {
    selected.has(label) ? selected.delete(label) : selected.add(label);
  } else {
    selected.clear();
    selected.add(label);
  }

  state.selected[question.id] = Array.from(selected).sort();
  saveState();
  renderQuestion();
}

function submitCurrent() {
  const question = currentQuestion();
  if (!question) return;

  if (question.type === "essay") {
    state.submitted[question.id] = { selected: ["已完成"], correct: true, at: Date.now() };
    state.revealedEssayAnswers[question.id] = true;
    delete state.wrong[question.id];
    saveState();
    renderQuestion();
    renderStats();
    focusReviewArea();
    return;
  }

  const selected = state.selected[question.id] || [];
  if (!selected.length) {
    flashFeedback("请选择一个答案再提交", false);
    return;
  }

  const selectedKey = selected.join("");
  const correctKey = answerLabelsFor(question).join("");
  const correct = selectedKey === correctKey;

  state.submitted[question.id] = { selected, correct, at: Date.now() };
  if (correct) {
    delete state.wrong[question.id];
  } else {
    state.wrong[question.id] = true;
  }
  saveState();
  renderQuestion();
  renderStats();
  focusReviewArea();
}

function focusReviewArea() {
  window.requestAnimationFrame(() => {
    els.feedbackBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

function renderFeedback(question) {
  const submitted = state.submitted[question.id];
  if (!submitted) {
    els.feedbackBox.classList.add("hidden");
    els.feedbackBox.classList.remove("ok", "bad");
    els.feedbackBox.textContent = "";
    return;
  }
  if (question.type === "essay") {
    els.feedbackBox.textContent = "已完成本题，可对照参考答案复盘。";
    els.feedbackBox.className = "feedback-box ok";
    return;
  }
  els.feedbackBox.textContent = submitted.correct ? "回答正确" : `回答错误，正确答案是 ${answerLabelsFor(question).join("")}`;
  els.feedbackBox.className = `feedback-box ${submitted.correct ? "ok" : "bad"}`;
}

function renderExplanation(question, submitted, answerVisible) {
  if (!answerVisible) {
    els.explanationPanel.classList.add("hidden");
    els.explanationText.textContent = "";
    return;
  }

  els.explanationPanel.classList.remove("hidden");
  els.explanationText.textContent = formatExplanation(question, submitted);
}

function flashFeedback(message, ok) {
  els.feedbackBox.textContent = message;
  els.feedbackBox.className = `feedback-box ${ok ? "ok" : "bad"}`;
  window.setTimeout(() => renderFeedback(currentQuestion()), 1600);
}

function revealEssayAnswer() {
  const question = currentQuestion();
  if (!question) return;
  state.revealedEssayAnswers[question.id] = true;
  saveState();
  renderQuestion();
}

function markEssayForReview() {
  const question = currentQuestion();
  if (!question) return;
  state.wrong[question.id] = true;
  state.revealedEssayAnswers[question.id] = true;
  saveState();
  renderQuestion();
  renderStats();
}

function toggleFavorite() {
  const question = currentQuestion();
  if (!question) return;
  if (state.favorites[question.id]) {
    delete state.favorites[question.id];
  } else {
    state.favorites[question.id] = true;
  }
  saveState();
  if (state.mode === "favorite") applyFilters();
  renderQuestion();
  renderStats();
}

function moveQuestion(delta) {
  state.currentIndex = clamp(state.currentIndex + delta, 0, Math.max(filteredQuestions.length - 1, 0));
  saveState();
  renderQuestion();
}

function jumpToNumber() {
  const target = Number.parseInt(els.jumpInput.value, 10);
  if (!Number.isFinite(target)) return;
  const index = filteredQuestions.findIndex((question) => question.number === target);
  if (index >= 0) {
    state.currentIndex = state.mode === "random" ? randomOrder.indexOf(index) : index;
    saveState();
    renderQuestion();
  } else {
    flashFeedback("当前筛选条件下没有这个题号", false);
  }
}

function renderStats() {
  const submitted = Object.values(state.submitted);
  const objectiveSubmitted = submitted.filter((item) => typeof item.correct === "boolean");
  const correct = objectiveSubmitted.filter((item) => item.correct).length;
  const accuracy = objectiveSubmitted.length ? Math.round((correct / objectiveSubmitted.length) * 100) : 0;

  els.accuracyText.textContent = `${accuracy}%`;
  els.doneCount.textContent = String(submitted.length);
  els.wrongCount.textContent = String(Object.keys(state.wrong).length);
  els.favCount.textContent = String(Object.keys(state.favorites).length);
  els.noteCount.textContent = String(Object.keys(state.notes).length);
}

function renderDistribution() {
  const counts = questionBank.reduce((acc, question) => {
    acc[question.typeName] = (acc[question.typeName] || 0) + 1;
    return acc;
  }, {});
  const total = questionBank.length || 1;
  els.distribution.innerHTML = Object.entries(counts)
    .map(([label, count]) => {
      const percent = Math.round((count / total) * 100);
      return `
        <div class="dist-row">
          <header><span>${escapeHtml(label)}</span><span>${count}</span></header>
          <div class="dist-bar"><span style="width: ${percent}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function answerLabelsFor(question) {
  if (question.type === "judge") return [question.answer];
  return String(question.answer || "").split("").sort();
}

function formatAnswer(question) {
  if (question.type === "essay") return question.answer;
  if (question.type === "judge") return question.answer;
  const optionText = question.options
    .filter((option) => answerLabelsFor(question).includes(option.label))
    .map((option) => `${option.label}. ${option.text}`)
    .join("\n");
  return `${answerLabelsFor(question).join("")}\n${optionText}`;
}

function formatExplanation(question, submitted) {
  if (question.detailedExplanation) return formatDetailedExplanation(question);
  if (question.explanation) return question.explanation;
  if (question.type === "essay") return "这类题建议先用自己的话列出要点，再对照参考答案补齐关键词、应用场景和风险措施。复习时重点看是否覆盖了题干要求的每个方面。";
  if (question.type === "judge") {
    return `本题判断为“${question.answer}”。复习时先抓题干中的绝对化表述、适用范围和因果关系，再和标准答案核对，避免只凭印象判断。`;
  }

  const answerLabels = answerLabelsFor(question);
  const correctOptions = question.options.filter((option) => answerLabels.includes(option.label));
  const correctText = correctOptions.map((option) => `${option.label}. ${option.text}`).join("\n");
  const selectedLabels = submitted?.selected || [];
  const wrongSelected = question.options.filter(
    (option) => selectedLabels.includes(option.label) && !answerLabels.includes(option.label)
  );
  const missed = correctOptions.filter((option) => !selectedLabels.includes(option.label));
  const lines = [
    `正确答案是 ${answerLabels.join("")}，关键依据是：`,
    correctText,
  ];

  if (wrongSelected.length) {
    lines.push(
      "",
      `你选择的 ${wrongSelected.map((option) => option.label).join("、")} 不在标准答案中，复盘时重点比较这些选项与正确选项的关键词差异。`
    );
  }
  if (missed.length && question.type === "multiple") {
    lines.push("", `多选题容易漏选，本题还需要包含：${missed.map((option) => `${option.label}. ${option.text}`).join("；")}。`);
  }
  lines.push("", "记忆点：先记住题干问的是“正确项”还是“错误项/不包括”，再把标准选项里的核心词和题干关键词绑定起来。");
  return lines.join("\n");
}

function formatDetailedExplanation(question) {
  const detail = question.detailedExplanation;
  const lines = [];

  if (detail.analysis) {
    lines.push("解析：", detail.analysis);
  }

  const optionLabels = question.options.map((option) => option.label);
  const optionDetails = detail.options || {};
  const availableLabels = optionLabels.filter((label) => optionDetails[label]);
  if (availableLabels.length) {
    lines.push("", "选项辨析：");
    availableLabels.forEach((label) => {
      lines.push(`${label}. ${optionDetails[label]}`);
    });
  }

  if (detail.memory) {
    lines.push("", "记忆点：", detail.memory);
  }

  return lines.join("\n");
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerOfflineCache() {
  if (!("serviceWorker" in navigator)) {
    els.offlineStatus.textContent = "本地可用";
    return;
  }
  navigator.serviceWorker
    .register("./sw.js")
    .then(() => {
      els.offlineStatus.textContent = "离线可用";
    })
    .catch(() => {
      els.offlineStatus.textContent = "本地可用";
    });
}
