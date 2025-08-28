// Game tuning parameters
const SPAWN_INTERVAL = 0.9; // seconds
const MIN_VY = 140; // pixels/sec
const MAX_VY = 180; // pixels/sec
const SWAY_MAX_VX = 25; // pixels/sec
const ITEM_RADIUS = 20; // pixels
const GOLDEN_BELL_CHANCE = 0.05; // 5%
const SMELLY_SOCK_CHANCE = 0.1; // 10%

// Game variables
let score = 0;
let lives = 3;
let timeLeft = 60;
let bestScore = parseInt(localStorage.getItem("colinSchoolRushBestScore")) || 0;
let canvas, ctx;
let animationId;
let player;
let keys = {};
let items = [];
let spawnTimer = 0;
let lastTime = 0;
let gameOver = false;
let screenShake = 0;
let audioContext;

// Audio feedback
function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.log("Audio not supported");
  }
}

function playSound(frequency, duration, type = "sine") {
  if (!audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.type = type;

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + duration
  );

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

// Collision detection: AABB vs Circle
function intersectsAABBCircle(rect, circle) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

  const distanceX = circle.x - closestX;
  const distanceY = circle.y - closestY;

  return (
    distanceX * distanceX + distanceY * distanceY <
    circle.radius * circle.radius
  );
}

// Handle catching an item
function catchItem(item) {
  switch (item.type) {
    case "golden_bell":
      score += 5;
      playSound(800, 0.2, "sine"); // Higher pitch for golden bell
      break;
    case "smelly_sock":
      lives--;
      playSound(200, 0.3, "sawtooth"); // Low buzz for sock
      screenShake = 0.3; // Screen shake
      break;
    default: // Regular items
      score += 1;
      playSound(400, 0.1, "sine"); // Regular pop sound
      break;
  }

  // Update best score
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem("colinSchoolRushBestScore", bestScore.toString());
  }

  updateHUD();
}

