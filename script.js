const AUDIO_ENABLED = true; 

const state = {
  tasks: [],                 // task objects
  filter: "all",             // all | active | completed
  view: "all",               // all | upcoming | archive
  dragSrcId: null,           // id of dragged task
  theme: "dark",            // light | dark
  lastToastId: null,         // track last toast
};

/* -------------------------- DOM ELEMENTS --------------------------------- */

const taskTemplate   = document.getElementById("taskTemplate") || document.getElementById("task-template");
const colTodo        = document.getElementById("col-todo");
const colInProgress  = document.getElementById("col-inprogress");
const colDone        = document.getElementById("col-done");
const progressFill   = document.getElementById("progressFill");
const progressPercent= document.getElementById("progressPercent");
const luckyBtn       = document.getElementById("luckyBtn");
const spinnerOverlay = document.getElementById("spinnerOverlay");
const spinnerWheel   = document.getElementById("spinnerWheel");
const spinnerClose   = document.getElementById("spinnerClose");
const themeToggle    = document.getElementById("themeToggle");

const addForm        = document.getElementById("addForm");
const taskInput      = document.getElementById("taskInput");
const selDue         = document.getElementById("taskDue");
const selTag         = document.getElementById("taskTag");
const selPriority    = document.getElementById("taskPriority");

const exportBtn      = document.getElementById("exportBtn");
const importFile     = document.getElementById("importFile");

const countLeftEl    = document.getElementById("countLeft");
const countDoneEl    = document.getElementById("countDone");
const countTodoEl    = document.getElementById("count-todo");
const countProgEl    = document.getElementById("count-inprogress");
const countDoneColEl = document.getElementById("count-done");

const clearCompletedBtn = document.getElementById("clearCompleted");
const navButtons     = document.querySelectorAll(".nav-btn");
const filterButtons  = document.querySelectorAll(".filter-btn");
const toastRoot      = document.getElementById("toast-root") || document.body;

/* Defensive: ensure required elements exist */
if (!taskTemplate) throw new Error("taskTemplate not found in DOM — expected #taskTemplate or #task-template.");
if (!colTodo || !colInProgress || !colDone) throw new Error("One or more board columns are missing.");

/* -------------------------- UTILS ---------------------------------------- */

function saveToStorage() {
  try {
    const payload = { tasks: state.tasks, theme: state.theme };
    localStorage.setItem("pulseTasks", JSON.stringify(payload));
  } catch (err) {
    console.error("Failed to save to storage:", err);
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem("pulseTasks");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tasks)) {
      state.tasks = parsed.tasks.map(normalizeTask);
    }
    if (parsed && parsed.theme) state.theme = parsed.theme;
    applyTheme(state.theme);
  } catch (err) {
    console.warn("Corrupt storage — ignoring.", err);
  }
}


function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}


function beep(type="soft") {
  if (!AUDIO_ENABLED) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = (type === "soft") ? "sine" : "triangle";
    o.frequency.value = (type === "soft") ? 620 : 420;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.linearRampToValueAtTime(0.06, now + 0.01);
    o.start(now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.stop(now + 0.14);
    
    setTimeout(()=>ctx.close(), 300);
  } catch (e) {
    // ignore
  }
}

/* Show toast (brief) */
function showToast(msg, opts = {}) {
  try {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    toastRoot.appendChild(el);
    // add show class for CSS (if any)
    requestAnimationFrame(()=>el.classList.add("show"));
    const duration = opts.duration || 2600;
    clearTimeout(state.lastToastId);
    state.lastToastId = setTimeout(()=>{
      el.classList.remove("show");
      setTimeout(()=>el.remove(), 300);
    }, duration);
  } catch (err) {
    console.warn("Toast failed:", err);
  }
}

