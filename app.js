/* global CONFIG */

const state = {
  data: null,
  teamKey: null,
  person: null,
  scores: {}
};

const els = {
  teamSelect: document.getElementById("teamSelect"),
  personSelect: document.getElementById("personSelect"),
  teamTitle: document.getElementById("teamTitle"),
  teamSpeech: document.getElementById("teamSpeech"),
  questions: document.getElementById("questions"),
  progressText: document.getElementById("progressText"),
  averageText: document.getElementById("averageText"),
  statusText: document.getElementById("statusText"),
  message: document.getElementById("message"),
  resetBtn: document.getElementById("resetBtn"),
  sendBtn: document.getElementById("sendBtn"),
  downloadCsvBtn: document.getElementById("downloadCsvBtn"),
  radarCanvas: document.getElementById("radarCanvas")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const res = await fetch("./data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar data.json (${res.status})`);

    state.data = await res.json();

    populateTeams();
    bindEvents();

    const firstTeam = Object.keys(state.data.teams || {})[0];
    if (firstTeam) {
      els.teamSelect.value = firstTeam;
      onTeamChange();
    }
  } catch (err) {
    showMessage(`Error cargando la encuesta: ${err.message}`, "error");
  }
}

function bindEvents() {
  els.teamSelect.addEventListener("change", onTeamChange);
  els.personSelect.addEventListener("change", onPersonChange);
  els.resetBtn.addEventListener("click", resetCurrent);
  els.sendBtn.addEventListener("click", sendAllToRepo);
  els.downloadCsvBtn.addEventListener("click", downloadCsv);
}

function populateTeams() {
  const teams = state.data.teams || {};
  els.teamSelect.innerHTML = Object.entries(teams)
    .map(([key, team]) => `<option value="${escapeHtml(key)}">${escapeHtml(team.title || key)}</option>`)
    .join("");
}

function onTeamChange() {
  state.teamKey = els.teamSelect.value;
  const team = getCurrentTeam();

  els.teamTitle.textContent = team.title || "Gerencia";
  els.teamSpeech.textContent = team.speech || "";

  const interlocutors = team.interlocutors && team.interlocutors.length
    ? team.interlocutors
    : ["Interlocutor"];

  els.personSelect.innerHTML = interlocutors
    .map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
    .join("");

  state.person = els.personSelect.value;
  loadScores();
  renderQuestions();
  updateSummary();
}

function onPersonChange() {
  state.person = els.personSelect.value;
  loadScores();
  renderQuestions();
  updateSummary();
}

function getCurrentTeam() {
  return (state.data.teams || {})[state.teamKey] || { questions: [] };
}

function storageKey() {
  return `sudameris_taller_${state.teamKey}_${state.person}`;
}

function loadScores() {
  try {
    state.scores = JSON.parse(localStorage.getItem(storageKey()) || "{}");
  } catch {
    state.scores = {};
  }
}

function saveScores() {
  localStorage.setItem(storageKey(), JSON.stringify(state.scores));
}

