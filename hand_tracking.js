// hand_tracking.js

const videoElement = document.querySelector('.input_video');
const debugCanvas = document.getElementById('debug-canvas');
const canvasCtx = debugCanvas.getContext('2d');
const gameFrame = document.getElementById('game-frame');

function onResults(results) {
    // 1. Setup Debug Canvas
    debugCanvas.width = videoElement.videoWidth;
    debugCanvas.height = videoElement.videoHeight;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    canvasCtx.drawImage(results.image, 0, 0, debugCanvas.width, debugCanvas.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Use the first detected hand
        const landmarks = results.multiHandLandmarks[0];
        
        // Draw skeleton
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 5});
        drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2});

        // 2. Calculate X Position (Normalized 0.0 - 1.0)
        // We use the Index Finger Tip (landmark 8) for pointing
        let xPos = landmarks[8].x;
        
        // Mirror the X coordinate for natural interaction
        // (Moving real hand right -> moves cursor right)
        xPos = 1.0 - xPos;

        // Clamp between 0 and 1
        xPos = Math.max(0.0, Math.min(1.0, xPos));

        // 3. Detect if Hand is Open
        // Heuristic: Check if fingers are extended (Tip further from wrist than PIP)
        // Wrist is landmark 0
        function isExtended(tipId, pipId) {
            const distTip = Math.hypot(landmarks[tipId].x - landmarks[0].x, landmarks[tipId].y - landmarks[0].y);
            const distPip = Math.hypot(landmarks[pipId].x - landmarks[0].x, landmarks[pipId].y - landmarks[0].y);
            return distTip > distPip;
        }

        const indexOpen = isExtended(8, 6);
        const middleOpen = isExtended(12, 10);
        const ringOpen = isExtended(16, 14);
        const pinkyOpen = isExtended(20, 18);
        
        // Consider hand "Open" if at least 3 of the 4 main fingers are extended
        const openCount = (indexOpen ? 1 : 0) + (middleOpen ? 1 : 0) + (ringOpen ? 1 : 0) + (pinkyOpen ? 1 : 0);
        const isHandOpen = openCount >= 3;

        // 4. Send to Godot (inside the iframe)
        // We check both the iframe window and the parent window (this window)
        // just in case Godot is exporting the function to the parent scope.
        let godotFn = null;
        let connectionType = "";

        try {
            const gameWindow = gameFrame.contentWindow;
            
            // Check 1: Is it on the iframe window? (Most likely)
            if (gameWindow && typeof gameWindow.godot_hand_update === 'function') {
                godotFn = gameWindow.godot_hand_update;
                connectionType = "Iframe";
            } 
            // Check 2: Is it on our own window? (If Godot used window.parent)
            else if (typeof window.godot_hand_update === 'function') {
                godotFn = window.godot_hand_update;
                connectionType = "Parent";
            }

            if (godotFn) {
                godotFn([xPos, isHandOpen]);
                
                // Visual feedback that we are connected
                canvasCtx.fillStyle = "#00FF00"; // Green
                canvasCtx.font = "16px Arial";
                canvasCtx.fillText(`Connected to Godot (${connectionType})`, 10, 30);
            } else {
                // Visual feedback that we are waiting
                canvasCtx.fillStyle = "yellow";
                canvasCtx.font = "16px Arial";
                canvasCtx.fillText("Waiting for Godot...", 10, 30);
                
                // DIAGNOSTIC: Scan for any properties that look like Godot
                let candidates = [];
                try {
                    if (gameWindow) {
                        const keys = Object.keys(gameWindow);
                        candidates = keys.filter(k => k.toLowerCase().includes('godot') || k.toLowerCase().includes('hand'));
                    }
                } catch (e) { candidates.push("Access Denied"); }

                canvasCtx.font = "12px Arial";
                if (candidates.length > 0) {
                    canvasCtx.fillText("Found similar: " + candidates.join(', ').substring(0, 30), 10, 50);
                } else {
                    canvasCtx.fillText("No 'godot...' functions found on iframe.", 10, 50);
                }
            }
        } catch (e) {
            // Ignore cross-origin errors if they happen during load
            console.warn("Communication error:", e);
        }
        
        // 5. Visual feedback on debug canvas
        canvasCtx.fillStyle = isHandOpen ? "#00FF00" : "#FF0000";
        canvasCtx.font = "bold 40px Arial";
        canvasCtx.fillText(isHandOpen ? "DROP" : "HOLD", 50, 80);
        
        // Draw a progress bar for X position
        canvasCtx.fillStyle = "white";
        canvasCtx.fillRect(0, debugCanvas.height - 20, debugCanvas.width, 20);
        canvasCtx.fillStyle = "blue";
        canvasCtx.fillRect(xPos * debugCanvas.width - 10, debugCanvas.height - 20, 20, 20);

    }
    canvasCtx.restore();
}

// Initialize MediaPipe Hands
const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

hands.onResults(onResults);

// Initialize Camera
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({image: videoElement});
  },
  width: 640,
  height: 480
});

camera.start();
