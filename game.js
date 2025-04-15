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
                alert('Failed to save score. Please try again.');
            });
}

// Initialize leaderboard
updateLeaderboard();

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.initializeGame();

        // Event listeners for game controls
        document.getElementById('startButton').addEventListener('click', () => this.startGame());
        document.getElementById('restartButton').addEventListener('click', () => this.restartGame());
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
        
        // Show game canvas
        this.canvas.style.display = 'block';
        document.getElementById('score-time').style.display = 'block';
        
        this.player = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            width: 40,
            height: 50,
            speed: 4,
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

        // Event listeners
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleKeyUp = this.handleKeyUp.bind(this);
        window.addEventListener('keydown', this.boundHandleKeyDown);
        window.addEventListener('keyup', this.boundHandleKeyUp);

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

    spawnEggs() {
        const numEggs = 5;
        let attempts = 0;
        const maxAttempts = 50; // Prevent infinite loop
        
        // Special egg chances
        const hasGoldenEgg = Math.random() < 0.2;  // 20% chance for golden egg
        const hasRainbowEgg = Math.random() < 0.1; // 10% chance for rainbow egg
        
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
                
                // Special egg assignments (first two eggs only)
                if (i === 0 && hasGoldenEgg) {
                    egg.color = '#FFD700';
                    egg.pattern = 3; // Special pattern for golden egg
                    egg.isGolden = true;
                } else if (i === 1 && hasRainbowEgg) {
                    egg.pattern = 4; // Special pattern for rainbow egg
                    egg.isRainbow = true;
                    egg.color = 'rainbow'; // Special marker for rainbow gradient
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
        // Show game elements
        this.canvas.style.display = 'block';
        document.getElementById('score-time').style.display = 'block';
        document.getElementById('startButton').style.display = 'none';
        
        // Show countdown
        const overlay = document.getElementById('countdown-overlay');
        overlay.style.display = 'block';
        
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
        
        // Reset game state
        this.initializeGame();
        
        // Hide restart button
        document.getElementById('restartButton').style.display = 'none';
        
        // Show countdown
        const overlay = document.getElementById('countdown-overlay');
        overlay.style.display = 'block';
        
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
        if (overlay) {
            overlay.style.display = 'none';
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

    async endGame() {
        this.gameOver = true;
        clearInterval(this.timer);
        window.lastScore = this.score;
        
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
                alert(`Game Over! Final Score: ${this.score}`);
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
                    const bonus = document.createElement('div');
                    bonus.textContent = '+5';
                    bonus.style.position = 'absolute';
                    bonus.style.left = `${egg.x}px`;
                    bonus.style.top = `${egg.y}px`;
                    bonus.style.color = '#FFD700';
                    bonus.style.fontWeight = 'bold';
                    bonus.style.fontSize = '24px';
                    bonus.style.textShadow = '2px 2px 4px rgba(0,0,0,0.3)';
                    bonus.style.animation = 'floatUp 1s ease-out';
                    document.getElementById('game-container').appendChild(bonus);
                    setTimeout(() => bonus.remove(), 1000);
                } else if (egg.isRainbow) {
                    this.score += 10;
                    // Show rainbow egg bonus with rainbow text
                    const bonus = document.createElement('div');
                    bonus.textContent = '+10';
                    bonus.style.position = 'absolute';
                    bonus.style.left = `${egg.x}px`;
                    bonus.style.top = `${egg.y}px`;
                    bonus.style.background = 'linear-gradient(90deg, red, orange, yellow, green, blue, purple)';
                    bonus.style.webkitBackgroundClip = 'text';
                    bonus.style.webkitTextFillColor = 'transparent';
                    bonus.style.fontWeight = 'bold';
                    bonus.style.fontSize = '24px';
                    bonus.style.textShadow = '2px 2px 4px rgba(0,0,0,0.3)';
                    bonus.style.animation = 'floatUp 1s ease-out';
                    document.getElementById('game-container').appendChild(bonus);
                    setTimeout(() => bonus.remove(), 1000);
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
                        const time = Date.now() * 0.003;
                        this.ctx.beginPath();
                        for(let i = 0; i < 4; i++) {
                            const angle = time + i * Math.PI / 2;
                            this.ctx.arc(egg.x + egg.width/2, 
                                        egg.y + egg.height/2,
                                        4 + i * 4, 
                                        angle, angle + Math.PI * 1.2);
                        }
                        this.ctx.stroke();
                        
                        // Add sparkles
                        for(let i = 0; i < 3; i++) {
                            const sparkleAngle = time * 2 + (i * Math.PI * 2 / 3);
                            const radius = 12;
                            const x = egg.x + egg.width/2 + Math.cos(sparkleAngle) * radius;
                            const y = egg.y + egg.height/2 + Math.sin(sparkleAngle) * radius;
                            
                            this.ctx.beginPath();
                            this.ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                            this.ctx.fillStyle = '#FFF';
                            this.ctx.fill();
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

            // Ensure opacity is reset at the end of each frame
            this.ctx.globalAlpha = 1.0;

            // Continue the game loop
            requestAnimationFrame(this.gameLoop.bind(this));
        }
    }
}

// Initialize game when the page loads
window.onload = () => {
    window.gameInstance = new Game();
};
