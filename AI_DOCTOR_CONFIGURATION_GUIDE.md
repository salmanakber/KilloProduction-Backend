# AI Doctor Configuration Guide

## Where to Configure Multi-Language Responses

### ✅ **Use System Prompt (Recommended)**

Configure multi-language responses in the **System Prompt** field of your AI_DOCTOR configuration. This is the best place because:

1. **System prompts guide the AI's behavior** - They set the overall instructions and format expectations
2. **Consistent across all interactions** - The AI will always follow the format you specify
3. **Easy to update** - Change once, applies everywhere

### Example System Prompt for Multi-Language:

```
You are a medical AI assistant for SuperKillo. You help patients by analyzing symptoms, recommending medicines, and providing medical guidance.

IMPORTANT: Always return responses in JSON format with three languages:
- english: English text
- hausa: Hausa translation
- yoruba: Yoruba translation
- Pashto: Pashto translation

For medicine recommendations, return:
{
  "recommendations": [
    {
      "medicineName": "exact name from database",
      "confidence": 0.9,
      "reason": "Why this medicine is suitable",
      "aiExplanation": "Detailed explanation"
    }
  ]
}

For notes/advice, return:
{
  "english": "English text",
  "hausa": "Hausa translation",
  "yoruba": "Yoruba translation"
}

For medical data extraction, return:
{
  "symptoms": ["symptom1", "symptom2"],
  "illnesses": ["illness1", "illness2"],
  "medicines": ["medicine1", "medicine2"]
}

CRITICAL: Always return ONLY valid JSON. Do not include explanations, commentary, or markdown code blocks.
```

### ❌ **Don't Use Custom Functions for Multi-Language**

Custom functions (like `search_medicines`) are for:
- **Function calling** - When the AI needs to call external functions
- **Tool integration** - Connecting to databases, APIs, etc.

They are NOT for:
- Formatting responses
- Language instructions
- Response structure

## Custom Functions Usage

### Your `search_medicines` Function

Your custom function is correctly configured:
```json
{
  "type": "function",
  "function": {
    "name": "search_medicines",
    "description": "Search for medicines by name, condition, symptoms, or analyze medical images",
    "parameters": {
      "type": "object",
      "required": ["query"],
      "properties": {
        "query": {
          "type": "string",
          "description": "Medicine name, condition, symptom, or extracted text from reports"
        },
        "image": {
          "type": "string",
          "description": "Optional image input (base64 or URL) for analysis"
        }
      }
    }
  }
}
```

**How it works:**
1. AI sees this function definition in the tools array
2. When AI needs to search medicines, it calls `search_medicines(query: "headache")`
3. Our code executes the function and returns medicine results
4. AI uses those results to generate recommendations

## System Prompt Best Practices

### ✅ DO:
- Specify JSON format requirements
- Include multi-language instructions
- Define response structures
- Set medical guidelines and disclaimers
- Instruct on using custom functions

### ❌ DON'T:
- Hardcode specific medicine names
- Include temporary instructions
- Mix formatting with function definitions
- Put function calling logic in system prompt

## Current Implementation

The code now:
1. ✅ Uses system prompt from database (no hardcoded prompts)
2. ✅ Includes custom functions automatically
3. ✅ Handles function calls (when AI calls `search_medicines`)
4. ✅ Better error handling for non-JSON responses
5. ✅ Provides helpful error messages

## Testing Your Configuration

1. Go to `/admin/ai-config`
2. Select "AI Doctor" use case
3. Check your System Prompt includes:
   - JSON format instructions
   - Multi-language requirements
   - Response structure examples
4. Verify Custom Functions includes `search_medicines`
5. Test in the playground console

## Troubleshooting

### Error: "Unexpected token 'I', 'I'll analy'... is not valid JSON"
**Solution:** Your system prompt needs to explicitly instruct the AI to return JSON only. Add:
```
CRITICAL: Return ONLY valid JSON. No explanations, no markdown, just JSON.
```

### Error: "AI response is not in valid JSON format"
**Solution:** Update your system prompt to include JSON format examples and strict instructions.

### Function calls not working
**Solution:** Ensure your custom function schema is valid JSON and matches OpenRouter's function calling format.
