/* ═══════════════════════════════════════════════════════════════
   NutriBot — Frontend Application Logic
   Features: Chat, Dashboard, BMI, Meal Plan, Family Profiles,
             Dark Mode, Charts (Chart.js), API integration
═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── State ────────────────────────────────────────────────────
const STATE = {
  chatHistory:    [],
  familyMembers:  [],
  profile:        null,
  macroChart:     null,
  calorieChart:   null,
  isDark:         false,
};

// ─── DOM helpers ─────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function showToast(msg, type = 'info') {
  const toast    = $('#appToast');
  const body     = $('#toastBody');
  body.textContent = msg;
  toast.className  = `toast align-items-center text-bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'dark'}`;
  bootstrap.Toast.getOrCreateInstance(toast, { delay: 3000 }).show();
}

function showLoading(msg = 'NutriBot is thinking...') {
  $('#loadingText').textContent = msg;
  $('#loadingOverlay').classList.remove('d-none');
}
function hideLoading() {
  $('#loadingOverlay').classList.add('d-none');
}

// ─── Dark Mode ────────────────────────────────────────────────
function initDarkMode() {
  const saved = localStorage.getItem('nutribot-theme') || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  STATE.isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-bs-theme', theme);
  const icon = $('#darkIcon');
  if (STATE.isDark) {
    icon.className = 'bi bi-sun-fill';
  } else {
    icon.className = 'bi bi-moon-stars-fill';
  }
  localStorage.setItem('nutribot-theme', theme);
  // Update chart colors if they exist
  if (STATE.macroChart || STATE.calorieChart) rebuildCharts();
}

$('#darkModeToggle').addEventListener('click', () => {
  applyTheme(STATE.isDark ? 'light' : 'dark');
});

// ─── API Health Check ─────────────────────────────────────────
async function checkApiHealth() {
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();
    const dot  = $('.status-dot');
    const txt  = $('#apiStatusText');

    if (data.watsonx === 'connected') {
      dot.className  = 'status-dot connected';
      txt.textContent = 'Watsonx Live';
      $('#modelBadge').textContent = 'Watsonx AI';
    } else {
      dot.className  = 'status-dot demo';
      txt.textContent = 'Demo Mode';
      $('#modelBadge').textContent = 'Demo Mode';
    }
  } catch {
    $('.status-dot').className  = 'status-dot';
    $('#apiStatusText').textContent = 'Offline';
  }
}

// ─── Profile Management ───────────────────────────────────────
function getProfile() {
  const name       = $('#profName').value.trim();
  const age        = parseInt($('#profAge').value);
  const gender     = $('#profGender').value;
  const weight     = parseFloat($('#profWeight').value);
  const height     = parseFloat($('#profHeight').value);
  const activity   = $('#profActivity').value;
  const diet_type  = $('#profDiet').value;
  const goals      = $('#profGoals').value.trim();
  const conditions = $('#profConditions').value.trim();

  if (!name || !age || !gender || !weight || !height) return null;
  return { name, age, gender, weight, height, activity, diet_type, goals, conditions };
}

function saveProfile() {
  const p = getProfile();
  if (!p) { showToast('Please fill in all required profile fields', 'error'); return; }
  STATE.profile = p;
  localStorage.setItem('nutribot-profile', JSON.stringify(p));
  const saved = $('#profileSaved');
  saved.classList.remove('d-none');
  setTimeout(() => saved.classList.add('d-none'), 2500);
  showToast(`Profile saved for ${p.name}!`, 'success');
}

function loadSavedProfile() {
  const raw = localStorage.getItem('nutribot-profile');
  if (!raw) return;
  try {
    const p = JSON.parse(raw);
    STATE.profile = p;
    if (p.name)       $('#profName').value       = p.name;
    if (p.age)        $('#profAge').value        = p.age;
    if (p.gender)     $('#profGender').value     = p.gender;
    if (p.weight)     $('#profWeight').value     = p.weight;
    if (p.height)     $('#profHeight').value     = p.height;
    if (p.activity)   $('#profActivity').value   = p.activity;
    if (p.diet_type)  $('#profDiet').value       = p.diet_type;
    if (p.goals)      $('#profGoals').value      = p.goals;
    if (p.conditions) $('#profConditions').value = p.conditions;
  } catch { /* ignore */ }
}

$('#saveProfile').addEventListener('click', saveProfile);

