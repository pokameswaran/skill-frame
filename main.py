import os
import json
import asyncio
import base64
import re
import os

from pathlib import Path
from dotenv import load_dotenv
from fastapi import Body
from json_repair import repair_json
from jsonschema import validate, ValidationError

from google.genai.types import (
    Part,
    Content,
    Blob,
)

from google.adk.runners import Runner
from google.adk.agents import LiveRequestQueue
from google.adk.agents.run_config import RunConfig
from google.adk.sessions.in_memory_session_service import InMemorySessionService
from google.adk.agents import Agent
from google.adk.tools import google_search
from google.genai.types import Modality

from fastapi import FastAPI, WebSocket, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from google_search_agent.agent import root_agent
from google import genai

#
# ADK Streaming
#

# Load Gemini API Key
load_dotenv()

APP_NAME = "ADK Streaming example"
session_service = InMemorySessionService()

# JSON Schema for scenario validation
SCENARIO_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "minLength": 1},
        "author": {"type": "string", "minLength": 1},
        "description": {"type": "string", "minLength": 1},
        "success_criteria": {
            "type": "array",
            "items": {"type": "string", "minLength": 1},
            "minItems": 3
        },
        "user_name": {"type": "string", "minLength": 1},
        "user_role": {"type": "string", "minLength": 1},
        "user_avatar": {"type": "string", "minLength": 1},
        "ai_name": {"type": "string", "minLength": 1},
        "ai_role": {"type": "string", "minLength": 1},
        "ai_avatar": {"type": "string", "minLength": 1},
        "ai_description": {"type": "string", "minLength": 1},
        "chat_prompt": {"type": "string", "minLength": 1}
    },
    "required": ["title", "author", "description", "success_criteria", "user_name", "user_role", "user_avatar", "ai_name", "ai_role", "ai_avatar", "ai_description", "chat_prompt"]
}


