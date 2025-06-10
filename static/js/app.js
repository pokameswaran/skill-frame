/**
* Copyright 2025 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

/**
 * app.js: JS code for the adk-streaming sample app with audio, video, and screen sharing.
 */

/**
 * WebSocket handling
 */

// Connect the server with a WebSocket connection
const sessionId = Math.random().toString().substring(10);
const ws_url =
  "ws://" + window.location.host + "/ws/" + sessionId;
let websocket = null;
let is_audio = false;

// Initialize system flags
window.textModeReady = false;
window.analysisInProgress = false;
window.analysisComplete = false;
window.isAnalysisRequest = false;
window.isWaitingForRolePlayAck = false;
window.manualReconnectionInProgress = false;
window.analysisTimeoutId = null;
window.feedbackPageRendered = false;

// Get DOM elements
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
const chatStatus = document.getElementById("chatStatus");
let currentMessageId = null;

// Media controls
const audioToggleButton = document.getElementById("audioToggleButton");
const cameraToggleButton = document.getElementById("cameraToggleButton");
const screenToggleButton = document.getElementById("screenToggleButton");
const vadButton = document.getElementById("vadButton");
const chatSection = document.getElementById("chatSection");
const rightSidebar = document.getElementById("rightSidebar");
const contentArea = document.getElementById("contentArea");
const videoSection = document.getElementById("videoSection");

// Menu controls
const menuButton = document.getElementById("menuButton");
const menuDropdown = document.getElementById("menuDropdown");
const pdfViewerMenuItem = document.getElementById("pdfViewerMenuItem");
const welcomeMessage = document.getElementById("welcomeMessage");
const pdfViewerContainer = document.getElementById("pdfViewerContainer");

// Chat and video visibility states
let isChatVisible = true;
let isVideoActive = false;
let isVideoMinimized = false; // New state for video minimize
let isPanelCollapsed = false; // New state for panel collapse
let isChatMinimized = false; // New state for chat minimize
let isPdfViewerActive = false; // New state for PDF viewer

// Initialize video minimize functionality
function initializeVideoMinimize() {
  const videoMinimizeButton = document.getElementById("videoMinimizeButton");
  const videoContent = document.getElementById("videoContent");
  
  if (videoMinimizeButton && videoContent) {
    videoMinimizeButton.addEventListener("click", () => {
      isVideoMinimized = !isVideoMinimized;
      updateVideoMinimizeState();
    });
  }
}

// Initialize chat minimize functionality
function initializeChatMinimize() {
  const chatMinimizeButton = document.getElementById("chatMinimizeButton");
  const chatContent = document.getElementById("chatContent");
  
  console.log("🔧 Initializing chat minimize...", { 
    button: !!chatMinimizeButton, 
    content: !!chatContent 
  });
  
  if (chatMinimizeButton && chatContent) {
    chatMinimizeButton.addEventListener("click", () => {
      console.log("🔘 Chat minimize button clicked, current state:", isChatMinimized);
      isChatMinimized = !isChatMinimized;
      updateChatMinimizeState();
    });
    console.log("✅ Chat minimize initialized successfully");
  } else {
    console.error("❌ Chat minimize initialization failed - missing elements");
  }
}

// Update video minimize state
function updateVideoMinimizeState() {
  const videoSection = document.getElementById("videoSection");
  const videoContent = document.getElementById("videoContent");
  const videoMinimizeButton = document.getElementById("videoMinimizeButton");
  
  if (isVideoMinimized) {
    videoContent.classList.add("minimized");
    videoSection.classList.add("minimized");
    videoMinimizeButton.textContent = "➕";
    videoMinimizeButton.title = "Restore video preview";
  } else {
    videoContent.classList.remove("minimized");
    videoSection.classList.remove("minimized");
    videoMinimizeButton.textContent = "➖";
    videoMinimizeButton.title = "Minimize video preview";
  }
  
  // Update layout after minimize state change
  updateRightSidebarLayout();
}

// Update chat minimize state
function updateChatMinimizeState() {
  const chatSection = document.getElementById("chatSection");
  const chatContent = document.getElementById("chatContent");
  const chatMinimizeButton = document.getElementById("chatMinimizeButton");
  
  if (isChatMinimized) {
    chatContent.classList.add("minimized");
    chatSection.classList.add("minimized");
    chatMinimizeButton.textContent = "➕";
    chatMinimizeButton.title = "Restore chat history";
    console.log("💬 Chat minimized");
  } else {
    chatContent.classList.remove("minimized");
    chatSection.classList.remove("minimized");
    chatMinimizeButton.textContent = "➖";
    chatMinimizeButton.title = "Minimize chat history";
    console.log("💬 Chat expanded");
  }
  
  // Update layout after minimize state change
  updateRightSidebarLayout();
}

// Update the right sidebar layout based on chat and video visibility
function updateRightSidebarLayout() {
  // Don't modify layout if panel is collapsed
  if (isPanelCollapsed) {
    return;
  }
  
  // Determine if we have any visible content in the right sidebar
  const hasChatContent = isChatVisible && !isChatMinimized;
  const hasVideoContent = isVideoActive && !isVideoMinimized;
  const hasAnyContent = isChatVisible || isVideoActive; // Headers are always visible
  
  if (!hasAnyContent) {
    // Hide entire right sidebar if no sections are active
    rightSidebar.classList.add("hidden");
    contentArea.classList.add("expanded");
  } else {
    // Show right sidebar
    rightSidebar.classList.remove("hidden");
    contentArea.classList.remove("expanded");
    
    // Chat is always visible when panel is expanded (but content may be minimized)
    chatSection.classList.remove("hidden");
    
    // Handle video section visibility (show when active, even if minimized)
    if (isVideoActive) {
      videoSection.classList.add("active");
    } else {
      videoSection.classList.remove("active");
    }
  }
  
  console.log(`Layout updated - Chat: ${isChatVisible ? (isChatMinimized ? 'minimized' : 'expanded') : 'hidden'}, Video: ${isVideoActive ? (isVideoMinimized ? 'minimized' : 'expanded') : 'inactive'}`);
}

// Update chat status
function updateChatStatus(status) {
  if (chatStatus) {
    chatStatus.textContent = status;
  }
}

// Show and expand chat - used when role play is created
function showChat() {
  console.log("📺 showChat() called - ensuring chat is visible and expanded");
  
  // Ensure panel is not collapsed
  if (isPanelCollapsed) {
    isPanelCollapsed = false;
    updatePanelCollapseState();
    console.log("📺 Panel was collapsed, expanding it");
  }
  
  // Ensure chat is visible and not minimized
  isChatVisible = true;
  if (isChatMinimized) {
    isChatMinimized = false;
    updateChatMinimizeState();
    console.log("📺 Chat was minimized, expanding it");
  }
  
  // Update the layout
  updateRightSidebarLayout();
  
  console.log("📺 Chat is now visible and expanded for role play");
}

// WebSocket handlers
function connectWebsocket() {
  // Connect websocket
  const wsUrlWithAudio = ws_url + "?is_audio=" + is_audio;
  console.log("🔌 Connecting to WebSocket:", wsUrlWithAudio);
  
  websocket = new WebSocket(wsUrlWithAudio);

  // Handle connection open
  websocket.onopen = function () {
    // Connection opened messages
    console.log("✅ WebSocket connection opened successfully");
    console.log("🎯 Audio mode:", is_audio ? "ENABLED" : "DISABLED");
    updateChatStatus("Connected - Ready to chat");

    // Enable the Send button
    document.getElementById("sendButton").disabled = false;
    addSubmitHandler();
  };

  // Handle incoming messages
  websocket.onmessage = function (event) {
    // Parse the incoming message
    const message_from_server = JSON.parse(event.data);
    console.log("[AGENT TO CLIENT] ", message_from_server);

    // Handle interruption - clear audio buffer immediately
    if (message_from_server.interrupted && message_from_server.interrupted === true) {
      console.log("🚫 Server-side interruption detected - clearing audio buffer");
      if (audioPlayerNode) {
        audioPlayerNode.port.postMessage({ command: 'endOfAudio' });
      }
      currentMessageId = null;
      updateChatStatus("Response interrupted");
      return;
    }

    // Check if the turn is complete
    if (
      message_from_server.turn_complete &&
      message_from_server.turn_complete == true
    ) {
      console.log("✅ Turn complete");
      
      // Handle complete AI message
      if (currentMessageId) {
        const completeMessage = document.getElementById(currentMessageId);
        if (completeMessage && completeMessage.textContent) {
          // Only process analysis response when turn is complete AND we're in analysis mode
          if (window.analysisInProgress) {
            const responseText = completeMessage.textContent.trim();
            
            // Check if this is just the reset signal response
            if (responseText === "ANALYSIS_MODE_START" || responseText.includes("ANALYSIS_MODE_START")) {
              console.log("🔄 Received reset signal acknowledgment, ignoring");
              window.awaitingAnalysisResponse = true; // Now we can expect the real analysis
              // Clear this message and wait for the actual analysis response
              if (completeMessage) {
                completeMessage.remove();
              }
              currentMessageId = null;
              return;
            }
            
            // Only process if we're awaiting analysis response (not reset signal)
            if (window.awaitingAnalysisResponse) {
              // Check if this looks like a complete JSON analysis response
              if (responseText.includes('"strengths"') && responseText.includes('"improvements"') && responseText.includes('"detailed_feedback"')) {
                console.log("📊 Detected complete analysis response from AI");
                window.isAnalysisRequest = false; // Reset flag
                window.awaitingAnalysisResponse = false; // Reset flag
                handleAnalysisResponse(responseText);
              } else {
                console.warn("⚠️ Analysis response incomplete or malformed, waiting for complete response...");
                // Just wait - don't show fallback
              }
            }
          } else if (rolePlayStartTime) {
            // Only track role-play messages if session is active
            trackRolePlayMessage(completeMessage.textContent, false, false);
          }
        }
      }
      
      currentMessageId = null;
      updateChatStatus("Response complete - Ready for next message");
      return;
    }

    // If it's audio, play it
    if (message_from_server.mime_type == "audio/pcm" && audioPlayerNode) {
      audioPlayerNode.port.postMessage(base64ToArray(message_from_server.data));
      updateChatStatus("Playing audio response...");
    }

    // If it's a text, print it
    if (message_from_server.mime_type == "text/plain") {
      // add a new message for a new turn
      if (currentMessageId == null) {
        currentMessageId = Math.random().toString(36).substring(7);
        
        // Only create message element if we're not in analysis mode
        if (!window.analysisInProgress) {
          const message = document.createElement("p");
          message.id = currentMessageId;
          message.style.marginBottom = "10px";
          message.style.padding = "8px";
          message.style.backgroundColor = "#f0f8ff";
          message.style.borderLeft = "3px solid #007acc";
          message.style.borderRadius = "3px";
          // Append the message element to the messagesDiv
          messagesDiv.appendChild(message);
          updateChatStatus("Receiving response...");
        } else {
          // Create hidden message element for analysis response collection
          const message = document.createElement("div");
          message.id = currentMessageId;
          message.style.display = "none"; // Hidden during analysis
          messagesDiv.appendChild(message);
        }
        
        // Check if this is the role-play context acknowledgment
        if (window.isWaitingForRolePlayAck) {
          window.isWaitingForRolePlayAck = false;
          showRolePlayStatus(`${window.rolePlayScenarioTitle || 'Role-play'} ready!`, "success");
          console.log("🎭 Role-play context acknowledged by AI");
        }
      }

      // Add message text to the existing message element (only if not analysis)
      if (!window.analysisInProgress && currentMessageId) {
        const message = document.getElementById(currentMessageId);
        if (message) {
          message.textContent += message_from_server.data;

          // Scroll down to the bottom of the messagesDiv if chat is visible
          if (isChatVisible) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }
        }
      } else if (window.analysisInProgress && currentMessageId) {
        // During analysis, still collect the text but don't display it
        const message = document.getElementById(currentMessageId);
        if (message) {
          message.textContent += message_from_server.data;
        }
      }
    }
  };
  // Handle connection close
  websocket.onclose = function (event) {
    console.log("❌ WebSocket connection closed.", event.code, event.reason);
    document.getElementById("sendButton").disabled = true;
    updateChatStatus("Connection lost - Reconnecting...");
    
    // Reset audio and video UI state when connection closes
    if (isAudioActive) {
      console.log("🔄 Resetting audio state due to connection close");
      stopAudio();
    }
    if (isVideoActive) {
      console.log("🔄 Resetting video state due to connection close");
      stopVideo();
    }
    
    // Only auto-reconnect if we're not in analysis mode AND not during manual reconnection
    if (!window.analysisInProgress && !window.manualReconnectionInProgress) {
      setTimeout(function () {
        console.log("🔄 Attempting to reconnect WebSocket...");
        connectWebsocket();
      }, 5000);
    } else {
      console.log("🔄 Skipping auto-reconnect (analysis or manual reconnection in progress)");
    }
  };

  websocket.onerror = function (error) {
    console.error("❌ WebSocket error:", error);
    updateChatStatus("Connection error - Check console for details");
  };
}
connectWebsocket();

