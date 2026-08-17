# Autonomous AI Test Automation Agent

A production-ready Node.js + TypeScript application that autonomously generates, executes, and heals Playwright tests using Gemini AI. Includes a professional web UI and CLI interface.

## 📖 Project Overview

This system implements a sophisticated autonomous test automation framework for [SauceDemo](https://www.saucedemo.com/) using:

- **Gemini AI** as the reasoning engine for intelligent test generation and failure analysis
- **Playwright** for cross-browser automation and test execution
- **Multi-Agent Architecture** (7 specialized agents) for modular and intelligent orchestration
- **TypeScript** for type-safe, production-grade code
- **Excel Repository** (test-plans.xlsx) for scenario tracking and reuse
- **Professional Web UI** for easy test automation without terminal interaction

### Problem It Solves

Manual test creation is time-consuming and error-prone. This system:
- Automatically discovers web application structure
- Generates executable Playwright tests from natural language descriptions
- Executes tests across multiple browsers
- Detects and automatically heals test failures
- Tracks scenarios in an Excel repository for reuse
- Provides visual evidence of all generated artifacts

### Major Components

1. **Orchestrator Agent** - Main controller, coordinates all agents and execution flow
2. **Explorer Agent** - Discovers application workflow, pages, and UI elements
3. **Planner Agent** - Creates detailed test plans from user stories using Gemini
4. **Generator Agent** - Generates Playwright test code with Page Object Model pattern
5. **Executor Agent** - Executes tests using Playwright Test framework
6. **Healer Agent** - Analyzes failures and recommends recovery strategies
7. **Report Agent** - Generates comprehensive execution reports
8. **Web UI Server** - Express server serving professional dashboard

---

## ⚙️ Prerequisites

Before setting up the project, ensure you have:

- **Node.js 16+** (verify with `node --version`)
- **npm 8+** (verify with `npm --version`)
- **Google Cloud Project** with Gemini API enabled
- **Google API Key** with Gemini API access
- **Playwright browsers** (installed during setup)
- **Internet connection** for Gemini API calls

### Verify Prerequisites

```bash
node --version        # Should be v16 or higher
npm --version         # Should be v8 or higher
```

---

## 📥 Installation Steps

### Step 1: Clone or Open the Project

Navigate to the project directory:

```bash
cd "Final Playwright Test Script Generator"
```

### Step 2: Install Dependencies

Install all required npm packages:

```bash
npm install
```

This will install:
- `@google/generative-ai` - Gemini API client
- `express` - Web server framework
- `playwright` - Browser automation library
- `xlsx` - Excel file handling
- `dotenv` - Environment configuration
- `typescript` - TypeScript compiler (dev only)

### Step 3: Install Playwright Browsers

Install the required browser engines for Playwright:

```bash
npx playwright install chromium
```

### Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` and add your Gemini API Key:

```env
# Required: Your Google Gemini API Key
GOOGLE_API_KEY=your_actual_gemini_api_key_here

# Optional configuration
GEMINI_MODEL=gemini-2.0-flash
APP_URL=https://www.saucedemo.com
DEFAULT_USERNAME=standard_user
DEFAULT_PASSWORD=secret_sauce
LOG_LEVEL=info
LOG_DIR=logs
```

**To get your Gemini API Key:**
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key to your `.env` file

### Step 5: Build the Project

Compile TypeScript to JavaScript:

```bash
npm run build
```

---

## 🚀 Running the Application

### Option 1: Web UI (Recommended)

Start the application with the web UI:

```bash
npm start
```

Output:
```
╔════════════════════════════════════════════════════════════╗
║     Autonomous AI Test Automation Agent - Web Server       ║
╚════════════════════════════════════════════════════════════╝

✓ Server running at http://localhost:3000
✓ Open your browser and navigate to http://localhost:3000
```

Open `http://localhost:3000` in your browser.

**Using the Web UI:**

1. Enter a User Story in the text area
2. Click **Run Autonomous Test**
3. Watch the workflow progress update in real-time
4. Review generated test plan and Playwright code
5. Download generated artifacts

### Option 2: CLI (Terminal-Based)

Run the application via command line:

```bash
npm run cli
```

You'll be prompted:
```
📋 Enter your User Story: 
```

---

## 📋 User Story Examples

The system works with arbitrary User Stories. Here are examples:

### Basic Login
```
Login with standard_user and password secret_sauce and verify the products page loads
```

### Locked Out User (Expecting Error)
```
Login with locked_out_user and password secret_sauce and verify the correct error message is displayed
```

### Add to Cart
```
Add Sauce Labs Backpack to the cart and verify the cart badge shows 1
```

### Complete Checkout
```
Add three products to cart, proceed to checkout with first name John and last name Doe, and verify order confirmation is displayed
```

---

## 🧪 Running Generated Playwright Tests Independently

After the agent generates a test, you can run it directly with Playwright:

### Run with Headless Browser

```bash
npx playwright test repositories/tests/generated-scenarios.spec.ts
```

### Run with Headed Browser (See Actions in Real-Time)

```bash
npx playwright test repositories/tests/generated-scenarios.spec.ts --headed
```

### Run with Debug Mode (Step Through Test)

```bash
npx playwright test repositories/tests/generated-scenarios.spec.ts --debug
```

---

## 🔧 Testing the Healer (Self-Healing)

The Healer agent automatically detects and fixes test failures. To verify this capability:

Add to `.env`:

```env
INTENTIONAL_TEST_FAILURE=true
```

Then run the agent. The Healer will detect the failure and apply automatic repairs.

### Maximum Retry Limit

The agent automatically retries failing tests up to **3 times** before reporting failure.

**Expected behavior:**

```
Executor Attempt 1/3  → FAILED (Locator mismatch)
  ↓ Healer analyzes failure
Executor Attempt 2/3  → PASSED

Test Result: PASSED (After 2 attempts)
```

---

## 📁 Generated Artifacts

The agent generates and stores artifacts in:

### Application Maps
```
repositories/application-maps/app-map-*.json
```

### Generated Tests & Page Objects
```
repositories/tests/
├── generated-scenarios.spec.ts
└── page-objects/
    ├── LoginPage.ts
    ├── ProductsPage.ts
    ├── CartPage.ts
    └── CheckoutPage.ts
```

### Test Execution Artifacts
```
test-artifacts/
├── execution-report.json
├── screenshots/
├── traces/
└── videos/
```

### Scenario Repository
```
test-plans.xlsx
```

---

## 📊 Scenario Repository (Excel)

The system maintains a persistent scenario repository in `test-plans.xlsx`:

**Columns:**
- User Story
- Scenario (normalized description)
- Steps (action sequence)
- Application Map Name
- Created Date
- Execution Count
- Reuse Count

**Workflow:**
1. New User Story submitted
2. System checks Excel for exact match
3. If found → Reuse existing artifacts
4. If not found → Run full workflow
5. Save new scenario to Excel for future reuse

---

## 🏗️ Project Structure

```
Final Playwright Test Script Generator/
├── src/
│   ├── agents/
│   │   ├── orchestrator.ts      # Main controller
│   │   ├── explorer.ts          # Application discovery
│   │   ├── planner.ts           # Test planning
│   │   ├── generator.ts         # Code generation
│   │   ├── executor.ts          # Test execution
│   │   ├── healer.ts            # Failure analysis & healing
│   │   └── report.ts            # Report generation
│   ├── services/
│   │   ├── config.ts            # Configuration management
│   │   ├── logger.ts            # Structured logging
│   │   ├── llm.ts               # Gemini API integration
│   │   ├── excel.ts             # Excel repository
│   │   ├── filesystem.ts        # File management
│   │   └── playwright.ts        # Browser automation
│   ├── types.ts                 # TypeScript types
│   ├── index.ts                 # CLI entry point
│   └── server.ts                # Web server entry point
├── public/
│   └── index.html               # Web UI (single-page app)
├── repositories/
│   ├── application-maps/        # Discovered app maps (JSON)
│   └── tests/
│       ├── generated-scenarios.spec.ts
│       └── page-objects/
├── test-artifacts/
├── logs/
├── dist/                        # Compiled JavaScript
├── package.json
├── tsconfig.json
├── .env                         # Create from .env.example
└── README.md
```

---

## 🔐 Security Considerations

### API Key Protection
- Store `GOOGLE_API_KEY` in `.env` file only
- Never commit `.env` to version control
- Never log or expose the API key

### Credential Handling
- Test credentials stored in `.env`
- Never hardcoded in source code
- Never logged or exposed in reports

### SauceDemo Test Accounts

Legitimate test accounts (provided by SauceDemo):
```
standard_user                  - Normal login
locked_out_user                - Login failure testing
problem_user                   - Display issues
performance_glitch_user        - Slow performance
visual_user                    - Visual testing
error_user                     - Error testing

Password (all accounts): secret_sauce
```

---

## 🐛 Troubleshooting

### Issue: "GOOGLE_API_KEY is not configured"

**Solution:**
1. Create `.env` from `.env.example`
2. Add your API key: `GOOGLE_API_KEY=your_key_here`
3. Ensure `.env` is in the project root

### Issue: "Playwright browser not installed"

**Solution:**
```bash
npx playwright install chromium
```

### Issue: "Failed to connect to Gemini API"

**Solution:**
1. Verify API key in `.env` is correct
2. Check internet connection
3. Verify Gemini API is enabled in Google Cloud project
4. Visit [Google AI Studio](https://aistudio.google.com/app/apikey) to check key status

### Issue: "Port 3000 already in use"

**Solution:**
```bash
PORT=3001 npm start
# Then access at http://localhost:3001
```

### Issue: "TypeScript compilation error"

**Solution:**
```bash
npm run clean      # Remove dist/
npm run build      # Rebuild
npm start          # Restart
```

---

## 🚀 Complete Quick-Start Command Sequence

Starting from a fresh checkout:

```bash
# 1. Navigate to project
cd "Final Playwright Test Script Generator"

# 2. Install dependencies
npm install

# 3. Install Playwright browsers
npx playwright install chromium

# 4. Create .env from template
cp .env.example .env

# 5. Edit .env and add your Gemini API key
#    GOOGLE_API_KEY=your_actual_key_here

# 6. Build the project
npm run build

# 7. Start the application
npm start

# 8. Open browser to http://localhost:3000

# 9. Enter a User Story:
#    "Login with standard_user and verify products page loads"

# 10. Click "Run Autonomous Test"

# 11. Watch workflow progress and download artifacts
```

---

## 📝 Supported Scenarios

The system can handle:

- ✓ Login workflows with various credentials
- ✓ Error message validation
- ✓ Product catalog navigation
- ✓ Shopping cart operations
- ✓ Checkout flows
- ✓ Multi-step workflows
- ✓ Dynamic UI element detection
- ✓ Cross-browser testing (Chromium, Firefox, WebKit)
- ✓ Accessibility testing
- ✓ Performance monitoring

---

## 📄 License

MIT License

---

**Project**: Autonomous AI Test Automation Agent  
**Version**: 1.0.0  
**Last Updated**: 2024

## 📋 User Story Examples

The system supports various test scenarios:

### Login Validation
```
"Login to SauceDemo and verify products page loads"
```

### Add to Cart
```
"Add Sauce Labs Backpack to cart and verify cart badge shows 1"
```

### Checkout Flow
```
"Complete a full checkout flow and verify order confirmation"
```

### Locked Out User
```
"Login with locked_out_user and verify error message"
```

### Multi-Product Verification
```
"Add two different products to cart, open cart, and verify both are displayed"
```

## 🏗️ Project Structure

```
Final Playwright Test Script Generator/
├── src/
│   ├── agents/
│   │   ├── orchestrator.ts      # Main controller
│   │   ├── explorer.ts          # Application discovery
│   │   ├── planner.ts           # Test planning
│   │   ├── generator.ts         # Code generation
│   │   ├── executor.ts          # Test execution
│   │   ├── healer.ts            # Failure analysis & healing
│   │   └── report.ts            # Report generation
│   ├── services/
│   │   ├── logger.ts            # Structured logging
│   │   ├── config.ts            # Configuration management
│   │   ├── llm.ts               # Gemini API integration
│   │   ├── excel.ts             # Excel repository management
│   │   ├── filesystem.ts        # File and artifact management
│   │   └── playwright.ts        # Browser automation wrapper
│   ├── types.ts                 # TypeScript type definitions
│   └── index.ts                 # Application entry point
├── repositories/
│   ├── application-maps/        # Discovered app maps (JSON)
│   └── tests/
│       ├── generated-scenarios.spec.ts  # Generated tests
│       └── page-objects/        # POM classes
├── test-artifacts/              # Execution artifacts
│   ├── screenshots/
│   ├── traces/
│   ├── videos/
│   └── logs/
├── logs/                        # Application logs
├── test-plans.xlsx              # Test scenario repository
├── package.json
├── tsconfig.json
├── .env                         # Configuration (create from .env.example)
└── README.md
```

## 🔐 Security

### Credential Handling

- **Never expose** API keys, passwords, or credentials in:
  - Console logs or output
  - Excel files
  - Generated reports
  - Screenshots or trace metadata
  - Network logs

- **Credentials are stored in `.env`** and loaded at runtime
- **Environment variables** are never logged or exposed

### Default Test Credentials (SauceDemo)

```
Username: standard_user
Password: secret_sauce
```

Other test users:
- `locked_out_user` - Account that cannot login
- `problem_user` - Account with display issues
- `performance_glitch_user` - Slow loading account
- `visual_user` - Visual regression testing
- `error_user` - Error display testing

## 📊 Workflow

### Step-by-Step Execution

1. **Initialization**
   - Load environment configuration
   - Validate API keys and connectivity
   - Initialize all services and agents

2. **User Story Input**
   - System prompts user to enter a test scenario

3. **Repository Check**
   - Query Excel for existing scenarios
   - Check application map repository
   - Reuse if scenario already exists

4. **Application Exploration** (if new scenario)
   - Explorer Agent discovers application structure
   - Maps pages, workflows, and UI elements
   - Saves application map for future reuse

5. **Test Planning** (if new scenario)
   - Planner Agent creates detailed test steps
   - Defines assertions and expected outcomes
   - Saves test plan to Excel

6. **Code Generation**
   - Generator Agent creates Playwright test code
   - Implements Page Object Model pattern
   - Appends to master test file

7. **Test Execution**
   - Executor Agent runs the test in headed mode
   - Captures screenshots, traces, videos, logs
   - Records detailed step results

8. **Failure Handling** (if test fails)
   - Healer Agent performs root cause analysis
   - Classifies failure type (locator, assertion, timeout, etc.)
   - Recommends recovery strategy
   - Retries up to 3 times (max retry policy)

9. **Report Generation**
   - Report Agent creates comprehensive final report
   - Shows system connectivity, execution details
   - Displays test results and artifacts
   - Saves JSON report for future reference

## 🧠 Root Cause Analysis

The Healer Agent classifies failures as:

- **LOCATOR_FAILURE** → Re-explore app, update selectors
- **ASSERTION_FAILURE** → Review assertions, re-explore app
- **BUSINESS_LOGIC_FAILURE** → Replan test steps
- **TIMEOUT_FAILURE** → Increase waits, add synchronization
- **NETWORK_FAILURE** → Retry with resilience
- **FLAKY_FAILURE** → Add stability improvements
- **UNKNOWN_FAILURE** → Perform detailed analysis

## 📁 Repositories

### Application Maps Repository
- **Location**: `repositories/application-maps/`
- **Format**: JSON files
- **Content**: Discovered pages, elements, workflow sequences
- **Reuse**: Automatically loaded when scenario is reused

### Test Scripts Repository
- **Location**: `repositories/tests/generated-scenarios.spec.ts`
- **Format**: Playwright test code
- **Content**: All generated test scenarios
- **Behavior**: Tests are appended, never replaced

### Page Object Model
- **Location**: `repositories/tests/page-objects/`
- **Files**: `LoginPage.ts`, `ProductsPage.ts`, `CartPage.ts`, etc.
- **Reuse**: Shared across all test scenarios
- **Updates**: Healer Agent updates locators here

### Excel Repository
- **File**: `test-plans.xlsx`
- **Columns**:
  - User Story
  - Scenario
  - Steps
  - Application Map Name
  - Created Date
  - Execution Count
  - Reuse Count

## 🎨 Features

### Supported Browsers
- ✅ Chromium
- ✅ Firefox
- ✅ WebKit
- ✅ Edge (Chromium-based)

### Test Artifacts Captured
- 📸 Screenshots (per step and final state)
- 📹 Videos (full execution)
- 🔍 Traces (DOM snapshots, network, timings)
- 📝 Logs (console, execution, network)
- 🗺️ Application Maps (workflow and elements)

### Execution Reports
- Connection status (LLM, MCP)
- Agent execution details
- Step-by-step results
- Failure analysis with root causes
- Retry summary
- Final outcome

## ⚙️ Configuration

### Environment Variables

```env
# Required
GOOGLE_API_KEY=                 # Your Gemini API key
GEMINI_MODEL=gemini-2.0-flash   # Gemini model to use

# Optional (defaults provided)
PLAYWRIGHT_MCP_URL=http://localhost:8080
APP_URL=https://www.saucedemo.com
DEFAULT_USERNAME=standard_user
DEFAULT_PASSWORD=secret_sauce
LOG_LEVEL=info
LOG_DIR=logs
```

## 📝 Logging

- **Log Files**: Saved in `logs/` directory
- **Log Level**: INFO (shows key events)
- **Console Output**: Real-time execution feedback
- **Timestamped Logs**: All entries include ISO timestamp
- **No Credentials Logged**: API keys and passwords never appear in logs

## 🔄 Knowledge Reuse

The system implements intelligent repository-driven behavior:

1. User enters story → System analyzes it
2. Check Excel for matching scenario
3. Check app map repository for matching workflows
4. Check test repository for matching tests

**Result**:
- ✓ **MATCH FOUND** → Reuse existing test (increment reuse count)
- ✗ **NO MATCH** → Generate new scenario (add to repositories)

This ensures:
- Faster test execution through reuse
- Consistent test behavior
- Reduced redundant exploration
- Tracked execution metrics

## 🚨 Error Handling

- **Maximum Retries**: 3 attempts per scenario
- **No Infinite Loops**: Explicit retry limit enforcement
- **Graceful Degradation**: Falls back to default implementations if LLM fails
- **Comprehensive Logging**: Every error is logged with context
- **Recovery Strategies**: Healer Agent provides intelligent fixes

## 📊 Output Example

```
==================================================
Autonomous Test Automation Final Report
==================================================

📡 SYSTEM CONNECTIVITY STATUS
  LLM Connection:  ✓ Connected
  LLM Model:       gemini-2.0-flash
  MCP Connection:  ✓ Connected

🧪 TEST EXECUTION SUMMARY
  User Story:      Checkout and confirm order
  Scenario:        Checkout Order
  Browser:         chromium
  Test Duration:   12500ms

✅ TEST RESULTS
  Final Outcome:   ✓ PASSED
  Passed Tests:    1
  Failed Tests:    0

📁 GENERATED FILES
  • repositories/application-maps/app-map-*.json
  • repositories/tests/generated-scenarios.spec.ts
  • test-artifacts/execution-report.json

==================================================
STATUS: ✓ SUCCESS
==================================================
```

## 🛠️ Development

### Build
```bash
npm run build
```

### Development Mode (with ts-node)
```bash
npm run dev
```

### Clean Build
```bash
npm run clean
```

## 📚 Mandatory Scenario Support

The framework automatically supports these scenarios:

1. ✅ **Login Validation**
   - Login with standard_user
   - Verify products page loads
   - Verify at least one product displays

2. ✅ **Add Product to Cart**
   - Add a product to cart
   - Verify cart badge count increases

3. ✅ **Cart Content Validation**
   - Add two different products
   - Open cart
   - Verify both products appear

4. ✅ **Checkout Flow**
   - Login → Add product → Checkout
   - Complete order
   - Verify confirmation message

5. ✅ **Locked Out User**
   - Login with locked_out_user
   - Verify correct error message

## 🎓 Best Practices

1. **Specific User Stories**: More specific stories generate better tests
   - ✅ "Add Sauce Labs Backpack to cart"
   - ❌ "Test the application"

2. **Credential Protection**: Never hardcode credentials
   - Use .env file (git-ignored)
   - Never commit .env to repository

3. **Regular Reuse Metrics**: Check Excel for test efficiency
   - High reuse count = efficient repo
   - Low reuse count = may indicate too many variations

4. **Artifact Management**: Monitor test-artifacts/ size
   - Screenshots, traces, videos consume space
   - Archive old artifacts periodically

## 📞 Support

For issues or questions:

1. Check `logs/execution-*.log` for detailed errors
2. Review `test-artifacts/execution-report.json` for test results
3. Inspect page objects in `repositories/tests/page-objects/`
4. Review generated tests in `repositories/tests/generated-scenarios.spec.ts`

## 📄 License

MIT

## 🙏 Acknowledgments

Built with:
- Playwright for browser automation
- Google Gemini API for AI reasoning
- XLSX for Excel management
- TypeScript for type safety
"# Autonomous-Playwright-Test-Script-Generator" 