/* Normalize incoming task object to known schema */
function normalizeTask(t){
  return {
    id: t.id || uid(),
    title: (typeof t.title === "string") ? t.title : "Untitled",
    due: t.due || "",
    tag: t.tag || "general",
    priority: t.priority || "normal",
    status: t.status || "todo",
    completed: !!t.completed,
    createdAt: t.createdAt || Date.now()
  };
}

/* Convert due select to ISO date string (yyyy-mm-dd) or empty string */
function dueSelectToISO(value) {
  const base = new Date(); base.setHours(0,0,0,0);
  if (value === "today") return base.toISOString().slice(0,10);
  if (value === "tomorrow") { base.setDate(base.getDate()+1); return base.toISOString().slice(0,10); }
  if (value === "week") { base.setDate(base.getDate()+7); return base.toISOString().slice(0,10); }
  return ""; // none
}

/* Format due date label */
function formatDueLabel(iso) {
  if (!iso) return "No date";
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
  if (diff <= 7) return `In ${diff}d`;
  return iso;
}

/* ---- Focus trap helper for modal overlays ---- */
function trapFocus(container, enable = true) {
  if (!container) return;
  const selector = 'a[href],button:not([disabled]),textarea, input, select, [tabindex]:not([tabindex="-1"])';
  let lastActive;
  function keyHandler(e) {
    if (e.key !== "Tab") return;
    const nodes = Array.from(container.querySelectorAll(selector)).filter(n => n.offsetParent !== null);
    if (!nodes.length) { e.preventDefault(); return; }
    const first = nodes[0], last = nodes[nodes.length -1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  if (enable) {
    lastActive = document.activeElement;
    container.addEventListener("keydown", keyHandler);
    container._restoreFocus = ()=>{ container.removeEventListener("keydown", keyHandler); if (lastActive && lastActive.focus) lastActive.focus(); };
  } else {
    if (container._restoreFocus) container._restoreFocus();
    container._restoreFocus = null;
  }
}

/* -------------------------- RENDERING TASKS ------------------------------- */

/* Render tasks for current state.view and state.filter */
function renderTasks() {
  // Defensive: clear columns
  [colTodo, colInProgress, colDone].forEach(c => { if (c) c.innerHTML = ""; });

  let activeCount = 0, doneCount = 0;

  const visible = state.tasks.filter(task => {
    // view gating
    if (state.view === "upcoming") {
      const todayISO = new Date().toISOString().slice(0,10);
      return !!task.due && task.due > todayISO && !task.completed;
    }
    if (state.view === "archive") return task.completed;
    return true;
  }).filter(task => {
    if (state.filter === "active" && task.completed) return false;
    if (state.filter === "completed" && !task.completed) return false;
    return true;
  });

  visible.forEach(task => {
    const node = taskTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = task.id;

    // title
    const titleEl = node.querySelector(".task-title");
    const dueEl = node.querySelector(".due");
    const tagEl = node.querySelector(".tag");
    const prioEl = node.querySelector(".task-prio");

    if (titleEl) titleEl.textContent = task.title;
    if (dueEl) dueEl.textContent = formatDueLabel(task.due || "");
    if (tagEl) tagEl.textContent = "• " + (task.tag || "General");
    if (prioEl) {
      prioEl.className = "task-prio " + (task.priority || "normal");
    }

    if (task.completed) {
      node.classList.add("completed");
      const check = node.querySelector(".task-check");
      if (check) check.setAttribute("aria-pressed","true");
    }

    // events: check, delete, edit
    const checkBtn = node.querySelector(".task-check");
    if (checkBtn) checkBtn.onclick = () => { toggleComplete(task.id); beep("soft"); };

    const deleteBtn = node.querySelector(".task-delete");
    if (deleteBtn) deleteBtn.onclick = () => { deleteTask(task.id); beep("soft"); };

    const editBtn = node.querySelector(".task-edit");
    if (editBtn) editBtn.onclick = () => { editTask(node, task.id); };

    // drag handlers
    node.draggable = true;
    node.addEventListener("dragstart", e => dragStart(e, node));
    node.addEventListener("dragover", e => dragOverItem(e, node));
    node.addEventListener("drop", e => dropOnItem(e, node));
    node.addEventListener("dragend", dragEnd);

    // append to column
    const status = task.status || "todo";
    if (status === "todo") colTodo.appendChild(node);
    else if (status === "inprogress") colInProgress.appendChild(node);
    else colDone.appendChild(node);

    if (task.completed) doneCount++; else activeCount++;
  });

  // update counts
  if (countLeftEl) countLeftEl.textContent = activeCount;
  if (countDoneEl) countDoneEl.textContent = doneCount;
  if (countTodoEl) countTodoEl.textContent = colTodo.children.length;
  if (countProgEl) countProgEl.textContent = colInProgress.children.length;
  if (countDoneColEl) countDoneColEl.textContent = colDone.children.length;

  updateProgressBar(activeCount, doneCount);
  updateLuckyButtonState();
  updateViewTitle();
}

/* Update the title to reflect active view */
function updateViewTitle() {
  const viewTitle = document.getElementById("viewTitle");
  if (!viewTitle) return;
  const map = { all: "All Tasks", upcoming: "Upcoming", archive: "Archive" };
  viewTitle.textContent = map[state.view] || "All Tasks";
}

/* -------------------------- PROGRESS ------------------------------------- */

function updateProgressBar(active, done) {
  const total = active + done;
  const percent = total ? Math.round((done / total) * 100) : 0;
  if (progressFill) progressFill.style.width = percent + "%";
  if (progressPercent) progressPercent.textContent = percent + "%";
  if (progressFill && progressFill.parentElement) progressFill.parentElement.setAttribute("aria-valuenow", percent);

  if (percent === 100 && total > 0) {
    launchConfetti();
    showToast("🎉 All tasks completed!");
    beep("soft");
  }
}

/* -------------------------- TASK ACTIONS --------------------------------- */

function addTask(title, dueISO, tag, priority) {
  if (!title || typeof title !== "string") {
    showToast("Please enter a task title");
    return;
  }
  const newTask = normalizeTask({
    id: uid(),
    title: title.trim(),
    due: dueISO || "",
    tag: tag || "general",
    priority: priority || "normal",
    status: "todo",
    completed: false,
    createdAt: Date.now()
  });
  state.tasks.unshift(newTask); // add to top for visibility
  saveToStorage();
  renderTasks();
  showToast("Task added");
  beep("soft");
  // focus input and clear (if using inline add)
}

function deleteTask(id) {
  const idx = state.tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  state.tasks.splice(idx, 1);
  saveToStorage();
  renderTasks();
  showToast("Task deleted");
}

/* toggles complete and moves to done status */
function toggleComplete(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.completed = !t.completed;
  t.status = t.completed ? "done" : "todo";
  saveToStorage();
  renderTasks();
}

/* Edit inline: toggles contentEditable on title */
function editTask(node, id) {
  const titleEl = node.querySelector(".task-title");
  if (!titleEl) return;
  const current = state.tasks.find(t => t.id === id);
  if (!current) return;

  if (titleEl.isContentEditable) {
    // finish editing
    titleEl.contentEditable = false;
    titleEl.blur();
    const newText = titleEl.textContent.trim();
    if (newText) current.title = newText;
    saveToStorage();
    showToast("Task updated");
  } else {
    titleEl.contentEditable = true;
    titleEl.focus();
    // caret at end
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/* -------------------------- DRAG & DROP (ITEM) --------------------------- */

function dragStart(e, node) {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", node.dataset.id);
  node.classList.add("dragging");
  state.dragSrcId = node.dataset.id;
}

function dragOverItem(e, node) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  node.classList.add("col-over");
}

function dropOnItem(e, node) {
  e.preventDefault();
  node.classList.remove("col-over");
  const draggedId = e.dataTransfer.getData("text/plain");
  const targetId = node.dataset.id;
  if (!draggedId || !targetId || draggedId === targetId) return;

  const draggedIndex = state.tasks.findIndex(t => t.id === draggedId);
  const targetIndex  = state.tasks.findIndex(t => t.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1) return;

  const dragged = state.tasks[draggedIndex];
  const target  = state.tasks[targetIndex];

  // move dragged to target.status and place before target in array
  dragged.status = target.status;

  // Remove dragged element from array and insert at targetIndex
  state.tasks.splice(draggedIndex, 1);
  const newTargetIndex = state.tasks.findIndex(t => t.id === targetId);
  state.tasks.splice(newTargetIndex, 0, dragged);

  saveToStorage();
  renderTasks();
  beep("soft");
}

function dragEnd() {
  document.querySelectorAll(".dragging, .col-over").forEach(el => el.classList.remove("dragging", "col-over"));
  state.dragSrcId = null;
}

/* ----------------------- DRAG & DROP (COLUMNS) --------------------------- */
/* Allow dropping onto empty columns and reorder to end */

function initColumnDrops() {
  [colTodo, colInProgress, colDone].forEach(ul => {
    if (!ul) return;
    ul.addEventListener("dragover", e => {
      e.preventDefault();
      ul.classList.add("col-over");
    });
    ul.addEventListener("dragleave", () => ul.classList.remove("col-over"));
    ul.addEventListener("drop", e => {
      e.preventDefault();
      ul.classList.remove("col-over");
      const id = e.dataTransfer.getData("text/plain");
      if (!id) return;
      const task = state.tasks.find(t => t.id === id);
      if (!task) return;
      const dest = ul.closest(".board") ? ul.closest(".board").dataset.col : (ul.dataset.col || "todo");
      task.status = dest || "todo";
      // Move dragged task to end of that column in array to preserve manual ordering
      const idx = state.tasks.findIndex(t => t.id === id);
      if (idx !== -1) {
        const [item] = state.tasks.splice(idx,1);
        // find last index of that status to insert after
        let insertAt = state.tasks.map(t => t.status).lastIndexOf(dest);
        if (insertAt === -1) {
          // no tasks with same status: find first index where status changes or push at end
          insertAt = state.tasks.length;
        } else {
          insertAt = insertAt + 1;
        }
        state.tasks.splice(insertAt, 0, item);
      }
      saveToStorage();
      renderTasks();
      beep("soft");
    });
  });
}

/* -------------------------- FILTERS & NAV -------------------------------- */

filterButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    filterButtons.forEach(b => { b.classList.remove("active"); b.removeAttribute("aria-selected"); });
    btn.classList.add("active"); btn.setAttribute("aria-selected", "true");
    state.filter = btn.dataset.filter || "all";
    renderTasks();
  });
});

navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    navButtons.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-pressed","false"); });
    btn.classList.add("active"); btn.setAttribute("aria-pressed","true");
    state.view = btn.dataset.view || "all";
    renderTasks();
  });
});

/* -------------------------- ADD FORM ------------------------------------- */

if (addForm) {
  addForm.addEventListener("submit", e => {
    e.preventDefault();
    const title = (taskInput && taskInput.value) ? taskInput.value.trim() : "";
    if (!title) {
      showToast("Please enter a task");
      return;
    }
    const dueISO = selDue ? dueSelectToISO(selDue.value) : "";
    const tag = selTag ? selTag.value : "general";
    const priority = selPriority ? selPriority.value : "normal";
    addTask(title, dueISO, tag, priority);
    addForm.reset();
    // focus back to input for quick add
    if (taskInput) {
      taskInput.focus();
    }
  });
}

/* ----------------------- CLEAR COMPLETED -------------------------------- */

if (clearCompletedBtn) {
  clearCompletedBtn.addEventListener("click", () => {
    const before = state.tasks.length;
    state.tasks = state.tasks.filter(t => !t.completed);
    const removed = before - state.tasks.length;
    saveToStorage();
    renderTasks();
    showToast(`Cleared ${removed} completed ${removed === 1 ? "task" : "tasks"}`);
    beep("soft");
  });
}