def parse_llm_json_response(response_text, prompt):
    """
    Robust JSON parsing function that extracts fields individually and constructs a clean JSON object.
    Uses multiple fallback strategies to handle malformed JSON responses.
    """
    print(f"[PARSE DEBUG] Starting to parse response of length: {len(response_text)}")
    
    # Strategy 1: Try direct JSON parsing
    try:
        parsed = json.loads(response_text)
        # Validate against schema
        validate(parsed, SCENARIO_SCHEMA)
        print("[PARSE SUCCESS] Direct JSON parsing successful")
        return parsed
    except (json.JSONDecodeError, ValidationError) as e:
        print(f"[PARSE DEBUG] Direct parsing failed: {e}")
    
    # Strategy 2: Try json-repair library
    try:
        repaired_json = repair_json(response_text)
        parsed = json.loads(repaired_json)
        validate(parsed, SCENARIO_SCHEMA)
        print("[PARSE SUCCESS] JSON repair successful")
        return parsed
    except (json.JSONDecodeError, ValidationError) as e:
        print(f"[PARSE DEBUG] JSON repair failed: {e}")
    
    # Strategy 3: Key-by-key extraction with regex patterns
    print("[PARSE DEBUG] Attempting key-by-key extraction")
    scenario = {}
    
    # Define extraction patterns for each field
    field_patterns = {
        'title': [
            r'"title"\s*:\s*"([^"]*)"',
            r"'title'\s*:\s*'([^']*)'",
            r'"title"\s*:\s*([^,}\n]+)',
        ],
        'author': [
            r'"author"\s*:\s*"([^"]*)"',
            r"'author'\s*:\s*'([^']*)'",
            r'"author"\s*:\s*([^,}\n]+)',
        ],
        'description': [
            r'"description"\s*:\s*"([^"]*)"',
            r"'description'\s*:\s*'([^']*)'",
            r'"description"\s*:\s*([^,}\n]+)',
        ],
        'user_name': [
            r'"user_name"\s*:\s*"([^"]*)"',
            r"'user_name'\s*:\s*'([^']*)'",
            r'"user_name"\s*:\s*([^,}\n]+)',
        ],
        'user_role': [
            r'"user_role"\s*:\s*"([^"]*)"',
            r"'user_role'\s*:\s*'([^']*)'",
            r'"user_role"\s*:\s*([^,}\n]+)',
        ],
        'user_avatar': [
            r'"user_avatar"\s*:\s*"([^"]*)"',
            r"'user_avatar'\s*:\s*'([^']*)'",
            r'"user_avatar"\s*:\s*([^,}\n]+)',
        ],
        'ai_name': [
            r'"ai_name"\s*:\s*"([^"]*)"',
            r"'ai_name'\s*:\s*'([^']*)'",
            r'"ai_name"\s*:\s*([^,}\n]+)',
        ],
        'ai_role': [
            r'"ai_role"\s*:\s*"([^"]*)"',
            r"'ai_role'\s*:\s*'([^']*)'",
            r'"ai_role"\s*:\s*([^,}\n]+)',
        ],
        'ai_avatar': [
            r'"ai_avatar"\s*:\s*"([^"]*)"',
            r"'ai_avatar'\s*:\s*'([^']*)'",
            r'"ai_avatar"\s*:\s*([^,}\n]+)',
        ],
        'ai_description': [
            r'"ai_description"\s*:\s*"([^"]*)"',
            r"'ai_description'\s*:\s*'([^']*)'",
            r'"ai_description"\s*:\s*([^,}\n]+)',
        ],
        'chat_prompt': [
            r'"chat_prompt"\s*:\s*"([^"]*)"',
            r"'chat_prompt'\s*:\s*'([^']*)'",
            r'"chat_prompt"\s*:\s*([^,}\n]+)',
        ]
    }
    
    # Extract simple string fields
    for field, patterns in field_patterns.items():
        for pattern in patterns:
            match = re.search(pattern, response_text, re.DOTALL | re.IGNORECASE)
            if match:
                value = match.group(1).strip().strip('"\'')
                scenario[field] = value
                print(f"[PARSE DEBUG] Extracted {field}: {value[:50]}...")
                break
    
    # Special handling for success_criteria array - most problematic field
    success_criteria = extract_success_criteria(response_text)
    if success_criteria:
        scenario['success_criteria'] = success_criteria
        print(f"[PARSE DEBUG] Extracted success_criteria: {len(success_criteria)} items")
    
    # Strategy 4: Fill missing fields with defaults based on prompt
    default_values = {
        'title': f"Professional Role Play: {prompt}" if prompt else "Role Play Scenario",
        'author': "AI Learning Coach",
        'description': f"Practice this important workplace scenario: {prompt}. This exercise will help you develop key communication and professional skills.",
        'success_criteria': [
            "Communicate clearly and professionally",
            "Listen actively and respond appropriately", 
            "Maintain composure and confidence",
            "Achieve your conversation objectives",
            "Build positive rapport with the other party"
        ],
        'user_name': "You",
        'user_role': "Professional",
        'user_avatar': "👤",
        'ai_name': "Alex",
        'ai_role': "Role Play Partner",
        'ai_avatar': "🧑‍💼",
        'ai_description': f"Alex is an experienced professional who will help you practice: {prompt}. They provide realistic responses and constructive feedback.",
        'chat_prompt': f"Let's start a role play about: {prompt}. I'll play the role of your conversation partner. Please set the scene and begin when you're ready."
    }
    
    # Fill in missing fields
    for field, default_value in default_values.items():
        if field not in scenario or not scenario[field]:
            scenario[field] = default_value
            print(f"[PARSE DEBUG] Using default for {field}")
    
    # Final validation
    try:
        validate(scenario, SCENARIO_SCHEMA)
        print("[PARSE SUCCESS] Key-by-key extraction with defaults successful")
        return scenario
    except ValidationError as e:
        print(f"[PARSE ERROR] Final validation failed: {e}")
        # Return the constructed scenario anyway - it's better than nothing
        return scenario


