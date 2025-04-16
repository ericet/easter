// Leaderboard handling with Firebase
function updateLeaderboard() {
    const leaderboardDiv = document.getElementById('leaderboard-entries');
    leaderboardDiv.innerHTML = '<div class="loading">Loading scores...</div>';
    
    // Get top 10 scores from Firebase
    const scoresRef = firebase.database().ref('scores');
    scoresRef.orderByChild('score')
            .limitToLast(10)
            .on('value', (snapshot) => {
                const scores = [];
                snapshot.forEach((childSnapshot) => {
                    scores.unshift(childSnapshot.val());
                });
                
                // Display scores
                leaderboardDiv.innerHTML = '';
                scores.forEach((score, index) => {
                    const entry = document.createElement('div');
                    entry.className = 'leaderboard-entry';
                    entry.innerHTML = `
                        <span class="rank">#${index + 1}</span>
                        <span class="player-name">${score.name}</span>
                        <span class="score">${score.score}</span>
                    `;
                    leaderboardDiv.appendChild(entry);
                });
            });
}

function checkHighScore(score) {
    return new Promise((resolve) => {
        const scoresRef = firebase.database().ref('scores');
        scoresRef.orderByChild('score')
                .limitToLast(10)
                .once('value')
                .then((snapshot) => {
                    const scores = [];
                    snapshot.forEach((childSnapshot) => {
                        scores.push(childSnapshot.val());
                    });
                    const lowestScore = scores.length < 10 ? 0 : Math.min(...scores.map(s => s.score));
                    resolve(scores.length < 10 || score > lowestScore);
                });
    });
}

