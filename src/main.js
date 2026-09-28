import './style.css';
import { InputManager } from './input.js';
import { Audio } from './audio.js';
import { Game } from './game.js';

const input = new InputManager();
const audio = new Audio();
const game = new Game(document.getElementById('game'), document.getElementById('ui'), input, audio);

// Browsers only allow audio after a user gesture.
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(ev, () => audio.unlock(), { passive: true });
}
document.addEventListener('contextmenu', (e) => e.preventDefault());

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.smashOps = game; // handy for poking at things from the console
