// ==================== CONFIGURATION ====================
const API_URL = "REMPLACER_PAR_URL_APPS_SCRIPT_/exec"; // URL du Web App Google Apps Script (Code.gs)
const STORAGE_KEY = "enquete_bennes_btp_v1";

// ==================== ICONES SVG (inline, monochromes) ====================
const ICONS = {
  benne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16l-2 10H6L4 8z"/><path d="M4 8L2 5h20l-2 3"/></svg>`,
  camion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="9" width="13" height="7"/><path d="M14 12h5l3 3v1h-8z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>`,
  recyclage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7l3-4 3 4"/><path d="M10 3v9"/><path d="M17 17l-3 4-3-4"/><path d="M14 21v-9"/><path d="M4 14a8 8 0 0116-1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l10 18H2L12 2zm0 6v6m0 3h0"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  print: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`
};

const SECTION_ICON = { A: "recyclage", B: "recyclage", C: "camion", D: "camion", E: "benne", F: "camion", G: "recyclage" };

const ILLUSTRATIONS = {
  benne_8m3: `
    <svg viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 45 L45 25 L175 25 L200 45 Z" fill="none" stroke="var(--color-primary)" stroke-width="4" stroke-linejoin="round"/>
      <rect x="20" y="45" width="180" height="70" rx="6" fill="none" stroke="var(--color-primary)" stroke-width="4"/>
      <line x1="55" y1="49" x2="55" y2="111" stroke="var(--color-primary-light)" stroke-width="2" opacity="0.5"/>
      <line x1="90" y1="49" x2="90" y2="111" stroke="var(--color-primary-light)" stroke-width="2" opacity="0.5"/>
      <line x1="130" y1="49" x2="130" y2="111" stroke="var(--color-primary-light)" stroke-width="2" opacity="0.5"/>
      <line x1="165" y1="49" x2="165" y2="111" stroke="var(--color-primary-light)" stroke-width="2" opacity="0.5"/>
      <rect x="12" y="118" width="20" height="10" rx="2" fill="var(--color-primary)"/>
      <rect x="188" y="118" width="20" height="10" rx="2" fill="var(--color-primary)"/>
      <rect x="78" y="63" width="64" height="28" rx="6" fill="var(--color-accent-btp)"/>
      <text x="110" y="83" font-family="system-ui, sans-serif" font-size="20" font-weight="700" text-anchor="middle" fill="var(--color-text)">8 m³</text>
    </svg>
  `
};

const NSP_LABEL = "Ne souhaite pas répondre";
const ZERO_LABEL = "0";

// ==================== STATE ====================
let QUESTIONS = null;
let state = {
  screen: "intro", // intro | question | recap | end
  currentQuestionId: null,
  answers: {},
  submitting: false,
  submitError: null
};

// Lignes explicitement ouvertes par l'utilisateur (via "Modifier" ou
// "Repondre"), en plus de la revelation progressive automatique.
let expandedRows = new Set();
let expandedRowsQuestionId = null;

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch("questions.json");
  QUESTIONS = await res.json();
  document.getElementById("header-title").textContent = QUESTIONS.meta.title;

  const saved = loadFromStorage();
  if (saved && Object.keys(saved.answers || {}).length > 0) {
    renderIntroWithResume(saved);
  } else {
    renderIntro();
  }

  document.getElementById("btn-prev").addEventListener("click", onPrev);
  document.getElementById("btn-next").addEventListener("click", onNext);
  const printBtn = document.getElementById("btn-print");
  if (printBtn) printBtn.addEventListener("click", () => window.print());
});

// ==================== STORAGE ====================
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers: state.answers, currentQuestionId: state.currentQuestionId }));
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearStorage() { localStorage.removeItem(STORAGE_KEY); }

// ==================== LOGIQUE CONDITIONNELLE ====================
// Supporte deux formes de visible_if :
// - { question, equals } : egalite stricte sur une valeur unique (radio,
//   dropdown...).
// - { question, any_of } : la reponse (tableau, ex: checkbox comme Q19)
//   doit contenir au moins une des valeurs listees. Utilise par ex. pour
//   la question VALOBAT conditionnee aux flux dechets selectionnes.
function isVisible(q) {
  if (!q.visible_if) return true;
  const cond = q.visible_if;
  const sourceVal = state.answers[cond.question];
  if (cond.any_of) {
    const arr = Array.isArray(sourceVal) ? sourceVal : [];
    return cond.any_of.some(opt => arr.includes(opt));
  }
  return sourceVal === cond.equals;
}

function getVisibleQuestions() {
  return QUESTIONS.questions.filter(isVisible);
}

function evaluateGotoEnd() {
  for (const rule of QUESTIONS.logic_rules || []) {
    if (rule.then.action === "goto_end" &&
        state.answers[rule.if.question] === rule.if.equals) {
      return true;
    }
  }
  return false;
}

// ==================== NAVIGATION ====================
function firstQuestion() {
  return getVisibleQuestions()[0];
}

function onNext() {
  const q = QUESTIONS.questions.find(x => x.id === state.currentQuestionId);
  const error = validateQuestion(q);
  if (error) {
    showFieldError(error);
    return;
  }
  saveToStorage();

  if (evaluateGotoEnd()) {
    renderEnd();
    return;
  }

  const visible = getVisibleQuestions();
  const idx = visible.findIndex(x => x.id === q.id);
  if (idx === visible.length - 1) {
    renderRecap();
  } else {
    goToQuestion(visible[idx + 1].id);
  }
}