function renderQuestions() {
  const team = getCurrentTeam();
  const questions = team.questions || [];

  els.questions.innerHTML = questions.map((item, idx) => {
    const n = idx + 1;
    const active = state.scores[n] || "";

    return `
      <article class="question-card" data-index="${n}">
        <div class="question-top">
          <span class="badge">${n}</span>
          <div>
            <h3>${escapeHtml(item.q || item.question || "")}</h3>
            <p class="example"><strong>Ejemplo aclaratorio:</strong> ${escapeHtml(item.ej || item.example || "")}</p>
            <p class="kpi-ref"><strong>KPI de referencia consultiva:</strong> ${escapeHtml(item.kpi || "")}</p>
            <div class="score-row" role="group" aria-label="Puntaje pregunta ${n}">
              ${[1, 2, 3, 4, 5].map(score => `
                <button
                  type="button"
                  class="score-btn ${Number(active) === score ? "is-active" : ""}"
                  data-index="${n}"
                  data-score="${score}"
                  aria-label="Puntuar ${score}"
                >${score}</button>
              `).join("")}
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");

  els.questions.querySelectorAll(".score-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = btn.dataset.index;
      const score = Number(btn.dataset.score);
      state.scores[index] = score;
      saveScores();
      renderQuestions();
      updateSummary();
    });
  });
}

function updateSummary() {
  const team = getCurrentTeam();
  const questions = team.questions || [];
  const total = questions.length;
  const answered = Object.values(state.scores).filter(v => Number(v) >= 1).length;
  const avg = calculateAverage();

  els.progressText.textContent = `${answered} / ${total}`;
  els.averageText.textContent = avg ? avg.toFixed(2) : "–";
  els.statusText.textContent = answered === 0
    ? "Pendiente"
    : answered < total
      ? "Parcial"
      : "Completa";

  drawRadar();
}

function calculateAverage() {
  const values = Object.values(state.scores).map(Number).filter(v => v >= 1 && v <= 5);
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function buildRecords() {
  const team = getCurrentTeam();
  const questions = team.questions || [];
  const avgArea = calculateAverage();
  const pctArea = avgArea ? avgArea / 5 : 0;

  return questions
    .map((item, idx) => {
      const index = idx + 1;
      const score = state.scores[index];

      return {
        teamKey: state.teamKey,
        teamTitle: team.title || state.teamKey,
        person: state.person,
        index,
        question: item.q || item.question || "",
        example: item.ej || item.example || "",
        kpi: item.kpi || "",
        score: score == null ? "" : Number(score),
        avgArea,
        pctArea
      };
    })
    .filter(r => r.score !== "");
}

async function sendAllToRepo() {
  clearMessage();

  const endpoint = window.CONFIG && window.CONFIG.ENDPOINT_URL;
  if (!endpoint) {
    showMessage("Falta CONFIG.ENDPOINT_URL en config.js.", "error");
    return;
  }

  const records = buildRecords();
  if (!records.length) {
    showMessage("No hay respuestas para enviar.", "error");
    return;
  }

  els.sendBtn.disabled = true;
  els.sendBtn.textContent = "Enviando...";

  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        records,
        generatedAt: new Date().toISOString()
      })
    });

    showMessage("Respuestas enviadas. Verificá la hoja Respuestas del Google Sheet.", "ok");
  } catch (err) {
    showMessage(`No se pudo enviar: ${err.message}`, "error");
  } finally {
    els.sendBtn.disabled = false;
    els.sendBtn.textContent = "Enviar respuestas al Google Sheet";
  }
}

function resetCurrent() {
  const ok = confirm("¿Seguro que querés borrar las respuestas locales de esta gerencia/interlocutor?");
  if (!ok) return;

  state.scores = {};
  saveScores();
  renderQuestions();
  updateSummary();
  showMessage("Respuestas locales reiniciadas.", "ok");
}

function downloadCsv() {
  const records = buildRecords();
  if (!records.length) {
    showMessage("No hay respuestas para exportar.", "error");
    return;
  }

  const headers = [
    "teamKey",
    "teamTitle",
    "person",
    "index",
    "question",
    "example",
    "kpi",
    "score",
    "avgArea",
    "pctArea"
  ];

  const rows = [headers].concat(records.map(r => headers.map(h => r[h])));
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `sudameris_${state.teamKey}_${state.person}_respuestas.csv`.replace(/[^\w.-]+/g, "_");
  a.click();

  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function drawRadar() {
  const canvas = els.radarCanvas;
  const ctx = canvas.getContext("2d");
  const team = getCurrentTeam();
  const total = (team.questions || []).length;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2 + 8;
  const radius = Math.min(w, h) * 0.34;

  ctx.font = "13px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";

  if (!total) {
    ctx.fillStyle = "#667085";
    ctx.fillText("Sin preguntas cargadas", cx, cy);
    return;
  }

  const maxAxes = Math.min(total, 12);
  const scores = [];
  for (let i = 1; i <= maxAxes; i++) {
    scores.push(Number(state.scores[i] || 0));
  }

  // Grid
  for (let level = 1; level <= 5; level++) {
    const r = radius * (level / 5);
    ctx.beginPath();
    for (let i = 0; i < maxAxes; i++) {
      const a = angleFor(i, maxAxes);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "#d8e0ec";
    ctx.stroke();
  }

  // Axes
  for (let i = 0; i < maxAxes; i++) {
    const a = angleFor(i, maxAxes);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.strokeStyle = "#d8e0ec";
    ctx.stroke();

    ctx.fillStyle = "#667085";
    ctx.fillText(String(i + 1), cx + Math.cos(a) * (radius + 18), cy + Math.sin(a) * (radius + 18));
  }

  // Data polygon
  ctx.beginPath();
  for (let i = 0; i < maxAxes; i++) {
    const score = scores[i] || 0;
    const r = radius * (score / 5);
    const a = angleFor(i, maxAxes);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(11, 79, 113, 0.18)";
  ctx.fill();
  ctx.strokeStyle = "#0b4f71";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;

  ctx.fillStyle = "#152238";
  ctx.fillText(`Promedio: ${calculateAverage() ? calculateAverage().toFixed(2) : "–"}`, cx, 24);

  if (total > maxAxes) {
    ctx.fillStyle = "#667085";
    ctx.fillText(`Vista radar: primeras ${maxAxes} preguntas de ${total}`, cx, h - 18);
  }
}

function angleFor(i, total) {
  return -Math.PI / 2 + (Math.PI * 2 * i) / total;
}

function showMessage(text, type) {
  els.message.textContent = text;
  els.message.className = `message ${type || ""}`;
}

function clearMessage() {
  els.message.textContent = "";
  els.message.className = "message";
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