// FallingItem class for school supplies
class FallingItem {
  constructor(type, x, y, vx, vy, radius) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.rotation = 0;
    this.rotationSpeed = (Math.random() - 0.5) * 0.1;
    this.caught = false;
  }

  update(dt) {
    // Apply gravity
    this.vy += 400 * dt;

    // Update position
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Update rotation
    this.rotation += this.rotationSpeed;

    // Check collision with player
    if (!this.caught && player) {
      const playerRect = {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height,
      };

      const itemCircle = {
        x: this.x,
        y: this.y,
        radius: this.radius,
      };

      if (intersectsAABBCircle(playerRect, itemCircle)) {
        this.caught = true;
        catchItem(this);
      }
    }
  }

  draw() {
    ctx.save();

    // Apply screen shake
    if (screenShake > 0) {
      const shakeX = (Math.random() - 0.5) * screenShake * 10;
      const shakeY = (Math.random() - 0.5) * screenShake * 10;
      ctx.translate(shakeX, shakeY);
    }

    // Move to item position and apply rotation
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Draw the item based on type
    ctx.font = `${this.radius * 1.5}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let emoji;
    let color = "white";

    switch (this.type) {
      case "notebook":
        emoji = "📓";
        break;
      case "pencil":
        emoji = "✏️";
        break;
      case "apple":
        emoji = "🍎";
        break;
      case "ruler":
        emoji = "📏";
        break;
      case "golden_bell":
        emoji = "🔔";
        color = "#FFD700"; // Gold color
        // Add glow effect
        ctx.shadowColor = "#FFD700";
        ctx.shadowBlur = 10;
        break;
      case "smelly_sock":
        emoji = "🧦";
        color = "#8B4513"; // Brown color
        break;
      default:
        emoji = "📚";
    }

    ctx.fillStyle = color;
    ctx.fillText(emoji, 0, 0);

    ctx.restore();
  }

  isOffScreen() {
    const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
    return this.y > canvasHeight + this.radius;
  }
}

// Player class for Colin's backpack
class Player {
  constructor(x, y, width, height, speed) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.image = new Image();
    this.image.src = "bag.png";
  }

  update() {
    // Handle left movement
    if (keys["ArrowLeft"] || keys["a"] || keys["A"]) {
      this.x -= this.speed;
    }

    // Handle right movement
    if (keys["ArrowRight"] || keys["d"] || keys["D"]) {
      this.x += this.speed;
    }

    // Keep player within canvas bounds
    if (this.x < 0) {
      this.x = 0;
    }
    if (this.x + this.width > canvas.width / (window.devicePixelRatio || 1)) {
      this.x = canvas.width / (window.devicePixelRatio || 1) - this.width;
    }
  }

  draw() {
    // Draw the backpack image
    if (this.image.complete) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    } else {
      // Fallback rectangle if image isn't loaded yet
      ctx.fillStyle = "#4ecdc4";
      ctx.fillRect(this.x, this.y, this.width, this.height);

      // Draw a simple backpack icon
      ctx.fillStyle = "white";
      ctx.font = "24px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🎒", this.x + this.width / 2, this.y + this.height / 2);
    }
  }
}

// Spawn a new falling item
function spawnItem() {
  const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
  const x = Math.random() * (canvasWidth - ITEM_RADIUS * 2) + ITEM_RADIUS;
  const y = -ITEM_RADIUS;

  const rand = Math.random();
  let type;

  if (rand < GOLDEN_BELL_CHANCE) {
    type = "golden_bell";
  } else if (rand < GOLDEN_BELL_CHANCE + SMELLY_SOCK_CHANCE) {
    type = "smelly_sock";
  } else {
    const regularTypes = ["notebook", "pencil", "apple", "ruler"];
    type = regularTypes[Math.floor(Math.random() * regularTypes.length)];
  }

  const vy = MIN_VY + Math.random() * (MAX_VY - MIN_VY);
  const vx = (Math.random() - 0.5) * 2 * SWAY_MAX_VX;

  items.push(new FallingItem(type, x, y, vx, vy, ITEM_RADIUS));
}

// Reset game state
function resetGame() {
  score = 0;
  lives = 3;
  timeLeft = 60;
  items = [];
  spawnTimer = 0;
  gameOver = false;
  screenShake = 0;

  // Reset player position
  if (player) {
    const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
    const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
    const playerWidth = 60;
    const playerHeight = 60;
    player.x = (canvasWidth - playerWidth) / 2;
    player.y = canvasHeight - playerHeight - 20;
  }

  updateHUD();
  hideGameOverModal();
}

// Show game over modal
function showGameOverModal() {
  const modal = document.createElement("div");
  modal.id = "gameOverModal";
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  const content = document.createElement("div");
  content.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 3rem;
    border-radius: 20px;
    text-align: center;
    color: white;
    font-family: "Comic Sans MS", cursive, sans-serif;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    border: 3px solid rgba(255, 255, 255, 0.2);
  `;

  content.innerHTML = `
    <h1 style="font-size: 2.5rem; margin-bottom: 1rem;">Game Over!</h1>
    <p style="font-size: 1.5rem; margin-bottom: 0.5rem;">Final Score: ${score}</p>
    <p style="font-size: 1.2rem; margin-bottom: 2rem;">Best Score: ${bestScore}</p>
    <div style="display: flex; gap: 1rem; justify-content: center;">
      <button onclick="resetGame()" style="
        background: linear-gradient(45deg, #4ecdc4, #44a08d);
        color: white;
        border: none;
        padding: 1rem 2rem;
        font-size: 1.2rem;
        border-radius: 25px;
        cursor: pointer;
        font-family: inherit;
        font-weight: bold;
      ">Play Again</button>
      <button onclick="window.location.href='index.html'" style="
        background: linear-gradient(45deg, #ff6b6b, #ee5a24);
        color: white;
        border: none;
        padding: 1rem 2rem;
        font-size: 1.2rem;
        border-radius: 25px;
        cursor: pointer;
        font-family: inherit;
        font-weight: bold;
      ">Home</button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);
}

// Hide game over modal
function hideGameOverModal() {
  const modal = document.getElementById("gameOverModal");
  if (modal) {
    modal.remove();
  }
}

// Initialize the game
function init() {
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  // Set up high-DPI rendering
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // Set the actual size in memory (scaled up for high-DPI)
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;

  // Scale the drawing context so everything draws at the correct size
  ctx.scale(dpr, dpr);

  // Set the CSS size to the display size
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";

  // Create player (backpack) at bottom center
  const canvasWidth = canvas.width / dpr;
  const canvasHeight = canvas.height / dpr;
  const playerWidth = 60;
  const playerHeight = 60;
  const playerX = (canvasWidth - playerWidth) / 2;
  const playerY = canvasHeight - playerHeight - 20;

  player = new Player(playerX, playerY, playerWidth, playerHeight, 5);

  // Initialize timing
  lastTime = performance.now();

  // Initialize audio
  initAudio();

  // Update HUD displays
  updateHUD();

  // Start the game loop
  gameLoop();
}

// Game loop using requestAnimationFrame
function gameLoop() {
  const currentTime = performance.now();
  const dt = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  update(dt);
  draw();
  animationId = requestAnimationFrame(gameLoop);
}

// Update game state
function update(dt) {
  if (gameOver) return;

  // Update countdown timer
  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    gameOver = true;
    showGameOverModal();
    return;
  }

  // Check lives
  if (lives <= 0) {
    gameOver = true;
    showGameOverModal();
    return;
  }

  // Update spawn timer
  spawnTimer += dt;
  if (spawnTimer >= SPAWN_INTERVAL) {
    spawnItem();
    spawnTimer = 0;
  }

  // Update all falling items
  items.forEach((item) => item.update(dt));

  // Remove items that are off screen or caught
  items = items.filter((item) => !item.isOffScreen() && !item.caught);

  // Update player movement
  if (player) {
    player.update();
  }

  // Update screen shake
  if (screenShake > 0) {
    screenShake -= dt;
    if (screenShake < 0) screenShake = 0;
  }
}

// Draw everything to the canvas
function draw() {
  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw a subtle background pattern
  drawBackgroundPattern();

  // Draw all falling items
  items.forEach((item) => item.draw());

  // Draw the main text (moved to top)
  ctx.fillStyle = "white";
  ctx.font = 'bold 32px "Comic Sans MS", cursive, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Add text shadow effect
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const centerX = canvas.width / (window.devicePixelRatio || 1) / 2;
  const topY = 50;

  ctx.fillText("Help Colin collect school supplies!", centerX, topY);

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Draw the player (backpack)
  if (player) {
    player.draw();
  }
}

// Draw a subtle background pattern
function drawBackgroundPattern() {
  ctx.save();
  ctx.globalAlpha = 0.1;

  // Draw some floating school supplies
  const supplies = ["📚", "✏️", "🎒", "📝", "🔍", "📖"];
  const fontSize = 24;

  for (let i = 0; i < 6; i++) {
    const x =
      (canvas.width / (window.devicePixelRatio || 1)) * (0.2 + i * 0.15);
    const y =
      (canvas.height / (window.devicePixelRatio || 1)) *
      (0.3 + Math.sin(Date.now() * 0.001 + i) * 0.1);

    ctx.font = `${fontSize}px Arial`;
    ctx.fillText(supplies[i], x, y);
  }

  ctx.restore();
}

// Update HUD displays
function updateHUD() {
  document.getElementById("scoreDisplay").textContent = score;
  document.getElementById("timerDisplay").textContent =
    Math.max(0, Math.floor(timeLeft)) + "s";

  // Update HUD to show lives
  const hudBar = document.querySelector(".hud-bar");
  if (hudBar) {
    // Remove existing lives display if it exists
    const existingLives = document.getElementById("livesDisplay");
    if (existingLives) {
      existingLives.parentElement.remove();
    }

    // Add lives display
    const livesItem = document.createElement("div");
    livesItem.className = "hud-item";
    livesItem.innerHTML = `
      <span class="hud-label">Lives:</span>
      <span class="hud-value" id="livesDisplay">${lives}</span>
    `;
    hudBar.appendChild(livesItem);
  }
}

// Handle window resize
function handleResize() {
  if (canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    // Update player position after resize
    if (player) {
      const canvasWidth = canvas.width / dpr;
      const canvasHeight = canvas.height / dpr;
      const playerWidth = 60;
      const playerHeight = 60;
      const playerX = (canvasWidth - playerWidth) / 2;
      const playerY = canvasHeight - playerHeight - 20;

      player.x = playerX;
      player.y = playerY;
      player.width = playerWidth;
      player.height = playerHeight;
    }
  }
}

// Handle keyboard input
function handleKeyDown(e) {
  keys[e.key] = true;
}

function handleKeyUp(e) {
  keys[e.key] = false;
}

// Utility function to add score
function addScore(points) {
  score += points;
  updateHUD();
}

// Utility function to update timer
function updateTimer(newTime) {
  timeLeft = newTime;
  updateHUD();
}

// Event listeners
window.addEventListener("load", init);
window.addEventListener("resize", handleResize);
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

// Clean up animation when page is unloaded
window.addEventListener("beforeunload", () => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
});