// Toggle profile section
let profileOpen = true;
$('#toggleProfile').addEventListener('click', () => {
  profileOpen = !profileOpen;
  const body    = $('#profileBody');
  const chevron = $('#profileChevron');
  body.style.display    = profileOpen ? '' : 'none';
  chevron.className     = profileOpen ? 'bi bi-chevron-up' : 'bi bi-chevron-down';
});

// ─── Chat ─────────────────────────────────────────────────────
function formatMarkdown(text) {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // H1-H3 headers → styled heading
    .replace(/^#{1,3}\s+(.+)$/gm, '<br><strong style="font-size:1.05em">$1</strong><br>')
    // Numbered list items → preserve number + indent
    .replace(/^(\d+)\.\s+/gm, '<br><strong>$1.</strong> ')
    // Bullet list items
    .replace(/^[-•]\s+/gm, '<br>• ')
    // Remaining newlines
    .replace(/\n/g, '<br>')
    // Clean up triple <br> runs that can appear around headings
    .replace(/(<br>\s*){3,}/g, '<br><br>');
}

function addMessage(role, content) {
  const window   = $('#chatWindow');
  const isBot    = role === 'bot';
  const time     = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const label    = isBot ? 'NutriBot' : 'You';
  const avatarHtml = isBot
    ? `<div class="avatar bot-avatar">🥗</div>`
    : `<div class="avatar user-avatar">👤</div>`;

  const msg = document.createElement('div');
  msg.className = `chat-message ${isBot ? 'bot-message' : 'user-message'}`;
  msg.innerHTML = `
    ${avatarHtml}
    <div class="message-bubble">
      <div class="message-content">${isBot ? formatMarkdown(content) : escapeHtml(content)}</div>
      <div class="message-time">${label} • ${time}</div>
    </div>`;
  window.appendChild(msg);
  window.scrollTop = window.scrollHeight;

  STATE.chatHistory.push({ role: isBot ? 'assistant' : 'user', content });
}

function addTypingIndicator() {
  const window = $('#chatWindow');
  const el     = document.createElement('div');
  el.className = 'chat-message bot-message';
  el.id        = 'typingIndicator';
  el.innerHTML = `
    <div class="avatar bot-avatar">🥗</div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;
  window.appendChild(el);
  window.scrollTop = window.scrollHeight;
}

function removeTypingIndicator() {
  const el = $('#typingIndicator');
  if (el) el.remove();
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendMessage() {
  const input   = $('#chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  resizeChatInput();
  updateCharCount();

  $('#sendBtn').disabled = true;
  addMessage('user', message);
  addTypingIndicator();

  try {
    const res  = await fetch('/api/chat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        message,
        history: STATE.chatHistory.slice(-10),
        profile: STATE.profile || getProfile(),
      }),
    });
    const data = await res.json();
    removeTypingIndicator();

    if (data.error) {
      addMessage('bot', `⚠️ Error: ${data.error}`);
    } else {
      addMessage('bot', data.response);
    }
  } catch (err) {
    removeTypingIndicator();
    addMessage('bot', '⚠️ Connection error. Please check your internet and try again.');
  } finally {
    $('#sendBtn').disabled = false;
    input.focus();
  }
}

// Send on button click
$('#sendBtn').addEventListener('click', sendMessage);

// Send on Ctrl+Enter
$('#chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendMessage(); }
});

// Auto-resize textarea
function resizeChatInput() {
  const ta = $('#chatInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}
function updateCharCount() {
  const len = $('#chatInput').value.length;
  $('#charCount').textContent = `${len} / 500`;
}
$('#chatInput').addEventListener('input', () => { resizeChatInput(); updateCharCount(); });

// Quick prompts
$$('.qp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#chatInput').value = btn.dataset.prompt;
    resizeChatInput();
    updateCharCount();
    sendMessage();
  });
});

// Clear chat
$('#clearChat').addEventListener('click', () => {
  const win = $('#chatWindow');
  win.innerHTML = '';
  STATE.chatHistory = [];
  addMessage('bot', '👋 Chat cleared! How can I help you with your nutrition today?');
});

// ─── Dashboard ────────────────────────────────────────────────
function getChartColors() {
  return STATE.isDark
    ? { grid: '#334155', text: '#94a3b8', bg: '#1e293b' }
    : { grid: '#e2e8f0', text: '#718096', bg: '#ffffff' };
}

function buildMacroChart(carbs, protein, fat) {
  const ctx    = $('#macroChart').getContext('2d');
  const colors = getChartColors();

  if (STATE.macroChart) STATE.macroChart.destroy();

  STATE.macroChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels:   ['Carbohydrates', 'Protein', 'Fat'],
      datasets: [{
        data:            [carbs, protein, fat],
        backgroundColor: ['#f59e0b', '#3b82f6', '#ef4444'],
        borderColor:     colors.bg,
        borderWidth:     3,
        hoverOffset:     8,
      }],
    },
    options: {
      responsive:    true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:     colors.text,
            font:      { size: 11 },
            padding:   10,
            boxWidth:  12,
            boxHeight: 12,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed}g`,
          },
        },
      },
      cutout: '65%',
    },
  });
}

