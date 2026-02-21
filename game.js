// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

// Game constants
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 30;
const PLAYER_SPEED = 5;
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 15;
const BULLET_SPEED = 7;
const ENEMY_WIDTH = 40;
const ENEMY_HEIGHT = 30;
const ENEMY_ROWS = 4;
const ENEMY_COLS = 8;
const ENEMY_SPACING = 60;
const ENEMY_BASE_SPEED = 0.8;
const ENEMY_BULLET_SPEED = 4;
const ENEMY_BULLET_CHANCE = 0.001;

// Swoop attack constants
const SWOOP_CHANCE = 0.0008; // Chance per frame per enemy
const SWOOP_SPEED = 3;
const SWOOP_DURATION = 180; // frames for complete swoop
const MAX_SWOOPING_ENEMIES = 2; // Maximum enemies swooping at once

// Game state
let gameState = 'start'; // 'start', 'playing', 'gameOver'
let score = 0;
let lives = 3;
let level = 1;
let enemyDirection = 1; // 1 = right, -1 = left
let enemyMoveCounter = 0;
let enemyMoveDelay = 30; // frames between enemy steps
let totalEnemies = ENEMY_ROWS * ENEMY_COLS;

// Player object
const player = {
    x: canvas.width / 2 - PLAYER_WIDTH / 2,
    y: canvas.height - 60,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    speed: PLAYER_SPEED
};

// Arrays for game objects
let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let swoopingEnemies = [];

// Keyboard input tracking
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    KeyA: false,
    KeyD: false,
    Space: false
};

// Shooting cooldown
let canShoot = true;
let shootCooldown = 250; // milliseconds between shots

// Sound files configuration
const sounds = {
    shoot: new Audio('sounds/shoot.mp3'),
    explosion: new Audio('sounds/explosion.mp3'),
    enemyShoot: new Audio('sounds/enemy-shoot.mp3'),
    hit: new Audio('sounds/hit.mp3'),
    levelUp: new Audio('sounds/level-up.mp3'),
    gameOver: new Audio('sounds/game-over.mp3')
};

// Set volume for all sounds
Object.values(sounds).forEach(sound => {
    sound.volume = 0.3;
});

// Sound playback functions with fallback
function playSound(soundName) {
    const sound = sounds[soundName];
    if (sound) {
        // Clone the audio to allow overlapping sounds
        const clone = sound.cloneNode();
        clone.volume = sound.volume;
        clone.play().catch(e => {
            console.log(`Could not play ${soundName} sound:`, e.message);
        });
    }
}

function playShootSound() {
    playSound('shoot');
}

function playExplosionSound() {
    playSound('explosion');
}

function playEnemyShootSound() {
    playSound('enemyShoot');
}

function playHitSound() {
    playSound('hit');
}

function playLevelUpSound() {
    playSound('levelUp');
}

function playGameOverSound() {
    playSound('gameOver');
}

// Helper functions
function getAliveEnemyCount() {
    return enemies.filter(e => e.alive && e.state === 'formation').length;
}

function calculateEnemySpeed() {
    const aliveCount = getAliveEnemyCount();
    if (aliveCount === 0) return ENEMY_BASE_SPEED;

    // Speed increases as enemies decrease (authentic Space Invaders)
    const speedMultiplier = 1 + ((totalEnemies - aliveCount) / totalEnemies) * 2;
    return ENEMY_BASE_SPEED * speedMultiplier * (1 + level * 0.15);
}

function getFormationBounds() {
    let leftmost = canvas.width;
    let rightmost = 0;

    enemies.forEach(enemy => {
        if (enemy.alive && enemy.state === 'formation') {
            if (enemy.x < leftmost) leftmost = enemy.x;
            if (enemy.x + enemy.width > rightmost) rightmost = enemy.x + enemy.width;
        }
    });

    return { leftmost, rightmost };
}

// Bezier curve calculation
function bezierPoint(t, p0, p1, p2) {
    // Quadratic Bezier: B(t) = (1-t)² * P0 + 2(1-t)t * P1 + t² * P2
    const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
    const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
    return { x, y };
}

