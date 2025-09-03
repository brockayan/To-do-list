let timer;
let timeLeft = 25 * 60; 
let running = false;

const display = document.getElementById("timerDisplay");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const setTimeBtn = document.getElementById("setTimeBtn");
const customMinutes = document.getElementById("customMinutes");

// Format mm:ss
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function updateDisplay() {
  display.textContent = formatTime(timeLeft);
}

function startTimer() {
  if (running) return;
  running = true;
  timer = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      updateDisplay();
    } else {
      clearInterval(timer);
      running = false;
      alert("⏰ Time’s up! Great job focusing.");
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timer);
  running = false;
}

function resetTimer() {
  clearInterval(timer);
  running = false;
  timeLeft = (customMinutes.value || 25) * 60;
  updateDisplay();
}

function setCustomTime() {
  const minutes = parseInt(customMinutes.value, 10);
  if (isNaN(minutes) || minutes < 1) return;
  timeLeft = minutes * 60;
  updateDisplay();
}

startBtn.onclick = startTimer;
pauseBtn.onclick = pauseTimer;
resetBtn.onclick = resetTimer;
setTimeBtn.onclick = setCustomTime;

updateDisplay();