def extract_success_criteria(response_text):
    """
    Extract success_criteria array from response text using multiple strategies.
    This is the most problematic field due to array formatting issues.
    """
    success_criteria = []
    
    # Strategy 1: Try to find complete array
    array_patterns = [
        r'"success_criteria"\s*:\s*\[([^\]]*)\]',
        r"'success_criteria'\s*:\s*\[([^\]]*)\]",
        r'"success_criteria"\s*:\s*\[(.*?)\]',
    ]
    
    for pattern in array_patterns:
        match = re.search(pattern, response_text, re.DOTALL | re.IGNORECASE)
        if match:
            array_content = match.group(1)
            print(f"[PARSE DEBUG] Found success_criteria array content: {array_content[:100]}...")
            
            # Try to extract individual items from the array content
            item_patterns = [
                r'"([^"]+)"',  # Double quoted strings
                r"'([^']+)'",  # Single quoted strings
            ]
            
            for item_pattern in item_patterns:
                items = re.findall(item_pattern, array_content)
                if items:
                    success_criteria = [item.strip() for item in items if item.strip()]
                    if len(success_criteria) >= 3:  # Minimum acceptable
                        return success_criteria
    
    # Strategy 2: Look for success criteria as individual lines or bullet points
    lines = response_text.split('\n')
    criteria_section = False
    for line in lines:
        line = line.strip()
        if 'success_criteria' in line.lower() or criteria_section:
            criteria_section = True
            if line and (line.startswith('-') or line.startswith('*') or line.startswith('•')):
                criterion = line.lstrip('-*•').strip().strip('"\'')
                if criterion and len(criterion) > 5:  # Avoid very short items
                    success_criteria.append(criterion)
            elif line.startswith('"') and line.endswith('"'):
                criterion = line.strip('"')
                if criterion and len(criterion) > 5:
                    success_criteria.append(criterion)
            elif ']' in line or '}' in line:
                criteria_section = False
    
    # Strategy 3: Extract from context if we found criteria-related text
    if not success_criteria:
        # Look for numbered lists or other patterns
        numbered_pattern = r'\d+\.\s*([^\n]+)'
        matches = re.findall(numbered_pattern, response_text)
        if matches:
            success_criteria = [match.strip().strip('"\'.,') for match in matches if len(match.strip()) > 10]
    
    # Return what we found, or empty list if nothing
    return success_criteria[:10] if success_criteria else []  # Limit to 10 items max


async def start_agent_session(session_id, is_audio=False):
    """Starts an agent session"""

    # Create a Session
    session = await session_service.create_session(
        app_name=APP_NAME,
        user_id=session_id,
        session_id=session_id,
    )

    # Create a Runner
    runner = Runner(
        app_name=APP_NAME,
        agent=root_agent,
        session_service=session_service,
    )    # Set response modality
    if is_audio:
        modalities = [Modality.AUDIO]  # Use enum instead of string
        run_config = RunConfig(response_modalities=modalities, output_audio_transcription={}, input_audio_transcription={})
    else:
        modalities = [Modality.TEXT]  # Use enum instead of string
        run_config = RunConfig(response_modalities=modalities)

    # modality = "AUDIO" if is_audio else "TEXT"
    # run_config = RunConfig(response_modalities=[modality])

    # Create a LiveRequestQueue for this session
    live_request_queue = LiveRequestQueue()

    # Start agent session
    live_events = runner.run_live(
        session=session,
        live_request_queue=live_request_queue,
        run_config=run_config,
    )
    return live_events, live_request_queue


async def agent_to_client_messaging(websocket, live_events):
    """Agent to client communication"""
    while True:
        async for event in live_events:
            print(f"event: {event}")
            # If the turn complete or interrupted, send it
            if event.turn_complete or event.interrupted:
                message = {
                    "turn_complete": event.turn_complete,
                    "interrupted": event.interrupted,
                }
                await websocket.send_text(json.dumps(message))
                print(f"[AGENT TO CLIENT]: {message}")
                continue

            # Read the Content and its first Part
            part: Part = (
                event.content and event.content.parts and event.content.parts[0]
            )
            if not part:
                continue

            # If it's audio, send Base64 encoded audio data
            is_audio = part.inline_data and part.inline_data.mime_type.startswith(
                "audio/pcm"
            )
            if is_audio:
                audio_data = part.inline_data and part.inline_data.data
                if audio_data:
                    message = {
                        "mime_type": "audio/pcm",
                        "data": base64.b64encode(audio_data).decode("ascii"),
                    }
                    await websocket.send_text(json.dumps(message))
                    print(f"[AGENT TO CLIENT]: audio/pcm: {len(audio_data)} bytes.")
                    continue

            # If it's text and a parial text, send it
            if part.text and event.partial:
                message = {"mime_type": "text/plain", "data": part.text}
                await websocket.send_text(json.dumps(message))
                print(f"abc [AGENT TO CLIENT]: text/plain: {message}")