// Add submit handler to the form
function addSubmitHandler() {
  messageForm.onsubmit = function (e) {
    e.preventDefault();
    const message = messageInput.value;
    if (message) {
      const p = document.createElement("p");
      p.textContent = "> " + message;
      p.style.marginBottom = "8px";
      p.style.padding = "6px";
      p.style.backgroundColor = "#f9f9f9";
      p.style.borderLeft = "3px solid #28a745";
      p.style.borderRadius = "3px";
      p.style.fontWeight = "400";
      messagesDiv.appendChild(p);
      messageInput.value = "";
      sendMessage({
        mime_type: "text/plain",
        data: message,
      });
      console.log("[CLIENT TO AGENT] " + message);
      updateChatStatus("Message sent - Waiting for response...");
      
      // Track user message for role-play analysis only if session is active
      if (rolePlayStartTime) {
        trackRolePlayMessage(message, true, false);
      }
      
      // Scroll to bottom
      setTimeout(() => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }, 100);
    }
    return false;
  };
}

// Send a message to the server as a JSON string
function sendMessage(message) {
  if (websocket && websocket.readyState == WebSocket.OPEN) {
    const messageJson = JSON.stringify(message);
    websocket.send(messageJson);
  }
}

// Decode Base64 data to Array
function base64ToArray(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Audio handling
 */

let audioPlayerNode;
let audioPlayerContext;
let audioRecorderNode;
let audioRecorderContext;
let micStream;
let isAudioActive = false;

// Voice Activity Detection (VAD) variables
let isUserSpeaking = false;
let lastUserSpeechTime = 0;
let silenceThreshold = 0.01; // RMS threshold for silence detection
let speechThreshold = 0.02; // RMS threshold for speech start detection
let minSpeechDuration = 300; // Minimum duration in ms to consider as speech
let maxSilenceDuration = 1000; // Maximum silence duration in ms before stopping speech detection
let vadEnabled = true; // VAD is always enabled now
let audioBuffer = []; // Buffer to store recent audio samples for analysis
let bufferSize = 1024; // Size of the analysis buffer

// Import the audio worklets
import { startAudioPlayerWorklet } from "./audio-player.js";
import { startAudioRecorderWorklet } from "./audio-recorder.js";

// Start audio
function startAudio() {
  console.log("🎵 Initializing audio worklets...");
  
  // Start audio output
  startAudioPlayerWorklet().then(([node, ctx]) => {
    audioPlayerNode = node;
    audioPlayerContext = ctx;
    console.log("🔊 Audio player worklet initialized successfully");
  }).catch(error => {
    console.error("❌ Failed to initialize audio player worklet:", error);
    updateChatStatus("Audio player initialization failed");
  });
  
  // Start audio input
  startAudioRecorderWorklet(audioRecorderHandler).then(
    ([node, ctx, stream]) => {
      audioRecorderNode = node;
      audioRecorderContext = ctx;
      micStream = stream;
      console.log("🎤 Audio recorder worklet initialized successfully");
    }
  ).catch(error => {
    console.error("❌ Failed to initialize audio recorder worklet:", error);
    updateChatStatus("Microphone access failed - Please check permissions");
    
    // Reset audio state if initialization fails
    isAudioActive = false;
    is_audio = false;
    audioToggleButton.classList.remove("active");
    audioToggleButton.title = "Click to start audio";
  });
}

// Audio toggle functionality using event delegation
function handleAudioToggle(buttonElement) {
  console.log("🎯 Audio toggle button clicked, current state:", { isAudioActive, is_audio });
  
  if (!isAudioActive) {
    console.log("🎤 Starting audio mode...");
    
    // Start audio
    startAudio();
    is_audio = true;
    isAudioActive = true;
    
    // Reconnect websocket with audio mode
    console.log("🔌 Reconnecting WebSocket in audio mode...");
    connectWebsocket(); 
    
    // Update UI for all audio toggle buttons
    updateAllAudioToggleButtons(true);
    
    console.log("🎤 Audio session started successfully");
    updateChatStatus("Audio active - Voice detection enabled");
    
    // Add VAD status message (always enabled) - only to main chat if visible
    if (messagesDiv && messagesDiv.style.display !== 'none') {
      const vadMsg = document.createElement("p");
      vadMsg.textContent = "🎙️ Voice Activity Detection: Active";
      vadMsg.style.color = "#0066cc";
      vadMsg.style.fontStyle = "italic";
      vadMsg.style.marginBottom = "8px";
      vadMsg.style.padding = "6px";
      vadMsg.style.backgroundColor = "#e6f3ff";
      vadMsg.style.borderRadius = "3px";
      messagesDiv.appendChild(vadMsg);
      
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
  } else {
    console.log("🛑 Stopping audio mode...");
    // Stop audio
    stopAudio();
  }
}

// Function to update all audio toggle buttons consistently
function updateAllAudioToggleButtons(isActive) {
  const allAudioButtons = document.querySelectorAll('#audioToggleButton');
  allAudioButtons.forEach(button => {
    if (isActive) {
      button.classList.add("active");
      button.title = "Click to stop audio";
    } else {
      button.classList.remove("active");
      button.title = "Click to start audio";
    }
  });
}

// Event delegation for dynamically created buttons
document.addEventListener("click", (e) => {
  if (e.target.id === "audioToggleButton") {
    e.preventDefault();
    handleAudioToggle(e.target);
  }
  if (e.target.id === "vadButton") {
    e.preventDefault();
    startVADCalibration();
  }
  if (e.target.id === "cameraToggleButton") {
    e.preventDefault();
    handleCameraToggle(e.target);
  }
  if (e.target.id === "screenToggleButton") {
    e.preventDefault();
    handleScreenToggle(e.target);
  }
});

// Enhanced audio recorder handler with Voice Activity Detection
function audioRecorderHandler(pcmData) {
  // Only process audio data if audio is active
  if (!isAudioActive) {
    return;
  }
  
  // Convert PCM data to Float32Array for analysis
  const int16Array = new Int16Array(pcmData);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  
  // Perform Voice Activity Detection (always enabled)
  const shouldSendAudio = performVAD(float32Array);
  
  // Only send audio data if VAD detects speech
  if (shouldSendAudio) {
    sendMessage({
      mime_type: "audio/pcm",
      data: arrayBufferToBase64(pcmData),
    });
    console.log(`[CLIENT TO AGENT] sent %s bytes (VAD: SPEECH)`, pcmData.byteLength);
  } else {
    // Log silence detection (less frequently to avoid spam)
    if (Math.random() < 0.01) { // Log ~1% of silence frames
      console.log(`[VAD] Silence detected, not sending audio (RMS: ${calculateRMS(float32Array).toFixed(4)})`);
    }
  }
}

// Voice Activity Detection function
function performVAD(audioSamples) {
  const currentTime = Date.now();
  
  // Calculate RMS (Root Mean Square) for volume detection
  const rms = calculateRMS(audioSamples);
  
  // Update audio buffer for more sophisticated analysis
  audioBuffer.push(...audioSamples);
  if (audioBuffer.length > bufferSize) {
    audioBuffer = audioBuffer.slice(-bufferSize);
  }
  
  // Detect start of speech
  if (rms > speechThreshold && !isUserSpeaking) {
    isUserSpeaking = true;
    lastUserSpeechTime = currentTime;
    console.log(`🗣️ Speech detected! RMS: ${rms.toFixed(4)}`);
    
    // Add visual feedback for speech detection
    updateSpeechIndicator(true);
    
    return true; // Send this audio frame
  }
  
  // Continue speech detection if already speaking and above silence threshold
  if (isUserSpeaking && rms > silenceThreshold) {
    lastUserSpeechTime = currentTime;
    return true; // Continue sending audio
  }
  
  // Detect end of speech (silence for too long)
  if (isUserSpeaking && (currentTime - lastUserSpeechTime) > maxSilenceDuration) {
    isUserSpeaking = false;
    console.log(`🔇 Speech ended (silence duration: ${currentTime - lastUserSpeechTime}ms)`);
    
    // Add visual feedback for speech end
    updateSpeechIndicator(false);
    
    return false; // Stop sending audio
  }
  
  // If we're in the middle of speech but below silence threshold, 
  // continue for a short time in case it's just a brief pause
  if (isUserSpeaking && (currentTime - lastUserSpeechTime) < minSpeechDuration) {
    return true; // Continue sending audio during brief pauses
  }
  
  return isUserSpeaking; // Send audio only if we're currently detecting speech
}

// Calculate RMS (Root Mean Square) for audio volume
function calculateRMS(audioSamples) {
  let sum = 0;
  for (let i = 0; i < audioSamples.length; i++) {
    sum += audioSamples[i] * audioSamples[i];
  }
  return Math.sqrt(sum / audioSamples.length);
}

// Update visual speech indicator
function updateSpeechIndicator(isSpeaking) {
  // Update the video status or create a speech indicator
  const speechIndicator = document.getElementById('speechIndicator') || createSpeechIndicator();
  
  if (isSpeaking) {
    speechIndicator.textContent = '🗣️ Speaking...';
    speechIndicator.style.color = '#00aa00';
    speechIndicator.style.fontWeight = 'normal';
  } else {
    speechIndicator.textContent = '🎤 Listening...';
    speechIndicator.style.color = '#666';
    speechIndicator.style.fontWeight = 'normal';
  }
}

// Create speech indicator element
function createSpeechIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'speechIndicator';
  indicator.style.position = 'fixed';
  indicator.style.top = '10px';
  indicator.style.right = '10px';
  indicator.style.padding = '5px 10px';
  indicator.style.backgroundColor = 'rgba(0,0,0,0.8)';
  indicator.style.color = 'white';
  indicator.style.borderRadius = '5px';
  indicator.style.fontSize = '14px';
  indicator.style.zIndex = '1000';
  indicator.textContent = '🎤 Listening...';
  document.body.appendChild(indicator);
  return indicator;
}

// Stop audio function
function stopAudio() {
  console.log("🛑 Stopping audio session...");
  
  isAudioActive = false;
  isUserSpeaking = false; // Reset VAD state
  
  // Update UI for all audio toggle buttons
  updateAllAudioToggleButtons(false);
  updateChatStatus("Audio stopped");
  
  // Remove speech indicator
  const speechIndicator = document.getElementById('speechIndicator');
  if (speechIndicator) {
    speechIndicator.remove();
  }
  
  // Stop microphone
  if (micStream) {
    micStream.getTracks().forEach(track => {
      track.stop();
      console.log("🎤 Microphone track stopped");
    });
    micStream = null;
  }
  
  // Stop audio contexts
  if (audioRecorderContext && audioRecorderContext.state !== 'closed') {
    audioRecorderContext.close().then(() => {
      console.log("🎙️ Audio recorder context closed");
    });
    audioRecorderContext = null;
    audioRecorderNode = null;
  }
  
  if (audioPlayerContext && audioPlayerContext.state !== 'closed') {
    audioPlayerContext.close().then(() => {
      console.log("🔊 Audio player context closed");
    });
    audioPlayerContext = null;
    audioPlayerNode = null;
  }
  
  // Reconnect websocket without audio
  is_audio = false;
  connectWebsocket();
  
  console.log("✅ Audio session stopped successfully");
  
  // Add visual feedback
  const stopMsg = document.createElement("p");
  stopMsg.textContent = "🛑 Audio stopped";
  stopMsg.style.color = "#666";
  stopMsg.style.fontStyle = "italic";
  stopMsg.style.marginBottom = "8px";
  stopMsg.style.padding = "6px";
  stopMsg.style.backgroundColor = "#f8f9fa";
  stopMsg.style.borderRadius = "3px";
  messagesDiv.appendChild(stopMsg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Initialize role-play conversation with context
function initializeRolePlayConversation(scenarioData) {
  console.log("🎭 Initializing role-play conversation with context...", scenarioData);
  
  // Start role-play session tracking
  startRolePlaySession(scenarioData);
  
  // Show loading indicator for context initialization
  showRolePlayStatus("Preparing role-play scenario...", "loading");
  
  // Construct comprehensive role-play context message
  const rolePlayContext = `
**ROLE-PLAY SCENARIO INITIALIZED**

**Scenario:** ${scenarioData.title || 'Role-Play Exercise'}
**Description:** ${scenarioData.description || 'Professional role-play scenario'}

**Your Role:** ${scenarioData.ai_role || 'Role-Play Partner'}
**Your Character:** ${scenarioData.ai_name || 'Alex'}
**Your Character Description:** ${scenarioData.ai_description || 'A professional role-play partner'}

**User's Role:** ${scenarioData.user_role || 'Professional'}
**User's Name:** ${scenarioData.user_name || 'User'}

**Success Criteria for this Role-Play:**
${(scenarioData.success_criteria || []).map((criteria, index) => `${index + 1}. ${criteria}`).join('\n')}

**Instructions:**
- Stay in character as ${scenarioData.ai_name || 'Alex'} throughout this conversation
- Act according to your role as ${scenarioData.ai_role || 'Role-Play Partner'}
- Help the user practice the scenario and provide realistic responses
- Be professional but engaging
- Provide constructive feedback when appropriate
- Keep responses conversational and realistic for this professional context

**Initial Prompt:** ${scenarioData.chat_prompt || 'Let\'s begin the role-play scenario.'}

Please acknowledge that you understand your role and are ready to begin the role-play scenario as ${scenarioData.ai_name || 'Alex'}.
`;

  // Track the initial context message
  trackRolePlayMessage(rolePlayContext, false, true);

  // Send the context to initialize the conversation
  setTimeout(() => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      sendMessage({
        mime_type: "text/plain",
        data: rolePlayContext,
      });
      console.log("🎭 Role-play context sent to AI");
      
      // Update status to show context was sent
      showRolePlayStatus("Context sent, waiting for AI response...", "loading");
      
      // Set flag to detect first AI response as context acknowledgment
      window.isWaitingForRolePlayAck = true;
      window.rolePlayScenarioTitle = scenarioData.title;
      
      // Show role-play initialization message in chat if visible
      if (messagesDiv && messagesDiv.style.display !== 'none') {
        const initMsg = document.createElement("p");
        initMsg.textContent = `🎭 Role-play scenario "${scenarioData.title}" initialized`;
        initMsg.style.color = "#0066cc";
        initMsg.style.fontStyle = "italic";
        initMsg.style.marginBottom = "8px";
        initMsg.style.padding = "6px";
        initMsg.style.backgroundColor = "#e6f3ff";
        initMsg.style.borderRadius = "3px";
        messagesDiv.appendChild(initMsg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    } else {
      console.warn("⚠️ WebSocket not ready, will retry role-play initialization...");
      showRolePlayStatus("Connection not ready, retrying...", "loading");
      // Retry after a short delay
      setTimeout(() => initializeRolePlayConversation(scenarioData), 1000);
    }
  }, 500); // Small delay to ensure WebSocket is ready
  
  // Timeout fallback - if no response after 10 seconds, show error
  setTimeout(() => {
    if (window.isWaitingForRolePlayAck) {
      console.warn("⚠️ Role-play context acknowledgment timeout");
      window.isWaitingForRolePlayAck = false;
      showRolePlayStatus("Role-play ready (manual start)", "info");
    }
  }, 10000); // 10 second timeout
}

// Show role-play status in the conversation interface
function showRolePlayStatus(message, type = "info") {
  // Try to find status area in role-play interface
  const conversationTimer = document.getElementById("conversationTimer");
  if (conversationTimer) {
    // Temporarily show status message in timer area
    const originalText = conversationTimer.textContent;
    conversationTimer.textContent = message;
    conversationTimer.style.color = type === "loading" ? "#0066cc" : 
                                  type === "success" ? "#00aa00" : 
                                  type === "error" ? "#cc0000" : "#888";
    
    // Reset to timer after 3 seconds for non-loading messages
    if (type !== "loading") {
      setTimeout(() => {
        conversationTimer.textContent = originalText;
        conversationTimer.style.color = "#888";
      }, 3000);
    }
  }
  
  // Also update avatar states to show activity
  const userAvatar = document.getElementById("userAvatar");
  const aiAvatar = document.getElementById("aiAvatar");
  const userDot = document.getElementById("userActiveDot");
  const aiDot = document.getElementById("aiActiveDot");
  
  if (type === "loading" && aiAvatar && aiDot) {
    aiAvatar.classList.add("active");
    aiDot.classList.add("active");
  } else if (type === "success" && aiAvatar && aiDot) {
    // Keep AI active for a moment to show readiness
    setTimeout(() => {
      aiAvatar.classList.remove("active");
      aiDot.classList.remove("active");
    }, 2000);
  }
}

// Role-play conversation tracking
let rolePlayConversation = [];
let rolePlayStartTime = null;
let rolePlayScenarioData = null;

// Initialize role-play session tracking
function startRolePlaySession(scenarioData) {
  rolePlayConversation = [];
  rolePlayStartTime = new Date();
  rolePlayScenarioData = scenarioData;
  console.log("🎭 Role-play session tracking started");
}

// Track conversation messages during role-play (primarily for logging)
function trackRolePlayMessage(message, isUser = false, isSystem = false) {
  if (!rolePlayStartTime) return; // Only track during active role-play
  
  const messageData = {
    timestamp: new Date(),
    content: message.substring(0, 100) + (message.length > 100 ? '...' : ''), // Truncate for logging
    speaker: isSystem ? 'system' : (isUser ? 'user' : 'ai'),
    timeFromStart: new Date() - rolePlayStartTime
  };
  
  rolePlayConversation.push(messageData);
  console.log(`📝 Tracked ${messageData.speaker} message: ${messageData.content}`);
  
  // Log conversation progress
  if (rolePlayConversation.length % 5 === 0) {
    console.log(`💬 Role-play progress: ${rolePlayConversation.length} messages exchanged`);
  }
}

// End role-play session and initiate analysis
function endRolePlaySession() {
  if (!rolePlayStartTime || !rolePlayScenarioData) {
    console.warn("⚠️ No role-play session to analyze");
    return;
  }
  
  console.log("🎭 Ending role-play session, preparing for analysis...");
  console.log(`📊 Session duration: ${Math.round((new Date() - rolePlayStartTime) / 1000)} seconds`);
  
  // Set analysis flag IMMEDIATELY to prevent auto-reconnection interference
  window.analysisInProgress = true;
  window.analysisComplete = false;
  window.feedbackPageRendered = false; // Reset for new analysis
  
  // Stop role-play session tracking
  const sessionDuration = new Date() - rolePlayStartTime;
  rolePlayStartTime = null; // Stop further message tracking
  
  // If audio is active, disable it first but preserve session
  if (isAudioActive) {
    console.log("🔇 Disabling audio mode for analysis while preserving session...");
    
    // Stop audio components but keep WebSocket session
    stopAudioForAnalysis();
    
    // Wait for audio to fully stop before starting analysis
    setTimeout(() => {
      startRolePlayAnalysis();
    }, 1000);
  } else {
    // Start analysis immediately if no audio to stop
    startRolePlayAnalysis();
  }
}

// Stop audio components and reconnect in text mode for analysis
function stopAudioForAnalysis() {
  console.log("🔇 Stopping audio and reconnecting in text mode for analysis...");
  
  isAudioActive = false;
  isUserSpeaking = false;
  
  // Update UI for all audio toggle buttons
  updateAllAudioToggleButtons(false);
  updateChatStatus("Switching to text mode for analysis...");
  
  // Remove speech indicator
  const speechIndicator = document.getElementById('speechIndicator');
  if (speechIndicator) {
    speechIndicator.remove();
  }
  
  // Stop microphone
  if (micStream) {
    micStream.getTracks().forEach(track => {
      track.stop();
      console.log("🎤 Microphone track stopped");
    });
    micStream = null;
  }
  
  // Stop audio contexts
  if (audioRecorderContext && audioRecorderContext.state !== 'closed') {
    audioRecorderContext.close().then(() => {
      console.log("🎙️ Audio recorder context closed");
    });
    audioRecorderContext = null;
    audioRecorderNode = null;
  }
  
  if (audioPlayerContext && audioPlayerContext.state !== 'closed') {
    audioPlayerContext.close().then(() => {
      console.log("🔊 Audio player context closed");
    });
    audioPlayerContext = null;
    audioPlayerNode = null;
  }
  
  // Now reconnect WebSocket in text mode with same session ID
  reconnectForAnalysis();
}

// Reconnect WebSocket in text mode while preserving session ID
function reconnectForAnalysis() {
  console.log("🔄 Reconnecting WebSocket in text mode for analysis...");
  
  // Set flag to prevent auto-reconnection interference
  window.manualReconnectionInProgress = true;
  
  // Store current session ID
  const currentSessionId = sessionId;
  
  // Close current WebSocket
  if (websocket) {
    websocket.close();
    console.log("🔌 Closed audio-mode WebSocket");
  }
  
  // Switch to text mode
  is_audio = false;
  
  // Set up new WebSocket connection in text mode with same session ID
  const wsUrlTextMode = "ws://" + window.location.host + "/ws/" + currentSessionId + "?is_audio=false";
  console.log("🔌 Connecting to WebSocket in text mode:", wsUrlTextMode);
  
  websocket = new WebSocket(wsUrlTextMode);
  
  // Handle connection open
  websocket.onopen = function () {
    console.log("✅ WebSocket reconnected in text mode successfully");
    updateChatStatus("Connected in text mode - Ready for analysis");
    
    // Clear manual reconnection flag and set text mode ready
    window.manualReconnectionInProgress = false;
    window.textModeReady = true;
    
    console.log("🎯 Text mode connection established, session history preserved");
  };
  
  // Reuse the existing WebSocket message handlers from connectWebsocket()
  websocket.onmessage = function (event) {
    // Parse the incoming message
    const message_from_server = JSON.parse(event.data);
    console.log("[AGENT TO CLIENT] ", message_from_server);

    // Handle interruption
    if (message_from_server.interrupted && message_from_server.interrupted === true) {
      console.log("🚫 Server-side interruption detected");
      currentMessageId = null;
      updateChatStatus("Response interrupted");
      return;
    }

    // Check if the turn is complete
    if (
      message_from_server.turn_complete &&
      message_from_server.turn_complete == true
    ) {
      console.log("✅ Turn complete");
      
      // Handle complete AI message
      if (currentMessageId) {
        const completeMessage = document.getElementById(currentMessageId);
        if (completeMessage && completeMessage.textContent) {
          // Only process analysis response when turn is complete AND we're in analysis mode
          if (window.analysisInProgress) {
            const responseText = completeMessage.textContent.trim();
            
            // Check if this is just the reset signal response
            if (responseText === "ANALYSIS_MODE_START" || responseText.includes("ANALYSIS_MODE_START")) {
              console.log("🔄 Received reset signal acknowledgment, ignoring");
              window.awaitingAnalysisResponse = true; // Now we can expect the real analysis
              // Clear this message and wait for the actual analysis response
              if (completeMessage) {
                completeMessage.remove();
              }
              currentMessageId = null;
              return;
            }
            
            // Only process if we're awaiting analysis response (not reset signal)
            if (window.awaitingAnalysisResponse) {
              // Check if this looks like a complete JSON analysis response
              if (responseText.includes('"strengths"') && responseText.includes('"improvements"') && responseText.includes('"detailed_feedback"')) {
                console.log("📊 Detected complete analysis response from AI");
                window.isAnalysisRequest = false; // Reset flag
                window.awaitingAnalysisResponse = false; // Reset flag
                handleAnalysisResponse(responseText);
              } else {
                console.warn("⚠️ Analysis response incomplete or malformed, waiting for complete response...");
                // Just wait - don't show fallback
              }
            }
          } else if (rolePlayStartTime) {
            // Only track role-play messages if session is active
            trackRolePlayMessage(completeMessage.textContent, false, false);
          }
        }
      }
      
      currentMessageId = null;
      updateChatStatus("Response complete - Ready for next message");
      return;
    }

    // Handle text messages only (audio is disabled in this mode)
    if (message_from_server.mime_type == "text/plain") {
      // add a new message for a new turn
      if (currentMessageId == null) {
        currentMessageId = Math.random().toString(36).substring(7);
        
        // Only create message element if we're not in analysis mode
        if (!window.analysisInProgress) {
          const message = document.createElement("p");
          message.id = currentMessageId;
          message.style.marginBottom = "10px";
          message.style.padding = "8px";
          message.style.backgroundColor = "#f0f8ff";
          message.style.borderLeft = "3px solid #007acc";
          message.style.borderRadius = "3px";
          // Append the message element to the messagesDiv
          messagesDiv.appendChild(message);
          updateChatStatus("Receiving response...");
        } else {
          // Create hidden message element for analysis response collection
          const message = document.createElement("div");
          message.id = currentMessageId;
          message.style.display = "none"; // Hidden during analysis
          messagesDiv.appendChild(message);
        }
        
        // Check if this is the role-play context acknowledgment
        if (window.isWaitingForRolePlayAck) {
          window.isWaitingForRolePlayAck = false;
          showRolePlayStatus(`${window.rolePlayScenarioTitle || 'Role-play'} ready!`, "success");
          console.log("🎭 Role-play context acknowledged by AI");
        }
      }

      // Add message text to the existing message element (only if not analysis)
      if (!window.analysisInProgress && currentMessageId) {
        const message = document.getElementById(currentMessageId);
        if (message) {
          message.textContent += message_from_server.data;

          // Scroll down to the bottom of the messagesDiv if chat is visible
          if (isChatVisible) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }
        }
      } else if (window.analysisInProgress && currentMessageId) {
        // During analysis, still collect the text but don't display it
        const message = document.getElementById(currentMessageId);
        if (message) {
          message.textContent += message_from_server.data;
        }
      }
    }
  };
  
  // Handle connection close and errors
  websocket.onclose = function (event) {
    console.log("❌ Analysis WebSocket connection closed.", event.code, event.reason);
    window.manualReconnectionInProgress = false; // Reset flag
    updateChatStatus("Analysis connection lost");
  };

  websocket.onerror = function (error) {
    console.error("❌ Analysis WebSocket error:", error);
    window.manualReconnectionInProgress = false; // Reset flag
    updateChatStatus("Analysis connection error");
  };
}

// Start comprehensive role-play analysis
function startRolePlayAnalysis() {
  console.log("📊 Starting role-play analysis...");
  
  // Show simple analyzing page
  renderAnalyzingPage();
  
  // Prepare analysis data
  const analysisData = prepareAnalysisData();
  
  // Send analysis request immediately (no step progression)
  waitForTextModeAndSendAnalysis(analysisData);
}

// Prepare analysis data based on AI's conversation memory
function prepareAnalysisData() {
  const sessionDuration = Math.round((new Date() - (rolePlayStartTime || new Date())) / 1000);
  
  return {
    scenario: rolePlayScenarioData,
    duration: sessionDuration,
    analysisMode: 'memory-based' // Use AI's conversation memory rather than transcript
  };
}

// Render simple analyzing page
function renderAnalyzingPage() {
  // Use the existing function from HTML but make it accessible
  if (typeof renderPreparingPage === 'function') {
    // Call the existing function but we'll modify it to show simple message
    renderPreparingPage();
    
    // Update the content to show simple analyzing message
    setTimeout(() => {
      const preparingContainer = document.querySelector('.preparing-container');
      if (preparingContainer) {
        preparingContainer.innerHTML = `
          <div class="preparing-content" style="text-align: center; padding: 60px 20px;">
            <div class="analyzing-spinner" style="margin-bottom: 30px;">
              <div style="
                width: 40px; 
                height: 40px; 
                border: 4px solid #f3f3f3; 
                border-top: 4px solid #0066cc; 
                border-radius: 50%; 
                animation: spin 1s linear infinite;
                margin: 0 auto;
              "></div>
            </div>
            <h2 style="color: #222; margin-bottom: 20px; font-size: 28px;">
              Analyzing Your Performance
            </h2>
            <p style="color: #666; font-size: 18px; line-height: 1.6;">
              Our AI is carefully reviewing your role-play conversation and preparing personalized feedback based on your performance...
            </p>
          </div>
          <style>
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        `;
      }
    }, 100);
  } else {
    // Fallback implementation
    console.warn("⚠️ renderPreparingPage not available, implementing fallback");
  }
  
  console.log("📊 Simple analyzing page rendered");
}

// Wait for text mode connection and send analysis
function waitForTextModeAndSendAnalysis(analysisData) {
  console.log("⏳ Waiting for text mode connection...");
  
  let attempts = 0;
  const maxAttempts = 20; // 10 seconds with 500ms intervals
  
  const checkConnection = () => {
    attempts++;
    
    // Check if analysis was already completed or cancelled
    if (window.analysisComplete) {
      console.log("📊 Analysis already complete, stopping connection check");
      return;
    }
    
    if (window.textModeReady && websocket && websocket.readyState === WebSocket.OPEN) {
      console.log("✅ Text mode ready, sending analysis request");
      sendAnalysisToAI(analysisData);
    } else if (attempts >= maxAttempts) {
      console.error("❌ Text mode connection timeout - analysis failed");
      showAnalysisError("Connection timeout. Please try again.");
    } else {
      console.log(`⏳ Still waiting for text mode connection... (${attempts}/${maxAttempts})`);
      setTimeout(checkConnection, 500);
    }
  };
  
  // Start checking after a brief delay
  setTimeout(checkConnection, 500);
}

// Send comprehensive analysis request to AI using conversation memory
function sendAnalysisToAI(analysisData) {
  // First, send a reset/interrupt signal to clear any pending responses
  const resetPrompt = "ANALYSIS_MODE_START";
  
  // Send reset signal first
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    sendMessage({
      mime_type: "text/plain",
      data: resetPrompt,
    });
    console.log("🔄 Sent conversation reset signal");
  }
  
  // Wait a brief moment, then send the actual analysis request
  setTimeout(() => {
    sendActualAnalysisRequest(analysisData);
  }, 500);
}

// Send the actual analysis request after reset
function sendActualAnalysisRequest(analysisData) {
  const analysisPrompt = `
**ROLE-PLAY PERFORMANCE ANALYSIS REQUEST**

Based on our recent role-play conversation, please provide a comprehensive performance analysis.

**Original Scenario Context:**
- Title: ${analysisData.scenario.title}
- Description: ${analysisData.scenario.description}
- User Role: ${analysisData.scenario.user_role} (${analysisData.scenario.user_name})
- AI Role: ${analysisData.scenario.ai_role} (${analysisData.scenario.ai_name})

**Success Criteria for the Role-Play:**
${(analysisData.scenario.success_criteria || []).map((criteria, index) => `${index + 1}. ${criteria}`).join('\n')}

**Session Duration:** ${Math.floor(analysisData.duration / 60)}:${String(analysisData.duration % 60).padStart(2, '0')}

**ANALYSIS INSTRUCTIONS:**
Please analyze the role-play conversation we just completed. Use your memory of our entire conversation to evaluate the user's performance against the success criteria.

CRITICAL FORMATTING INSTRUCTIONS:
- DO NOT include any conversational text like "I understand" or "Here is the analysis"  
- DO NOT use markdown formatting like \`\`\`json or \`\`\`
- DO NOT include explanations before or after the JSON
- Your entire response must be ONLY the JSON object
- Start your response immediately with { (opening brace)
- End your response immediately with } (closing brace)
- Nothing else - just pure JSON

Required JSON format (this is what your ENTIRE response should look like):

{
  "strengths": [
    "Specific strength 1 with detailed explanation of what the user did well",
    "Specific strength 2 with detailed explanation of what the user did well",
    "Specific strength 3 with detailed explanation of what the user did well"
  ],
  "improvements": [
    "Specific area for improvement 1 with actionable advice",
    "Specific area for improvement 2 with actionable advice", 
    "Specific area for improvement 3 with actionable advice"
  ],
  "detailed_feedback": "Comprehensive 3-4 paragraph analysis covering: overall communication effectiveness, achievement of success criteria, specific examples from our conversation, professional presence, and actionable recommendations for future practice. Reference specific moments or approaches from our conversation."
}

**Analysis Focus:**
- Evaluate communication clarity and effectiveness
- Assess achievement of the stated success criteria
- Consider professional presence and confidence level
- Analyze listening and response quality
- Identify specific areas for skill development
- Reference actual moments from our conversation
- Provide constructive, actionable feedback for improvement

IMPORTANT REMINDERS:
- Base your analysis on the actual conversation we just had, referencing specific examples and moments from our role-play interaction
- Respond with ONLY the JSON object - no additional text, explanations, or acknowledgments
- Start your response immediately with { and end with }
- Do not include markdown formatting like \`\`\`json or \`\`\`
`;

  // Set analysis flags for response handling
  window.analysisInProgress = true;
  window.analysisComplete = false;
  window.isAnalysisRequest = true; // Flag to identify analysis responses
  window.awaitingAnalysisResponse = true; // New flag to distinguish from reset responses
  
  // Send analysis request via text (audio should already be disabled)
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    sendMessage({
      mime_type: "text/plain",
      data: analysisPrompt,
    });
    console.log("📊 Memory-based analysis request sent to AI after reset");
  } else {
    console.error("❌ WebSocket not available for analysis");
    showAnalysisError("Connection error. Please try again.");
  }
}


