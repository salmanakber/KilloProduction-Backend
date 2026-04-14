# Fixes Summary - API Timeout, Language Selector, and Suggested Questions

## Issues Fixed

### 1. ✅ API Timeout Issues
**Problem:** API calls taking 2+ minutes, timing out

**Solutions:**
- Reduced `maxTokens` from 8192 to 4096 for notes generation (faster responses)
- Improved JSON extraction to handle ```json code blocks
- Better error handling to prevent cascading failures

### 2. ✅ Language Selector Not Showing
**Problem:** Only 'english' detected, no language selector visible

**Solutions:**
- Fixed JSON extraction to properly handle ```json code blocks
- Improved language detection to filter out non-language keys
- Added support for language dropdown format with codes/flags
- Enhanced mobile app language detection with multiple fallbacks

### 3. ✅ Suggested Questions Storage
**Problem:** Suggested questions not being saved to local storage

**Solutions:**
- Added `suggested_questions` to response interface
- Implemented `saveSuggestedQuestionsToStorage` function
- Auto-saves when response is received
- Updated `aiDoctorModal` to prioritize AI-suggested questions over search history

## Code Changes

### Backend (`web/backend-data/`)

1. **`lib/virtual-doctor/ai-medicine-matcher.ts`**:
   - Fixed JSON extraction to handle ```json code blocks (case-insensitive)
   - Improved language extraction (filters non-language keys)
   - Reduced maxTokens to 4096 for faster responses

2. **`app/api/pharmacy/VirtualDoctor/route.ts`**:
   - Enhanced language detection with dropdown support
   - Maps language codes (en, ha, yo, ps) to language keys
   - Extracts `suggestedQuestions` from AI response
   - Includes `available_languages_dropdown` in response

### Mobile App (`mobile/app/src/`)

1. **`screens/customer/pharmacy/AIResultsScreen.tsx`**:
   - Added `SuggestedQuestion` and `LanguageOption` interfaces
   - Added `suggested_questions` to `VirtualDoctorResponse`
   - Implemented `saveSuggestedQuestionsToStorage` function
   - Auto-saves suggested questions when response received
   - Improved language detection with better fallbacks

2. **`components/aiDoctorModal.tsx`**:
   - Updated to load AI-suggested questions from storage first
   - Falls back to search history if no AI suggestions
   - Prioritizes AI-generated questions over user search history

## System Prompt Update Required

**CRITICAL:** Update your AI_DOCTOR system prompt with this at the TOP:

```
CRITICAL JSON-ONLY RULE:
- You MUST return ONLY valid JSON
- NEVER include any text, explanations, or commentary BEFORE or AFTER the JSON
- NEVER write "Based on..." or "Here are..." before the JSON
- NEVER wrap JSON in ```json code blocks
- Start your response directly with { and end with }
- Example of WRONG format: "Based on your symptoms, here is the response: {...}" or ```json {...} ```
- Example of CORRECT format: {...}
- If you include any text before the JSON, the system will fail to parse your response
```

## Testing Checklist

1. ✅ Test API response time (should be < 60 seconds now)
2. ✅ Test language selector appears with 4 languages
3. ✅ Test suggested questions are saved to storage
4. ✅ Test aiDoctorModal shows AI-suggested questions
5. ✅ Verify JSON parsing works with ```json code blocks

## Storage Keys

- `@ai_doctor_search_history` - User search history (for fallback questions)
- `@ai_doctor_suggested_questions` - AI-generated suggested questions (prioritized)

## Next Steps

1. **Update System Prompt** - Add JSON-only rule at the top
2. **Test** - Try "Body pain" query and verify:
   - Response time < 60 seconds
   - Language selector shows 4 languages
   - Suggested questions appear in modal
3. **Monitor** - Check logs for language detection and storage saves
