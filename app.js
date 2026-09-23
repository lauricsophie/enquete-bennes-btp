// ==================== CONFIGURATION ====================
const API_URL = "REMPLACER_PAR_URL_APPS_SCRIPT_/exec"; // URL du Web App Google Apps Script (Code.gs)
const STORAGE_KEY = "enquete_bennes_btp_v1";

// ==================== ICONES SVG (inline, monochromes) ====================
const ICONS = {
  benne: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16l-2 10H6L4 8z"/><path d="M4 8L2 5h20l-2 3"/></svg>`,
  camion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="9" width="13" height="7"/><path d="M14 12h5l3 3v1h-8z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>`,
  recyclage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7l3-4 3 4"/><path d="M10 3v9"/><path d="M17 17l-3 4-3-4"/><path d="M14 21v-9"/><path d="M4 14a8 8 0 0116-1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l10 18H2L12 2zm0 6v6m0 3h0"/></svg>`
};

const SECTION_ICON = { A: "recyclage", B: "recyclage", C: "camion", D: "camion", E: "benne", F: "camion", G: "recyclage" };

// ==================== STATE ====================
let QUESTIONS = null;
let state = {
  screen: "intro", // intro | question | recap | end
  currentQuestionId: null,
  answers: {},
  submitting: false,
  submitError: null
};

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
function isVisible(q) {
  if (!q.visible_if) return true;
  return state.answers[q.visible_if.question] === q.visible_if.equals;
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
function validateQuestion(q) {
  if (q.type === "matrix_single") {
    if (q.required) {
      for (const col of q.columns) {
        if (!state.answers[col]) return "Merci de répondre pour chaque ligne du tableau.";
      }
    }
    return null;
  }

  if (q.type === "matrix_number") {
    const naChecked = q.allow_na && state.answers[q.na_column] === true;
    if (naChecked) return null;
    if (q.required) {
      const hasAtLeastOne = q.columns.some(col => state.answers[col] !== undefined && String(state.answers[col]).trim() !== "");
      if (!hasAtLeastOne) return "Merci de renseigner au moins une valeur, ou de cocher \"Ne souhaite pas répondre\".";
    }
    for (const col of q.columns) {
      const v = state.answers[col];
      if (v !== undefined && String(v).trim() !== "" && !/^\d+$/.test(String(v).trim())) {
        return "Merci de saisir uniquement des chiffres, sans espace ni symbole.";
      }
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
    if (col === "q3_siret" && !/^\d{14}$/.test(String(val).trim())) {
      return "Le SIRET doit comporter exactement 14 chiffres.";
    }
    if (q.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim())) {
      return "Le format de l'adresse e-mail est invalide.";
    }
    if (q.type === "number" && !/^\d+$/.test(String(val).trim())) {
      return "Merci de saisir uniquement des chiffres, sans espace ni symbole (pas de symbole \u20ac, pas de lettres).";
    }
  }
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
// meta.intro accepte :
// - une chaine simple (retrocompatibilite)
// - un tableau de blocs { type: "paragraph"|"list", text|items }
//   Le texte d'un paragraphe peut contenir **mots en gras**.
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

  // Note d'aide : ajout automatique de "Plusieurs réponses possibles." pour les cases à cocher
  let helperText = q.helper || "";
  if (q.type === "checkbox") {
    helperText = helperText ? helperText + " Plusieurs réponses possibles." : "Plusieurs réponses possibles.";
  }

  root.innerHTML = `
    <div class="card">
      <div class="section-tag">${icon} ${escapeHtml(sectionTitle)}</div>
      <p class="question-label">${escapeHtml(q.label)}${q.required ? '<span class="question-required">*</span>' : ''}</p>
      ${helperText ? `<p class="question-helper">${escapeHtml(helperText)}</p>` : ""}
      ${fieldHtml}
      <div id="field-error-zone"></div>
    </div>
  `;
  attachFieldHandlers(q);
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
    html += `<label class="volume-chip ${sel}" data-value="${escapeHtml(opt)}">
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
  const pxmin = 18, pxmax = 42;
  const c = Math.max(vmin, Math.min(vmax, v));
  return Math.round(pxmin + (c - vmin) / (vmax - vmin) * (pxmax - pxmin));
}

function renderMatrix(q) {
  let html = `<div class="volume-matrix">`;
  q.rows.forEach((rowLabel, i) => {
    const col = q.columns[i];
    const val = state.answers[col];
    const volume = extractVolume(rowLabel);
    const iconHtml = volume !== null
      ? `<span class="volume-row__icon" style="width:${iconSizeForVolume(volume)}px;height:${iconSizeForVolume(volume)}px;">${ICONS.benne}</span>`
      : "";
    html += `
      <div class="volume-row">
        <div class="volume-row__head">
          ${iconHtml}
          <span class="volume-row__label">${escapeHtml(rowLabel)}</span>
        </div>
        <div class="volume-row__chips">`;
    q.options.forEach(opt => {
      const sel = val === opt ? "selected" : "";
      html += `<label class="volume-chip ${sel}" data-col="${col}" data-value="${escapeHtml(opt)}">
            <input type="radio" name="${col}" value="${escapeHtml(opt)}" ${val === opt ? "checked" : ""}>${escapeHtml(opt)}</label>`;
    });
    html += `</div></div>`;
  });
  html += `</div>`;
  return html;
}

function renderMatrixNumber(q) {
  const naChecked = q.allow_na && state.answers[q.na_column] === true;
  let html = `<div class="matrix-number">`;
  q.rows.forEach((rowLabel, i) => {
    const col = q.columns[i];
    const val = naChecked ? "" : (state.answers[col] || "");
    html += `
      <div class="matrix-number-row">
        <label class="matrix-number-row__label" for="${col}">${escapeHtml(rowLabel)}</label>
        <input class="field-input matrix-number-row__input" id="${col}" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="km" value="${escapeHtml(val)}" ${naChecked ? "disabled" : ""}>
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
        renderQuestion(q);
      });
    });
  }

  if (q.type === "matrix_number") {
    q.columns.forEach(col => {
      const input = document.getElementById(col);
      if (input) input.addEventListener("input", () => { state.answers[col] = input.value; });
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
}

// ==================== PROGRESS (jalons par section, pas de compteur brut) ====================
function milestoneMessage(pct) {
  if (pct < 25) return "C'est parti !";
  if (pct < 50) return "Vous avancez bien !";
  if (pct < 75) return "Plus qu'une petite ligne droite !";
  if (pct < 100) return "Presque terminé !";
  return "Dernière question !";
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
  const sectionTitle = sections[sectionIndex] ? sections[sectionIndex].title : "";
  renderMilestoneDots(sectionIndex, sections.length);

  document.getElementById("progress-label").textContent =
    `Étape ${sectionIndex + 1}/${sections.length} · ${sectionTitle} — ${milestoneMessage(pct)}`;
}
function toggleProgress(show) { document.getElementById("progress-wrap").hidden = !show; }
function toggleNav(show) {
  document.getElementById("nav-buttons").hidden = !show;
  document.getElementById("btn-prev").style.display = show ? "" : "none";
  document.getElementById("btn-next").textContent = "Suivant";
}

// ==================== RECAP ====================
function renderRecap() {
  state.screen = "recap";
  toggleProgress(false);
  toggleNav(true);
  document.getElementById("btn-next").textContent = "Envoyer mes réponses";

  const visible = getVisibleQuestions();
  const root = document.getElementById("app-root");
  let items = "";
  visible.forEach(q => {
    let display = "";
    if (q.type === "matrix_single") {
      display = q.rows.map((rowLabel, i) => `${rowLabel} : ${state.answers[q.columns[i]] || "—"}`).join("<br>");
    } else if (q.type === "matrix_number") {
      if (q.allow_na && state.answers[q.na_column] === true) {
        display = q.na_label || "Ne souhaite pas répondre";
      } else {
        display = q.rows.map((rowLabel, i) => `${rowLabel} : ${state.answers[q.columns[i]] || "—"} km`).join("<br>");
      }
    } else {
      const col = q.columns[0];
      const val = state.answers[col];
      if (Array.isArray(val)) display = val.join(", ") || "—";
      else display = val || "—";
      if (q.allow_other && val === "Autre" && state.answers[col + "_autre"]) {
        display += ` (${state.answers[col + "_autre"]})`;
      }
    }
    items += `
      <div class="recap-item">
        <div class="recap-item__q">${escapeHtml(q.label)}</div>
        <div class="recap-item__a">${display}</div>
        <button class="recap-edit-link" data-qid="${q.id}">Modifier</button>
      </div>`;
  });

  root.innerHTML = `
    <div class="card">
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

// Sur l'écran récapitulatif, le bouton "Suivant" devient "Envoyer mes réponses"
document.addEventListener("DOMContentLoaded", () => {
  const btnNext = document.getElementById("btn-next");
  btnNext.addEventListener("click", (e) => {
    if (state.screen === "recap" && !state.submitting) {
      e.stopImmediatePropagation();
      onSubmit();
    }
  }, true);
});
