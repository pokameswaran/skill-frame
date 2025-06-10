from google.adk.agents import Agent
from google.adk.tools import google_search  # Import the tool

from dotenv import load_dotenv

load_dotenv()

root_agent = Agent(
    # A unique name for the agent.
    name="multimodal_search_agent",
    # The Large Language Model (LLM) that agent will use.
    #model="gemini-2.0-flash-exp",   # Only model supporting bidiGenerateContent in your account
    #model="gemini-1.5-pro",   # Alternative 1: More capable but slower
    #model="gemini-1.0-pro",   # Alternative 2: Most stable, basic multimodal - Also incompatible
    #model="gemini-2.0-flash-live",  # Limited availability - causes quota issues
    model="gemini-2.0-flash-live-001",  # Limited availability - causes quota issues
   # model="gemini-2.0-flash-exp-image-generation", # Also supports bidiGenerateContent, but for image gen
    # A short description of the agent's purpose.
    description="Agent to answer questions using Google Search and analyze images/audio from camera or screen sharing.",
    # Instructions to set the agent's behavior.
    instruction="""You are a helpful assistant that can:
    1. Answer questions using Google Search
    2. Analyze images from camera feed or screen sharing
    3. Respond to audio input
    4. Provide contextual information based on what you see and hear
    
    When you receive images:
    - If from camera: Describe what you see in the physical environment
    - If from screen sharing: Help with what's displayed on the screen, explain UI elements, assist with software, read text, etc.
    
    Be conversational and helpful. For screen sharing, you can:
    - Help troubleshoot software issues
    - Explain what's on the screen
    - Guide through processes
    - Read text that might be hard to see
    - Provide context about applications or websites being shown""",
    # Add google_search tool to perform grounding with Google search.
    tools=[google_search],
)