function buildCalorieChart(maintenance, weightLoss, weightGain) {
  const ctx    = $('#calorieChart').getContext('2d');
  const colors = getChartColors();

  if (STATE.calorieChart) STATE.calorieChart.destroy();

  STATE.calorieChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels:   ['Weight Loss', 'Maintenance', 'Weight Gain'],
      datasets: [{
        label:           'Calories (kcal)',
        data:            [weightLoss, maintenance, weightGain],
        backgroundColor: ['#3b82f6cc', '#38a169cc', '#f59e0bcc'],
        borderColor:     ['#3b82f6',   '#38a169',   '#f59e0b'],
        borderWidth:     2,
        borderRadius:    6,
      }],
    },
    options: {
      responsive:    true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid:   { color: colors.grid },
          ticks:  { color: colors.text, font: { size: 11 } },
        },
        y: {
          grid:   { color: colors.grid },
          ticks:  { color: colors.text, font: { size: 11 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: c => ` ${c.parsed.y} kcal` },
        },
      },
    },
  });
}

function rebuildCharts() {
  // Re-draw charts with updated theme colors (doesn't re-fetch data)
  if (STATE.macroChart) {
    const { carbs_g, protein_g, fat_g } = STATE._lastMacros || {};
    if (carbs_g) buildMacroChart(carbs_g, protein_g, fat_g);
  }
  if (STATE.calorieChart) {
    const { maintenance, weight_loss, weight_gain } = STATE._lastCalories || {};
    if (maintenance) buildCalorieChart(maintenance, weight_loss, weight_gain);
  }
}

async function calculateDashboard() {
  const p = STATE.profile || getProfile();
  if (!p || !p.weight || !p.height || !p.age || !p.gender) {
    showToast('Please fill in your profile (weight, height, age, gender) first!', 'error');
    $('#profName').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  showLoading('Calculating your nutrition data...');
  try {
    const [tdeeRes, bmiRes] = await Promise.all([
      fetch('/api/tdee', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          weight:    p.weight,
          height:    p.height,
          age:       p.age,
          gender:    p.gender,
          activity:  p.activity || 'moderate',
          diet_type: p.diet_type || 'balanced',
        }),
      }),
      fetch('/api/bmi', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ weight: p.weight, height: p.height }),
      }),
    ]);

    const tdeeData = await tdeeRes.json();
    const bmiData  = await bmiRes.json();

    // Update metric cards
    $('#dashTDEE').textContent    = `${tdeeData.tdee} kcal`;
    $('#dashBMR').textContent     = `${tdeeData.bmr} kcal`;
    $('#dashBMI').textContent     = bmiData.bmi;
    $('#dashGoalCal').textContent = `${tdeeData.weight_loss} kcal`;

    // Update macro breakdown
    const m = tdeeData.macros;
    $('#macroCarbs').textContent   = `${m.carbs_g}g`;
    $('#macroProtein').textContent = `${m.protein_g}g`;
    $('#macroFat').textContent     = `${m.fat_g}g`;
    $('#macroBreakdown').style.display = '';

    // Save for chart redraw
    STATE._lastMacros   = m;
    STATE._lastCalories = tdeeData;

    // Build charts
    buildMacroChart(m.carbs_g, m.protein_g, m.fat_g);
    buildCalorieChart(tdeeData.tdee, tdeeData.weight_loss, tdeeData.weight_gain);

    showToast('Dashboard updated!', 'success');
  } catch (err) {
    showToast('Failed to calculate nutrition data', 'error');
  } finally {
    hideLoading();
  }
}

$('#calcDashBtn').addEventListener('click', calculateDashboard);

// ─── BMI Calculator ───────────────────────────────────────────
const BMI_CATEGORIES = {
  underweight: { label: 'Underweight', color: '#3b82f6', pct: 8  },
  normal:      { label: 'Normal',      color: '#22c55e', pct: 35 },
  overweight:  { label: 'Overweight',  color: '#f59e0b', pct: 62 },
  obese:       { label: 'Obese',       color: '#ef4444', pct: 85 },
};

