# Setup and Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Setup](#local-setup)
3. [Getting Gemini API Key](#getting-gemini-api-key)
4. [Configuration](#configuration)
5. [Running the Application](#running-the-application)
6. [Troubleshooting](#troubleshooting)
7. [Production Deployment](#production-deployment)

## Prerequisites

Before starting, ensure you have:

- **Node.js**: 16.x or higher
  - Check: `node --version`
  - Download: https://nodejs.org/

- **npm**: 7.x or higher (comes with Node.js)
  - Check: `npm --version`

- **Google Account**: For Gemini API access
  - Sign up: https://accounts.google.com/

- **Google Cloud Project**: With billing enabled
  - Create at: https://console.cloud.google.com/

## Local Setup

### Step 1: Clone or Navigate to Project

```bash
cd "Final Playwright Test Script Generator"
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages:
- `@google/generative-ai` - Gemini API client
- `playwright` - Browser automation
- `dotenv` - Environment variable management
- `xlsx` - Excel file handling
- `typescript` - TypeScript compiler
- All dev dependencies

### Step 3: Verify Installation

```bash
npm list --depth=0
```

You should see:
- @google/generative-ai
- dotenv
- playwright
- xlsx

### Step 4: Build TypeScript

```bash
npm run build
```

Check for any compilation errors. The `dist/` folder should contain compiled JavaScript.

## Getting Gemini API Key

### Option 1: Google AI Studio (Quick Start)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Choose "Create API key in new Google Cloud project"
4. Copy the API key
5. Keep it secure and don't share it

### Option 2: Google Cloud Console (Recommended for Production)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project:
   - Click "Select a Project"
   - Click "New Project"
   - Enter project name (e.g., "AI Test Automation")
   - Click "Create"

3. Enable Generative AI API:
   - Go to APIs & Services > Library
   - Search for "Generative AI"
   - Click "Generative Language API"
   - Click "Enable"

4. Create API Key:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "API Key"
   - Copy the API key
   - Restrict it to "Generative Language API"

5. Set up billing:
   - Go to Billing
   - Link a payment method
   - Set up a budget alert (optional)

**Note**: Gemini API has a free tier with rate limits. Check current pricing at https://ai.google.dev/pricing

## Configuration

### Step 1: Create Environment File

```bash
cp .env.example .env
```

### Step 2: Edit `.env` File

Open `.env` in your text editor and update:

```env
GOOGLE_API_KEY=paste_your_api_key_here
GEMINI_MODEL=gemini-2.0-flash
APP_URL=https://www.saucedemo.com
DEFAULT_USERNAME=standard_user
DEFAULT_PASSWORD=secret_sauce
LOG_LEVEL=info
LOG_DIR=logs
```

### Step 3: Verify Configuration

Run this command to verify the setup:

```bash
npm run build
```

If successful, proceed to running the application.

## Running the Application

### Development Mode

For quick testing with hot reload:

```bash
npm run dev
```

### Production Mode

For the normal execution:

```bash
npm start --headed
```

**Flags**:
- `--headed`: Shows browser window during execution (recommended for first run)
- Without flag: Runs in headless mode (no browser window)

### Expected Output

When you run `npm start --headed`:

1. **Initialization Phase** (2-3 seconds)
   ```
   ✓ Configuration loaded and validated
   ✓ Core services initialized
   ✓ All AI agents initialized
   ```

2. **Connectivity Validation** (5-10 seconds)
   ```
   ✓ LLM Connection Status: Connected Successfully
   Model: gemini-2.0-flash
   ```

3. **User Story Prompt**
   ```
   📋 Enter your User Story: 
   ```

4. **Autonomous Execution** (30-60 seconds)
   ```
   Invoking Explorer Agent...
   Invoking Planner Agent...
   Invoking Generator Agent...
   Invoking Executor Agent...
   ```

5. **Final Report**
   ```
   📡 SYSTEM CONNECTIVITY STATUS
   🧪 TEST EXECUTION SUMMARY
   ✅ TEST RESULTS
   STATUS: ✓ SUCCESS
   ```

## Troubleshooting

### Issue: "GOOGLE_API_KEY is not configured"

**Solution**:
1. Make sure `.env` file exists in project root
2. Verify `GOOGLE_API_KEY` is set correctly
3. No spaces or quotes around the key

```env
# ✓ Correct
GOOGLE_API_KEY=AIzaSyD_xPW8vKqhR8fPZ...

# ✗ Wrong
GOOGLE_API_KEY = AIzaSyD_xPW8vKqhR8fPZ...
GOOGLE_API_KEY="AIzaSyD_xPW8vKqhR8fPZ..."
```

### Issue: "Module not found" Error

**Solution**:
1. Make sure all dependencies are installed
   ```bash
   npm install
   ```
2. Clear npm cache
   ```bash
   npm cache clean --force
   npm install
   ```

### Issue: "Cannot connect to SauceDemo"

**Solution**:
1. Check internet connection
2. Verify URL: https://www.saucedemo.com is accessible
3. Check if SauceDemo is down: https://status.saucedemo.com/

### Issue: "Browser launch failed"

**Solution**:
1. Playwright browsers might not be installed
   ```bash
   npx playwright install
   ```
2. On Linux, install required dependencies:
   ```bash
   npx playwright install-deps
   ```

### Issue: "Timeout waiting for selector"

**Solution**:
1. Internet connection might be slow
2. SauceDemo might be experiencing issues
3. Try running again after a few minutes
4. Check browser console logs in `logs/` directory

### Issue: "API quota exceeded"

**Solution**:
1. You've hit rate limits on the free tier
2. Enable billing in Google Cloud Console
3. Or wait for the rate limit reset (typically 1 minute)
4. Check current usage at: https://console.cloud.google.com/

## File Structure After Execution

After running the application, you'll see:

```
Final Playwright Test Script Generator/
├── dist/                    # Compiled JavaScript
├── logs/                    # Execution logs
│   └── execution-*.log     # Timestamped log files
├── repositories/           # Generated repositories
│   ├── application-maps/   # Discovered app structures
│   │   └── app-map-*.json
│   └── tests/
│       ├── generated-scenarios.spec.ts
│       └── page-objects/   # Page Object Model files
│           ├── LoginPage.ts
│           ├── ProductsPage.ts
│           ├── CartPage.ts
│           ├── CheckoutPage.ts
│           └── ConfirmationPage.ts
├── test-artifacts/        # Test execution artifacts
│   ├── screenshots/
│   ├── traces/
│   ├── videos/
│   └── *.json            # JSON reports
├── test-plans.xlsx       # Scenario repository (Excel)
└── .env                  # Configuration (KEEP SECRET)
```

## Production Deployment

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install Playwright dependencies
RUN apk add --no-cache \
    chromium \
    firefox \
    curl

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t ai-test-automation .
docker run -e GOOGLE_API_KEY=your_key ai-test-automation
```

### Environment Variables in Production

**Option 1**: Environment Variable Substitution

```bash
export GOOGLE_API_KEY="your_api_key"
export GEMINI_MODEL="gemini-2.0-flash"
npm start
```

**Option 2**: Secret Management (Recommended)

Use services like:
- Google Cloud Secret Manager
- AWS Secrets Manager
- HashiCorp Vault
- Environment variable injection via orchestration platform

### Running in CI/CD Pipeline

Example GitHub Actions workflow:

```yaml
name: Run AI Test Automation

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - run: npm install
      
      - run: npm run build
      
      - run: npm start
        env:
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
          GEMINI_MODEL: gemini-2.0-flash
      
      - name: Upload Reports
        if: always()
        uses: actions/upload-artifact@v2
        with:
          name: test-reports
          path: test-artifacts/
```

### Performance Tuning

For large-scale deployments:

1. **Parallel Execution**: Run multiple agents in parallel
   - Modify Orchestrator to support concurrent agents

2. **Caching**: Cache application maps and page objects
   - Already implemented via repositories/

3. **Resource Limits**: Set Node.js memory limits
   ```bash
   node --max-old-space-size=4096 dist/index.js
   ```

4. **Logging**: Reduce verbosity in production
   ```env
   LOG_LEVEL=warn
   ```

## Monitoring and Maintenance

### Regular Tasks

1. **Monitor API Usage**
   - Check Gemini API quota in Google Cloud Console
   - Set budget alerts to avoid surprises

2. **Archive Artifacts**
   - Periodically archive old test artifacts
   - Clear logs directory to save space

3. **Update Dependencies**
   ```bash
   npm update
   npm audit fix
   ```

4. **Monitor Excel File**
   - Periodically export test-plans.xlsx for backup
   - Analyze reuse metrics for optimization

### Health Checks

Add periodic validation:

```bash
# Test connectivity
curl https://www.saucedemo.com

# Check API key validity
npm run build && npm start --dry-run
```

## Support and Documentation

- **Playwright Docs**: https://playwright.dev/
- **Gemini API Docs**: https://ai.google.dev/
- **SauceDemo**: https://www.saucedemo.com/
- **TypeScript Docs**: https://www.typescriptlang.org/

## Next Steps

1. ✅ Complete the setup steps above
2. ✅ Get your Gemini API key
3. ✅ Create and configure `.env` file
4. ✅ Run `npm install` and `npm run build`
5. ✅ Execute `npm start --headed` with a test user story
6. ✅ Review the generated report in `test-artifacts/`

Happy testing! 🚀
