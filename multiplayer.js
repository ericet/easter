// Helper function to safely access DOM elements
function safeGetElement(id) {
    const element = document.getElementById(id);
    return element;
}

class MultiplayerManager {
    constructor() {
        this.sessionId = null;
        this.isHost = false;
        // Use existing playerId from localStorage or generate a new one
        this.playerId = localStorage.getItem('playerId') || Math.random().toString(36).substring(2, 15);
        // Store the playerId in localStorage
        localStorage.setItem('playerId', this.playerId);
        this.playerName = '';
        this.sessionRef = null;
        this.playersRef = null;
        this.scoresRef = null;
        this.winsRef = null; // Reference to track player wins
    }
    
    // Helper method to update UI for multiplayer mode
    updateMultiplayerUI() {
        try {
            // Always hide the single player start button in multiplayer mode
            const singlePlayerStartButton = safeGetElement('startButton');
            if (singlePlayerStartButton) {
                singlePlayerStartButton.style.display = 'none';
            }
            
            // Show/hide multiplayer start button based on host status
            const multiplayerStartButton = safeGetElement('startMultiplayerButton');
            if (multiplayerStartButton) {
                multiplayerStartButton.style.display = this.isHost ? 'block' : 'none';
            }
        } catch (error) {
            console.error('Error updating multiplayer UI:', error);
        }
    }

    async createSession() {
        try {
            this.isHost = true;
            this.sessionId = Math.random().toString(36).substring(2, 10);
            this.sessionRef = firebase.database().ref(`sessions/${this.sessionId}`);
            this.playersRef = this.sessionRef.child('players');
            this.scoresRef = this.sessionRef.child('scores');
            this.winsRef = this.sessionRef.child('wins');

            await this.sessionRef.set({
                status: 'waiting',
                host: this.playerId,
                startTime: null,
                endTime: null
            });

            // Host is automatically ready
            await this.playersRef.child(this.playerId).set({
                name: this.playerName,
                ready: true
            });

            // Update UI for multiplayer mode
            this.updateMultiplayerUI();
            
            this.listenToPlayers();
            this.listenToGameStart();
            return this.sessionId;
        } catch (error) {
            console.error('Error creating session:', error);
            throw error;
        }
    }

    async joinSession(sessionId) {
        try {
            this.sessionId = sessionId;
            this.sessionRef = firebase.database().ref(`sessions/${this.sessionId}`);
            this.playersRef = this.sessionRef.child('players');
            this.scoresRef = this.sessionRef.child('scores');
            this.winsRef = this.sessionRef.child('wins');

            // Check if session exists
            const snapshot = await this.sessionRef.once('value');
            if (!snapshot.exists()) {
                throw new Error('Session not found');
            }

            const sessionData = snapshot.val();
            if (sessionData.status === 'in_progress') {
                throw new Error('Game already in progress');
            }

            // Set host status based on session data
            this.isHost = sessionData.host === this.playerId;
            
            // Update UI for multiplayer mode (hides single player start button and manages multiplayer start button)
            this.updateMultiplayerUI();
            
            // Update session link display
            const sessionLinkElement = safeGetElement('session-link');
            if (sessionLinkElement) {
                const sessionLink = `${window.location.href.split('?')[0]}?session=${this.sessionId}`;
                sessionLinkElement.textContent = sessionLink;
            }

            this.listenToPlayers();
            this.listenToGameStart();
            return true;
        } catch (error) {
            console.error('Error joining session:', error);
            throw error;
        }
    }

    async setPlayerName(name) {
        this.playerName = name;
        await this.playersRef.child(this.playerId).set({
            name: name,
            ready: this.isHost // Host is automatically ready
        });
    }

    async setPlayerReady(ready) {
        await this.playersRef.child(this.playerId).update({
            ready: ready
        });
    }