/* -------------------------- THEME TOGGLE -------------------------------- */

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === "light") {
    html.classList.add("light-theme");
  } else {
    html.classList.remove("light-theme"); // default = dark
  }

  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", theme === "dark");
  }
}

// ✅ Ensure default = dark mode on first load
if (!state.theme) {
  state.theme = "dark";
}
applyTheme(state.theme);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    state.theme = (state.theme === "light") ? "dark" : "light";
    applyTheme(state.theme);
    saveToStorage();
    showToast(state.theme === "dark" ? "Dark mode" : "Light mode");
    beep("soft");
  });
}


/* -------------------------- LUCKY DRAW (SPINNER) -------------------------- */

function updateLuckyButtonState() {
  const available = state.tasks.filter(t => !t.completed).length >= 2;
  if (luckyBtn) {
    luckyBtn.disabled = !available;
    luckyBtn.setAttribute("aria-disabled", String(!available));
  }
}

function openSpinner() {
  if (!spinnerOverlay) return;
  spinnerOverlay.style.display = "flex";
  spinnerOverlay.setAttribute("aria-hidden", "false");
  buildSpinner();
  trapFocus(spinnerOverlay, true);
  // focus close
  if (spinnerClose) spinnerClose.focus();
  // spin a small intro
  setTimeout(()=>spinWheel(), 220);
}