function submitScore() {
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value.trim();
    if (!name) return;
    
    const scoreData = {
        name: name,
        score: window.lastScore,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    // Save to Firebase
    const scoresRef = firebase.database().ref('scores');
    scoresRef.push(scoreData)
            .then(() => {
                // Hide modal
                document.getElementById('player-name-modal').style.display = 'none';
                document.querySelector('.modal-overlay').style.display = 'none';
                
                // Highlight the new score in the leaderboard
                setTimeout(() => {
                    const entries = document.querySelectorAll('.leaderboard-entry');
                    entries.forEach(entry => {
                        const entryName = entry.querySelector('.player-name').textContent;
                        const entryScore = parseInt(entry.querySelector('.score').textContent);
                        if (entryName === name && entryScore === window.lastScore) {
                            entry.classList.add('highlight');
                        }
                    });
                }, 500);
            })
            .catch(error => {
                console.error('Error saving score:', error);
                window.showNotification('Failed to save score. Please try again.', '🐰 Error 🐰', '⚠️');
            });
}

// Initialize leaderboard
updateLeaderboard();

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        
        // Check if device is mobile
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Touch state for mobile controls
        this.touchState = {
            active: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0
        };
        
        // Virtual joystick properties
        this.joystick = {
            visible: false,
            baseX: 0,
            baseY: 0,
            stickX: 0,
            stickY: 0,
            radius: this.isMobile ? 40 : 50, // Smaller radius on mobile
            stickRadius: this.isMobile ? 20 : 25 // Smaller stick on mobile
        };
        
        // Set default canvas size
        this.canvas.width = 640;
        this.canvas.height = 480;
        
        // Initialize game after setting up properties
        this.initializeGame();

        // Event listeners for game controls
        const startButton = document.getElementById('startButton');
        const restartButton = document.getElementById('restartButton');
        
        if (startButton) {
            startButton.addEventListener('click', () => this.startGame());
        }
        
        if (restartButton) {
            restartButton.addEventListener('click', () => this.restartGame());
        }
    }

    initializeGame() {
        this.score = 0;
        this.timeLeft = 60;
        this.gameOver = false;
        this.gameStarted = false;
        this.eggs = [];
        this.obstacles = [];
        document.getElementById('score').textContent = '0';
        document.getElementById('time').textContent = '60';
        
        // Hide game canvas and container initially
        this.canvas.style.display = 'none';
        document.getElementById('score-time').style.display = 'block';
        
        // Hide the canvas container when game is not started
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.style.display = 'none';
        }
        
        // Set canvas size responsively
        this.resizeCanvas();
        
        this.player = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            width: 40,
            height: 50,
            speed: 4,
            baseSpeed: 4, // Store base speed for reference
            direction: 'right',
            color: '#FFFFFF',  // White for the Easter bunny
            earColor: '#FFE4E4',  // Pink inner ears
            basketColor: '#FF69B4', // Hot pink basket
            basketHighlight: '#FFD700',  // Gold highlights
            basketPattern: ['#87CEEB', '#98FB98', '#DDA0DD', '#F0E68C'], // Colorful pattern
            animation: 0
        };

        // Movement state
        this.keys = {
            ArrowLeft: false,
            ArrowRight: false,
            ArrowUp: false,
            ArrowDown: false
        };

        // Event listeners for keyboard
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleKeyUp = this.handleKeyUp.bind(this);
        window.addEventListener('keydown', this.boundHandleKeyDown);
        window.addEventListener('keyup', this.boundHandleKeyUp);
        
        // Event listeners for touch controls
        this.boundHandleTouchStart = this.handleTouchStart.bind(this);
        this.boundHandleTouchMove = this.handleTouchMove.bind(this);
        this.boundHandleTouchEnd = this.handleTouchEnd.bind(this);
        this.boundHandleResize = this.resizeCanvas.bind(this);
        
        this.canvas.addEventListener('touchstart', this.boundHandleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.boundHandleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.boundHandleTouchEnd);
        window.addEventListener('resize', this.boundHandleResize);

        // Create obstacles (trees)
        this.createObstacles();
    }

    createObstacles() {
        const numObstacles = 8;
        for (let i = 0; i < numObstacles; i++) {
            let obstacle;
            do {
                obstacle = {
                    x: Math.random() * (this.canvas.width - 40),
                    y: Math.random() * (this.canvas.height - 60),
                    width: 40,
                    height: 60
                };
            } while (this.checkObstacleOverlap(obstacle));
            this.obstacles.push(obstacle);
        }
    }

    checkObstacleOverlap(newObstacle) {
        // Check overlap with player starting position
        const playerBuffer = 100;
        if (Math.abs(newObstacle.x - this.player.x) < playerBuffer &&
            Math.abs(newObstacle.y - this.player.y) < playerBuffer) {
            return true;
        }

        // Check overlap with other obstacles
        return this.obstacles.some(obstacle => {
            const buffer = 60;
            return Math.abs(newObstacle.x - obstacle.x) < buffer &&
                   Math.abs(newObstacle.y - obstacle.y) < buffer;
        });
    }

    handleKeyDown(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = true;
        }
    }

    handleKeyUp(e) {
        if (this.keys.hasOwnProperty(e.key)) {
            this.keys[e.key] = false;
        }
    }
    
    resizeCanvas() {
        try {
            // Get the canvas container dimensions
            const container = document.getElementById('canvas-container');
            
            // Check if container exists
            if (!container) {
                console.warn('Canvas container not found');
                return;
            }
            
            // Use fixed dimensions to maintain consistent size across game sessions
            const fixedWidth = 640;
            const fixedHeight = 480;
            
            // Set canvas dimensions to fixed size
            this.canvas.width = fixedWidth;
            this.canvas.height = fixedHeight;
            
            // Ensure the container maintains the proper dimensions
            container.style.width = `${fixedWidth}px`;
            container.style.height = `${fixedHeight}px`;
            
            // Reposition player if needed
            if (this.player) {
                this.player.x = Math.min(this.player.x, this.canvas.width - this.player.width);
                this.player.y = Math.min(this.player.y, this.canvas.height - this.player.height);
            }
        } catch (error) {
            console.error('Error resizing canvas:', error);
            // Set default canvas size if there's an error
            this.canvas.width = 640;
            this.canvas.height = 480;
        }
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        
        if (!this.gameStarted || this.gameOver) return;
        
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        
        this.touchState.active = true;
        this.touchState.startX = touch.clientX - rect.left;
        this.touchState.startY = touch.clientY - rect.top;
        this.touchState.currentX = this.touchState.startX;
        this.touchState.currentY = this.touchState.startY;
        
        // Set up virtual joystick
        this.joystick.visible = true;
        this.joystick.baseX = this.touchState.startX;
        this.joystick.baseY = this.touchState.startY;
        this.joystick.stickX = this.touchState.startX;
        this.joystick.stickY = this.touchState.startY;
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        
        if (!this.touchState.active) return;
        
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        
        this.touchState.currentX = touch.clientX - rect.left;
        this.touchState.currentY = touch.clientY - rect.top;
        
        // Calculate direction and distance
        const dx = this.touchState.currentX - this.touchState.startX;
        const dy = this.touchState.currentY - this.touchState.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Update joystick position with limit on distance
        if (distance > this.joystick.radius) {
            const angle = Math.atan2(dy, dx);
            this.joystick.stickX = this.joystick.baseX + Math.cos(angle) * this.joystick.radius;
            this.joystick.stickY = this.joystick.baseY + Math.sin(angle) * this.joystick.radius;
        } else {
            this.joystick.stickX = this.touchState.currentX;
            this.joystick.stickY = this.touchState.currentY;
        }
        
        // Set movement keys based on joystick position
        const threshold = 10;
        this.keys.ArrowLeft = dx < -threshold;
        this.keys.ArrowRight = dx > threshold;
        this.keys.ArrowUp = dy < -threshold;
        this.keys.ArrowDown = dy > threshold;
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        
        // Reset touch state and keys
        this.touchState.active = false;
        this.joystick.visible = false;
        
        // Reset all movement keys
        this.keys.ArrowLeft = false;
        this.keys.ArrowRight = false;
        this.keys.ArrowUp = false;
        this.keys.ArrowDown = false;
    }

    spawnEggs() {
        const numEggs = 5;
        let attempts = 0;
        const maxAttempts = 50; // Prevent infinite loop
        
        // Special egg chances
        const hasGoldenEgg = Math.random() < 0.2;  // 20% chance for golden egg
        const hasRainbowEgg = Math.random() < 0.1; // 10% chance for rainbow egg
        const hasThunderEgg = Math.random() < 0.15; // 15% chance for thunder egg
        
        for (let i = 0; i < numEggs; i++) {
            let egg;
            let validPosition = false;
            
            while (!validPosition && attempts < maxAttempts) {
                egg = {
                    x: Math.random() * (this.canvas.width - 30),
                    y: Math.random() * (this.canvas.height - 35),
                    width: 30,
                    height: 35,
                    color: ['#FF1493', '#4169E1', '#FFD700', '#9400D3', '#FF4500'][Math.floor(Math.random() * 5)], // Deep Pink, Royal Blue, Gold, Dark Violet, Orange Red
                    pattern: Math.floor(Math.random() * 3),
                    isGolden: false,
                    isRainbow: false
                };
                
                // Special egg assignments (first three eggs only)
                if (i === 0 && hasGoldenEgg) {
                    egg.color = '#FFD700';
                    egg.pattern = 3; // Special pattern for golden egg
                    egg.isGolden = true;
                } else if (i === 1 && hasRainbowEgg) {
                    egg.pattern = 4; // Special pattern for rainbow egg
                    egg.isRainbow = true;
                    egg.color = 'rainbow'; // Special marker for rainbow gradient
                } else if (i === 2 && hasThunderEgg) {
                    egg.pattern = 5; // Special pattern for thunder egg
                    egg.isThunder = true;
                    egg.color = '#FFFF00'; // Yellow color for thunder egg
                }
                
                if (!this.checkEggCollision(egg)) {
                    validPosition = true;
                    this.eggs.push(egg);
                }
                
                attempts++;
            }
        }
        
        // If we couldn't spawn all eggs, clear some obstacles
        if (this.eggs.length < numEggs) {
            this.obstacles = this.obstacles.slice(0, Math.max(2, this.obstacles.length - 2));
            this.spawnEggs(); // Try again with fewer obstacles
        }
    }

    checkEggCollision(egg) {
        // Check collision with obstacles
        return this.obstacles.some(obstacle => {
            return egg.x < obstacle.x + obstacle.width &&
                   egg.x + egg.width > obstacle.x &&
                   egg.y < obstacle.y + obstacle.height &&
                   egg.y + egg.height > obstacle.y;
        });
    }

    async startGame() {
        // Show game elements and canvas container
        this.canvas.style.display = 'block';
        document.getElementById('score-time').style.display = 'block';
        document.getElementById('startButton').style.display = 'none';
        
        // Show the canvas container when game starts
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.style.display = 'block';
        }
        
        // Show countdown
        const overlay = document.getElementById('countdown-overlay');
        overlay.style.display = 'flex';
        
        // Countdown sequence
        const messages = ['Ready...', 'Set...', 'GO!'];
        for (let message of messages) {
            overlay.textContent = message;
            overlay.style.animation = 'none';
            overlay.offsetHeight; // Trigger reflow
            overlay.style.animation = 'scaleIn 0.5s ease-out';
            await new Promise(resolve => setTimeout(resolve, 800));
        }
        
        // Hide overlay and start game
        overlay.style.display = 'none';
        this.gameStarted = true;
        this.spawnEggs();
        this.startTimer();
        this.gameLoop();
    }

    async restartGame() {
        // Clean up event listeners
        window.removeEventListener('keydown', this.boundHandleKeyDown);
        window.removeEventListener('keyup', this.boundHandleKeyUp);
        this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart);
        this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove);
        this.canvas.removeEventListener('touchend', this.boundHandleTouchEnd);
        window.removeEventListener('resize', this.boundHandleResize);
        
        // Reset game state
        this.initializeGame();
        
        // Hide restart button
        document.getElementById('restartButton').style.display = 'none';
        
        // Show the canvas container when restarting the game
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.style.display = 'block';
        }
        
        // Show the canvas
        this.canvas.style.display = 'block';
        
        // Show countdown
        const overlay = document.getElementById('countdown-overlay');
        if (overlay) {
            // Reset overlay styling
            overlay.style.display = 'flex';
            
            // Countdown sequence
            const messages = ['Ready...', 'Set...', 'GO!'];
            for (let message of messages) {
                overlay.textContent = message;
                overlay.style.animation = 'none';
                overlay.offsetHeight; // Trigger reflow
                overlay.style.animation = 'scaleIn 0.5s ease-out';
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            
            // Hide overlay and start game
            overlay.style.display = 'none';
        } else {
            console.error('Countdown overlay element not found');
        }
        
        // Hide single player controls in multiplayer mode
        if (window.isMultiplayerMode) {
            document.getElementById('startButton').style.display = 'none';
        }
        
        // Start the game
        this.canvas.style.display = 'block';
        document.getElementById('score-time').style.display = 'block';
        
        this.gameStarted = true;
        this.spawnEggs();
        this.startTimer();
        this.gameLoop();
    }

    startTimer() {
        const timerElement = document.getElementById('time');
        this.timer = setInterval(() => {
            this.timeLeft--;
            timerElement.textContent = this.timeLeft;
            
            if (this.timeLeft <= 0) {
                this.endGame();
            }
        }, 1000);
    }
    
    resetForHome() {
        // Stop the game timer if running
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        // Clean up event listeners
        window.removeEventListener('keydown', this.boundHandleKeyDown);
        window.removeEventListener('keyup', this.boundHandleKeyUp);
        this.canvas.removeEventListener('touchstart', this.boundHandleTouchStart);
        this.canvas.removeEventListener('touchmove', this.boundHandleTouchMove);
        this.canvas.removeEventListener('touchend', this.boundHandleTouchEnd);
        window.removeEventListener('resize', this.boundHandleResize);
        
        // Reset game state
        this.gameOver = true;
        this.gameStarted = false;
        this.score = 0;
        this.timeLeft = 60;
        this.eggs = [];
        
        // Reset UI elements
        document.getElementById('score').textContent = '0';
        document.getElementById('time').textContent = '60';
        document.getElementById('restartButton').style.display = 'none';
        document.getElementById('startButton').style.display = 'block';
        
        // Hide canvas and container
        this.canvas.style.display = 'none';
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.style.display = 'none';
        }
        
        // Hide countdown overlay if visible
        const overlay = document.getElementById('countdown-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    async endGame() {
        this.gameOver = true;
        clearInterval(this.timer);
        window.lastScore = this.score;
        
        // Hide the canvas container when game ends
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.style.display = 'none';
        }
        
        if (isMultiplayerMode) {
            await multiplayer.submitScore(this.score);
        } else {
            document.getElementById('restartButton').style.display = 'block';
            const isHighScore = await checkHighScore(this.score);
            if (isHighScore) {
                const modal = document.getElementById('player-name-modal');
                const overlay = document.querySelector('.modal-overlay');
                const nameInput = document.getElementById('player-name');
                const finalScoreSpan = modal.querySelector('.final-score');
                
                finalScoreSpan.textContent = this.score;
                modal.style.display = 'block';
                overlay.style.display = 'block';
                nameInput.value = '';
                nameInput.focus();
            } else {
                window.showNotification(`Game Over! Final Score: ${this.score}`, '🐰 Game Over 🐰', '🏆');
            }
        }
    }

    updatePlayer() {
        let newX = this.player.x;
        let newY = this.player.y;

        if (this.keys.ArrowLeft) {
            newX = Math.max(0, this.player.x - this.player.speed);
            this.player.direction = 'left';
        }
        if (this.keys.ArrowRight) {
            newX = Math.min(this.canvas.width - this.player.width, this.player.x + this.player.speed);
            this.player.direction = 'right';
        }
        if (this.keys.ArrowUp) {
            newY = Math.max(0, this.player.y - this.player.speed);
        }
        if (this.keys.ArrowDown) {
            newY = Math.min(this.canvas.height - this.player.height, this.player.y + this.player.speed);
        }

        // Check collision with obstacles before updating position
        const newBounds = {
            x: newX,
            y: newY,
            width: this.player.width,
            height: this.player.height
        };

        if (!this.checkObstacleCollision(newBounds)) {
            this.player.x = newX;
            this.player.y = newY;
        }

        // Update animation counter
        if (this.keys.ArrowLeft || this.keys.ArrowRight || this.keys.ArrowUp || this.keys.ArrowDown) {
            this.player.animation = (this.player.animation + 1) % 30;
        }
    }

    checkObstacleCollision(bounds) {
        return this.obstacles.some(obstacle => {
            return bounds.x < obstacle.x + obstacle.width &&
                   bounds.x + bounds.width > obstacle.x &&
                   bounds.y < obstacle.y + obstacle.height &&
                   bounds.y + bounds.height > obstacle.y;
        });
    }

    checkCollisions() {
        this.eggs = this.eggs.filter(egg => {
            const collision = this.player.x < egg.x + egg.width &&
                            this.player.x + this.player.width > egg.x &&
                            this.player.y < egg.y + egg.height &&
                            this.player.y + this.player.height > egg.y;
            
            if (collision) {
                // Add points based on egg type
                if (egg.isGolden) {
                    this.score += 5;
                    // Show golden egg bonus
                    this.showBonusPoints(egg.x, egg.y, '+5', '#FFD700');
                } else if (egg.isRainbow) {
                    this.score += 10;
                    // Show rainbow egg bonus with rainbow text
                    this.showBonusPoints(egg.x, egg.y, '+10', 'rainbow');
                } else if (egg.isThunder) {
                    // Permanently increase player speed by 25%
                    this.player.speed = this.player.speed * 1.25;
                    
                    // Show thunder speed boost notification
                    this.showBonusPoints(egg.x, egg.y, '⚡ SPEED +25%! ⚡', '#FFFF00');
                    
                    this.score++;
                } else {
                    this.score++;
                }
                document.getElementById('score').textContent = this.score;
                return false;
            }
            return true;
        });

        if (this.eggs.length === 0) {
            this.spawnEggs();
        }
    }
    
    // Helper method to show bonus points directly above eggs
    showBonusPoints(x, y, text, color) {
        // Create bonus text element
        const bonus = document.createElement('div');
        bonus.textContent = text;
        bonus.style.position = 'fixed';
        bonus.style.fontWeight = 'bold';
        bonus.style.fontSize = '24px';
        bonus.style.textShadow = '2px 2px 4px rgba(0,0,0,0.3)';
        bonus.style.zIndex = '20';
        
        // Get canvas position
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // Position directly above the egg in canvas coordinates
        const canvasX = canvasRect.left + x;
        const canvasY = canvasRect.top + y - 30; // Position above the egg
        
        bonus.style.left = `${canvasX}px`;
        bonus.style.top = `${canvasY}px`;
        
        // Apply appropriate styling based on egg type
        if (color === 'rainbow') {
            bonus.style.background = 'linear-gradient(90deg, red, orange, yellow, green, blue, purple)';
            bonus.style.webkitBackgroundClip = 'text';
            bonus.style.webkitTextFillColor = 'transparent';
        } else {
            bonus.style.color = color;
        }
        
        // Add animation
        bonus.style.animation = 'floatUp 1s ease-out';
        
        // Add to document body to ensure proper positioning
        document.body.appendChild(bonus);
        
        // Remove after animation completes
        setTimeout(() => bonus.remove(), 1000);
    }

    drawPlayer() {
        const bounce = Math.sin(this.player.animation * 0.2) * 2;
        const isMoving = this.keys.ArrowLeft || this.keys.ArrowRight || this.keys.ArrowUp || this.keys.ArrowDown;
        const footBounce = isMoving ? Math.sin(this.player.animation * 0.4) * 3 : 0;
        
        // Draw feet
        this.ctx.fillStyle = this.player.color;
        
        // Left foot
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2 - 10,
            this.player.y + bounce + this.player.height - 5 + (footBounce),
            8,
            6,
            0, 0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Right foot
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2 + 10,
            this.player.y + bounce + this.player.height - 5 + (-footBounce),
            8,
            6,
            0, 0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Draw basket behind the bunny if facing left
        if (this.player.direction === 'left') {
            this.drawBasket(bounce);
        }

        // Draw bunny body (oval shape)
        this.ctx.fillStyle = this.player.color;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2,
            this.player.y + bounce + this.player.height/2,
            this.player.width/2,
            this.player.height/2 - 5,
            0, 0, Math.PI * 2
        );
        this.ctx.fill();

        // Draw basket in front of the bunny if facing right
        if (this.player.direction === 'right') {
            this.drawBasket(bounce);
        }

        // Draw arms/hands
        const armBounce = Math.sin(this.player.animation * 0.2) * 1.5;
        
        // Left arm
        this.ctx.fillStyle = this.player.color;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2 - 18,
            this.player.y + bounce + this.player.height/2 + armBounce,
            6,
            8,
            Math.PI / 4,
            0, Math.PI * 2
        );
        this.ctx.fill();

        // Right arm
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2 + 18,
            this.player.y + bounce + this.player.height/2 + armBounce,
            6,
            8,
            -Math.PI / 4,
            0, Math.PI * 2
        );
        this.ctx.fill();

        // Draw hands (small circles at the end of arms)
        this.ctx.beginPath();
        this.ctx.arc(
            this.player.x + this.player.width/2 - 22,
            this.player.y + bounce + this.player.height/2 + 5 + armBounce,
            4,
            0, Math.PI * 2
        );
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(
            this.player.x + this.player.width/2 + 22,
            this.player.y + bounce + this.player.height/2 + 5 + armBounce,
            4,
            0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Draw bunny head (round)
        this.ctx.beginPath();
        this.ctx.arc(
            this.player.x + this.player.width/2,
            this.player.y + bounce,
            18,
            0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Draw ears (with inner color)
        const earWidth = 10;
        const earHeight = 30;
        const earSpacing = 12;
        
        // Left ear outer
        this.ctx.fillStyle = this.player.color;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2 - earSpacing,
            this.player.y + bounce - earHeight/2,
            earWidth/2,
            earHeight/2,
            -0.2,
            0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Left ear inner
        this.ctx.fillStyle = this.player.earColor;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2 - earSpacing,
            this.player.y + bounce - earHeight/2,
            earWidth/3,
            earHeight/2.5,
            -0.2,
            0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Right ear outer
        this.ctx.fillStyle = this.player.color;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2 + earSpacing,
            this.player.y + bounce - earHeight/2,
            earWidth/2,
            earHeight/2,
            0.2,
            0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Right ear inner
        this.ctx.fillStyle = this.player.earColor;
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2 + earSpacing,
            this.player.y + bounce - earHeight/2,
            earWidth/3,
            earHeight/2.5,
            0.2,
            0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Draw eyes
        this.ctx.fillStyle = '#000';
        // Left eye
        this.ctx.beginPath();
        this.ctx.arc(
            this.player.x + this.player.width/2 - 6,
            this.player.y + bounce - 2,
            3, 0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Right eye
        this.ctx.beginPath();
        this.ctx.arc(
            this.player.x + this.player.width/2 + 6,
            this.player.y + bounce - 2,
            3, 0, Math.PI * 2
        );
        this.ctx.fill();
        
        // Draw subtle eye highlights
        this.ctx.fillStyle = '#FFF';
        this.ctx.globalAlpha = 0.5;
        this.ctx.beginPath();
        this.ctx.arc(
            this.player.x + this.player.width/2 - 7,
            this.player.y + bounce - 3,
            1, 0, Math.PI * 2
        );
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.arc(
            this.player.x + this.player.width/2 + 5,
            this.player.y + bounce - 3,
            1, 0, Math.PI * 2
        );
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;
        
        // Draw nose (more subtle)
        this.ctx.fillStyle = '#FFC0CB';
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.player.x + this.player.width/2,
            this.player.y + bounce + 4,
            3, 2,
            0, 0, Math.PI * 2
        );
        this.ctx.fill();

        // Draw mouth (simple, dignified line)
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(
            this.player.x + this.player.width/2 - 3,
            this.player.y + bounce + 8
        );
        this.ctx.lineTo(
            this.player.x + this.player.width/2 + 3,
            this.player.y + bounce + 8
        );
        this.ctx.stroke();
        
        // Draw whiskers
        this.ctx.strokeStyle = '#DDD';
        this.ctx.lineWidth = 1.5;
        
        // Left whiskers
        for(let i = 0; i < 3; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.player.x + this.player.width/2 - 5, this.player.y + bounce + 4 + (i-1)*3);
            this.ctx.lineTo(this.player.x + this.player.width/2 - 15, this.player.y + bounce + 2 + (i-1)*4);
            this.ctx.stroke();
        }
        
        // Right whiskers
        for(let i = 0; i < 3; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.player.x + this.player.width/2 + 5, this.player.y + bounce + 4 + (i-1)*3);
            this.ctx.lineTo(this.player.x + this.player.width/2 + 15, this.player.y + bounce + 2 + (i-1)*4);
            this.ctx.stroke();
        }
    }

    drawEggs() {
        this.eggs.forEach(egg => {
            if (egg.isGolden) {
                // Create gradient for golden egg
                const gradient = this.ctx.createLinearGradient(
                    egg.x, egg.y,
                    egg.x + egg.width,
                    egg.y + egg.height
                );
                
                // Animated gradient positions
                const time = Date.now() * 0.001; // Convert to seconds
                const shimmer = Math.sin(time * 3) * 0.1 + 0.4; // Oscillate between 0.3 and 0.5
                
                gradient.addColorStop(0, '#FFD700');     // Gold
                gradient.addColorStop(shimmer, '#FFF8DC'); // Cream
                gradient.addColorStop(1, '#DAA520');     // Golden Rod
                
                this.ctx.fillStyle = gradient;
                
                // Add glow effect
                this.ctx.shadowColor = '#FFD700';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 0;
            } else if (egg.isRainbow) {
                // Create rainbow gradient
                const gradient = this.ctx.createLinearGradient(
                    egg.x, egg.y,
                    egg.x + egg.width,
                    egg.y + egg.height
                );
                
                // Animated rainbow colors
                const offset = (Date.now() % 2000) / 2000; // Cycle every 2 seconds
                const colors = [
                    '#FF0000', // Red
                    '#FF8800', // Orange
                    '#FFFF00', // Yellow
                    '#00FF00', // Green
                    '#0088FF', // Blue
                    '#8800FF'  // Purple
                ];
                
                colors.forEach((color, i) => {
                    const stop = (i / (colors.length - 1) + offset) % 1;
                    gradient.addColorStop(stop, color);
                });
                
                this.ctx.fillStyle = gradient;
                
                // Add sparkly glow effect
                this.ctx.shadowColor = '#FFF';
                this.ctx.shadowBlur = 15;
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 0;
            } else if (egg.isThunder) {
                // Create dynamic thunder effect
                const time = Date.now();
                // Create pulsating effect
                const pulseRate = 0.01;
                const pulseIntensity = Math.sin(time * pulseRate);
                const flash = pulseIntensity > 0 ? '#FFFF00' : '#FFFFFF';
                
                // Create a more dramatic gradient for thunder egg
                const gradient = this.ctx.createRadialGradient(
                    egg.x + egg.width/2, egg.y + egg.height/2, 0,
                    egg.x + egg.width/2, egg.y + egg.height/2, egg.width/2
                );
                
                // More dramatic color scheme
                gradient.addColorStop(0, '#FFFFFF'); // Bright center
                gradient.addColorStop(0.4, '#FFFF00'); // Electric yellow
                gradient.addColorStop(0.7, '#FF9500'); // Orange glow
                gradient.addColorStop(1, '#4B0082'); // Indigo for storm cloud effect
                
                this.ctx.fillStyle = gradient;
                
                // Enhanced electric thunder glow effect
                this.ctx.shadowColor = flash;
                this.ctx.shadowBlur = 20 + Math.abs(pulseIntensity) * 10; // Pulsating glow
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 0;

            } else {
                this.ctx.fillStyle = egg.color;
                this.ctx.shadowColor = 'transparent';
                this.ctx.shadowBlur = 0;
            }
            
            // Draw egg shape
            this.ctx.beginPath();
            this.ctx.ellipse(
                egg.x + egg.width/2,
                egg.y + egg.height/2,
                egg.width/2,
                egg.height/2 * 1.2,
                0,
                0,
                2 * Math.PI
            );
            this.ctx.fill();
            
            // Reset shadow
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
            
            // Draw egg patterns
            this.ctx.strokeStyle = egg.isGolden ? '#DAA520' : '#FFF';
            this.ctx.lineWidth = egg.isGolden ? 3 : 2;
            
            switch(egg.pattern) {
                case 0: // Zigzag pattern
                    this.ctx.beginPath();
                    for(let i = 0; i < 3; i++) {
                        this.ctx.moveTo(egg.x + 5, egg.y + 10 + i * 8);
                        this.ctx.lineTo(egg.x + 15, egg.y + 5 + i * 8);
                        this.ctx.lineTo(egg.x + 25, egg.y + 10 + i * 8);
                    }
                    this.ctx.stroke();
                    break;
                case 1: // Dots pattern
                    for(let i = 0; i < 3; i++) {
                        for(let j = 0; j < 2; j++) {
                            this.ctx.beginPath();
                            this.ctx.arc(egg.x + 10 + j * 10, 
                                        egg.y + 10 + i * 8, 
                                        2, 0, Math.PI * 2);
                            this.ctx.fill();
                        }
                    }
                    break;
                case 2: // Spiral pattern
                    if (egg.isGolden) {
                        // Animated spiral for golden egg
                    } else if (egg.isThunder) {
                        const time = Date.now() * 0.003;
                        
                        // Create dark storm cloud at the top
                        const cloudGradient = this.ctx.createRadialGradient(
                            egg.x + egg.width/2, egg.y + 5, 0,
                            egg.x + egg.width/2, egg.y + 5, 10
                        );
                        cloudGradient.addColorStop(0, '#9494A1'); // Light gray
                        cloudGradient.addColorStop(1, '#3A3A45'); // Dark gray
                        
                        this.ctx.fillStyle = cloudGradient;
                        this.ctx.beginPath();
                        this.ctx.arc(egg.x + 15, egg.y + 5, 6, 0, Math.PI * 2);
                        this.ctx.arc(egg.x + 8, egg.y + 8, 5, 0, Math.PI * 2);
                        this.ctx.arc(egg.x + 22, egg.y + 8, 5, 0, Math.PI * 2);
                        this.ctx.fill();
                        
                        // Draw multiple lightning bolts with animation
                        this.ctx.strokeStyle = '#FFFF00';
                        this.ctx.lineWidth = 2;
                        
                        // Animate lightning position slightly
                        const offsetX = Math.sin(time * 2) * 1.5;
                        
                        // Main lightning bolt
                        this.ctx.beginPath();
                        this.ctx.moveTo(egg.x + 15 + offsetX, egg.y + 5);
                        this.ctx.lineTo(egg.x + 10 + offsetX, egg.y + 12);
                        this.ctx.lineTo(egg.x + 15 + offsetX, egg.y + 15);
                        this.ctx.lineTo(egg.x + 7 + offsetX, egg.y + 25);
                        this.ctx.stroke();
                        
                        // Second lightning bolt
                        this.ctx.beginPath();
                        this.ctx.moveTo(egg.x + 18 - offsetX, egg.y + 7);
                        this.ctx.lineTo(egg.x + 22 - offsetX, egg.y + 15);
                        this.ctx.lineTo(egg.x + 18 - offsetX, egg.y + 18);
                        this.ctx.lineTo(egg.x + 24 - offsetX, egg.y + 27);
                        this.ctx.stroke();
                        
                        // Draw lightning bolt symbol with glow effect
                        this.ctx.save();
                        
                        // Create glowing effect for the symbol
                        const glowSize = 2 + Math.sin(time * 5) * 1; // Pulsating glow
                        
                        // Draw multiple layers with decreasing opacity for glow effect
                        for (let i = 5; i > 0; i--) {
                            this.ctx.font = `bold ${20 + i * glowSize}px Arial`;
                            this.ctx.fillStyle = `rgba(255, 255, 0, ${0.1 * i})`;
                            this.ctx.fillText('⚡', egg.x + egg.width/2, egg.y + egg.height/2);
                        }
                        
                        // Draw the main symbol
                        this.ctx.font = 'bold 20px Arial';
                        this.ctx.fillStyle = '#FFFF00';
                        this.ctx.strokeStyle = '#000000';
                        this.ctx.lineWidth = 1.5;
                        this.ctx.strokeText('⚡', egg.x + egg.width/2, egg.y + egg.height/2);
                        this.ctx.fillText('⚡', egg.x + egg.width/2, egg.y + egg.height/2);
                        
                        this.ctx.restore();
                        
                        // Add electric sparks around the egg
                        this.ctx.strokeStyle = '#FFFFFF';
                        this.ctx.lineWidth = 1;
                        
                        for (let i = 0; i < 6; i++) {
                            const sparkAngle = time * 2 + i * (Math.PI / 3);
                            const radius = 15;
                            const x = egg.x + egg.width/2 + Math.cos(sparkAngle) * radius;
                            const y = egg.y + egg.height/2 + Math.sin(sparkAngle) * radius;
                            
                            // Draw branching sparks
                            this.ctx.beginPath();
                            this.ctx.moveTo(x, y);
                            this.ctx.lineTo(
                                x + Math.cos(sparkAngle + Math.PI/4) * 4, 
                                y + Math.sin(sparkAngle + Math.PI/4) * 4
                            );
                            this.ctx.stroke();
                            
                            this.ctx.beginPath();
                            this.ctx.moveTo(x, y);
                            this.ctx.lineTo(
                                x + Math.cos(sparkAngle - Math.PI/4) * 4, 
                                y + Math.sin(sparkAngle - Math.PI/4) * 4
                            );
                            this.ctx.stroke();
                        }
                    } else {
                        // Regular spiral pattern
                        this.ctx.beginPath();
                        for(let i = 0; i < 3; i++) {
                            this.ctx.arc(egg.x + egg.width/2, 
                                        egg.y + egg.height/2,
                                        5 + i * 5, 
                                        0, Math.PI * 1.5);
                        }
                        this.ctx.stroke();
                    }
                    break;
                case 4: // Rainbow pattern
                    if (egg.isRainbow) {
                        const time = Date.now() * 0.003;
                        // Draw rainbow stars
                        for(let i = 0; i < 6; i++) {
                            const angle = time + (i * Math.PI / 3);
                            const x = egg.x + egg.width/2 + Math.cos(angle) * 10;
                            const y = egg.y + egg.height/2 + Math.sin(angle) * 10;
                            
                            this.ctx.beginPath();
                            this.drawStar(x, y, 5, 3, 6);
                            this.ctx.fillStyle = ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#0088FF', '#8800FF'][i];
                            this.ctx.fill();
                        }
                    }
                    break;
            }
        });
    }

    drawStar(x, y, radius, innerRadius, points) {
        this.ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? radius : innerRadius;
            const angle = (i * Math.PI) / points;
            if (i === 0) {
                this.ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
            } else {
                this.ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
            }
        }
        this.ctx.closePath();
    }

    drawBasket(bounce) {
        const basketX = this.player.x + this.player.width/2 + (this.player.direction === 'right' ? 20 : -20);
        const basketY = this.player.y + bounce + this.player.height/2 + 5;

        // Draw basket handle
        this.ctx.strokeStyle = this.player.basketColor;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.ellipse(
            basketX,
            basketY - 5,
            12,
            8,
            0,
            0, Math.PI
        );
        this.ctx.stroke();

        // Draw main basket
        this.ctx.fillStyle = this.player.basketColor;
        this.ctx.beginPath();
        this.ctx.ellipse(
            basketX,
            basketY + 8,
            15,
            12,
            0,
            0, Math.PI * 2
        );
        this.ctx.fill();

        // Draw colorful basket pattern
        this.ctx.lineWidth = 2;
        
        // Horizontal lines with different colors
        for(let i = -1; i <= 1; i++) {
            this.ctx.strokeStyle = this.player.basketPattern[Math.abs(i)];
            this.ctx.beginPath();
            this.ctx.ellipse(
                basketX,
                basketY + 8 + (i * 5),
                15,
                12,
                0,
                -Math.PI/3, Math.PI/3
            );
            this.ctx.stroke();
        }

        // Decorative dots
        for(let i = -2; i <= 2; i++) {
            this.ctx.fillStyle = this.player.basketHighlight;
            this.ctx.beginPath();
            this.ctx.arc(basketX + (i * 6), basketY + 8, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawObstacles() {
        this.obstacles.forEach(obstacle => {
            // Draw tree trunk
            this.ctx.fillStyle = '#8B4513';
            this.ctx.fillRect(obstacle.x + 15, 
                            obstacle.y + 20, 
                            10, 
                            obstacle.height - 20);
            
            // Draw tree top
            this.ctx.fillStyle = '#228B22';
            this.ctx.beginPath();
            this.ctx.moveTo(obstacle.x, obstacle.y + 30);
            this.ctx.lineTo(obstacle.x + obstacle.width, obstacle.y + 30);
            this.ctx.lineTo(obstacle.x + obstacle.width/2, obstacle.y);
            this.ctx.fill();
            
            this.ctx.beginPath();
            this.ctx.moveTo(obstacle.x + 5, obstacle.y + 20);
            this.ctx.lineTo(obstacle.x + obstacle.width - 5, obstacle.y + 20);
            this.ctx.lineTo(obstacle.x + obstacle.width/2, obstacle.y - 10);
            this.ctx.fill();
        });
    }

    gameLoop() {
        if (!this.gameOver && this.gameStarted) {
            // Clear canvas
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Reset any canvas state that might persist between frames
            this.ctx.globalAlpha = 1.0;

            // Update game state
            this.updatePlayer();
            this.checkCollisions();

            // Draw everything
            this.drawObstacles();
            this.drawEggs();
            this.drawPlayer();
            
            // Draw virtual joystick on mobile
            if (this.isMobile && this.joystick.visible) {
                this.drawJoystick();
            }

            // Ensure opacity is reset at the end of each frame
            this.ctx.globalAlpha = 1.0;

            // Continue the game loop
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }
    
    drawJoystick() {
        // Draw joystick base (semi-transparent circle)
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = '#888888';
        this.ctx.beginPath();
        this.ctx.arc(this.joystick.baseX, this.joystick.baseY, this.joystick.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw joystick stick (more opaque)
        this.ctx.globalAlpha = 0.6;
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(this.joystick.stickX, this.joystick.stickY, this.joystick.stickRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Reset alpha
        this.ctx.globalAlpha = 1.0;
    }
}

// Initialize game when the page loads
window.onload = () => {
    window.gameInstance = new Game();
};