// Sanitize JSON string to handle control characters and formatting issues
function sanitizeJsonString(jsonString) {
  try {
    let sanitized = jsonString;
    
    // Step 1: Remove problematic control characters (except valid JSON whitespace)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Step 2: Handle newlines, carriage returns, and tabs in string values
    // Convert literal newlines/tabs to escaped versions
    sanitized = sanitized.replace(/\n/g, '\\n');
    sanitized = sanitized.replace(/\r/g, '\\r'); 
    sanitized = sanitized.replace(/\t/g, '\\t');
    
    // Step 3: Fix double-escaped sequences that may have been created
    sanitized = sanitized.replace(/\\\\n/g, '\\n');
    sanitized = sanitized.replace(/\\\\r/g, '\\r');
    sanitized = sanitized.replace(/\\\\t/g, '\\t');
    
    // Step 4: Remove trailing commas before closing brackets/braces
    sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');
    
    // Step 5: Try to fix basic quote escaping issues within strings
    // This is a simplified approach that handles most cases
    const lines = sanitized.split('\n');
    const fixedLines = lines.map(line => {
      // If this line looks like it's inside a string value (has quotes but not proper JSON structure)
      if (line.includes('"') && !line.trim().match(/^"[^"]*":\s*"/) && !line.trim().match(/^"[^"]*"$/)) {
        // Try to fix unescaped quotes in the middle of values
        return line.replace(/([^\\])"/g, '$1\\"');
      }
      return line;
    });
    sanitized = fixedLines.join('\n');
    
    console.log("🧹 JSON sanitization applied");
    return sanitized;
    
  } catch (error) {
    console.warn("⚠️ Error during JSON sanitization, returning original:", error);
    return jsonString;
  }
}