// Initiate swoop attack
function initiateSwoop(enemy) {
    enemy.state = 'swooping';
    enemy.swoopProgress = 0;

    // Create swoop path using Bezier curve
    const startPoint = { x: enemy.x, y: enemy.y };

    // Target point near player
    const targetX = player.x + (Math.random() - 0.5) * 100;
    const targetY = player.y - 50;

    // Control point creates the curve (to the side)
    const side = Math.random() > 0.5 ? 1 : -1;
    const controlPoint = {
        x: (startPoint.x + targetX) / 2 + side * 150,
        y: (startPoint.y + targetY) / 2 + 100
    };

    // End point returns near formation position
    const endPoint = { x: enemy.formationX, y: enemy.formationY };

    enemy.swoopPath = {
        phase: 'dive', // 'dive' or 'return'
        dive: { start: startPoint, control: controlPoint, end: { x: targetX, y: targetY } },
        return: { start: { x: targetX, y: targetY }, control: { x: targetX + side * 100, y: startPoint.y }, end: endPoint }
    };

    swoopingEnemies.push(enemy);
}

// Find nearest available formation position
function findAvailableFormationSpot(returningEnemy) {
    // Build list of all occupied formation spots
    const occupiedSpots = enemies
        .filter(e => e !== returningEnemy && e.alive && e.state === 'formation')
        .map(e => ({ x: e.formationX, y: e.formationY }));

    // Check if original spot is available
    const originalSpotTaken = occupiedSpots.some(spot =>
        Math.abs(spot.x - returningEnemy.formationX) < ENEMY_WIDTH - 5 &&
        Math.abs(spot.y - returningEnemy.formationY) < ENEMY_HEIGHT - 5
    );

    if (!originalSpotTaken) {
        return { x: returningEnemy.formationX, y: returningEnemy.formationY };
    }

    // Original spot is taken, find any available spot in the grid
    const startX = 100;
    const startY = 80;

    // Create all possible formation positions
    const allPositions = [];
    for (let row = 0; row < ENEMY_ROWS; row++) {
        for (let col = 0; col < ENEMY_COLS; col++) {
            allPositions.push({
                x: startX + col * ENEMY_SPACING,
                y: startY + row * ENEMY_SPACING,
                row: row,
                col: col
            });
        }
    }

    // Find first unoccupied position
    for (const pos of allPositions) {
        const isOccupied = occupiedSpots.some(spot =>
            Math.abs(spot.x - pos.x) < ENEMY_WIDTH - 5 &&
            Math.abs(spot.y - pos.y) < ENEMY_HEIGHT - 5
        );

        if (!isOccupied) {
            return { x: pos.x, y: pos.y, row: pos.row, col: pos.col };
        }
    }

    // If somehow no spot found, place at edge of screen (shouldn't happen)
    return { x: canvas.width - 100, y: 80 };
}

// Update swooping enemies
function updateSwoopingEnemies() {
    swoopingEnemies.forEach((enemy, index) => {
        enemy.swoopProgress += SWOOP_SPEED / SWOOP_DURATION;

        if (enemy.swoopProgress >= 1 && enemy.swoopPath.phase === 'dive') {
            // Switch to return phase - find available formation spot
            const targetSpot = findAvailableFormationSpot(enemy);

            enemy.swoopPath.phase = 'return';
            enemy.swoopProgress = 0;

            // Update return path to go to available spot
            const side = Math.random() > 0.5 ? 1 : -1;
            enemy.swoopPath.return = {
                start: { x: enemy.x, y: enemy.y },
                control: { x: enemy.x + side * 100, y: (enemy.y + targetSpot.y) / 2 },
                end: targetSpot
            };

            // Update formation position to new spot
            enemy.formationX = targetSpot.x;
            enemy.formationY = targetSpot.y;

            // Update row/col if provided
            if (targetSpot.row !== undefined) {
                enemy.row = targetSpot.row;
                enemy.col = targetSpot.col;
            }

        } else if (enemy.swoopProgress >= 1 && enemy.swoopPath.phase === 'return') {
            // Swoop complete, return to formation
            // Final check - make sure spot is still available
            const finalCheck = enemies.some(e =>
                e !== enemy &&
                e.alive &&
                e.state === 'formation' &&
                Math.abs(e.x - enemy.formationX) < ENEMY_WIDTH - 5 &&
                Math.abs(e.y - enemy.formationY) < ENEMY_HEIGHT - 5
            );

            if (finalCheck) {
                // Spot got taken while returning, find new spot
                const newSpot = findAvailableFormationSpot(enemy);
                enemy.formationX = newSpot.x;
                enemy.formationY = newSpot.y;
                if (newSpot.row !== undefined) {
                    enemy.row = newSpot.row;
                    enemy.col = newSpot.col;
                }
            }

            enemy.state = 'formation';
            enemy.x = enemy.formationX;
            enemy.y = enemy.formationY;
            enemy.rotation = 0;
            swoopingEnemies.splice(index, 1);
        } else {
            // Calculate position along curve
            const path = enemy.swoopPath.phase === 'dive' ? enemy.swoopPath.dive : enemy.swoopPath.return;
            const pos = bezierPoint(enemy.swoopProgress, path.start, path.control, path.end);
            enemy.x = pos.x;
            enemy.y = pos.y;

            // Calculate rotation based on movement direction
            if (enemy.swoopProgress > 0.01) {
                const prevPos = bezierPoint(Math.max(0, enemy.swoopProgress - 0.02), path.start, path.control, path.end);
                enemy.rotation = Math.atan2(pos.y - prevPos.y, pos.x - prevPos.x);
            }

            // Allow swooping enemies to shoot
            if (Math.random() < ENEMY_BULLET_CHANCE * 3 && enemy.alive) {
                enemyBullets.push({
                    x: enemy.x + enemy.width / 2 - BULLET_WIDTH / 2,
                    y: enemy.y + enemy.height
                });
                playEnemyShootSound();
            }
        }
    });
}

