# AI Configuration System - How It Works

## Overview

The AI configuration system allows you to set up different AI behaviors for different use cases (AI Doctor, AI Mechanic, Order History, etc.). Each use case has its own:
- System Prompt (System Architecture)
- Tools & Functions
- Custom Functions
- Hyperparameters (Temperature, Max Tokens, Top P)

---

## 1. Custom Function Schema - How It Works

### What Are Custom Functions?

Custom functions allow the AI to call your backend APIs or perform specific actions. When you define a custom function, the AI model can "decide" to call it based on the user's request.

### Example Use Cases:

**For AI Doctor:**
```json
{
  "type": "function",
  "function": {
    "name": "search_medicines",
    "description": "Search for medicines by name or condition",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Medicine name or condition"
        }
      },
      "required": ["query"]
    }
  }
}
```

**For AI Mechanic:**
```json
{
  "type": "function",
  "function": {
    "name": "get_vehicle_info",
    "description": "Get vehicle information by VIN or license plate",
    "parameters": {
      "type": "object",
      "properties": {
        "identifier": {
          "type": "string",
          "description": "VIN number or license plate"
        }
      },
      "required": ["identifier"]
    }
  }
}
```

### How It Works:

1. **You define the function schema** in the UI (JSON format)
2. **Function is saved** with the use case configuration
3. **When AI processes a request**, it sees the available functions
4. **AI decides** if it needs to call a function based on the user's query
5. **Your backend receives** the function call and executes it
6. **Results are returned** to the AI, which then responds to the user

### Important Notes:

- ✅ **Each use case has its own custom functions** - AI Doctor functions won't appear for AI Mechanic
- ✅ **Functions are sent to OpenRouter** in the `tools` parameter
- ✅ **You need to implement the actual function handlers** in your backend
- ✅ **Functions are optional** - AI can work without them

---

## 2. Per Use Case Configuration

### Yes, It Works Separately for Each Use Case!

Each use case (AI Doctor, AI Mechanic, Order History, etc.) has its **own separate configuration**:

- **System Prompt**: Different instructions for each use case
- **Tools**: Different tools enabled per use case
- **Custom Functions**: Different functions per use case
- **Hyperparameters**: Different temperature, max tokens, top_p per use case

### How to Configure:

1. **Select Use Case** from the dropdown (AI Doctor, AI Mechanic, etc.)
2. **Configure settings** for that specific use case:
   - Edit System Prompt
   - Enable/disable tools
   - Add custom functions
   - Set temperature, max tokens, top_p
3. **Click "Save Version"** - This saves the configuration for that use case
4. **Switch to another use case** - You'll see different settings (or create new ones)

### Example:

- **AI Doctor** might have:
  - System Prompt: "You are a medical assistant..."
  - Tools: web_search enabled
  - Custom Function: search_medicines
  - Temperature: 0.7

- **AI Mechanic** might have:
  - System Prompt: "You are an automotive expert..."
  - Tools: code_interpreter enabled
  - Custom Function: get_vehicle_info
  - Temperature: 0.8

---

## 3. Max Tokens, Temperature, Top P - Fixed!

### The Problem:

The values weren't being passed correctly because of how JavaScript handles falsy values (0, null, undefined).

### The Fix:

Changed from:
```typescript
temperature: config.temperature || undefined  // ❌ Fails if temperature is 0
```

To:
```typescript
temperature: config.temperature !== null && config.temperature !== undefined ? config.temperature : undefined  // ✅ Works correctly
```

### How It Works Now:

1. **You set the values** in the UI (sliders)
2. **Values are saved** to the database
3. **Values are loaded** when you select a use case
4. **Values are passed** to the AI API call
5. **AI uses your settings** for that specific request

### Priority Order:

1. **Configuration value** (from database) - Highest priority
2. **Model default** (from AIModel table) - Fallback
3. **System default** (0.7, 4096, 1.0) - Last resort

---

## 4. Complete Flow

### When You Save Configuration:

1. UI sends data to `/api/admin/ai-config/config`
2. Server saves to `AIConfiguration` table with `useCase` field
3. Each use case can have multiple versions (versioning system)

### When AI Processes Request:

1. Mobile app calls `/api/ai/analyze` with `useCase: "AI_DOCTOR"`
2. Server gets configuration for `AI_DOCTOR` use case
3. Server builds request with:
   - System prompt from config
   - Tools from config (web_search, code_interpreter, custom functions)
   - Temperature, max_tokens, top_p from config
4. Server calls OpenRouter API with all settings
5. OpenRouter returns response
6. Response sent back to mobile app

---

## 5. Testing

### Test Your Configuration:

1. **Select a use case** (e.g., AI Doctor)
2. **Configure settings** (prompt, tools, functions, hyperparameters)
3. **Click "Save Version"**
4. **Enter a test prompt** in the "Test Prompt" section
5. **Click "Run Test"**
6. **See results** - Check if your settings are working

---

## Summary

✅ **Custom Functions**: Per use case, JSON schema format, sent to AI model  
✅ **Separate Configurations**: Each use case (AI Doctor, Mechanic, etc.) has its own settings  
✅ **Max Tokens/Temperature/Top P**: Now working correctly with proper null checks  
✅ **Tools**: Web Search and Code Interpreter can be enabled per use case  
✅ **System Prompt**: Different instructions per use case  

Everything is now properly connected and working!