// Parse JSON with multiple fallback strategies
function parseJsonWithFallbacks(jsonString) {
  // Strategy 1: Direct parsing
  try {
    return JSON.parse(jsonString);
  } catch (error1) {
    console.warn("⚠️ Direct JSON parsing failed, trying fallback strategies...");
  }
  
  // Strategy 2: Try with additional quote escaping
  try {
    let escaped = jsonString.replace(/\\n/g, '\\\\n').replace(/\\r/g, '\\\\r').replace(/\\t/g, '\\\\t');
    return JSON.parse(escaped);
  } catch (error2) {
    console.warn("⚠️ Escaped parsing failed, trying manual extraction...");
  }
  
  // Strategy 3: Manual extraction of JSON fields (improved)
  try {
    console.log("🔍 Attempting manual extraction...");
    
    // More robust regex patterns that handle multiline content
    const strengthsMatch = jsonString.match(/"strengths"\s*:\s*\[([\s\S]*?)\]\s*,\s*"improvements"/);
    const improvementsMatch = jsonString.match(/"improvements"\s*:\s*\[([\s\S]*?)\]\s*,\s*"detailed_feedback"/);
    const detailedMatch = jsonString.match(/"detailed_feedback"\s*:\s*"([\s\S]*?)"\s*\}/);
    
    console.log("🔍 Extraction matches:", {
      strengths: !!strengthsMatch,
      improvements: !!improvementsMatch, 
      detailed: !!detailedMatch
    });
    
    if (strengthsMatch && improvementsMatch && detailedMatch) {
      // Improved array item extraction
      const extractArrayItems = (arrayContent) => {
        const items = [];
        let current = '';
        let inString = false;
        let escaped = false;
        let depth = 0;
        
        // Clean the content first
        arrayContent = arrayContent.trim();
        
        for (let i = 0; i < arrayContent.length; i++) {
          const char = arrayContent[i];
          
          if (escaped) {
            current += char;
            escaped = false;
            continue;
          }
          
          if (char === '\\') {
            escaped = true;
            current += char;
            continue;
          }
          
          if (char === '"' && depth === 0) {
            inString = !inString;
            if (inString || current.trim()) {
              current += char;
            }
            continue;
          }
          
          if (inString) {
            current += char;
            continue;
          }
          
          if (char === ',' && depth === 0) {
            if (current.trim()) {
              // Clean and add item - remove surrounding quotes and clean content
              let cleanItem = current.trim();
              if (cleanItem.startsWith('"') && cleanItem.endsWith('"')) {
                cleanItem = cleanItem.slice(1, -1);
              }
              // Unescape content
              cleanItem = cleanItem.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
              items.push(cleanItem);
            }
            current = '';
            continue;
          }
          
          // Track nested structures (though we don't expect them in this format)
          if (char === '[' || char === '{') depth++;
          if (char === ']' || char === '}') depth--;
          
          current += char;
        }
        
        // Add last item
        if (current.trim()) {
          let cleanItem = current.trim();
          if (cleanItem.startsWith('"') && cleanItem.endsWith('"')) {
            cleanItem = cleanItem.slice(1, -1);
          }
          cleanItem = cleanItem.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
          items.push(cleanItem);
        }
        
        return items.filter(item => item.length > 0);
      };
      
      const result = {
        strengths: extractArrayItems(strengthsMatch[1]),
        improvements: extractArrayItems(improvementsMatch[1]),
        detailed_feedback: detailedMatch[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r')
      };
      
      console.log("🔧 Manual JSON extraction successful:", {
        strengthsCount: result.strengths.length,
        improvementsCount: result.improvements.length,
        detailedLength: result.detailed_feedback.length
      });
      return result;
    } else {
      console.warn("⚠️ Could not find all required sections in response");
    }
  } catch (error3) {
    console.warn("⚠️ Manual extraction failed:", error3.message);
  }
  
  // Strategy 4: Ultra-aggressive line-by-line extraction
  try {
    console.log("🚨 Attempting ultra-aggressive extraction...");
    
    const lines = jsonString.split('\n');
    const result = {
      strengths: [],
      improvements: [],
      detailed_feedback: ''
    };
    
    let currentSection = null;
    let currentItem = '';
    let inString = false;
    let braceDepth = 0;
    
    for (let line of lines) {
      line = line.trim();
      
      // Detect section starts
      if (line.includes('"strengths"')) {
        currentSection = 'strengths';
        continue;
      } else if (line.includes('"improvements"')) {
        currentSection = 'improvements';
        continue;
      } else if (line.includes('"detailed_feedback"')) {
        currentSection = 'detailed_feedback';
        // Extract the start of detailed feedback
        const match = line.match(/"detailed_feedback"\s*:\s*"(.*)$/);
        if (match) {
          result.detailed_feedback = match[1];
        }
        continue;
      }
      
      // Process content based on current section
      if (currentSection === 'strengths' || currentSection === 'improvements') {
        // Look for array items (lines that start with quotes)
        if (line.startsWith('"') && !line.includes('":')) {
          // This looks like an array item
          let content = line;
          // Remove leading/trailing quotes and commas
          content = content.replace(/^"/, '').replace(/",?$/, '').replace(/"$/, '');
          // Unescape content
          content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n');
          
          if (content.trim()) {
            result[currentSection].push(content.trim());
          }
        }
      } else if (currentSection === 'detailed_feedback') {
        // Continue building detailed feedback
        if (line && !line.includes('}') && !line.includes('```')) {
          let content = line.replace(/^"/, '').replace(/"$/, '');
          content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n');
          if (result.detailed_feedback && !result.detailed_feedback.endsWith(' ')) {
            result.detailed_feedback += ' ';
          }
          result.detailed_feedback += content;
        }
      }
    }
    
    // Clean up detailed feedback
    result.detailed_feedback = result.detailed_feedback
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/"$/, '') // Remove trailing quote
      .trim();
    
    // Validate we got meaningful content
    if (result.strengths.length > 0 && result.improvements.length > 0 && result.detailed_feedback.length > 0) {
      console.log("🚨 Ultra-aggressive extraction successful:", {
        strengthsCount: result.strengths.length,
        improvementsCount: result.improvements.length,
        detailedLength: result.detailed_feedback.length
      });
      return result;
    } else {
      console.warn("⚠️ Ultra-aggressive extraction didn't find enough content");
    }
  } catch (error4) {
    console.warn("⚠️ Ultra-aggressive extraction failed:", error4.message);
  }
  
  // If all strategies fail, throw the original error
  throw new Error("All JSON parsing strategies failed");
}

// Handle analysis response from AI
function handleAnalysisResponse(responseText) {
  console.log("📊 Received analysis response from AI");
  
  // Prevent duplicate processing
  if (window.analysisComplete) {
    console.warn("⚠️ Analysis already complete, ignoring duplicate response");
    return;
  }
  
  // ===== DEBUGGING: LOG COMPLETE RESPONSE =====
  console.log("🔍 === COMPLETE AI RESPONSE DEBUG ===");
  console.log("🔍 Response length:", responseText.length);
  console.log("🔍 Response type:", typeof responseText);
  console.log("🔍 First 200 chars:", JSON.stringify(responseText.substring(0, 200)));
  console.log("🔍 Last 200 chars:", JSON.stringify(responseText.substring(responseText.length - 200)));
  
  // Check for common problematic patterns
  const hasUnescapedQuotes = (responseText.match(/[^\\]"/g) || []).length;
  const hasNewlines = responseText.includes('\n');
  const hasCarriageReturns = responseText.includes('\r');
  const hasTabs = responseText.includes('\t');
  const hasControlChars = /[\x00-\x1F\x7F]/.test(responseText);
  
  console.log("🔍 Pattern analysis:", {
    unescapedQuotes: hasUnescapedQuotes,
    hasNewlines,
    hasCarriageReturns, 
    hasTabs,
    hasControlChars
  });
  
  // Look for JSON structure markers
  const hasStrengths = responseText.includes('"strengths"');
  const hasImprovements = responseText.includes('"improvements"');
  const hasDetailedFeedback = responseText.includes('"detailed_feedback"');
  const hasJsonMarkers = responseText.includes('```json') || responseText.includes('```');
  
  console.log("🔍 Content structure:", {
    hasStrengths,
    hasImprovements,
    hasDetailedFeedback,
    hasJsonMarkers
  });
  
  // Find approximate positions of main sections
  const strengthsPos = responseText.indexOf('"strengths"');
  const improvementsPos = responseText.indexOf('"improvements"');
  const detailedPos = responseText.indexOf('"detailed_feedback"');
  
  console.log("🔍 Section positions:", {
    strengthsPos,
    improvementsPos,
    detailedPos
  });
  
  // Sample some content around key sections
  if (strengthsPos >= 0) {
    const strengthsSample = responseText.substring(strengthsPos, strengthsPos + 300);
    console.log("🔍 Strengths section sample:", JSON.stringify(strengthsSample));
  }
  
  if (detailedPos >= 0) {
    const detailedSample = responseText.substring(detailedPos, detailedPos + 200);
    console.log("🔍 Detailed feedback section sample:", JSON.stringify(detailedSample));
  }
  console.log("🔍 === END DEBUG ===");
  // ===== END DEBUGGING =====
  
  try {
    // Clean response and extract JSON portion
    let cleanedResponse = responseText.trim();
    
    // First, try to find JSON boundaries - look for opening and closing braces
    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    
    console.log("🔍 JSON boundary detection:", {
      firstBrace,
      lastBrace,
      responseLength: cleanedResponse.length,
      validBracePair: firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
    });
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      // Extract just the JSON portion
      const jsonPortion = cleanedResponse.substring(firstBrace, lastBrace + 1);
      console.log("🔍 Extracted JSON portion, length:", jsonPortion.length);
      console.log("🔍 JSON portion (first 100):", JSON.stringify(jsonPortion.substring(0, 100)));
      console.log("🔍 JSON portion (last 50):", JSON.stringify(jsonPortion.substring(jsonPortion.length - 50)));
      cleanedResponse = jsonPortion;
    } else {
      console.log("🔍 No clear JSON boundaries found, using full response");
    }
    
    // Remove markdown if present (fallback for cases where AI still uses it)
    if (cleanedResponse.includes('```json')) {
      console.log("🔧 Removing markdown formatting (```json)");
      cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
    }
    if (cleanedResponse.includes('```')) {
      console.log("🔧 Removing remaining markdown formatting (```)");
      cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
    }
    
    // Additional cleanup for any remaining formatting artifacts
    cleanedResponse = cleanedResponse.replace(/^[\s\n\r]+/, '').replace(/[\s\n\r]+$/, '');
    
    console.log("🔍 After cleaning length:", cleanedResponse.length);
    console.log("🔍 After cleaning (first 100):", JSON.stringify(cleanedResponse.substring(0, 100)));
    
    // Try direct parsing first (for clean JSON)
    let analysisResult;
    try {
      console.log("🚀 Attempting direct JSON parsing of clean response...");
      analysisResult = JSON.parse(cleanedResponse);
      console.log("✅ Direct parsing successful! Skipping sanitization.");
    } catch (directParseError) {
      console.warn("⚠️ Direct parsing failed, applying sanitization...", directParseError.message);
      
      // Only sanitize if direct parsing fails
      cleanedResponse = sanitizeJsonString(cleanedResponse);
      console.log("🔍 After sanitization length:", cleanedResponse.length);
      console.log("🔍 After sanitization (first 100):", JSON.stringify(cleanedResponse.substring(0, 100)));
      
      // Parse JSON response with multiple fallback strategies
      analysisResult = parseJsonWithFallbacks(cleanedResponse);
    }
    
    // Validate response structure
    if (analysisResult.strengths && analysisResult.improvements && analysisResult.detailed_feedback) {
      window.analysisComplete = true;
      window.analysisInProgress = false;
      
      console.log("📊 Analysis validation successful - displaying results");
      
      // Reset system state after successful analysis
      resetSystemAfterAnalysis();
      
      // Display dynamic feedback
      setTimeout(() => {
        renderDynamicFeedbackPage(analysisResult);
      }, 1000);
      
      console.log("✅ Analysis complete and validated");
    } else {
      throw new Error("Invalid analysis response structure");
    }
    
  } catch (error) {
    console.error("❌ Error parsing analysis response:", error);
    showAnalysisError("Failed to process analysis. Please try again.");
  }
}

// Reset system state after analysis is complete
function resetSystemAfterAnalysis() {
  console.log("🔄 Resetting system state after analysis...");
  
  // Reset audio mode flag properly
  is_audio = false;
  
  // Clear role-play session data
  rolePlayConversation = [];
  rolePlayScenarioData = null;
  
  // Reset analysis flags
  window.analysisInProgress = false;
  window.analysisComplete = false;
  window.isAnalysisRequest = false;
  window.isWaitingForRolePlayAck = false;
  window.textModeReady = false;
  window.manualReconnectionInProgress = false;
  window.feedbackPageRendered = false;
  window.awaitingAnalysisResponse = false; // Reset the new flag
  
  console.log("✅ System state reset complete");
}

// Show analysis error instead of fallback
function showAnalysisError(errorMessage) {
  window.analysisComplete = true;
  window.analysisInProgress = false;
  
  // Reset system state
  resetSystemAfterAnalysis();
  
  // Update the analyzing page to show error
  const preparingContainer = document.querySelector('.preparing-container');
  if (preparingContainer) {
    preparingContainer.innerHTML = `
      <div class="preparing-content" style="text-align: center; padding: 60px 20px;">
        <div style="margin-bottom: 30px;">
          <div style="
            width: 60px; 
            height: 60px; 
            background-color: #ff6b6b;
            border-radius: 50%; 
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: white;
          ">⚠️</div>
        </div>
        <h2 style="color: #ff6b6b; margin-bottom: 20px; font-size: 28px;">
          Analysis Failed
        </h2>
        <p style="color: #666; font-size: 18px; line-height: 1.6; margin-bottom: 30px;">
          ${errorMessage}
        </p>
        <button onclick="location.reload()" style="
          background-color: #0066cc;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background-color 0.2s;
        " onmouseover="this.style.backgroundColor='#0052a3'" onmouseout="this.style.backgroundColor='#0066cc'">
          Try Again
        </button>
      </div>
    `;
  }
  
  console.log(`❌ Analysis error shown: ${errorMessage}`);
}

// Render dynamic feedback page with AI analysis
function renderDynamicFeedbackPage(analysisResult) {
  // Prevent multiple renders
  if (window.feedbackPageRendered) {
    console.warn("⚠️ Feedback page already rendered, skipping duplicate render");
    return;
  }
  
  window.feedbackPageRendered = true;
  console.log("📊 Rendering dynamic feedback page with analysis results");
  
  // Update to call the HTML function but with dynamic content
  if (typeof renderFeedbackPage === 'function') {
    // We'll need to modify the HTML function to accept dynamic data
    renderFeedbackPage(analysisResult);
  } else {
    console.warn("⚠️ renderFeedbackPage not available");
  }
  
  console.log("📊 Dynamic feedback page rendered successfully");
}

// Make functions globally accessible for HTML calls
window.initializeRolePlayConversation = initializeRolePlayConversation;
window.showRolePlayStatus = showRolePlayStatus;
window.startRolePlaySession = startRolePlaySession;
window.trackRolePlayMessage = trackRolePlayMessage;
window.endRolePlaySession = endRolePlaySession;
window.stopAudioForAnalysis = stopAudioForAnalysis;
window.reconnectForAnalysis = reconnectForAnalysis;
window.waitForTextModeAndSendAnalysis = waitForTextModeAndSendAnalysis;
window.startRolePlayAnalysis = startRolePlayAnalysis;
window.handleAnalysisResponse = handleAnalysisResponse;
window.resetSystemAfterAnalysis = resetSystemAfterAnalysis;
window.renderDynamicFeedbackPage = renderDynamicFeedbackPage;
window.showAnalysisError = showAnalysisError;

// --- BEGIN NEW FUNCTION ---
/**
 * Activates audio mode if not already active, speaks a given prompt, and then calls a callback.
 * @param {string} chatPrompt The text to be spoken.
 * @param {function} callbackOnEnd The function to call after speech ends or on error.
 */
function startRolePlayAudioSequence(chatPrompt, callbackOnEnd) {
  // 1. Ensure audio mode is active
  if (!isAudioActive) {
    // Call startAudio to initialize worklets and get mic stream
    startAudio(); 
    
    // Set global flags
    is_audio = true; 
    isAudioActive = true; 
    
    // Reconnect WebSocket in audio mode
    if (typeof connectWebsocket === 'function') {
      connectWebsocket();
    }
    
    // Update UI elements for all audio toggle buttons
    updateAllAudioToggleButtons(true);
    if (typeof updateChatStatus === 'function') {
      updateChatStatus("Audio active - Voice detection enabled");
    }
    if (messagesDiv) {
      const vadMsg = document.createElement("p");
      vadMsg.textContent = "🎙️ Voice Activity Detection: Active";
      vadMsg.style.cssText = 'color:#0066cc; font-style:italic; margin-bottom:8px; padding:6px; background-color:#e6f3ff; border-radius:3px;';
      messagesDiv.appendChild(vadMsg);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    console.log("🎤 Audio session started (for role play)"); // Aligned console log
  } else {
    console.log("Audio mode was already active for role play.");
  }

  // 2. Speak the chat prompt
  if (chatPrompt && typeof window.speechSynthesis !== 'undefined') {
    const utterance = new SpeechSynthesisUtterance(chatPrompt);
    utterance.onend = function() {
      console.log("Speech synthesis finished for role play prompt.");
      if (typeof callbackOnEnd === 'function') callbackOnEnd();
    };
    utterance.onerror = function(event) {
      console.error('Speech synthesis error:', event);
      if (typeof callbackOnEnd === 'function') callbackOnEnd(); // Proceed even if speech fails
    };
    window.speechSynthesis.speak(utterance);
  } else {
    if (!chatPrompt) console.warn('No chat_prompt provided to speak for role play.');
    if (typeof window.speechSynthesis === 'undefined') console.warn('Browser speech synthesis not available.');
    if (typeof callbackOnEnd === 'function') callbackOnEnd(); // If no prompt or no synthesis, call callback immediately
  }
}
// --- END NEW FUNCTION ---

/**
 * Video handling
 */

let videoElement;
let canvasElement;
let canvasContext;
let videoStream;
let captureInterval;
let currentVideoMode = null;

// Initialize video elements
function initializeVideoElements() {
  videoElement = document.getElementById("videoPreview");
  canvasElement = document.getElementById("captureCanvas");
  canvasContext = canvasElement.getContext("2d");
}

// Camera and screen toggle functions for event delegation
function handleCameraToggle(buttonElement) {
  if (!isVideoActive || currentVideoMode !== 'camera') {
    // Start camera (will stop screen share if active)
    startCamera();
  } else {
    // Stop camera
    stopVideo();
  }
}

function handleScreenToggle(buttonElement) {
  if (!isVideoActive || currentVideoMode !== 'screen') {
    // Start screen share (will stop camera if active)
    startScreenCapture();
  } else {
    // Stop screen share
    stopVideo();
  }
}

// Start camera
async function startCamera() {
  try {
    console.log("📷 Starting camera...");
    
    // Stop any existing video first
    if (isVideoActive) {
      stopVideo();
    }
    
    // Get camera stream
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      }
    });
    
    await setupVideoStream('camera');
    
  } catch (error) {
    console.error("❌ Error starting camera:", error);
    alert("Failed to start camera. Please check permissions and try again.");
  }
}

// Start screen capture
async function startScreenCapture() {
  try {
    console.log("🖥️ Starting screen capture...");
    
    // Stop any existing video first
    if (isVideoActive) {
      stopVideo();
    }
    
    // Get screen capture stream
    videoStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 10 } // Lower frame rate for screen sharing
      },
      audio: false // We handle audio separately
    });
    
    // Listen for screen share end (when user clicks "Stop sharing" in browser)
    videoStream.getVideoTracks()[0].addEventListener('ended', () => {
      console.log("🖥️ Screen sharing ended by user");
      stopVideo();
    });
    
    await setupVideoStream('screen');
    
  } catch (error) {
    console.error("❌ Error starting screen capture:", error);
    if (error.name === 'NotAllowedError') {
      alert("Screen sharing permission denied. Please allow screen sharing and try again.");
    } else {
      alert("Failed to start screen capture. Please try again.");
    }
  }
}

