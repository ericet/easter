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

    async createSession() {
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

        this.listenToPlayers();
        this.listenToGameStart();
        return this.sessionId;
    }

    async joinSession(sessionId) {
        this.sessionId = sessionId;
        this.sessionRef = firebase.database().ref(`sessions/${this.sessionId}`);
        this.playersRef = this.sessionRef.child('players');
        this.scoresRef = this.sessionRef.child('scores');

        // Check if session exists
        const snapshot = await this.sessionRef.once('value');
        if (!snapshot.exists()) {
            throw new Error('Session not found');
        }

        if (snapshot.val().status === 'in_progress') {
            throw new Error('Game already in progress');
        }

        this.listenToPlayers();
        this.listenToGameStart();
        return true;
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
        this.playersRef.on('value', (snapshot) => {
            const players = snapshot.val() || {};
            const playersList = Object.entries(players).map(([id, data]) => ({
                id,
                ...data
            }));
            
            // Update UI with players
            this.updatePlayersList(playersList);

            // Check if all players are ready (host only)
            if (this.isHost && playersList.length > 0) {
                const allReady = playersList.every(player => player.ready);
                const startButton = document.getElementById('startMultiplayerButton');
                startButton.disabled = !allReady;
                if (allReady) {
                    startButton.textContent = 'Start Game (All Ready!)';
                } else {
                    startButton.textContent = 'Start Game (Waiting...)';
                }
            }
        });
    }

    listenToGameStart() {
        this.sessionRef.child('status').on('value', (snapshot) => {
            const status = snapshot.val();
            if (status === 'in_progress') {
                // Hide session info and start game
                document.getElementById('session-info').style.display = 'none';
                document.getElementById('readyButton').style.display = 'none';
                document.getElementById('startMultiplayerButton').style.display = 'none';
                
                // Start the game
                const gameInstance = window.gameInstance;
                if (gameInstance) {
                    gameInstance.startGame();
                }
            } else if (status === 'finished') {
                this.showResults();
            }
        });
    }

    updatePlayersList(players) {
        const list = document.getElementById('players-list');
        list.innerHTML = '';
        
        players.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-item';
            item.innerHTML = `
                <span>${player.name}</span>
                <span class="status">${player.ready ? '✅ Ready' : '⏳ Waiting'}</span>
            `;
            list.appendChild(item);
        });
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
        const scoresSnapshot = await this.scoresRef.once('value');
        const scores = scoresSnapshot.val() || {};
        
        // Convert to array and sort by score
        const sortedScores = Object.entries(scores)
            .map(([id, data]) => ({
                id,
                ...data
            }))
            .sort((a, b) => b.score - a.score);

        // Show results modal
        const resultsModal = document.getElementById('results-modal');
        const resultsList = document.getElementById('results-list');
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
