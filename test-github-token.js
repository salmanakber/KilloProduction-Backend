// Test script to check GitHub token and configuration
// This helps debug the "Azure client error: undefined" issue

const fs = require('fs');
const path = require('path');

// Test GitHub token and configuration
function testGitHubConfiguration() {
  console.log('🧪 Testing GitHub Configuration');
  console.log('===============================');
  
  try {
    // Test 1: Check environment variables
    console.log('\n📋 Test 1: Environment Variables');
    const githubToken = process.env.GITHUB_TOKEN;
    const githubProvider = process.env.GITHUB_AI_PROVIDER;
    
    if (githubToken) {
      console.log('✅ GITHUB_TOKEN found');
      console.log(`   Token length: ${githubToken.length} characters`);
      console.log(`   Token starts with: ${githubToken.substring(0, 10)}...`);
    } else {
      console.log('❌ GITHUB_TOKEN not found');
      console.log('   Please set GITHUB_TOKEN in your environment variables');
    }
    
    if (githubProvider) {
      console.log(`✅ GITHUB_AI_PROVIDER: ${githubProvider}`);
    } else {
      console.log('⚠️ GITHUB_AI_PROVIDER not set (defaults to azure)');
    }
    
    // Test 2: Check if .env files exist
    console.log('\n📋 Test 2: Environment Files');
    const envFiles = ['.env', '.env.local', '.env.development'];
    
    envFiles.forEach(envFile => {
      const envPath = path.join(__dirname, envFile);
      if (fs.existsSync(envPath)) {
        console.log(`✅ ${envFile} exists`);
        
        // Check if it contains GitHub token
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('GITHUB_TOKEN')) {
          console.log(`   ✅ Contains GITHUB_TOKEN`);
        } else {
          console.log(`   ❌ Does not contain GITHUB_TOKEN`);
        }
      } else {
        console.log(`❌ ${envFile} not found`);
      }
    });
    
    // Test 3: Check package.json for required dependencies
    console.log('\n📋 Test 3: Dependencies');
    const packagePath = path.join(__dirname, 'package.json');
    
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      const requiredDeps = [
        '@azure-rest/ai-inference',
        '@azure/core-auth',
        'openai'
      ];
      
      requiredDeps.forEach(dep => {
        if (dependencies[dep]) {
          console.log(`✅ ${dep}: ${dependencies[dep]}`);
        } else {
          console.log(`❌ ${dep} not found`);
        }
      });
    } else {
      console.log('❌ package.json not found');
    }
    
    // Test 4: Check GitHub AI service file
    console.log('\n📋 Test 4: GitHub AI Service');
    const githubAIPath = path.join(__dirname, 'lib/virtual-doctor/github-ai.ts');
    
    if (fs.existsSync(githubAIPath)) {
      console.log('✅ github-ai.ts exists');
      
      const githubAIContent = fs.readFileSync(githubAIPath, 'utf8');
      
      // Check for key imports and functions
      const keyElements = [
        'import ModelClient',
        'import { AzureKeyCredential }',
        'import OpenAI',
        'GITHUB_MODELS_BASE_URL',
        'callWithAzureClient',
        'callWithOpenAIClient',
        'callWithFetch'
      ];
      
      keyElements.forEach(element => {
        if (githubAIContent.includes(element)) {
          console.log(`✅ ${element} found`);
        } else {
          console.log(`❌ ${element} not found`);
        }
      });
    } else {
      console.log('❌ github-ai.ts not found');
    }
    
    console.log('\n✅ GitHub configuration tests completed!');
    
  } catch (error) {
    console.error('❌ GitHub configuration test failed:', error);
  }
}

// Test the actual GitHub AI call
async function testGitHubAICall() {
  console.log('\n🤖 Testing GitHub AI Call');
  console.log('=========================');
  
  try {
    // Import the GitHub AI function
    const { callGitHubAI } = require('./lib/virtual-doctor/github-ai.ts');
    
    console.log('📝 Making test call to GitHub AI...');
    
    const testPrompt = "Hello, this is a test message. Please respond with 'Test successful'.";
    
    const result = await callGitHubAI(testPrompt, {
      model: 'meta/Llama-4-Scout-17B-16E-Instruct',
      temperature: 0.3,
      max_tokens: 100,
      provider: 'azure'
    });
    
    console.log('✅ GitHub AI call successful!');
    console.log(`   Response: ${result}`);
    
  } catch (error) {
    console.error('❌ GitHub AI call failed:', error.message);
    
    // Try with different provider
    try {
      console.log('🔄 Trying with OpenAI provider...');
      const { callGitHubAI } = require('./lib/virtual-doctor/github-ai.ts');
      
      const result = await callGitHubAI("Test message", {
        model: 'meta/Llama-4-Scout-17B-16E-Instruct',
        temperature: 0.3,
        max_tokens: 100,
        provider: 'openai'
      });
      
      console.log('✅ GitHub AI call with OpenAI provider successful!');
      console.log(`   Response: ${result}`);
      
    } catch (fallbackError) {
      console.error('❌ GitHub AI call with OpenAI provider also failed:', fallbackError.message);
    }
  }
}

// Provide troubleshooting suggestions
function provideTroubleshootingSuggestions() {
  console.log('\n🔧 Troubleshooting Suggestions');
  console.log('==============================');
  
  console.log('\n1. **Check GitHub Token**:');
  console.log('   - Ensure GITHUB_TOKEN is set in your environment');
  console.log('   - Token should be a valid GitHub personal access token');
  console.log('   - Token should have appropriate permissions');
  
  console.log('\n2. **Check Environment Variables**:');
  console.log('   - Create .env.local file with: GITHUB_TOKEN=your_token_here');
  console.log('   - Or set GITHUB_AI_PROVIDER=openai to use OpenAI client');
  
  console.log('\n3. **Check Dependencies**:');
  console.log('   - Run: npm install @azure-rest/ai-inference @azure/core-auth openai');
  console.log('   - Ensure all packages are properly installed');
  
  console.log('\n4. **Check Network**:');
  console.log('   - Ensure you can access https://models.github.ai/inference');
  console.log('   - Check firewall/proxy settings');
  
  console.log('\n5. **Check Model Availability**:');
  console.log('   - Some models might be temporarily unavailable');
  console.log('   - Try different models or providers');
  
  console.log('\n6. **Check Token Permissions**:');
  console.log('   - GitHub token needs appropriate scopes');
  console.log('   - Check token permissions in GitHub settings');
}

// Main test function
async function runAllTests() {
  console.log('🚀 GitHub Token Debug Test Suite');
  console.log('=================================');
  
  testGitHubConfiguration();
  
  // Only run API test if token is available
  if (process.env.GITHUB_TOKEN) {
    await testGitHubAICall();
  } else {
    console.log('\n⚠️ Skipping API test - no GITHUB_TOKEN found');
  }
  
  provideTroubleshootingSuggestions();
  
  console.log('\n📝 Summary:');
  console.log('===========');
  console.log('✅ Configuration tests completed');
  console.log('✅ Troubleshooting suggestions provided');
  console.log('✅ Ready for debugging Azure client issues');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testGitHubConfiguration,
  testGitHubAICall,
  provideTroubleshootingSuggestions,
  runAllTests
};