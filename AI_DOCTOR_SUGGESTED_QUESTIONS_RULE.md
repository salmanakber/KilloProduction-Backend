# AI Doctor Suggested Questions Rule

## ⚠️ CRITICAL: JSON-Only Response Rule

**BEFORE adding suggested questions, ensure this rule is in your system prompt:**

```
CRITICAL JSON-ONLY RULE:
- You MUST return ONLY valid JSON
- NEVER include any text, explanations, or commentary BEFORE or AFTER the JSON
- NEVER write "Based on..." or "Here are..." before the JSON
- Start your response directly with { and end with }
- Example of WRONG format: "Based on your symptoms, here is the response: {...}"
- Example of CORRECT format: {...}
```

## Rule for AI Behavior Context

Add this rule to your AI_DOCTOR system prompt in the admin panel (`/admin/ai-config`):

---

## **Suggested Questions Generation Rule**

**CRITICAL:** After providing your main response (medicine recommendations, notes, etc.), you MUST include a `suggestedQuestions` field in your JSON response.

### Format:

```json
{
  "english": "Your main response in English",
  "hausa": "Your main response in Hausa",
  "yoruba": "Your main response in Yoruba",
  "pashto": "Your main response in Pashto",
  "recommendations": [...],
  "suggestedQuestions": [
    {
      "text": "Question text in the user's language",
      "icon": "icon_name",
      "category": "symptom|medicine|condition|general"
    }
  ]
}
```

### Rules for Generating Suggested Questions:

1. **Based on User's Query:**
   - If user asks about "headache" → suggest: "How to prevent headaches?", "Headache with fever", "Chronic headache treatment"
   - If user asks about "stomach pain" → suggest: "Stomach pain after eating", "Severe stomach cramps", "Stomach pain with nausea"
   - If user asks about a medicine → suggest: "Side effects of [medicine]", "Dosage for [medicine]", "Can I take [medicine] with [other medicine]?"

2. **Based on Recommended Medicines:**
   - For each recommended medicine, generate 1-2 related questions
   - Example: If you recommend "Paracetamol" → suggest: "Paracetamol dosage for adults", "Paracetamol side effects"

3. **Based on Symptoms:**
   - Generate follow-up questions about the symptoms mentioned
   - Example: If symptoms include "fever" → suggest: "How to reduce fever naturally?", "Fever with body aches"

4. **Based on Conditions/Illnesses:**
   - Generate questions about related conditions
   - Example: If condition is "gastritis" → suggest: "Gastritis diet recommendations", "Gastritis symptoms and causes"

5. **General Health Questions:**
   - Include 1-2 general health questions if relevant
   - Example: "When to see a doctor?", "Prevention tips for [condition]"

### Question Format Requirements:

- **Text:** Should be a complete, natural question (not just keywords)
- **Icon:** Use appropriate icon names:
  - `pulse` - for pain/headache
  - `thermometer` - for fever/temperature
  - `body` - for body pain/stomach
  - `flask` - for lab reports/tests
  - `medical` - for general health
  - `eye` - for eye/vision issues
  - `heart` - for heart/cardiovascular
  - `lungs` - for respiratory issues
- **Category:** One of: `symptom`, `medicine`, `condition`, `general`

### Example Response:

```json
{
  "english": "Based on your sharp stomach pain, I recommend Omeprazole 20mg...",
  "hausa": "Bisa ciwon ciki mai kaifi, ina ba da shawarar Omeprazole 20mg...",
  "yoruba": "Bẹsẹ lori irora ikun ti o le, Mo ṣe imọran Omeprazole 20mg...",
  "pashto": "د ستونزو د تیږو درد پر بنسټ، زه Omeprazole 20mg وړاندیز کوم...",
  "recommendations": [
    {
      "medicineName": "Omeprazole 20mg",
      "confidence": 0.9,
      "reason": "Reduces stomach acid",
      "aiExplanation": "..."
    }
  ],
  "suggestedQuestions": [
    {
      "text": "Stomach pain after eating",
      "icon": "body",
      "category": "symptom"
    },
    {
      "text": "Omeprazole side effects",
      "icon": "medical",
      "category": "medicine"
    },
    {
      "text": "How to prevent gastritis",
      "icon": "medical",
      "category": "condition"
    },
    {
      "text": "When to see a doctor for stomach pain",
      "icon": "medical",
      "category": "general"
    },
    {
      "text": "Stomach pain with nausea and vomiting",
      "icon": "body",
      "category": "symptom"
    }
  ]
}
```

### Important Notes:

- **Always include 3-5 suggested questions** in every response
- **Questions should be in the same language** as the user's query (or match the primary language of the response)
- **Questions should be relevant** to the current consultation
- **Mix different categories** (symptom, medicine, condition, general)
- **Make questions actionable** - users should be able to click and get useful answers

---

## Implementation in System Prompt

Add this section to your AI_DOCTOR system prompt:

```
## Suggested Questions Generation

After providing your main response, you MUST include a "suggestedQuestions" array with 3-5 relevant follow-up questions.

Each question should be:
- Relevant to the user's current query
- Based on recommended medicines, symptoms, or conditions
- In the same language as the user's query
- Formatted as a complete, natural question

Format:
{
  "suggestedQuestions": [
    {
      "text": "Question text",
      "icon": "icon_name",
      "category": "symptom|medicine|condition|general"
    }
  ]
}

Generate questions that help users:
- Understand their condition better
- Learn about recommended medicines
- Know when to seek further help
- Prevent similar issues in the future
```

---

## Backend Implementation

The backend will automatically extract `suggestedQuestions` from the AI response and include it in the API response, which the mobile app can then use to show dynamic suggested questions.
