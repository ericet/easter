// Helper function to safely access DOM elements
function safeGetElement(id) {
    const element = document.getElementById(id);
    return element;
}

class MultiplayerManager {
    constructor() {
        this.sessionId = null;
        this.isHost = false;
        this.playerId = Math.random().toString(36).substring(2, 15);
        this.playerName = '';
        this.sessionRef = null;
        this.playersRef = null;
        this.scoresRef = null;
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
                        if (startButton && playersList.length > 0) {
                            const allReady = playersList.every(player => player.ready);
                            startButton.disabled = !allReady;
                            if (allReady) {
                                startButton.textContent = 'Start Game (All Ready!)';
                            } else {
                                startButton.textContent = 'Start Game (Waiting...)';
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

            // Show results modal with null checks
            const resultsModal = document.getElementById('results-modal');
            const resultsList = document.getElementById('results-list');
            
            if (!resultsModal || !resultsList) {
                console.error('Results modal or list elements not found');
                return;
            }
            
            resultsList.innerHTML = '';

            sortedScores.forEach((score, index) => {
                const item = document.createElement('div');
                item.className = 'result-item';
                item.innerHTML = `
                    <span class="place">${index + 1}</span>
                    <span class="name">${score.name}</span>
                    <span class="score">${score.score}</span>
                    ${index === 0 ? '<span class="crown">👑</span>' : ''}
                `;
                resultsList.appendChild(item);
            });

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
}
