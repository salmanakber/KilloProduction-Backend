# Virtual Doctor Implementation

This implementation provides an AI-powered health assistant that can process voice input, image uploads, or text input to provide medical recommendations based on your CentralMedicine database.

## Features

### Input Processing
- **Voice Input**: Speech-to-text conversion with failover strategy
- **Image Upload**: OCR text extraction from prescription images
- **Text Input**: Direct symptom description input

### AI Processing Pipeline
1. **Input Processing**: Convert voice/image to text
2. **NLP Analysis**: Extract symptoms, illnesses, and medicines
3. **Database Mapping**: Find matching medicines from CentralMedicine
4. **Response Generation**: Provide structured recommendations

### Failover Strategy
Each processing step uses multiple APIs with automatic failover:
- **Speech-to-Text**: OpenAI Whisper → Google Speech → Azure Speech
- **OCR**: Google Vision → AWS Textract → Tesseract
- **NLP**: Infermedica → EndlessMedical → Azure Health → OpenAI GPT

## API Endpoint

### POST `/api/pharmacy/VirtualDoctor`

**Request Body (multipart/form-data):**
- `audioFile` (optional): Audio file for voice input
- `imageFile` (optional): Image file for prescription OCR
- `textInput` (optional): Direct text input

**Response:**
```json
{
  "diagnosis": ["Flu", "Fever"],
  "recommended_medicines": [
    {
      "name": "Paracetamol",
      "genericName": "Acetaminophen",
      "dosage": "500mg every 6 hours",
      "fromDB": true,
      "warnings": "Avoid if liver issues",
      "sideEffects": {...},
      "category": "Analgesic",
      "strength": "500mg",
      "manufacturer": "Generic",
      "confidence": 0.9,
      "matchReason": "Matched illness: fever"
    }
  ],
  "notes": "Drink fluids, rest, and consult a doctor if symptoms persist.",
  "disclaimer": "This is not medical advice. Consult a pharmacy professional from the below list.",
  "processing_info": {
    "input_type": "text",
    "text_extracted": "I have a headache and feel nauseous...",
    "nlp_source": "Simple NLP Fallback",
    "medicines_found": 3,
    "processing_time_ms": 150
  }
}
```

## Environment Variables

Add these to your `.env` file:

```env
# Speech-to-Text APIs
OPENAI_API_KEY="your_openai_api_key_here"
GOOGLE_SPEECH_API_KEY="your_google_speech_api_key_here"
AZURE_SPEECH_API_KEY="your_azure_speech_api_key_here"
AZURE_SPEECH_REGION="your_azure_speech_region_here"

# OCR APIs
GOOGLE_VISION_API_KEY="your_google_vision_api_key_here"
AWS_ACCESS_KEY_ID="your_aws_access_key_here"
AWS_SECRET_ACCESS_KEY="your_aws_secret_key_here"
AWS_REGION="us-east-1"
TESSERACT_PATH="/usr/local/bin/tesseract"

# NLP APIs
INFERMEDICA_API_KEY="your_infermedica_api_key_here"
INFERMEDICA_APP_ID="your_infermedica_app_id_here"
ENDLESSMEDICAL_API_KEY="your_endlessmedical_api_key_here"
AZURE_HEALTH_API_KEY="your_azure_health_api_key_here"
AZURE_HEALTH_ENDPOINT="your_azure_health_endpoint_here"
```

## Mobile Integration

The mobile app includes:
- **AI Health Assistant Modal**: Input interface for symptoms
- **AI Results Screen**: Display of recommendations and medicines
- **Processing States**: Loading indicators and error handling

### Usage in Mobile App

1. User opens the pharmacy screen
2. Taps "AI Health Assistant" button
3. Describes symptoms or uploads prescription image
4. AI processes input and shows results screen
5. User can consult pharmacist or try again

## Database Integration

The system queries the `CentralMedicine` model using:
- **Illness Types**: Matches against `illnessTypes` JSON field
- **Medicine Names**: Searches `name` and `genericName` fields
- **Active Ingredients**: Matches against `activeIngredients` JSON field
- **Symptoms**: Maps common symptoms to illness categories

## Testing

Run the test script to verify the API:

```bash
cd /Users/macbook/SuperKillo/web/backend-data
node test-virtual-doctor.js
```

## Current Implementation Status

✅ **Completed:**
- Database mapping service
- Simple fallback implementation
- API endpoint structure
- Mobile UI integration
- Error handling and failover

🔄 **In Progress:**
- External API integrations (requires API keys)
- Advanced NLP processing
- Voice recording functionality
- Image upload handling

## Next Steps

1. **Add API Keys**: Configure environment variables with actual API keys
2. **Test Integration**: Verify all external APIs work correctly
3. **Add Voice Recording**: Implement audio recording in mobile app
4. **Add Image Upload**: Implement image picker and upload functionality
5. **Enhance NLP**: Improve symptom and illness detection accuracy

## Security Considerations

- All API keys stored in environment variables
- Input validation and sanitization
- Rate limiting on API endpoints
- Medical disclaimer in all responses
- No storage of personal health data

## Disclaimer

This is a demonstration implementation. For production use:
- Add proper authentication and authorization
- Implement comprehensive error handling
- Add logging and monitoring
- Ensure HIPAA compliance if handling real health data
- Add proper medical disclaimers and legal notices