function closeSpinner() {
  if (!spinnerOverlay) return;
  spinnerOverlay.style.display = "none";
  spinnerOverlay.setAttribute("aria-hidden", "true");
  spinnerWheel.innerHTML = "";
  trapFocus(spinnerOverlay, false);
}

if (luckyBtn) {
  luckyBtn.addEventListener("click", () => {
    if (luckyBtn.disabled) return;
    openSpinner();
  });
}
if (spinnerClose) spinnerClose.addEventListener("click", closeSpinner);

if (spinnerOverlay) {
  spinnerOverlay.addEventListener("click", (e) => {
    if (e.target === spinnerOverlay) closeSpinner();
  });
}

/* build spinner slices from available (not completed) tasks */
function buildSpinner() {
  if (!spinnerWheel) return;
  spinnerWheel.innerHTML = "";
  const items = state.tasks.filter(t => !t.completed);
  if (!items.length) return;
  const sliceAngle = 360 / items.length;
  items.forEach((t, i) => {
    const slice = document.createElement("div");
    slice.className = "spin-item";
    slice.textContent = t.title;
    slice.style.setProperty("--angle", `${i * sliceAngle}deg`);
    spinnerWheel.appendChild(slice);
  });
}

/* spin the wheel with smooth easing and choose a random slice */
function spinWheel() {
  if (!spinnerWheel) return;
  const items = state.tasks.filter(t => !t.completed);
  if (items.length < 2) return;

  const spins = 6 + Math.floor(Math.random() * 6); // 6..11
  const extra = Math.floor(Math.random() * 360);
  const totalAngle = spins * 360 + extra;
  spinnerWheel.style.transition = "transform 4s cubic-bezier(.17,.67,.83,.67)";
  spinnerWheel.style.transform = `rotate(${totalAngle}deg)`;

  // After animation compute the chosen item
  setTimeout(() => {
    const normalized = ((360 - (totalAngle % 360)) % 360);
    const sliceAngle = 360 / items.length;
    let index = Math.floor(normalized / sliceAngle);
    index = index % items.length;
    const chosen = items[index];
    // highlight
    const all = spinnerWheel.querySelectorAll(".spin-item");
    all.forEach(el => el.classList.remove("selected"));
    if (all[index]) all[index].classList.add("selected");
    showToast("🎯 Lucky: " + chosen.title);
    beep("soft");
  }, 4200);
}