function bmiToPercent(bmi) {
  if (bmi < 18.5) return Math.max(2,  Math.min(23, ((bmi - 10) / 8.5) * 23));
  if (bmi < 25)   return Math.max(25, Math.min(57, ((bmi - 18.5) / 6.5) * 32 + 25));
  if (bmi < 30)   return Math.max(58, Math.min(78, ((bmi - 25) / 5) * 20 + 58));
  return Math.min(96, ((bmi - 30) / 15) * 18 + 78);
}

async function calculateBMI() {
  const weight = parseFloat($('#bmiWeight').value);
  const height = parseFloat($('#bmiHeight').value);

  if (!weight || !height || weight <= 0 || height <= 0) {
    showToast('Please enter valid weight and height', 'error');
    return;
  }

  try {
    const res  = await fetch('/api/bmi', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ weight, height }),
    });
    const data = await res.json();

    $('#bmiNumber').textContent   = data.bmi;
    $('#bmiCategory').textContent = data.category;
    $('#bmiAdvice').textContent   = data.advice;

    const pct    = bmiToPercent(data.bmi);
    const marker = $('#scaleMarker');
    const fill   = $('#scaleFill');
    marker.style.left = `${pct}%`;

    // Category-specific badge color
    const catKey = data.category.toLowerCase().replace(' ', '');
    const colors = {
      underweight: '#3b82f6',
      normalweight:'#22c55e',
      overweight:  '#f59e0b',
      obese:       '#ef4444',
    };
    $('#bmiCategory').style.background = colors[catKey] || '#22c55e';
    $('#bmiCategory').style.color      = '#fff';

    $('#bmiResult').style.display = '';
    $('#bmiEmpty').style.display  = 'none';
    showToast(`BMI calculated: ${data.bmi} (${data.category})`, 'success');
  } catch {
    showToast('BMI calculation failed', 'error');
  }
}

$('#calcBmiBtn').addEventListener('click', calculateBMI);
$$('#bmiWeight, #bmiHeight').forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') calculateBMI(); });
});

// ─── Meal Plan ────────────────────────────────────────────────
async function generateMealPlan() {
  const days    = $('#mealDays').value;
  const goal    = $('#mealGoal').value;
  const profile = STATE.profile || getProfile();

  const output = $('#mealPlanOutput');
  output.innerHTML = '';   // clear previous result immediately
  showLoading(`Generating your ${days}-day meal plan...`);

  try {
    const res = await fetch('/api/meal-plan', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ days: parseInt(days), goal, profile }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      output.innerHTML = `<div class="alert alert-danger">Server error (status ${res.status}). Make sure the Flask server is running.</div>`;
      showToast('Server error', 'error');
      return;
    }

    if (data.error) {
      output.innerHTML = `<div class="alert alert-danger">⚠️ ${escapeHtml(data.error)}</div>`;
      showToast('Error generating plan', 'error');
    } else if (!data.plan || !data.plan.trim()) {
      output.innerHTML = `<div class="alert alert-warning">The model returned an empty response. Please try again.</div>`;
      showToast('Empty response — try again', 'error');
    } else {
      output.innerHTML = `<div class="meal-plan-content">${formatMarkdown(data.plan)}</div>`;
      if (data.mode === 'demo') {
        output.innerHTML += `<div class="mt-3 p-2 rounded" style="background:var(--bg-secondary);border:1px solid var(--border-color);font-size:.8rem;color:var(--text-muted)">
          ℹ️ Demo mode — Add IBM API credentials for a fully personalized AI meal plan
        </div>`;
      }
      showToast('Meal plan generated! 🍽️', 'success');
    }
  } catch (err) {
    output.innerHTML = `<div class="alert alert-danger">⚠️ Could not reach the server. Is the Flask app running on port 5000?<br><small>${escapeHtml(String(err))}</small></div>`;
    showToast('Connection failed', 'error');
  } finally {
    hideLoading();
  }
}

$('#generateMealBtn').addEventListener('click', generateMealPlan);

