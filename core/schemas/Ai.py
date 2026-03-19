
from pydantic import BaseModel, Field


class AISearchRequest(BaseModel):
    """
    Schema for the AI-powered movie search request.
    """
    # The natural language query from the user
    prompt: str = Field(..., min_length=1, max_length=500, description="The natural language movie prompt")


class AISearchResponse(BaseModel):
    """
    Schema for the AI-powered movie search response.
    will be updated according to the response from the ai search engine
    """
    pass