// Initialize enemies
function createEnemies() {
    enemies = [];
    swoopingEnemies = [];
    const startX = 100;
    const startY = 80;

    for (let row = 0; row < ENEMY_ROWS; row++) {
        for (let col = 0; col < ENEMY_COLS; col++) {
            enemies.push({
                x: startX + col * ENEMY_SPACING,
                y: startY + row * ENEMY_SPACING,
                formationX: startX + col * ENEMY_SPACING,
                formationY: startY + row * ENEMY_SPACING,
                width: ENEMY_WIDTH,
                height: ENEMY_HEIGHT,
                alive: true,
                state: 'formation', // 'formation', 'swooping', 'returning'
                row: row,
                col: col,
                type: row === 0 ? 'aggressive' : row === ENEMY_ROWS - 1 ? 'defensive' : 'normal',
                swoopProgress: 0,
                swoopPath: null,
                rotation: 0
            });
        }
    }
    totalEnemies = ENEMY_ROWS * ENEMY_COLS;
}

// Draw player
function drawPlayer() {
    ctx.fillStyle = '#00ff00';
    // Draw ship body
    ctx.fillRect(player.x, player.y + 20, player.width, 10);
    // Draw ship top
    ctx.beginPath();
    ctx.moveTo(player.x + player.width / 2, player.y);
    ctx.lineTo(player.x, player.y + 20);
    ctx.lineTo(player.x + player.width, player.y + 20);
    ctx.closePath();
    ctx.fill();
}

// Draw enemies
function drawEnemies() {
    enemies.forEach(enemy => {
        if (enemy.alive) {
            ctx.save();

            // Apply rotation for swooping enemies
            if (enemy.state === 'swooping' && enemy.rotation !== 0) {
                ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
                ctx.rotate(enemy.rotation);
                ctx.translate(-(enemy.x + enemy.width / 2), -(enemy.y + enemy.height / 2));
            }

            // Different colors based on enemy type
            if (enemy.type === 'aggressive') {
                ctx.fillStyle = '#ff4444'; // Brighter red for aggressive
            } else if (enemy.type === 'defensive') {
                ctx.fillStyle = '#cc0000'; // Darker red for defensive
            } else {
                ctx.fillStyle = '#ff0000'; // Standard red
            }

            // Draw enemy body
            ctx.fillRect(enemy.x, enemy.y + 10, enemy.width, 15);
            // Draw enemy arms
            ctx.fillRect(enemy.x - 5, enemy.y + 15, 10, 5);
            ctx.fillRect(enemy.x + enemy.width - 5, enemy.y + 15, 10, 5);
            // Draw enemy eyes
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(enemy.x + 10, enemy.y + 15, 5, 5);
            ctx.fillRect(enemy.x + 25, enemy.y + 15, 5, 5);

            // Add swooping indicator
            if (enemy.state === 'swooping') {
                ctx.fillStyle = '#ffff00';
                ctx.fillRect(enemy.x + enemy.width / 2 - 3, enemy.y, 6, 6);
            }

            ctx.restore();
        }
    });
}

// Draw bullets
function drawBullets() {
    ctx.fillStyle = '#00ff00';
    bullets.forEach(bullet => {
        ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
    });

    ctx.fillStyle = '#ff00ff';
    enemyBullets.forEach(bullet => {
        ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
    });
}