function onPrev() {
  if (state.screen === "recap") {
    const visible = getVisibleQuestions();
    goToQuestion(visible[visible.length - 1].id);
    return;
  }
  const visible = getVisibleQuestions();
  const idx = visible.findIndex(x => x.id === state.currentQuestionId);
  if (idx <= 0) {
    renderIntro();
  } else {
    goToQuestion(visible[idx - 1].id);
  }
}

function goToQuestion(id) {
  state.currentQuestionId = id;
  state.screen = "question";
  const q = QUESTIONS.questions.find(x => x.id === id);
  renderQuestion(q);
}

// ==================== VALIDATION ====================
function validateExtraField(q) {
  if (!q.extra_field) return null;
  const ef = q.extra_field;
  const val = state.answers[ef.column];
  if (ef.required && (val === undefined || String(val).trim() === "")) {
    return `Le champ "${ef.label}" est obligatoire.`;
  }
  if (val !== undefined && String(val).trim() !== "") {
    if (ef.type === "tel" && !/^\d{10}$/.test(String(val).trim())) {
      return `Le numéro de téléphone doit comporter 10 chiffres, sans espace ni symbole.`;
    }
  }
  return null;
}

function rowConditionMet(sourceVal) {
  if (sourceVal === undefined || sourceVal === null || sourceVal === "") return false;
  if (sourceVal === "0") return false;
  return true;
}

function getVisibleRowIndices(q) {
  return q.rows.map((_, i) => i).filter(i => {
    if (!q.row_source_columns) return true;
    const srcCol = q.row_source_columns[i];
    if (!srcCol) return true;
    return rowConditionMet(state.answers[srcCol]);
  });
}

function validateQuestion(q) {
  if (q.type === "matrix_single") {
    if (q.required) {
      const visibleIdx = getVisibleRowIndices(q);
      for (const i of visibleIdx) {
        const col = q.columns[i];
        if (!state.answers[col]) return "Merci de répondre pour chaque ligne du tableau.";
      }
    }
    return null;
  }

  if (q.type === "matrix_number") {
    const naChecked = q.allow_na && state.answers[q.na_column] === true;
    if (naChecked) return null;
    const visibleIdx = getVisibleRowIndices(q);
    if (visibleIdx.length === 0) return null;
    if (q.required) {
      for (const i of visibleIdx) {
        const col = q.columns[i];
        const v = state.answers[col];
        if (v === undefined || String(v).trim() === "") {
          return "Merci de renseigner un kilométrage pour chaque véhicule affiché, ou de cocher \"Ne souhaite pas répondre\".";
        }
      }
    }
    for (const i of visibleIdx) {
      const col = q.columns[i];
      const v = state.answers[col];
      if (v !== undefined && String(v).trim() !== "" && !/^\d+$/.test(String(v).trim())) {
        return "Merci de saisir uniquement des chiffres, sans espace ni symbole.";
      }
    }
    return null;
  }

  if (q.type === "slider") {
    const col = q.columns[0];
    const v = state.answers[col];
    if (q.required && (v === undefined || v === null || String(v).trim() === "")) {
      return "Merci de positionner le curseur pour répondre à cette question.";
    }
    return null;
  }

  const col = q.columns[0];
  const val = state.answers[col];

  if (q.required) {
    if (q.type === "checkbox") {
      if (!Array.isArray(val) || val.length === 0) return "Merci de sélectionner au moins une option.";
    } else if (val === undefined || val === null || String(val).trim() === "") {
      return "Ce champ est obligatoire.";
    }
  }

  if (val !== undefined && val !== null && String(val).trim() !== "") {
    if (q.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim())) {
      return "Le format de l'adresse e-mail est invalide.";
    }
    if (q.type === "number" && !/^\d+$/.test(String(val).trim())) {
      return "Merci de saisir uniquement des chiffres, sans espace ni symbole (pas de symbole \u20ac, pas de lettres).";
    }
  }

  const extraError = validateExtraField(q);
  if (extraError) return extraError;

  return null;
}

function showFieldError(msg) {
  const el = document.getElementById("field-error-zone");
  if (!el) return;
  el.innerHTML = `<div class="field-error" role="alert">${ICONS.alert}<span>${escapeHtml(msg)}</span></div>`;
}
function clearFieldError() {
  const el = document.getElementById("field-error-zone");
  if (el) el.innerHTML = "";
}

