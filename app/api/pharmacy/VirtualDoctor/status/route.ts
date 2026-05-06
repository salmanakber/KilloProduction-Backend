import { NextRequest, NextResponse } from 'next/server';
import { getAPIStatus } from '@/lib/virtual-doctor/hybrid-apis';
import { testGitHubAIConnection } from '@/lib/virtual-doctor/github-ai';

export async function GET(request: NextRequest) {
  try {
    const apiStatus = getAPIStatus();
    
    // Test GitHub AI connection
    let githubAIStatus = 'disabled';
    let githubAIConnection = false;
    
    const useGitHubAI = process.env.USE_GITHUB_AI === 'true' || process.env.USE_GITHUB_AI === '1';
    
    if (useGitHubAI) {
      githubAIStatus = 'enabled';
      try {
        githubAIConnection = await testGitHubAIConnection();
      } catch (error) {
        githubAIStatus = 'enabled_but_failed';
        console.error('GitHub AI connection test failed:', error);
      }
    }
    
    const status = {
      timestamp: new Date().toISOString(),
      environment: {
        use_github_ai: useGitHubAI,
        github_token_configured: !!process.env.GITHUB_TOKEN,
        github_ai_provider: process.env.GITHUB_AI_PROVIDER || 'azure',
        github_ai_status: githubAIStatus,
        github_ai_connection: githubAIConnection
      },
      api_status: apiStatus,
      processing_order: [
        '1. Primary AI_DOCTOR configuration pipeline',
        useGitHubAI ? `2. GitHub AI Medicine Matching (${process.env.GITHUB_AI_PROVIDER || 'azure'} provider)` : '2. GitHub AI Disabled',
        '3. Conservative heuristic fallback (only on AI failure)'
      ],
      available_providers: {
        azure: 'Azure REST client (recommended)',
        openai: 'OpenAI client (compatible)',
        fetch: 'Direct fetch (fallback)'
      },
      endpoints: {
        virtual_doctor: '/api/pharmacy/VirtualDoctor',
        status: '/api/pharmacy/VirtualDoctor/status'
      }
    };
    
    return NextResponse.json(status);
    
  } catch (error) {
    console.error('Status check failed:', error);
    
    return NextResponse.json({
      error: 'Status check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