/* Close spinner on Esc */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (spinnerOverlay && spinnerOverlay.getAttribute("aria-hidden") === "false") {
      closeSpinner();
    }
  }
});

/* -------------------------- CONFETTI (rAF) -------------------------------- */

let confettiAnim = null;

function launchConfetti() {
  const canvas = document.getElementById("confettiCanvas") || document.getElementById("confetti-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  const COUNT = 160;
  const pieces = [];

  for (let i = 0; i < COUNT; i++) {
    pieces.push({
      x: Math.random() * W,
      y: Math.random() * H - H,
      r: Math.random() * 6 + 4,
      d: Math.random() * COUNT,
      color: `hsl(${Math.random() * 360}, 80%, 60%)`,
      tilt: Math.random() * 10,
      tiltAngleIncrement: Math.random() * 0.07 + 0.05,
      tiltAngle: 0,
      speed: Math.random() * 2 + 1.5
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < COUNT; i++) {
      const p = pieces[i];
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();
    }
    update();
  }

  function update() {
    for (let i = 0; i < COUNT; i++) {
      const p = pieces[i];
      p.tiltAngle += p.tiltAngleIncrement;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2 + p.speed * 0.3;
      p.x += Math.sin(p.d);
      p.tilt = Math.sin(p.tiltAngle - i / 3) * 15;
      if (p.y > H) {
        p.y = -20;
        p.x = Math.random() * W;
      }
    }
  }

  let start = null;
  let frames = 0;

  function loop(ts) {
    if (!start) start = ts;
    frames++;
    draw();
    // Stop after about 3.2 seconds to avoid resource hogging
    if (ts - start < 3200) confettiAnim = requestAnimationFrame(loop);
    else {
      ctx.clearRect(0, 0, W, H);
      cancelAnimationFrame(confettiAnim);
      confettiAnim = null;
    }
  }

  if (confettiAnim) cancelAnimationFrame(confettiAnim);
  confettiAnim = requestAnimationFrame(loop);

  // handle resize while running
  const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
  window.addEventListener("resize", onResize);
  setTimeout(()=> window.removeEventListener("resize", onResize), 3500);
}

/* -------------------------- EXPORT / IMPORT ------------------------------- */

if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    try {
      const out = { version: 1, tasks: state.tasks };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pulsetodo-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Exported tasks");
    } catch (err) {
      showToast("Export failed");
      console.error(err);
    }
  });
}

if (importFile) {
  importFile.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.tasks)) throw new Error("Invalid file format");
      const incoming = parsed.tasks.map(normalizeTask);
      const existingIds = new Set(state.tasks.map(t => t.id));
      incoming.forEach(t => { if (!existingIds.has(t.id)) state.tasks.push(t); });
      saveToStorage();
      renderTasks();
      showToast("Imported tasks");
    } catch (err) {
      console.error("Import failed:", err);
      showToast("Import failed");
    } finally {
      importFile.value = "";
    }
  });
}

/* -------------------------- KEYBOARD SHORTCUTS ---------------------------- */

/* Global shortcuts:
   / -> focus input
   n -> focus input
   Esc -> close spinner / blur editable
*/
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) {
    e.preventDefault();
    taskInput && taskInput.focus();
    return;
  }
  if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) return;
    e.preventDefault();
    taskInput && taskInput.focus();
    return;
  }
  if (e.key === "Escape") {
    // blur any contenteditable fields
    const editable = document.querySelectorAll('[contenteditable="true"]');
    editable.forEach(el => { el.contentEditable = "false"; el.blur(); });
  }
});

/* -------------------------- INIT ----------------------------------------- */

function init() {
  loadFromStorage();
  
  initColumnDrops();
  renderTasks();
  applyTheme(state.theme);

  if (taskInput) {
    setTimeout(()=> taskInput.focus(), 350);
  }


  updateLuckyButtonState();
}

init();