// Unified video stream setup
async function setupVideoStream(mode) {
  if (!videoElement) {
    initializeVideoElements();
  }
  
  videoElement.srcObject = videoStream;
  currentVideoMode = mode;
  
  // Wait for video to be ready
  await new Promise((resolve) => {
    videoElement.onloadedmetadata = () => {
      // Set canvas size to match video
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
      resolve();
    };
  });
  
  isVideoActive = true;
  
  // Start capturing frames
  startFrameCapture();
  
  // Update UI
  updateVideoUI(mode);
  
  const modeText = mode === 'camera' ? 'Camera' : 'Screen sharing';
  console.log(`✅ ${modeText} started successfully`);
  
  // Add visual feedback
  const videoMsg = document.createElement("p");
  videoMsg.textContent = `${mode === 'camera' ? '📷' : '🖥️'} ${modeText} started`;
  videoMsg.style.color = "#008800";
  videoMsg.style.fontStyle = "italic";
  videoMsg.style.marginBottom = "8px";
  videoMsg.style.padding = "6px";
  videoMsg.style.backgroundColor = "#e6ffe6";
  videoMsg.style.borderRadius = "3px";
  messagesDiv.appendChild(videoMsg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Update UI based on video mode
function updateVideoUI(mode) {
  // Reset all video buttons
  cameraToggleButton.classList.remove("active");
  screenToggleButton.classList.remove("active");
  
  // Show video section
  videoSection.classList.add("active");
  isVideoActive = true;
  
  // Update right sidebar layout
  updateRightSidebarLayout();
  
  // Highlight active mode and update titles
  if (mode === 'camera') {
    cameraToggleButton.classList.add("active");
    cameraToggleButton.title = "Click to stop camera";
    screenToggleButton.title = "Click to start screen share";
    document.getElementById("videoStatus").textContent = "Camera active";
  } else if (mode === 'screen') {
    screenToggleButton.classList.add("active");
    screenToggleButton.title = "Click to stop screen share";
    cameraToggleButton.title = "Click to start camera";
    document.getElementById("videoStatus").textContent = "Screen sharing active";
  }
}

// Stop video (unified for camera and screen)
function stopVideo() {
  console.log("🛑 Stopping video...");
  
  isVideoActive = false;
  currentVideoMode = null;
  
  // Stop frame capture
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  
  // Stop video stream
  if (videoStream) {
    videoStream.getTracks().forEach(track => {
      track.stop();
      console.log("📹 Video track stopped");
    });
    videoStream = null;
  }
  
  // Clear video element
  if (videoElement) {
    videoElement.srcObject = null;
  }
  
  // Hide video section
  videoSection.classList.remove("active");
  
  // Update right sidebar layout
  updateRightSidebarLayout();
  
  // Update UI
  cameraToggleButton.classList.remove("active");
  screenToggleButton.classList.remove("active");
  cameraToggleButton.title = "Click to start camera";
  screenToggleButton.title = "Click to start screen share";
  document.getElementById("videoStatus").textContent = "No video source active";
  
  // Add visual feedback
  const stopMsg = document.createElement("p");
  stopMsg.textContent = "🛑 Video stopped";
  stopMsg.style.color = "#666";
  stopMsg.style.fontStyle = "italic";
  stopMsg.style.marginBottom = "8px";
  stopMsg.style.padding = "6px";
  stopMsg.style.backgroundColor = "#f8f9fa";
  stopMsg.style.borderRadius = "3px";
  messagesDiv.appendChild(stopMsg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  console.log("✅ Video stopped successfully");
}

// Start frame capture (always 1 fps now)
function startFrameCapture() {
  const captureRate = 1000; // Fixed at 1 fps
  
  captureInterval = setInterval(() => {
    if (isVideoActive && videoElement && canvasContext) {
      captureAndSendFrame();
    }
  }, captureRate);
  
  console.log(`📸 Frame capture started at 1 fps`);
}

// Enhanced capture function with screen-optimized compression
function captureAndSendFrame() {
  try {
    // Draw current video frame to canvas
    canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Adjust compression based on video mode
    let quality = 0.8; // Default for camera
    let maxWidth = 640;
    let maxHeight = 480;
    
    if (currentVideoMode === 'screen') {
      quality = 0.6; // Lower quality for screen sharing (text is still readable)
      maxWidth = 1024; // Allow larger size for screen content
      maxHeight = 768;
    }
    
    // Resize if needed
    let { width, height } = canvasElement;
    let base64Data; // Declare at function level to avoid scope issues
    
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width *= ratio;
      height *= ratio;
      
      // Create a temporary canvas for resizing
      const tempCanvas = document.createElement('canvas');
      const tempContext = tempCanvas.getContext('2d');
      tempCanvas.width = width;
      tempCanvas.height = height;
      
      tempContext.drawImage(canvasElement, 0, 0, width, height);
      
      // Convert resized canvas to base64
      const imageData = tempCanvas.toDataURL('image/jpeg', quality);
      base64Data = imageData.split(',')[1];
      
      sendMessage({
        mime_type: "image/jpeg",
        data: base64Data,
        metadata: {
          source: currentVideoMode,
          width: width,
          height: height
        }
      });
    } else {
      // Use original size
      const imageData = canvasElement.toDataURL('image/jpeg', quality);
      base64Data = imageData.split(',')[1];
      
      sendMessage({
        mime_type: "image/jpeg",
        data: base64Data,
        metadata: {
          source: currentVideoMode,
          width: width,
          height: height
        }
      });
    }
    
    console.log(`[CLIENT TO AGENT] sent ${currentVideoMode} image: ${base64Data.length} chars`);
    
  } catch (error) {
    console.error("❌ Error capturing frame:", error);
  }
}

// Initialize VAD controls (simplified since it's just a calibration button)
function initializeVADControls() {
  // VAD is always enabled, button is just for calibration
  console.log("🎯 VAD initialized - always enabled, button available for calibration");
}

// VAD button functionality (calibration only) - handled by event delegation below

// VAD calibration function
function startVADCalibration() {
  if (!isAudioActive) {
    alert('Please start audio first to calibrate VAD');
    return;
  }
  
  console.log('🎯 Starting VAD calibration...');
  
  // Disable calibration button during calibration
  vadButton.disabled = true;
  vadButton.title = 'Calibrating VAD...';
  
  // Show calibration instructions
  const calibrationMsg = document.createElement("p");
  calibrationMsg.textContent = "🎯 VAD Calibration: Stay silent for 3 seconds, then speak normally for 3 seconds...";
  calibrationMsg.style.color = "#007acc";
  calibrationMsg.style.fontWeight = "normal";
  calibrationMsg.style.marginBottom = "8px";
  calibrationMsg.style.padding = "6px";
  calibrationMsg.style.backgroundColor = "#e6f3ff";
  calibrationMsg.style.borderRadius = "3px";
  messagesDiv.appendChild(calibrationMsg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  let calibrationPhase = 'silence'; // 'silence' or 'speech'
  let calibrationStartTime = Date.now();
  let silenceRMSValues = [];
  let speechRMSValues = [];
  let originalVADEnabled = vadEnabled;
  
  // Temporarily disable VAD during calibration
  vadEnabled = false;
  
  // Store original audio handler
  const originalPerformVAD = performVAD;
  
  // Override VAD function for calibration
  performVAD = function(audioSamples) {
    const currentTime = Date.now();
    const elapsed = currentTime - calibrationStartTime;
    const rms = calculateRMS(audioSamples);
    
    if (calibrationPhase === 'silence' && elapsed < 3000) {
      silenceRMSValues.push(rms);
      return false; // Don't send audio during calibration
    } else if (calibrationPhase === 'silence' && elapsed >= 3000) {
      calibrationPhase = 'speech';
      calibrationStartTime = currentTime;
      
      // Update instructions
      const speechMsg = document.createElement("p");
      speechMsg.textContent = "🗣️ Now speak normally for 3 seconds...";
      speechMsg.style.color = "#00aa00";
      speechMsg.style.fontWeight = "normal";
      speechMsg.style.marginBottom = "8px";
      speechMsg.style.padding = "6px";
      speechMsg.style.backgroundColor = "#e6ffe6";
      speechMsg.style.borderRadius = "3px";
      messagesDiv.appendChild(speechMsg);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } else if (calibrationPhase === 'speech' && elapsed < 3000) {
      speechRMSValues.push(rms);
      return false; // Don't send audio during calibration
    } else if (calibrationPhase === 'speech' && elapsed >= 3000) {
      // Calibration complete
      finishVADCalibration(silenceRMSValues, speechRMSValues, originalVADEnabled, originalPerformVAD);
      return false;
    }
    
    return false;
  };
}

// Finish VAD calibration and set optimal thresholds
function finishVADCalibration(silenceRMSValues, speechRMSValues, originalVADEnabled, originalPerformVAD) {
  // Restore original VAD function
  performVAD = originalPerformVAD;
  vadEnabled = true; // Always re-enable VAD
  
  // Re-enable calibration button
  vadButton.disabled = false;
  vadButton.title = 'Calibrate Voice Activity Detection';
  
  if (silenceRMSValues.length === 0 || speechRMSValues.length === 0) {
    console.log('❌ Calibration failed: insufficient data');
    
    // Show failure message
    const failMsg = document.createElement("p");
    failMsg.textContent = "❌ VAD calibration failed. Please try again.";
    failMsg.style.color = "#cc0000";
    failMsg.style.fontWeight = "normal";
    failMsg.style.marginBottom = "8px";
    failMsg.style.padding = "6px";
    failMsg.style.backgroundColor = "#ffe6e6";
    failMsg.style.borderRadius = "3px";
    messagesDiv.appendChild(failMsg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    return;
  }
  
  // Calculate statistics
  const avgSilenceRMS = silenceRMSValues.reduce((a, b) => a + b, 0) / silenceRMSValues.length;
  const maxSilenceRMS = Math.max(...silenceRMSValues);
  const avgSpeechRMS = speechRMSValues.reduce((a, b) => a + b, 0) / speechRMSValues.length;
  const minSpeechRMS = Math.min(...speechRMSValues);
  
  console.log(`📊 Calibration results:
    Silence - Avg: ${avgSilenceRMS.toFixed(4)}, Max: ${maxSilenceRMS.toFixed(4)}
    Speech - Avg: ${avgSpeechRMS.toFixed(4)}, Min: ${minSpeechRMS.toFixed(4)}`);
  
  // Set optimal thresholds (don't show values to user)
  const optimalSilenceThreshold = Math.max(maxSilenceRMS * 1.5, 0.005);
  const optimalSpeechThreshold = Math.max(minSpeechRMS * 0.8, optimalSilenceThreshold * 1.5);
  
  // Update global variables (no UI updates for threshold values)
  silenceThreshold = optimalSilenceThreshold;
  speechThreshold = optimalSpeechThreshold;
  
  // Show simple success message without values
  const resultMsg = document.createElement("p");
  resultMsg.textContent = "✅ VAD calibrated successfully!";
  resultMsg.style.color = "#00aa00";
  resultMsg.style.fontWeight = "normal";
  resultMsg.style.marginBottom = "8px";
  resultMsg.style.padding = "6px";
  resultMsg.style.backgroundColor = "#e6ffe6";
  resultMsg.style.borderRadius = "3px";
  messagesDiv.appendChild(resultMsg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  console.log('✅ VAD calibration complete');
}

// Encode an array buffer with Base64
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Initialize video elements when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeVideoElements();
  initializeVADControls();
  initializeVideoMinimize();
  initializePanelCollapse();
  initializeChatMinimize();
  initializeMenu();
});

// Initialize panel collapse functionality
function initializePanelCollapse() {
  const panelCollapseButton = document.getElementById("panelCollapseButton");
  
  if (panelCollapseButton) {
    panelCollapseButton.addEventListener("click", () => {
      isPanelCollapsed = !isPanelCollapsed;
      updatePanelCollapseState();
    });
  }
}

// Update panel collapse state
function updatePanelCollapseState() {
  const panelCollapseButton = document.getElementById("panelCollapseButton");
  const rightSidebar = document.getElementById("rightSidebar");
  const contentArea = document.getElementById("contentArea");
  
  if (isPanelCollapsed) {
    // Collapse the panel
    rightSidebar.classList.add("panel-collapsed");
    contentArea.classList.add("panel-expanded");
    panelCollapseButton.textContent = "❮";
    panelCollapseButton.title = "Expand right panel";
    
    console.log("📱 Right panel collapsed - PDF area maximized");
  } else {
    // Expand the panel
    rightSidebar.classList.remove("panel-collapsed");
    contentArea.classList.remove("panel-expanded");
    panelCollapseButton.textContent = "❯";
    panelCollapseButton.title = "Collapse right panel";
    
    console.log("📱 Right panel expanded");
  }
}

// Initialize menu functionality
function initializeMenu() {
  console.log("🔧 Initializing menu functionality...");
  
  if (menuButton && menuDropdown) {
    // Toggle menu dropdown
    menuButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = menuDropdown.classList.contains("show");
      
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });
    
    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!menuButton.contains(e.target)) {
        closeMenu();
      }
    });
    
    // PDF Viewer menu item
    if (pdfViewerMenuItem) {
      pdfViewerMenuItem.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent event bubbling
        closeMenu(); // Close menu immediately
        // Small delay to ensure menu closes before toggling PDF viewer
        setTimeout(() => {
          togglePdfViewer();
        }, 50);
      });
    }
    
    // Settings menu item (placeholder)
    const settingsMenuItem = document.getElementById("settingsMenuItem");
    if (settingsMenuItem) {
      settingsMenuItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu(); // Close menu immediately
        setTimeout(() => {
          console.log("Settings clicked - feature coming soon!");
        }, 50);
      });
    }
    
    // Help menu item (placeholder)
    const helpMenuItem = document.getElementById("helpMenuItem");
    if (helpMenuItem) {
      helpMenuItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu(); // Close menu immediately
        setTimeout(() => {
          console.log("Help clicked - feature coming soon!");
        }, 50);
      });
    }
    
    console.log("✅ Menu functionality initialized successfully");
  } else {
    console.error("❌ Menu initialization failed - missing elements");
  }
}