// ==================== HELPER INTRO (paragraphes riches) ====================
function formatInlineBold(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function renderIntroParagraphs() {
  const intro = QUESTIONS.meta.intro;
  const blocks = Array.isArray(intro) ? intro : [{ type: "paragraph", text: intro }];
  return blocks.map(b => {
    if (typeof b === "string") return `<p class="intro-text">${formatInlineBold(b)}</p>`;
    if (b.type === "list") {
      return `<ul class="intro-list">${b.items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
    }
    return `<p class="intro-text">${formatInlineBold(b.text)}</p>`;
  }).join("");
}

// ==================== RENDER : INTRO ====================
function renderIntro() {
  state.screen = "intro";
  toggleNav(false);
  toggleProgress(false);
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="card">
      <span class="meta-duration">Durée estimée : ${escapeHtml(QUESTIONS.meta.estimated_duration_min)} min</span>
      <h1>${escapeHtml(QUESTIONS.meta.title)}</h1>
      ${renderIntroParagraphs()}
      <button class="btn btn--primary" id="btn-start" style="margin-top:16px;">Commencer</button>
    </div>
  `;
  document.getElementById("btn-start").addEventListener("click", () => {
    goToQuestion(firstQuestion().id);
  });
}

function renderIntroWithResume(saved) {
  state.screen = "intro";
  toggleNav(false);
  toggleProgress(false);
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="card">
      <span class="meta-duration">Durée estimée : ${escapeHtml(QUESTIONS.meta.estimated_duration_min)} min</span>
      <h1>${escapeHtml(QUESTIONS.meta.title)}</h1>
      <div class="resume-banner">
        <span>Une réponse en cours a été détectée sur cet appareil.</span>
        <button id="btn-resume">Reprendre où j'en étais</button>
      </div>
      ${renderIntroParagraphs()}
      <button class="btn btn--primary" id="btn-start" style="margin-top:16px;">Recommencer à zéro</button>
    </div>
  `;
  document.getElementById("btn-start").addEventListener("click", () => {
    clearStorage();
    state.answers = {};
    goToQuestion(firstQuestion().id);
  });
  document.getElementById("btn-resume").addEventListener("click", () => {
    state.answers = saved.answers || {};
    const target = saved.currentQuestionId || firstQuestion().id;
    goToQuestion(target);
  });
}

// ==================== RENDER : QUESTION ====================
function renderQuestion(q) {
  toggleNav(true);
  toggleProgress(true);
  updateProgress(q);
  togglePrintButton(false);

  const root = document.getElementById("app-root");
  const icon = ICONS[SECTION_ICON[q.section]] || ICONS.recyclage;
  const sectionTitle = (QUESTIONS.sections.find(s => s.id === q.section) || {}).title || "";

  let fieldHtml = "";
  if (q.type === "radio" && q.display === "chips") fieldHtml = renderRadioChips(q);
  else if (q.type === "radio") fieldHtml = renderRadio(q);
  else if (q.type === "checkbox") fieldHtml = renderCheckbox(q);
  else if (q.type === "dropdown") fieldHtml = renderDropdown(q);
  else if (q.type === "text") fieldHtml = renderText(q, "text");
  else if (q.type === "email") fieldHtml = renderText(q, "email");
  else if (q.type === "number") fieldHtml = renderText(q, "number");
  else if (q.type === "matrix_single") fieldHtml = renderMatrix(q);
  else if (q.type === "matrix_number") fieldHtml = renderMatrixNumber(q);
  else if (q.type === "slider") fieldHtml = renderSlider(q);

  if (q.extra_field) {
    fieldHtml += renderExtraField(q.extra_field);
  }

  let helperText = q.helper || "";
  if (q.type === "checkbox") {
    helperText = helperText ? helperText + " Plusieurs réponses possibles." : "Plusieurs réponses possibles.";
  }

  const illustrationHtml = q.illustration && ILLUSTRATIONS[q.illustration]
    ? `<div class="question-illustration">${ILLUSTRATIONS[q.illustration]}</div>`
    : "";

  const cardClass = q.type === "matrix_single" ? "card card--wide" : "card";

  root.innerHTML = `
    <div class="${cardClass}">
      <div class="section-tag">${icon} ${escapeHtml(sectionTitle)}</div>
      <p class="question-label">${escapeHtml(q.label)}${q.required ? '<span class="question-required">*</span>' : ''}</p>
      ${helperText ? `<p class="question-helper">${escapeHtml(helperText)}</p>` : ""}
      ${q.type === "matrix_single" ? '<p class="matrix-subquestion-hint">Pour chaque élément ci-dessous :</p>' : ""}
      ${illustrationHtml}
      ${fieldHtml}
      <div id="field-error-zone"></div>
    </div>
  `;
  attachFieldHandlers(q);
}

function renderExtraField(ef) {
  const val = state.answers[ef.column] || "";
  const inputmode = ef.type === "tel" ? ' inputmode="numeric" pattern="[0-9]*"' : "";
  return `
    <div class="extra-field">
      <label class="extra-field__label" for="${ef.column}">${escapeHtml(ef.label)}${ef.required ? '<span class="question-required">*</span>' : ''}</label>
      <input class="field-input" id="${ef.column}" type="${ef.type === 'tel' ? 'text' : ef.type}"${inputmode} placeholder="${escapeHtml(ef.placeholder || '')}" value="${escapeHtml(val)}">
    </div>`;
}

function renderRadio(q) {
  const current = q.columns[0];
  const val = state.answers[current];
  let html = `<div class="option-list" role="radiogroup">`;
  q.options.forEach((opt) => {
    const checked = val === opt ? "selected" : "";
    html += `
      <label class="option-block ${checked}" data-value="${escapeHtml(opt)}">
        <input type="radio" name="${current}" value="${escapeHtml(opt)}" ${val === opt ? "checked" : ""}>
        <span class="option-block__label">${escapeHtml(opt)}</span>
        <span class="option-block__check">${ICONS.check}</span>
      </label>`;
  });
  if (q.allow_other) {
    const otherVal = state.answers[current + "_autre"] || "";
    const otherChecked = val === "Autre" ? "selected" : "";
    html += `
      <label class="option-block ${otherChecked}" data-value="Autre">
        <input type="radio" name="${current}" value="Autre" ${val === "Autre" ? "checked" : ""}>
        <span class="option-block__label">Autre</span>
        <span class="option-block__check">${ICONS.check}</span>
      </label>
      <input type="text" class="field-input option-other-input" id="${current}_autre" placeholder="Précisez..." value="${escapeHtml(otherVal)}" ${val === "Autre" ? "" : "hidden"}>`;
  }
  html += `</div>`;
  return html;
}

function renderRadioChips(q) {
  const current = q.columns[0];
  const val = state.answers[current];
  let html = `<div class="chips-wrap">`;
  q.options.forEach(opt => {
    const sel = val === opt ? "selected" : "";
    const nspClass = opt === NSP_LABEL ? " volume-chip--nsp" : "";
    html += `<label class="volume-chip${nspClass} ${sel}" data-value="${escapeHtml(opt)}">
      <input type="radio" name="${current}" value="${escapeHtml(opt)}" ${val === opt ? "checked" : ""}>${escapeHtml(opt)}</label>`;
  });
  html += `</div>`;
  return html;
}

function renderCheckbox(q) {
  const current = q.columns[0];
  const val = Array.isArray(state.answers[current]) ? state.answers[current] : [];
  let html = `<div class="option-list">`;
  q.options.forEach(opt => {
    const checked = val.includes(opt) ? "selected" : "";
    html += `
      <label class="option-block ${checked}" data-value="${escapeHtml(opt)}">
        <input type="checkbox" name="${current}" value="${escapeHtml(opt)}" ${val.includes(opt) ? "checked" : ""}>
        <span class="option-block__label">${escapeHtml(opt)}</span>
        <span class="option-block__check">${ICONS.check}</span>
      </label>`;
  });
  if (q.allow_other) {
    const otherVal = state.answers[current + "_autre"] || "";
    const otherChecked = val.includes("Autre") ? "selected" : "";
    html += `
      <label class="option-block ${otherChecked}" data-value="Autre">
        <input type="checkbox" name="${current}" value="Autre" ${val.includes("Autre") ? "checked" : ""}>
        <span class="option-block__label">Autre</span>
        <span class="option-block__check">${ICONS.check}</span>
      </label>
      <input type="text" class="field-input option-other-input" id="${current}_autre" placeholder="Précisez..." value="${escapeHtml(otherVal)}" ${val.includes("Autre") ? "" : "hidden"}>`;
  }
  html += `</div>`;
  return html;
}

function renderDropdown(q) {
  const current = q.columns[0];
  const val = state.answers[current] || "";
  let html = `<select class="field-input" id="${current}">`;
  html += `<option value="">-- Sélectionner --</option>`;
  q.options.forEach(opt => {
    html += `<option value="${escapeHtml(opt)}" ${val === opt ? "selected" : ""}>${escapeHtml(opt)}</option>`;
  });
  html += `</select>`;
  return html;
}

function renderText(q, type) {
  const current = q.columns[0];
  const val = state.answers[current] || "";
  const inputmode = type === "number" ? ' inputmode="numeric" pattern="[0-9]*"' : "";
  const inputType = type === "number" ? "text" : (type || "text");
  return `<input class="field-input" id="${current}" type="${inputType}"${inputmode} value="${escapeHtml(val)}" placeholder="${type === "email" ? "nom@entreprise.fr" : ""}">`;
}

function renderSlider(q) {
  const current = q.columns[0];
  const min = q.min !== undefined ? q.min : 0;
  const max = q.max !== undefined ? q.max : 100;
  const step = q.step !== undefined ? q.step : 1;
  const tickStep = q.tick_step || Math.round((max - min) / 4);
  const minorTickStep = q.minor_tick_step || Math.round((max - min) / 10);
  const stored = state.answers[current];
  const hasValue = stored !== undefined && stored !== null && String(stored).trim() !== "";
  const displayVal = hasValue ? stored : Math.round((min + max) / 2);

  let minorTicksHtml = "";
  if (minorTickStep > 0) {
    for (let t = min; t <= max; t += minorTickStep) {
      if (t % tickStep === 0) continue;
      const pct = ((t - min) / (max - min)) * 100;
      minorTicksHtml += `<span class="slider-field__tick slider-field__tick--minor" style="left:${pct}%;"></span>`;
    }
  }

  let majorTicksHtml = "";
  if (tickStep > 0) {
    for (let t = min; t <= max; t += tickStep) {
      const pct = ((t - min) / (max - min)) * 100;
      majorTicksHtml += `<span class="slider-field__tick slider-field__tick--major" style="left:${pct}%;"></span>`;
    }
  }

  let majorLabelsHtml = "";
  if (tickStep > 0) {
    for (let t = min; t <= max; t += tickStep) {
      const pct = ((t - min) / (max - min)) * 100;
      majorLabelsHtml += `<span class="slider-field__tick-label" style="left:${pct}%;">${t}${q.unit || ""}</span>`;
    }
  }

  return `
    <div class="slider-field">
      <div class="slider-field__value" id="${current}_value">${hasValue ? displayVal : "—"}${q.unit || ""}</div>
      <div class="slider-field__track-wrap">
        <input class="slider-field__input" id="${current}" type="range" min="${min}" max="${max}" step="${step}" value="${displayVal}" data-touched="${hasValue ? "true" : "false"}">
        <div class="slider-field__ticks">${minorTicksHtml}${majorTicksHtml}</div>
      </div>
      <div class="slider-field__tick-labels">${majorLabelsHtml}</div>
    </div>`;
}

// ==================== MATRICE SIMPLIFIEE / GAMIFIEE ====================
function extractVolume(label) {
  const m = label.match(/(\d+)\s*m\u00b3/);
  if (!m) return null;
  let v = parseInt(m[1], 10);
  if (/plus de/i.test(label)) v += 10;
  return v;
}

function iconSizeForVolume(v) {
  const vmin = 3, vmax = 40;
  const pxmin = 16, pxmax = 32;
  const c = Math.max(vmin, Math.min(vmax, v));
  return Math.round(pxmin + (c - vmin) / (vmax - vmin) * (pxmax - pxmin));
}

function ensureExpandedRowsFor(qid) {
  if (expandedRowsQuestionId !== qid) {
    expandedRows = new Set();
    expandedRowsQuestionId = qid;
  }
}

// Revelation strictement sequentielle : un seul element visible a la
// fois (le premier non repondu), avec une animation d'apparition en
// fondu. Les elements pas encore atteints ne sont pas rendus du tout
// (contrairement a l'ancienne version qui les listait en "Repondre"),
// pour eviter l'effet de liste longue qui peut decourager. Un compteur
// "Element X sur N" indique la progression sans tout devoiler d'un coup.
function renderMatrix(q) {
  ensureExpandedRowsFor(q.id);

  const rowIndices = getVisibleRowIndices(q);

  if (rowIndices.length === 0) {
    return `<p class="question-helper" style="margin-top:0;">Aucune ligne à afficher (condition non remplie pour l'instant).</p>`;
  }

  const totalRows = rowIndices.length;

  let firstUnansweredDisplayIdx = -1;
  rowIndices.forEach((i, displayIdx) => {
    if (firstUnansweredDisplayIdx === -1 && !state.answers[q.columns[i]]) {
      firstUnansweredDisplayIdx = displayIdx;
    }
  });
  const currentPosition = firstUnansweredDisplayIdx === -1 ? totalRows : firstUnansweredDisplayIdx + 1;

  let counterHtml = `<div class="sequential-counter">Élément ${currentPosition} sur ${totalRows}</div>`;

  let html = `<div class="volume-matrix volume-matrix--sequential">`;
  rowIndices.forEach((i, displayIdx) => {
    const rowLabel = q.rows[i];
    const col = q.columns[i];
    const val = state.answers[col];
    const isAnswered = !!val;
    const manuallyOpened = expandedRows.has(col);
    const isAutoFirst = displayIdx === firstUnansweredDisplayIdx;
    const isExpanded = manuallyOpened || (!isAnswered && isAutoFirst) || (isAnswered && manuallyOpened);

    if (!isAnswered && !isAutoFirst && !manuallyOpened) {
      return;
    }

    const volume = extractVolume(rowLabel);
    const iconHtml = volume !== null
      ? `<span class="volume-row__icon" style="width:${iconSizeForVolume(volume)}px;height:${iconSizeForVolume(volume)}px;">${ICONS.benne}</span>`
      : "";
    const indexBadge = volume === null
      ? `<span class="volume-row__index">${displayIdx + 1}</span>`
      : "";

    if (isAnswered && !isExpanded) {
      let answerClass = "";
      if (val === NSP_LABEL) answerClass = " volume-row__answer--nsp";
      else if (val === ZERO_LABEL) answerClass = " volume-row__answer--zero";
      html += `
        <div class="volume-row volume-row--collapsed volume-row--fade-in">
          <div class="volume-row--collapsed__inline">
            ${iconHtml}${indexBadge}
            <span class="volume-row__label">${escapeHtml(rowLabel)}</span>
            <span class="volume-row--collapsed__sep">—</span>
            <span class="volume-row__answer${answerClass}">${escapeHtml(val)}</span>
            <button type="button" class="volume-row__edit" data-col="${col}">${ICONS.edit} Modifier</button>
          </div>
        </div>`;
      return;
    }

    html += `
      <div class="volume-row volume-row--fade-in">
        <div class="volume-row__head">
          ${iconHtml}${indexBadge}
          <span class="volume-row__label">${escapeHtml(rowLabel)}</span>
        </div>
        <div class="volume-row__chips">`;
    q.options.forEach(opt => {
      const sel = val === opt ? "selected" : "";
      let nspClass = "";
      if (opt === NSP_LABEL) nspClass = " volume-chip--nsp";
      else if (opt === ZERO_LABEL && sel) nspClass = " volume-chip--zero";
      html += `<label class="volume-chip${nspClass} ${sel}" data-col="${col}" data-value="${escapeHtml(opt)}">
            <input type="radio" name="${col}" value="${escapeHtml(opt)}" ${val === opt ? "checked" : ""}>${escapeHtml(opt)}</label>`;
    });
    html += `</div></div>`;
  });
  html += `</div>`;
  return counterHtml + html;
}

// Matrice numerique (ex: Q10 kilometres annuels) avec la meme revelation
// progressive que renderMatrix : les lignes sont filtrees par
// row_source_columns (ex: Q8), seule la premiere ligne eligible non
// repondue s'ouvre automatiquement, les autres restent compactes en
// attente et peuvent etre ouvertes via "Répondre".
function renderMatrixNumber(q) {
  ensureExpandedRowsFor(q.id);

  const naChecked = q.allow_na && state.answers[q.na_column] === true;
  const rowIndices = getVisibleRowIndices(q);

  if (rowIndices.length === 0) {
    return `<p class="question-helper" style="margin-top:0;">Aucune ligne à afficher (aucun véhicule concerné pour l'instant).</p>`;
  }

  let firstUnansweredDisplayIdx = -1;
  if (!naChecked) {
    rowIndices.forEach((i, displayIdx) => {
      const col = q.columns[i];
      const v = state.answers[col];
      if (firstUnansweredDisplayIdx === -1 && (v === undefined || String(v).trim() === "")) {
        firstUnansweredDisplayIdx = displayIdx;
      }
    });
  }

  let html = `<div class="volume-matrix">`;
  const totalRows = rowIndices.length;
  const lastRowSize = totalRows % 2 === 0 ? 2 : 1;
  const lastRowStart = totalRows - lastRowSize;

  rowIndices.forEach((i, displayIdx) => {
    const rowLabel = q.rows[i];
    const col = q.columns[i];
    const rawVal = state.answers[col];
    const isAnswered = !naChecked && rawVal !== undefined && String(rawVal).trim() !== "";
    const manuallyOpened = expandedRows.has(col);
    const isAutoFirst = displayIdx === firstUnansweredDisplayIdx;
    const isPending = !naChecked && !isAnswered && !isAutoFirst && !manuallyOpened;
    const isExpanded = naChecked ? false : (manuallyOpened || (!isAnswered && isAutoFirst));

    const isLastRow = displayIdx >= lastRowStart;
    const isFullWidth = lastRowSize === 1 && displayIdx === lastRowStart;
    const extraClass = (isLastRow ? " volume-row--noborder" : "") + (isFullWidth ? " volume-row--full" : "");
    const indexBadge = `<span class="volume-row__index">${displayIdx + 1}</span>`;

    if (naChecked) {
      html += `
        <div class="volume-row volume-row--collapsed${extraClass}">
          <div class="volume-row--collapsed__inline">
            ${indexBadge}
            <span class="volume-row__label">${escapeHtml(rowLabel)}</span>
            <span class="volume-row--collapsed__sep">—</span>
            <span class="volume-row__answer volume-row__answer--nsp">${escapeHtml(q.na_label || NSP_LABEL)}</span>
          </div>
        </div>`;
      return;
    }

    if (isPending) {
      html += `
        <div class="volume-row volume-row--pending${extraClass}">
          <div class="volume-row--collapsed__inline">
            ${indexBadge}
            <span class="volume-row__label volume-row__label--pending">${escapeHtml(rowLabel)}</span>
            <button type="button" class="volume-row__open" data-col="${col}">Répondre ${ICONS.chevron}</button>
          </div>
        </div>`;
      return;
    }

    if (isAnswered && !isExpanded) {
      html += `
        <div class="volume-row volume-row--collapsed${extraClass}">
          <div class="volume-row--collapsed__inline">
            ${indexBadge}
            <span class="volume-row__label">${escapeHtml(rowLabel)}</span>
            <span class="volume-row--collapsed__sep">—</span>
            <span class="volume-row__answer">${escapeHtml(String(rawVal))} km/an</span>
            <button type="button" class="volume-row__edit" data-col="${col}">${ICONS.edit} Modifier</button>
          </div>
        </div>`;
      return;
    }

    const val = rawVal || "";
    html += `
      <div class="volume-row${extraClass}">
        <div class="volume-row__head">
          ${indexBadge}
          <span class="volume-row__label">${escapeHtml(rowLabel)}</span>
        </div>
        <div class="matrix-number-row matrix-number-row--inline">
          <input class="field-input matrix-number-row__input" id="${col}" data-col="${col}" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="km/an" value="${escapeHtml(val)}">
          <span class="matrix-number-row__unit">km/an</span>
        </div>
      </div>`;
  });
  html += `</div>`;

  if (q.allow_na) {
    html += `
      <label class="option-block na-checkbox ${naChecked ? "selected" : ""}" style="margin-top:12px;">
        <input type="checkbox" id="${q.na_column}" ${naChecked ? "checked" : ""}>
        <span class="option-block__label">${escapeHtml(q.na_label || "Ne souhaite pas répondre")}</span>
        <span class="option-block__check">${ICONS.check}</span>
      </label>`;
  }
  return html;
}

// ==================== HANDLERS ====================
function attachFieldHandlers(q) {
  clearFieldError();
  const current = q.columns[0];

  if (q.type === "radio") {
    document.querySelectorAll(`.option-block input[type="radio"], .chips-wrap .volume-chip input[type="radio"]`).forEach(input => {
      input.addEventListener("change", () => {
        state.answers[current] = input.value;
        if (q.allow_other) {
          const otherInput = document.getElementById(current + "_autre");
          if (otherInput) state.answers[current + "_autre"] = otherInput.value;
        }
        renderQuestion(q);
      });
    });
    const otherInput = document.getElementById(current + "_autre");
    if (otherInput) otherInput.addEventListener("input", () => { state.answers[current + "_autre"] = otherInput.value; });
  }

  if (q.type === "checkbox") {
    document.querySelectorAll(`.option-block input[type="checkbox"]`).forEach(input => {
      input.addEventListener("change", () => {
        let arr = Array.isArray(state.answers[current]) ? state.answers[current].slice() : [];
        if (input.checked) { if (!arr.includes(input.value)) arr.push(input.value); }
        else { arr = arr.filter(v => v !== input.value); }
        state.answers[current] = arr;
        renderQuestion(q);
      });
    });
    const otherInput = document.getElementById(current + "_autre");
    if (otherInput) otherInput.addEventListener("input", () => { state.answers[current + "_autre"] = otherInput.value; });
  }

  if (q.type === "dropdown") {
    const sel = document.getElementById(current);
    sel.addEventListener("change", () => { state.answers[current] = sel.value; });
  }

  if (q.type === "text" || q.type === "email" || q.type === "number") {
    const input = document.getElementById(current);
    input.addEventListener("input", () => { state.answers[current] = input.value; });
  }

  if (q.type === "matrix_single") {
    document.querySelectorAll(`.volume-row .volume-chip input[type="radio"]`).forEach(input => {
      input.addEventListener("change", () => {
        state.answers[input.name] = input.value;
        expandedRows.delete(input.name);
        renderQuestion(q);
      });
    });
    document.querySelectorAll(`.volume-row__edit`).forEach(btn => {
      btn.addEventListener("click", () => {
        expandedRows.add(btn.dataset.col);
        renderQuestion(q);
      });
    });
    document.querySelectorAll(`.volume-row__open`).forEach(btn => {
      btn.addEventListener("click", () => {
        expandedRows.add(btn.dataset.col);
        renderQuestion(q);
      });
    });
  }

  if (q.type === "matrix_number") {
    document.querySelectorAll(`.matrix-number-row__input[data-col]`).forEach(input => {
      input.addEventListener("input", () => { state.answers[input.dataset.col] = input.value; });
      input.addEventListener("blur", () => {
        if (state.answers[input.dataset.col] && String(state.answers[input.dataset.col]).trim() !== "") {
          expandedRows.delete(input.dataset.col);
          renderQuestion(q);
        }
      });
    });
    document.querySelectorAll(`.volume-row__edit`).forEach(btn => {
      btn.addEventListener("click", () => {
        expandedRows.add(btn.dataset.col);
        renderQuestion(q);
      });
    });
    document.querySelectorAll(`.volume-row__open`).forEach(btn => {
      btn.addEventListener("click", () => {
        expandedRows.add(btn.dataset.col);
        renderQuestion(q);
      });
    });
    if (q.allow_na) {
      const naInput = document.getElementById(q.na_column);
      if (naInput) naInput.addEventListener("change", () => {
        state.answers[q.na_column] = naInput.checked;
        if (naInput.checked) {
          q.columns.forEach(col => { state.answers[col] = ""; });
        }
        renderQuestion(q);
      });
    }
  }

  if (q.type === "slider") {
    const slider = document.getElementById(current);
    const valueLabel = document.getElementById(current + "_value");
    if (slider) {
      slider.addEventListener("input", () => {
        state.answers[current] = slider.value;
        if (valueLabel) valueLabel.textContent = `${slider.value}${q.unit || ""}`;
        slider.dataset.touched = "true";
      });
    }
  }

  if (q.extra_field) {
    const efInput = document.getElementById(q.extra_field.column);
    if (efInput) efInput.addEventListener("input", () => { state.answers[q.extra_field.column] = efInput.value; });
  }
}

// ==================== PROGRESS (jalons par section, formulation professionnelle) ====================
function milestoneMessage(pct) {
  if (pct < 25) return "Vos réponses contribuent à mieux connaître la filière.";
  if (pct < 50) return "Vous progressez efficacement.";
  if (pct < 75) return "Encore quelques questions.";
  if (pct < 100) return "Plus que quelques instants.";
  return "Dernière question.";
}

function renderMilestoneDots(sectionIndex, totalSections) {
  const container = document.getElementById("milestone-dots");
  if (!container) return;
  let html = "";
  for (let i = 0; i < totalSections; i++) {
    const cls = i < sectionIndex ? "done" : (i === sectionIndex ? "active" : "");
    html += `<span class="milestone-dot ${cls}"></span>`;
  }
  container.innerHTML = html;
}

function updateProgress(q) {
  const visible = getVisibleQuestions();
  const idx = visible.findIndex(x => x.id === q.id);
  const pct = Math.round(((idx + 1) / visible.length) * 100);
  document.getElementById("progress-bar").style.width = pct + "%";

  const sections = QUESTIONS.sections;
  const sectionIndex = Math.max(0, sections.findIndex(s => s.id === q.section));
  renderMilestoneDots(sectionIndex, sections.length);

  document.getElementById("progress-label").textContent =
    `Étape ${sectionIndex + 1}/${sections.length} — ${milestoneMessage(pct)}`;
}
function toggleProgress(show) { document.getElementById("progress-wrap").hidden = !show; }
function toggleNav(show) {
  document.getElementById("nav-buttons").hidden = !show;
  document.getElementById("btn-prev").style.display = show ? "" : "none";
  document.getElementById("btn-next").textContent = "Suivant";
}
function togglePrintButton(show) {
  const printBtn = document.getElementById("btn-print");
  if (!printBtn) return;
  printBtn.hidden = !show;
  if (show) printBtn.innerHTML = `${ICONS.print} Imprimer`;
}

// ==================== RECAP ====================
function renderRecap() {
  state.screen = "recap";
  toggleProgress(false);
  toggleNav(true);
  togglePrintButton(true);
  document.getElementById("btn-next").textContent = "Envoyer mes réponses";

  const visible = getVisibleQuestions();
  const root = document.getElementById("app-root");
  let items = "";
  visible.forEach(q => {
    let display = "";
    if (q.type === "matrix_single") {
      const rowIndices = getVisibleRowIndices(q);
      display = rowIndices.map(i => `${q.rows[i]} : ${state.answers[q.columns[i]] || "—"}`).join("<br>");
      if (!display) display = "—";
    } else if (q.type === "matrix_number") {
      if (q.allow_na && state.answers[q.na_column] === true) {
        display = q.na_label || "Ne souhaite pas répondre";
      } else {
        const visibleIdx = getVisibleRowIndices(q);
        display = visibleIdx.map(i => `${q.rows[i]} : ${state.answers[q.columns[i]] || "—"} km/an`).join("<br>");
        if (!display) display = "—";
      }
    } else if (q.type === "slider") {
      const col = q.columns[0];
      const v = state.answers[col];
      display = (v !== undefined && v !== null && String(v).trim() !== "") ? `${v}${q.unit || ""}` : "—";
    } else {
      const col = q.columns[0];
      const val = state.answers[col];
      if (Array.isArray(val)) display = val.join(", ") || "—";
      else display = val || "—";
      if (q.allow_other && val === "Autre" && state.answers[col + "_autre"]) {
        display += ` (${state.answers[col + "_autre"]})`;
      }
    }
    if (q.extra_field) {
      const efVal = state.answers[q.extra_field.column];
      display += `<br>${escapeHtml(q.extra_field.label)} : ${efVal ? escapeHtml(efVal) : "—"}`;
    }
    items += `
      <div class="recap-item">
        <div class="recap-item__q">${escapeHtml(q.label)}</div>
        <div class="recap-item__a">${display}</div>
        <button class="recap-edit-link" data-qid="${q.id}">Modifier</button>
      </div>`;
  });

  root.innerHTML = `
    <div class="card" id="recap-card">
      <h1>Relire mes réponses</h1>
      <p class="intro-text">Vérifiez vos réponses avant l'envoi définitif.</p>
      ${items}
      ${state.submitError ? `<div class="field-error" role="alert">${ICONS.alert}<span>${escapeHtml(state.submitError)}</span></div>` : ""}
    </div>
  `;
  document.querySelectorAll(".recap-edit-link").forEach(btn => {
    btn.addEventListener("click", () => goToQuestion(btn.dataset.qid));
  });
}

// ==================== SUBMIT ====================
function onSubmit() {
  state.submitting = true;
  state.submitError = null;
  const root = document.getElementById("app-root");
  root.innerHTML = `<div class="card" style="text-align:center;"><div class="spinner"></div><p class="intro-text">Envoi en cours...</p></div>`;
  toggleNav(false);
  togglePrintButton(false);

  const payload = buildPayload();

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(data => {
      if (data.status === "success") {
        clearStorage();
        renderEnd();
      } else {
        state.submitError = data.message || "Une erreur est survenue lors de l'envoi.";
        renderRecap();
      }
    })
    .catch(() => {
      state.submitError = "Impossible de contacter le serveur. Vos réponses sont conservées, vous pouvez réessayer.";
      renderRecap();
    })
    .finally(() => { state.submitting = false; });
}

function buildPayload() {
  const payload = Object.assign({}, state.answers);
  QUESTIONS.questions.forEach(q => {
    if (q.allow_other) {
      const col = q.columns[0];
      const otherKey = col + "_autre";
      if (payload[otherKey]) {
        if (Array.isArray(payload[col])) {
          payload[col] = payload[col].map(v => v === "Autre" ? `Autre : ${payload[otherKey]}` : v);
        } else if (payload[col] === "Autre") {
          payload[col] = `Autre : ${payload[otherKey]}`;
        }
        delete payload[otherKey];
      }
    }
    if (q.type === "matrix_number" && q.allow_na && payload[q.na_column] === true) {
      q.columns.forEach(col => { payload[col] = "Ne souhaite pas répondre"; });
      delete payload[q.na_column];
    } else if (q.type === "matrix_number" && q.allow_na) {
      delete payload[q.na_column];
    }
  });
  payload.submission_id = generateUUID();
  return payload;
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ==================== END SCREEN ====================
function renderEnd() {
  state.screen = "end";
  toggleProgress(false);
  toggleNav(false);
  togglePrintButton(false);
  const root = document.getElementById("app-root");
  root.innerHTML = `
    <div class="end-screen">
      <div class="end-screen__card">
        <div class="end-screen__icon">${ICONS.recyclage}</div>
        <div class="end-screen__title">Merci pour votre réponse</div>
        <p class="end-screen__message">${escapeHtml(QUESTIONS.end_screen.message)}</p>
        <button class="btn btn--primary" id="btn-share" style="max-width:280px;">Copier le lien du questionnaire</button>
      </div>
    </div>
  `;
  document.getElementById("btn-share").addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const btn = document.getElementById("btn-share");
      btn.textContent = "Lien copié !";
      setTimeout(() => { btn.textContent = "Copier le lien du questionnaire"; }, 2000);
    });
  });
}

// ==================== UTILS ====================
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  const btnNext = document.getElementById("btn-next");
  btnNext.addEventListener("click", (e) => {
    if (state.screen === "recap" && !state.submitting) {
      e.stopImmediatePropagation();
      onSubmit();
    }
  }, true);
});