async def client_to_agent_messaging(websocket, live_request_queue):
    """Client to agent communication"""
    while True:
        # Decode JSON message
        message_json = await websocket.receive_text()
        message = json.loads(message_json)
        mime_type = message["mime_type"]
        data = message["data"]
        metadata = message.get("metadata", {})

        # Send the message to the agent
        if mime_type == "text/plain":
            # Send a text message
            content = Content(role="user", parts=[Part.from_text(text=data)])
            live_request_queue.send_content(content=content)
            print(f"[CLIENT TO AGENT]: {data}")
        elif mime_type == "audio/pcm":
            # Send an audio data
            decoded_data = base64.b64decode(data)
            live_request_queue.send_realtime(
                Blob(data=decoded_data, mime_type=mime_type)
            )
        elif mime_type == "image/jpeg":
            # Send image data
            decoded_data = base64.b64decode(data)
            live_request_queue.send_realtime(
                Blob(data=decoded_data, mime_type=mime_type)
            )
            source = metadata.get("source", "unknown")
            print(f"[CLIENT TO AGENT]: image/jpeg from {source}: {len(decoded_data)} bytes")
        else:
            raise ValueError(f"Mime type not supported: {mime_type}")


#
# FastAPI web app
#

app = FastAPI()

STATIC_DIR = Path("static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    """Serves the index.html"""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/roleplay-details", response_class=HTMLResponse)
async def roleplay_details_page(request: Request):
    """Serves the scenario details HTML page."""
    return FileResponse(os.path.join(STATIC_DIR, "roleplay-details.html"))


@app.get("/roleplay", response_class=JSONResponse)
async def get_roleplay(prompt: str):
    """Generate scenario details from LLM for the given prompt (GET for details page JS)."""
    # TODO: Replace with actual LLM call. Here is a static mock for demo:
    # In production, call your LLM and parse the result into this structure.
    scenario = {
        "title": "Project Pitch to Executive",
        "author": "Parameshwara V",
        "description": "You are tasked with pitching a new project to an executive in your company. The setting is a formal meeting room, and you need to convince the executive of the project's value and feasibility.",
        "success_criteria": [
            "Clearly articulate the project's objectives and expected outcomes.",
            "Provide a detailed plan, including timelines and resource requirements.",
            "Highlight the potential ROI and benefits to the company.",
            "Address potential risks and mitigation strategies.",
            "Engage the executive with a confident and professional demeanor."
        ],
        "user_name": "Parameshwara V",
        "user_role": "Project Manager",
        "user_avatar": "<svg width='32' height='32'><circle cx='16' cy='16' r='16' fill='#e0e7ef'/><text x='50%' y='55%' text-anchor='middle' fill='#888' font-size='16'>P</text></svg>",
        "ai_name": "Sam",
        "ai_role": "Executive",
        "ai_avatar": "<svg width='32' height='32'><circle cx='16' cy='16' r='16' fill='#e0e7ef'/><text x='50%' y='55%' text-anchor='middle' fill='#2563eb' font-size='16'>S</text></svg>",
        "ai_description": "The executive is a seasoned professional with a keen eye for detail and a strong focus on ROI. They are analytical, direct, and expect clear, concise, and compelling presentations."
    }
    return scenario


@app.post("/roleplay", response_class=JSONResponse)
async def post_roleplay(data: dict = Body(...)):
    prompt = data.get("prompt", "")
    print(f"[ROLEPLAY REQUEST] User prompt: {prompt}")
    
    # Generate a detailed role play scenario using the existing agent system
    try:
        # Create a temporary session to get LLM response
        temp_session_id = f"roleplay_{os.urandom(8).hex()}"
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=temp_session_id,
            session_id=temp_session_id,
        )
        
        runner = Runner(
            app_name=APP_NAME,
            agent=root_agent,
            session_service=session_service,        )
        
        # Create RunConfig with only essential parameters
        run_config = RunConfig(response_modalities=["TEXT"])
        live_request_queue = LiveRequestQueue()
        
        # Start the agent session
        live_events = runner.run_live(
            session=session,
            live_request_queue=live_request_queue,
            run_config=run_config,
        )
          # Craft a detailed prompt for generating role play scenario
        scenario_prompt = f"""
        Create a detailed Learning-style role play scenario based on this request: \"{prompt}\"
        
        IMPORTANT: Respond ONLY with a valid JSON object as described below. Do not include markdown, code blocks, or any text before or after the JSON.

        All array elements (like \"success_criteria\") must be valid, double-quoted strings on a single line. Do not break strings across lines. Ensure the JSON is valid and minified (no unnecessary whitespace or line breaks inside strings).

        Use this format:
        {{
            "title": "A professional title for the scenario",
            "author": "AI Learning Coach",
            "description": "A detailed 2-3 sentence description of the scenario context and objectives",
            "success_criteria": ["criterion 1", "criterion 2", "criterion 3", "criterion 4", "criterion 5"],
            "user_name": "You",
            "user_role": "A specific professional role relevant to the scenario",
            "user_avatar": "👤",
            "ai_name": "A realistic name for the AI character",
            "ai_role": "The role the AI will play",  
            "ai_avatar": "An appropriate emoji like 🧑‍💼 or 👩‍💻",
            "ai_description": "2-3 sentences describing the AI character's personality and approach",
            "chat_prompt": "A detailed prompt to initialize the role play conversation with context and opening"
        }}
        
        Make it realistic, professional, and engaging for workplace skill development. 

        Response format: Respond ONLY with a valid JSON object as described above.
        """
        
        # Send the scenario generation request
        content = Content(role="user", parts=[Part.from_text(text=scenario_prompt)])
        live_request_queue.send_content(content=content)
        
        # Collect the response
        llm_response = ""
        async for event in live_events:
            if event.turn_complete or event.interrupted:
                break
              # Read the Content and its first Part
            part = (
                event.content and event.content.parts and event.content.parts[0]
            )
            if not part or not part.text:
                continue
            
            llm_response += part.text
        
        print(f"[ROLEPLAY LLM] Raw response: {llm_response}")
        
        # Clean LLM response of markdown/code block wrappers before parsing
        cleaned_response = llm_response.strip()
        # Remove leading/trailing triple backticks and 'json' if present
        if cleaned_response.startswith('```json'):
            cleaned_response = cleaned_response[len('```json'):].strip()
        if cleaned_response.startswith('```'):
            cleaned_response = cleaned_response[len('```'):].strip()
        if cleaned_response.endswith('```'):
            cleaned_response = cleaned_response[:-3].strip()


        print(f"[ROLEPLAY DEBUG] Cleaned response before JSON parse:\n{cleaned_response[:500]}")        # Multi-layered JSON parsing approach
        scenario = parse_llm_json_response(cleaned_response, prompt)

        # Ensure all required fields exist
        required_fields = ['title', 'author', 'description', 'success_criteria', 'user_name', 'user_role', 'user_avatar', 'ai_name', 'ai_role', 'ai_avatar', 'ai_description', 'chat_prompt']
        for field in required_fields:
            if field not in scenario:
                scenario[field] = f"[{field} not provided]"
        
    except Exception as e:
        print(f"[ROLEPLAY ERROR] Failed to generate scenario via LLM: {e}")
        # Fallback scenario
        scenario = {
            "title": f"Professional Role Play: {prompt}" if prompt else "Role Play Scenario",
            "author": "AI Learning Coach",
            "description": f"Practice this important workplace scenario: {prompt}. This exercise will help you develop key communication and professional skills.",
            "success_criteria": [
                "Communicate clearly and professionally",
                "Listen actively and respond appropriately", 
                "Maintain composure and confidence",
                "Achieve your conversation objectives",
                "Build positive rapport with the other party"
            ],
            "user_name": "You",
            "user_role": "Professional",
            "user_avatar": "👤",
            "ai_name": "Alex",
            "ai_role": "Role Play Partner",
            "ai_avatar": "🧑‍💼",
            "ai_description": f"Alex is an experienced professional who will help you practice: {prompt}. They provide realistic responses and constructive feedback.",
            "chat_prompt": f"Let's start a role play about: {prompt}. I'll play the role of your conversation partner. Please set the scene and begin when you're ready."
        }
    
    print(f"[ROLEPLAY RESPONSE] Returning scenario: {scenario['title']}")
    return scenario

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: int, is_audio: str):
    """Client websocket endpoint"""

    # Wait for client connection
    await websocket.accept()
    print(f"Client #{session_id} connected, audio mode: {is_audio}")

    # Start agent session
    session_id = str(session_id)
    live_events, live_request_queue = await start_agent_session(
        session_id, is_audio == "true"
    )

    # Start tasks
    agent_to_client_task = asyncio.create_task(
        agent_to_client_messaging(websocket, live_events)
    )
    client_to_agent_task = asyncio.create_task(
        client_to_agent_messaging(websocket, live_request_queue)
    )
    await asyncio.gather(agent_to_client_task, client_to_agent_task)    # Disconnected
    print(f"Client #{session_id} disconnected")