    listenToPlayers() {
        try {
            this.playersRef.on('value', (snapshot) => {
                try {
                    const players = snapshot.val() || {};
                    const playersList = Object.entries(players).map(([id, data]) => ({
                        id,
                        ...data
                    }));
                    
                    // Update UI with players
                    this.updatePlayersList(playersList);
                    
                    // Ensure multiplayer UI is consistent (hide single player start button, manage multiplayer start button)
                    this.updateMultiplayerUI();
                    
                    // Update the multiplayer start button state based on player readiness (for host only)
                    if (this.isHost) {
                        const startButton = safeGetElement('startMultiplayerButton');
                        if (startButton) {
                            // Check if there are at least 2 players and all are ready
                            const hasEnoughPlayers = playersList.length >= 2;
                            const allReady = playersList.every(player => player.ready);
                            const canStartGame = hasEnoughPlayers && allReady;
                            
                            // Disable button if not enough players or not all ready
                            startButton.disabled = !canStartGame;
                            
                            // Update button text based on state
                            if (!hasEnoughPlayers) {
                                startButton.textContent = 'Waiting for Players...';
                            } else if (!allReady) {
                                startButton.textContent = 'Waiting for Ready...';
                            } else {
                                startButton.textContent = 'Start Game (All Ready!)';
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error in player list update:', error);
                }
            });
        } catch (error) {
            console.error('Error setting up player listener:', error);
        }
    }

    listenToGameStart() {
        try {
            this.sessionRef.child('status').on('value', (snapshot) => {
                try {
                    const status = snapshot.val();
                    if (status === 'in_progress') {
                        // Hide session info and start game with null checks
                        const sessionInfo = safeGetElement('session-info');
                        const readyButton = safeGetElement('readyButton');
                        const startButton = safeGetElement('startMultiplayerButton');
                        
                        // Only modify elements if they exist
                        if (sessionInfo) sessionInfo.style.display = 'none';
                        if (readyButton) readyButton.style.display = 'none';
                        if (startButton) startButton.style.display = 'none';
                        
                        // Start the game
                        const gameInstance = window.gameInstance;
                        if (gameInstance && typeof gameInstance.startGame === 'function') {
                            gameInstance.startGame();
                        } else {
                            console.warn('Game instance or startGame method not available');
                        }
                    } else if (status === 'finished') {
                        this.showResults();
                    }
                } catch (error) {
                    console.error('Error handling game status change:', error);
                }
            });
        } catch (error) {
            console.error('Error setting up game start listener:', error);
        }
    }

    updatePlayersList(players) {
        try {
            const list = safeGetElement('players-list');
            if (!list) {
                console.warn('Players list element not found');
                return; // Exit if the list element doesn't exist
            }
            
            list.innerHTML = '';
            
            if (!players || !Array.isArray(players)) {
                console.warn('Invalid players data:', players);
                return; // Exit if players is not a valid array
            }
            
            players.forEach(player => {
                try {
                    if (!player) return; // Skip invalid player entries
                    
                    const item = document.createElement('div');
                    item.className = 'player-item';
                    item.innerHTML = `
                        <span>${player.name || 'Unknown'}</span>
                        <span class="status">${player.ready ? '✅ Ready' : '⏳ Waiting'}</span>
                    `;
                    list.appendChild(item);
                } catch (playerError) {
                    console.error('Error rendering player:', playerError);
                }
            });
        } catch (error) {
            console.error('Error updating players list:', error);
        }
    }

    async startMultiplayerGame() {
        if (!this.isHost) return;

        // Hide single player controls and multiplayer controls
        document.getElementById('startButton').style.display = 'none';
        document.getElementById('startMultiplayerButton').style.display = 'none';
        document.getElementById('session-info').style.display = 'none';
        
        // Start the game
        await this.sessionRef.update({
            status: 'in_progress',
            startTime: firebase.database.ServerValue.TIMESTAMP,
            endTime: null
        });
    }

    async submitScore(score) {
        await this.scoresRef.child(this.playerId).set({
            name: this.playerName,
            score: score,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // If this is the last player to submit, update session status
        const snapshot = await this.scoresRef.once('value');
        const playersSnapshot = await this.playersRef.once('value');
        
        if (snapshot.numChildren() === playersSnapshot.numChildren()) {
            await this.sessionRef.update({
                status: 'finished',
                endTime: firebase.database.ServerValue.TIMESTAMP
            });
        }
    }

    async showResults() {
        try {
            const scoresSnapshot = await this.scoresRef.once('value');
            const scores = scoresSnapshot.val() || {};
            
            // Convert to array and sort by score
            const sortedScores = Object.entries(scores)
                .map(([id, data]) => ({
                    id,
                    ...data
                }))
                .sort((a, b) => b.score - a.score);

            // Get the winner (highest score)
            if (sortedScores.length > 0) {
                const winner = sortedScores[0];
                
                // Update win count for the winner
                await this.updateWinCount(winner.id, winner.name);
            }
            
            // Get current win counts
            const winsSnapshot = await this.winsRef.once('value');
            const wins = winsSnapshot.val() || {};

            // Show results modal with null checks
            const resultsModal = safeGetElement('results-modal');
            const resultsList = safeGetElement('results-list');
            
            if (!resultsModal || !resultsList) {
                console.error('Results modal or list elements not found');
                return;
            }
            
            resultsList.innerHTML = '';

            // Add game results
            const gameResultsTitle = document.createElement('h3');
            gameResultsTitle.textContent = 'Game Results';
            resultsList.appendChild(gameResultsTitle);

            sortedScores.forEach((score, index) => {
                const item = document.createElement('div');
                item.className = 'result-item';
                item.innerHTML = `
                    <span class="place">${index + 1}</span>
                    <span class="name">${index === 0 ? '<span class="crown">👑</span>' : ''} ${score.name}</span>
                    <span class="score">${score.score}</span>
                `;
                resultsList.appendChild(item);
            });
            
            // Add session leaderboard
            const leaderboardTitle = document.createElement('h3');
            leaderboardTitle.textContent = 'Session Leaderboard';
            leaderboardTitle.style.marginTop = '20px';
            resultsList.appendChild(leaderboardTitle);
            
            // Convert wins to array and sort by win count
            const sortedWins = Object.entries(wins)
                .map(([id, data]) => ({
                    id,
                    ...data
                }))
                .sort((a, b) => b.wins - a.wins);
                
            sortedWins.forEach((player, index) => {
                const item = document.createElement('div');
                item.className = 'result-item leaderboard-item';
                item.innerHTML = `
                    <span class="place">${index + 1}</span>
                    <span class="name">${player.name}</span>
                    <span class="wins">${player.wins} ${player.wins === 1 ? 'win' : 'wins'}</span>
                `;
                resultsList.appendChild(item);
            });
            
            // Clear the existing buttons
            const buttonsContainer = safeGetElement('results-buttons');
            if (buttonsContainer) {
                buttonsContainer.innerHTML = '';
                
                // Add Play Again button for the same session
                const playAgainButton = document.createElement('button');
                playAgainButton.className = 'game-button';
                playAgainButton.textContent = 'Play Again (Same Session)';
                playAgainButton.onclick = () => this.restartSession();
                buttonsContainer.appendChild(playAgainButton);
                
                // Add New Game button
                const newGameButton = document.createElement('button');
                newGameButton.className = 'game-button';
                newGameButton.textContent = 'New Game';
                newGameButton.onclick = () => location.reload();
                buttonsContainer.appendChild(newGameButton);
            }

            resultsModal.style.display = 'block';
        } catch (error) {
            console.error('Error showing results:', error);
        }
    }

    cleanup() {
        if (this.sessionRef) {
            this.sessionRef.off();
            if (this.isHost) {
                this.sessionRef.remove();
            }
        }
    }
    
    async updateWinCount(playerId, playerName) {
        try {
            // Get current win count for the player
            const playerWinsRef = this.winsRef.child(playerId);
            const snapshot = await playerWinsRef.once('value');
            const currentData = snapshot.val();
            
            if (currentData) {
                // Player already has wins, increment count
                await playerWinsRef.update({
                    wins: currentData.wins + 1
                });
            } else {
                // First win for this player
                await playerWinsRef.set({
                    name: playerName,
                    wins: 1
                });
            }
        } catch (error) {
            console.error('Error updating win count:', error);
        }
    }
    
    async restartSession() {
        try {
            // Close the results modal
            const resultsModal = safeGetElement('results-modal');
            if (resultsModal) {
                resultsModal.style.display = 'none';
            }
            
            // Get the session data to identify the host
            const sessionSnapshot = await this.sessionRef.once('value');
            const sessionData = sessionSnapshot.val() || {};
            const hostId = sessionData.host;
            
            // Clear previous scores
            if (this.scoresRef) {
                await this.scoresRef.remove();
            }
            
            // Get current players
            const playersSnapshot = await this.playersRef.once('value');
            const players = playersSnapshot.val() || {};
            
            // First, update the session status to waiting
            await this.sessionRef.update({
                status: 'waiting',
                startTime: null,
                endTime: null
            });
            
            // Then update player ready states
            for (const [playerId, playerData] of Object.entries(players)) {
                // If player is the host, set to ready, otherwise set to not ready
                const isHost = playerId === hostId;
                await this.playersRef.child(playerId).update({
                    ready: isHost
                });
            }
            
            // Update session link display
            const sessionLinkElement = safeGetElement('session-link');
            if (sessionLinkElement) {
                const sessionLink = `${window.location.href.split('?')[0]}?session=${this.sessionId}`;
                sessionLinkElement.textContent = sessionLink;
            }
            
            // Show session info and controls again
            const sessionInfo = safeGetElement('session-info');
            const readyButton = safeGetElement('readyButton');
            
            if (sessionInfo) sessionInfo.style.display = 'block';
            
            // Only show Ready button for non-host players
            if (readyButton) {
                if (this.isHost) {
                    readyButton.style.display = 'none';
                } else {
                    readyButton.style.display = 'block';
                    readyButton.textContent = 'Ready'; // Reset button text to initial state
                }
            }
            
            // Update UI for multiplayer mode
            this.updateMultiplayerUI();
            
            // Show game UI
            const gameUI = safeGetElement('game-ui');
            if (gameUI) gameUI.style.display = 'block';
            
            // Reset game instance if needed
            const gameInstance = window.gameInstance;
            if (gameInstance && typeof gameInstance.initializeGame === 'function') {
                gameInstance.initializeGame();
            }
        } catch (error) {
            console.error('Error restarting session:', error);
            alert('Failed to restart session: ' + error.message);
        }
    }
}