// Draw particles
function drawParticles() {
    particles.forEach(particle => {
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.alpha;
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    ctx.globalAlpha = 1;
}

// Update player position
function updatePlayer() {
    if ((keys.ArrowLeft || keys.KeyA) && player.x > 0) {
        player.x -= player.speed;
    }
    if ((keys.ArrowRight || keys.KeyD) && player.x < canvas.width - player.width) {
        player.x += player.speed;
    }
}

// Update bullets
function updateBullets() {
    bullets = bullets.filter(bullet => {
        bullet.y -= BULLET_SPEED;
        return bullet.y > -BULLET_HEIGHT;
    });

    enemyBullets = enemyBullets.filter(bullet => {
        bullet.y += ENEMY_BULLET_SPEED;
        return bullet.y < canvas.height;
    });
}

// Update enemies
function updateEnemies() {
    // Update swooping enemies
    updateSwoopingEnemies();

    // Calculate alive count
    const aliveCount = getAliveEnemyCount();

    // Enemy shooting happens every frame (not tied to movement)
    enemies.forEach(enemy => {
        if (enemy.alive && enemy.state === 'formation') {
            const shootChance = enemy.type === 'aggressive' ? ENEMY_BULLET_CHANCE * 2 : ENEMY_BULLET_CHANCE;
            if (Math.random() < shootChance * (1 + level * 0.2)) {
                enemyBullets.push({
                    x: enemy.x + enemy.width / 2 - BULLET_WIDTH / 2,
                    y: enemy.y + enemy.height
                });
                playEnemyShootSound();
            }
        }
    });

    // Step-based movement timing
    enemyMoveCounter++;

    // Calculate dynamic move delay based on enemy count (faster as enemies die)
    enemyMoveDelay = Math.max(3, 15 - (totalEnemies - aliveCount) * 0.5);

    if (enemyMoveCounter >= enemyMoveDelay) {
        enemyMoveCounter = 0;

        // Get formation bounds
        const bounds = getFormationBounds();
        const speed = calculateEnemySpeed();
        let shouldMoveDown = false;

        // Check if formation hits edge
        if ((bounds.leftmost <= 0 && enemyDirection === -1) ||
            (bounds.rightmost >= canvas.width && enemyDirection === 1)) {
            shouldMoveDown = true;
        }

        // Update formation enemies
        enemies.forEach(enemy => {
            if (enemy.alive && enemy.state === 'formation') {
                if (shouldMoveDown) {
                    enemy.y += 20;
                    enemy.formationY += 20;

                    // Check if enemies reached the player
                    if (enemy.y + enemy.height >= player.y) {
                        gameOver();
                    }
                } else {
                    enemy.x += speed * enemyDirection * 5;
                    enemy.formationX += speed * enemyDirection * 5;
                }
            }
        });

        if (shouldMoveDown) {
            enemyDirection *= -1;
        }
    }

    // Initiate swoop attacks
    if (swoopingEnemies.length < MAX_SWOOPING_ENEMIES && aliveCount > 0) {
        enemies.forEach(enemy => {
            if (enemy.alive && enemy.state === 'formation') {
                // Higher swoop chance for aggressive types and as enemies decrease
                const swoopChance = SWOOP_CHANCE * (enemy.type === 'aggressive' ? 2 : 1) *
                                   (1 + (totalEnemies - aliveCount) / totalEnemies);

                if (Math.random() < swoopChance && swoopingEnemies.length < MAX_SWOOPING_ENEMIES) {
                    initiateSwoop(enemy);
                }
            }
        });
    }
}

// Update particles
function updateParticles() {
    particles = particles.filter(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.alpha -= 0.02;
        return particle.alpha > 0;
    });
}

// Create explosion particles
function createExplosion(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            size: Math.random() * 4 + 2,
            alpha: 1,
            color: color
        });
    }
}

