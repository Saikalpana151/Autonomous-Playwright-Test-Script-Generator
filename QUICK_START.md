# 🚀 QUICK START GUIDE - 5 Minutes to Automation

Follow these steps to get the Autonomous AI Test Automation Agent running in 5 minutes.

## Step 1: Install Dependencies (1 minute)

```bash
cd "Final Playwright Test Script Generator"
npm install
```

Expected output:
```
added 500+ packages in ~45 seconds
```

## Step 2: Get Your Gemini API Key (2 minutes)

### Quick Method (Google AI Studio):
1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Click "Create API key in new Google Cloud project"
4. Copy the API key

### Keep your API key safe - you'll need it in step 3!

## Step 3: Configure Environment (1 minute)

Edit the `.env` file in the project root:

```bash
# Open the .env file and find this line:
GOOGLE_API_KEY=your_google_api_key_here

# Replace it with your actual API key:
GOOGLE_API_KEY=AIzaSyD_xPW8vKqhR8fPZ_abc123def456
```

**That's it!** All other settings have defaults.

## Step 4: Run the Application (1 minute)

```bash
npm start --headed
```

The system will:
1. Load configuration ✓
2. Validate Gemini API connection ✓
3. Prompt for user story input (YOU type here)
4. Run autonomously ✓
5. Show results ✓

## Step 5: Enter Your Test Scenario

When you see this prompt:
```
📋 Enter your User Story: 
```

Type one of these examples:

### Example 1 (Recommended for first run):
```
Login to SauceDemo and verify products are displayed
```

### Example 2:
```
Add a product to cart and verify the cart badge shows 1
```

### Example 3:
```
Complete a full checkout and verify the order confirmation message
```

### Example 4:
```
Login with locked_out_user and verify error message appears
```

Press **Enter** to start the automation!

## What Happens Next

The system will:

1. **Explore** the application (5-10 seconds)
   - Discovers pages and elements
   
2. **Plan** the test (3-5 seconds)
   - Creates a detailed test plan
   
3. **Generate** the test code (2-3 seconds)
   - Creates Playwright test
   - Saves for future reuse
   
4. **Execute** the test (10-20 seconds)
   - Runs in headed Chromium browser
   - You can watch it execute
   
5. **Generate Report** (2-3 seconds)
   - Detailed results
   - Artifacts saved

## You'll See Output Like This

```
==================================================
LLM Connection Status: Connected Successfully
Model: gemini-2.0-flash
==================================================

🤖 Invoking Explorer Agent...
✓ Exploration completed
✓ Application Map: app-map-1692057600000

🤖 Invoking Planner Agent...
✓ Test Plan Created: Login Validation

🤖 Invoking Generator Agent...
✓ Test code generated and appended

🤖 Invoking Executor Agent...
✓ Test execution passed

✅ FINAL RESULTS
Outcome: ✓ SUCCESS
Duration: 12.5 seconds
```

## Files Generated

After running, these files are created:

```
logs/                                  # Execution logs
repositories/
  ├── application-maps/app-map-*.json  # Discovered app
  └── tests/
      ├── generated-scenarios.spec.ts  # Generated test
      └── page-objects/                # Page objects
test-artifacts/
  ├── screenshots/                     # Test screenshots
  ├── traces/                          # Playwright traces
  └── execution-report.json            # Results
test-plans.xlsx                        # Scenario repository
```

## Troubleshooting

### "GOOGLE_API_KEY is not configured"
- Make sure you edited the `.env` file correctly
- No spaces around the `=` sign
- No quotes around the key

### "Cannot find module"
```bash
npm install
npm run build
```

### "Timeout waiting for selector"
- Internet might be slow
- Try again in a few seconds
- Check that saucedemo.com is accessible

### "Playwright browsers not installed"
```bash
npx playwright install
```

## Next Steps

✅ **You're Done!** The basic setup is complete.

### Want to Run More Tests?
```bash
npm start --headed
```
Then enter a different user story.

### Want to See Previous Test Plans?
Open `test-plans.xlsx` - your scenarios are saved there!

### Want to Use Your Own Tests?
Edit `src/agents/executor.ts` to add custom scenarios.

### Want to Deploy to Cloud?
See `SETUP.md` for Docker and CI/CD examples.

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/` | All source code |
| `logs/` | Execution logs |
| `repositories/` | Saved tests and maps |
| `test-artifacts/` | Screenshots and traces |

## Important Notes

⚠️ **Security**
- Your `.env` file has your API key - keep it safe
- Never commit `.env` to Git
- It's in `.gitignore` by default

📱 **API Usage**
- Gemini has a free tier with rate limits
- Check your usage at: https://console.cloud.google.com/
- No charges for small-scale testing

🎯 **Best Practices**
- Be specific with user stories
  - ✅ "Add Sauce Labs Backpack to cart"
  - ❌ "Test something"
- Each user story runs independently
- Results are saved for reuse

## Real-World Example

**User Story:**
```
Complete a full checkout flow with John Doe and verify order confirmation
```

**System Does:**
1. Explores SauceDemo
2. Creates test plan for checkout
3. Generates Playwright code
4. Logs in as standard_user
5. Adds product to cart
6. Completes checkout with details
7. Verifies success message
8. Saves test for reuse
9. Generates report

**Total Time:** ~45 seconds

## Support

📖 **Full Documentation**: See `README.md`
⚙️ **Setup Guide**: See `SETUP.md`
📋 **File Inventory**: See `FILE_INVENTORY.md`
✅ **Completion Report**: See `PROJECT_COMPLETION_SUMMARY.md`

---

## 🎊 You're All Set!

That's it! You now have a fully functional autonomous AI test automation agent.

Run it with:
```bash
npm start --headed
```

Happy testing! 🚀
