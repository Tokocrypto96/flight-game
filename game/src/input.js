// input.js — keyboard and mouse, nothing else.
// One job: read the pilot's hands into one small state object.

export function newInput() {
  return {
    pitchUp: false, pitchDown: false,
    rollLeft: false, rollRight: false,
    throttleUp: false, throttleDown: false,
    action: false,          // Space: drop parcel (edge-triggered by the game)
    pause: false, restart: false, start: false, mute: false,
    mouseActive: false, mouseRoll: 0, mousePitch: 0,
  };
}

const KEYMAP = {
  ArrowUp: 'pitchUp', KeyW: 'throttleUp',
  ArrowDown: 'pitchDown', KeyS: 'throttleDown',
  ArrowLeft: 'rollLeft', ArrowRight: 'rollRight',
  ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown', ControlRight: 'throttleDown',
};

export function bindInput(input, canvas, onFirstGesture) {
  const down = (e) => {
    if (e.code === 'Space') { input.action = true; e.preventDefault(); return; }
    if (e.code === 'Enter') { input.start = true; return; }
    if (e.code === 'KeyP' || e.code === 'Escape') { input.pause = true; return; }
    if (e.code === 'KeyR') { input.restart = true; return; }
    if (e.code === 'KeyM') { input.mute = true; return; }
    const field = KEYMAP[e.code];
    if (field) { input[field] = true; e.preventDefault(); }
    onFirstGesture();
  };
  const up = (e) => {
    const field = KEYMAP[e.code];
    if (field) input[field] = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => {
    for (const k of Object.keys(KEYMAP)) input[KEYMAP[k]] = false;
    input.mouseActive = false;
  });
  // Mouse steering: hold the left button and the stick follows the pointer.
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    input.mouseActive = true;
    onFirstGesture();
  });
  window.addEventListener('mouseup', () => { input.mouseActive = false; });
  window.addEventListener('mousemove', (e) => {
    if (!input.mouseActive) return;
    const r = canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    input.mouseRoll = Math.max(-1, Math.min(1, nx));
    input.mousePitch = Math.max(-1, Math.min(1, ny));
  });
  canvas.addEventListener('click', onFirstGesture);
}

export function clearEdges(input) {
  input.action = false; input.pause = false;
  input.restart = false; input.start = false; input.mute = false;
}