// ─── Family Profiles ──────────────────────────────────────────
function renderFamilyMembers() {
  const grid   = $('#familyMembers');
  const empty  = $('#familyEmpty');
  const actions = $('#familyActions');

  if (STATE.familyMembers.length === 0) {
    grid.innerHTML    = '';
    empty.style.display   = '';
    actions.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  actions.style.display = '';

  const avatars = { male: '👨', female: '👩', other: '🧑', child: '👦' };
  grid.innerHTML = STATE.familyMembers.map((m, i) => {
    const age    = parseInt(m.age);
    const avatar = age < 15 ? '👦' : (avatars[m.gender] || '🧑');
    return `
      <div class="family-card">
        <button class="family-remove" onclick="removeMember(${i})" title="Remove">
          <i class="bi bi-x-circle"></i>
        </button>
        <div class="family-avatar">${avatar}</div>
        <div class="family-name">${escapeHtml(m.name)}</div>
        <div class="family-meta">Age ${m.age} · ${m.gender}</div>
        <div class="family-meta">${escapeHtml(m.goals || 'General health')}</div>
        <span class="family-diet-badge">${m.diet}</span>
      </div>`;
  }).join('');
}

function removeMember(idx) {
  STATE.familyMembers.splice(idx, 1);
  saveFamilyToStorage();
  renderFamilyMembers();
}

function saveFamilyToStorage() {
  localStorage.setItem('nutribot-family', JSON.stringify(STATE.familyMembers));
}

function loadFamilyFromStorage() {
  const raw = localStorage.getItem('nutribot-family');
  if (!raw) return;
  try {
    STATE.familyMembers = JSON.parse(raw);
    renderFamilyMembers();
  } catch { /* ignore */ }
}

function openAddMemberModal() {
  // Clear form
  ['memName', 'memAge', 'memGoals', 'memConditions'].forEach(id => { $(`#${id}`).value = ''; });
  $('#memGender').value = 'male';
  $('#memDiet').value   = 'balanced';
  bootstrap.Modal.getOrCreateInstance($('#addMemberModal')).show();
}

$('#addMemberBtn').addEventListener('click', openAddMemberModal);
$('#addFirstMember').addEventListener('click', openAddMemberModal);

$('#saveMemberBtn').addEventListener('click', () => {
  const name = $('#memName').value.trim();
  const age  = $('#memAge').value.trim();

  if (!name || !age) {
    showToast('Name and age are required', 'error');
    return;
  }

  STATE.familyMembers.push({
    name,
    age:        parseInt(age),
    gender:     $('#memGender').value,
    diet:       $('#memDiet').value,
    goals:      $('#memGoals').value.trim()      || 'General health',
    conditions: $('#memConditions').value.trim() || 'None',
  });

  saveFamilyToStorage();
  renderFamilyMembers();
  bootstrap.Modal.getOrCreateInstance($('#addMemberModal')).hide();
  showToast(`${name} added to family!`, 'success');
});

async function getFamilyNutritionPlan() {
  if (STATE.familyMembers.length === 0) {
    showToast('Add family members first!', 'error');
    return;
  }

  showLoading('Creating family nutrition plan...');
  const output = $('#familyPlanOutput');
  output.innerHTML = '';

  try {
    const res  = await fetch('/api/family-nutrition', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ members: STATE.familyMembers }),
    });
    const data = await res.json();

    if (data.error) {
      output.innerHTML = `<div class="text-danger">Error: ${escapeHtml(data.error)}</div>`;
    } else {
      output.innerHTML = `<div>${formatMarkdown(data.recommendations)}</div>`;
    }
    showToast('Family plan ready!', 'success');
  } catch {
    output.innerHTML = '<div class="text-danger">Failed to get family plan. Please try again.</div>';
  } finally {
    hideLoading();
  }
}

$('#getFamilyPlanBtn').addEventListener('click', getFamilyNutritionPlan);

// ─── Smooth Scroll + Active Sidebar Link ─────────────────────
$$('.sidebar-link, .nav-item-mobile').forEach(link => {
  link.addEventListener('click', e => {
    const section = link.dataset.section || link.getAttribute('href')?.slice(1);
    if (!section) return;
    const el = document.getElementById(section);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      $$('.sidebar-link').forEach(l => {
        l.classList.toggle('active', l.dataset.section === id);
      });
    }
  });
}, { threshold: 0.3 });

['chatSection', 'dashSection', 'mealSection', 'bmiSection', 'familySection'].forEach(id => {
  const el = document.getElementById(id);
  if (el) observer.observe(el);
});

// ─── Smooth scroll for hero buttons ──────────────────────────
$$('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});

// ─── Remove global window reference for family remove ────────
window.removeMember = removeMember;

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  checkApiHealth();
  loadSavedProfile();
  loadFamilyFromStorage();

  // Auto-calculate dashboard if profile already saved
  if (STATE.profile) {
    setTimeout(calculateDashboard, 600);
  }
});