// Collision detection
function checkCollisions() {
    // Check bullet vs enemy collisions
    bullets.forEach((bullet, bulletIndex) => {
        enemies.forEach(enemy => {
            if (enemy.alive &&
                bullet.x < enemy.x + enemy.width &&
                bullet.x + BULLET_WIDTH > enemy.x &&
                bullet.y < enemy.y + enemy.height &&
                bullet.y + BULLET_HEIGHT > enemy.y) {

                enemy.alive = false;
                bullets.splice(bulletIndex, 1);
                score += 10 * level;
                updateScore();
                createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0000');
                playExplosionSound();

                // Check if all enemies destroyed
                if (enemies.every(e => !e.alive)) {
                    levelUp();
                }
            }
        });
    });

    // Check enemy bullet vs player collisions
    enemyBullets.forEach((bullet, bulletIndex) => {
        if (bullet.x < player.x + player.width &&
            bullet.x + BULLET_WIDTH > player.x &&
            bullet.y < player.y + player.height &&
            bullet.y + BULLET_HEIGHT > player.y) {

            enemyBullets.splice(bulletIndex, 1);
            lives--;
            updateLives();
            createExplosion(player.x + player.width / 2, player.y + player.height / 2, '#00ff00');
            playHitSound();

            if (lives <= 0) {
                gameOver();
            }
        }
    });
}

// Shoot bullet
function shootBullet() {
    if (canShoot) {
        bullets.push({
            x: player.x + player.width / 2 - BULLET_WIDTH / 2,
            y: player.y
        });
        playShootSound();
        canShoot = false;
        setTimeout(() => {
            canShoot = true;
        }, shootCooldown);
    }
}

// Update UI
function updateScore() {
    document.getElementById('score').textContent = `Score: ${score}`;
}

function updateLives() {
    document.getElementById('lives').textContent = `Lives: ${lives}`;
}

function updateLevel() {
    document.getElementById('level').textContent = `Level: ${level}`;
}

// Level up
function levelUp() {
    level++;
    updateLevel();
    createEnemies();
    bullets = [];
    enemyBullets = [];
    swoopingEnemies = [];
    enemyMoveCounter = 0;
    playLevelUpSound();
}

// Game over
function gameOver() {
    gameState = 'gameOver';
    document.getElementById('final-score').textContent = `Final Score: ${score}`;
    document.getElementById('game-over-screen').classList.remove('hidden');
    playGameOverSound();
}

// Start game
function startGame() {
    console.log('startGame() function called!');
    gameState = 'playing';
    score = 0;
    lives = 3;
    level = 1;
    bullets = [];
    enemyBullets = [];
    particles = [];
    swoopingEnemies = [];
    enemyDirection = 1;
    enemyMoveCounter = 0;
    enemyMoveDelay = 30;

    player.x = canvas.width / 2 - PLAYER_WIDTH / 2;

    updateScore();
    updateLives();
    updateLevel();
    createEnemies();

    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');

    console.log('Hiding start screen:', startScreen);
    console.log('Start screen classes before:', startScreen.className);

    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    console.log('Start screen classes after:', startScreen.className);
    console.log('Game state:', gameState);
}

// Draw background stars
let stars = [];
for (let i = 0; i < 100; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2
    });
}

function drawBackground() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });
}

// Main game loop
function gameLoop() {
    drawBackground();

    if (gameState === 'playing') {
        updatePlayer();
        updateBullets();
        updateEnemies();
        updateParticles();
        checkCollisions();

        drawPlayer();
        drawEnemies();
        drawBullets();
        drawParticles();
    }

    requestAnimationFrame(gameLoop);
}

// Event listeners
document.addEventListener('keydown', (e) => {
    // Prevent default behavior for game keys
    if (e.code === 'Space' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' ||
        e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
    }

    // Handle shooting separately before updating key state
    if (e.code === 'Space' && gameState === 'playing' && !keys.Space) {
        shootBullet();
    }

    // Update key state
    if (e.code in keys) {
        keys[e.code] = true;
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code in keys) {
        keys[e.code] = false;
    }
});

// Add click listeners with debug logging
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');

console.log('Start button:', startButton);
console.log('Restart button:', restartButton);

// Debug: detect what element is on top
document.addEventListener('click', function(e) {
    console.log('Click detected at:', e.clientX, e.clientY);
    console.log('Element clicked:', e.target);
    console.log('Elements at click point:', document.elementsFromPoint(e.clientX, e.clientY));
});

if (startButton) {
    startButton.addEventListener('click', function(e) {
        console.log('Start button clicked!', e);
        startGame();
    });

    // Also try direct onclick
    startButton.onclick = function(e) {
        console.log('Start button onclick fired!', e);
        startGame();
    };
}

if (restartButton) {
    restartButton.addEventListener('click', function(e) {
        console.log('Restart button clicked!', e);
        startGame();
    });
}

// Start the game loop
gameLoop();