// Open menu dropdown
function openMenu() {
  menuDropdown.classList.add("show");
  updateMenuItemStates();
}

// Close menu dropdown
function closeMenu() {
  if (menuDropdown.classList.contains("show")) {
    menuDropdown.classList.remove("show");
    console.log("📋 Menu closed");
  }
}

// Update menu item states (active/inactive)
function updateMenuItemStates() {
  if (pdfViewerMenuItem) {
    if (isPdfViewerActive) {
      pdfViewerMenuItem.classList.add("active");
    } else {
      pdfViewerMenuItem.classList.remove("active");
    }
  }
}

// Toggle PDF viewer visibility
function togglePdfViewer() {
  console.log("📄 Toggling PDF viewer, current state:", isPdfViewerActive);
  
  isPdfViewerActive = !isPdfViewerActive;
  
  if (isPdfViewerActive) {
    // Show PDF viewer
    welcomeMessage.style.display = "none";
    pdfViewerContainer.style.display = "block";
    contentArea.classList.remove("no-pdf");
    
    // Initialize PDF viewer if not already done
    if (!window.pdfViewer && window.PDFViewer) {
      window.pdfViewer = new window.PDFViewer('pdfViewerContainer');
      console.log("📄 PDF viewer initialized");
    }
    
    console.log("📄 PDF viewer activated");
  } else {
    // Hide PDF viewer
    welcomeMessage.style.display = "block";
    pdfViewerContainer.style.display = "none";
    contentArea.classList.add("no-pdf");
    
    console.log("📄 PDF viewer deactivated");
  }
}

// Expose togglePdfViewer globally for PDF viewer minimize button
window.togglePdfViewer = togglePdfViewer;