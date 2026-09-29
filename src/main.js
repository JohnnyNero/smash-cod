import './style.css';
import './showdown.css';
import './theme.css';
import { InputManager } from './input.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { preloadRigs } from './models/rig.js';

const input = new InputManager();
const audio = new Audio();
audio.loadCries(['pikachu', 'charizard', 'blastoise', 'venusaur', 'gengar', 'lucario']);
// Load the Pokémon models first (about 2 MB); the game falls back to procedural models if not.
await preloadRigs();
const game = new Game(document.getElementById('game'), document.getElementById('ui'), input, audio);

// Browsers only allow audio after a user gesture.
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(ev, () => audio.unlock(), { passive: true });
}
document.addEventListener('contextmenu', (e) => e.preventDefault());
// M toggles the music anywhere (remembered).
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyM' || e.repeat) return;
  audio.toggleMusic();
  if (game.state === 'paused') game.ui.showPause(true, audio.musicOn);
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (new URLSearchParams(location.search).has('lab')) {
  import('./lab.js').then(({ startLab }) => startLab(game));
}

window.smashOps = game; // handy for poking at things from the console
