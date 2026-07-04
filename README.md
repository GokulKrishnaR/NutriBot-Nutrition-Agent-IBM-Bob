# 🥗 NutriBot — AI Nutrition Agent

> **IBM Watsonx.ai powered nutrition coach** built with Python Flask, IBM Granite models, Bootstrap 5, and Chart.js. Features chat UI, nutrition dashboard, meal planner, BMI calculator, and family profile support.

---

## 📋 Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [IBM Watsonx Setup](#ibm-watsonx-setup)
- [Customising the Agent](#customising-the-agent)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Screenshots](#screenshots)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Chat** | Real-time chat with IBM Granite models via Watsonx.ai |
| 📊 **Nutrition Dashboard** | TDEE, BMR, BMI, macro distribution with Chart.js |
| 🗓️ **AI Meal Planner** | 1/3/7-day personalised meal plans |
| ⚖️ **BMI Calculator** | Visual BMI scale with health advice |
| 👨‍👩‍👧 **Family Profiles** | Multi-member family nutrition recommendations |
| 🌿 **Indian Foods First** | Prioritises traditional Indian cuisine |
| 🌙 **Dark Mode** | Full dark/light theme with local storage persistence |
| 📱 **Mobile Responsive** | Fully responsive Bootstrap 5 layout |
| 🔒 **Secure Config** | IBM API Key stored in `.env`, never exposed |

---

## 📁 Project Structure

```
nutrition-agent/
├── app.py                    # Flask backend + Watsonx integration + AGENT_INSTRUCTIONS
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variable template
├── .env                      # Your actual credentials (DO NOT COMMIT)
├── .gitignore                # Excludes .env, __pycache__, etc.
│
├── templates/
│   └── index.html            # Single-page frontend (Jinja2)
│
└── static/
    ├── css/
    │   └── style.css         # Custom styles + dark mode + animations
    └── js/
        └── app.js            # Frontend logic (Chat, Charts, BMI, Meals, Family)
```

---

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- IBM Cloud account (free tier available)
- IBM Watsonx.ai project

### 1. Clone & setup environment

```bash
git clone <your-repo-url>
cd nutrition-agent

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (macOS / Linux)
source venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure credentials

```bash
# Copy the template
cp .env.example .env

# Edit .env and fill in your credentials
notepad .env         # Windows
nano .env            # macOS / Linux
```

Your `.env` should look like:

```env
IBM_API_KEY=your_actual_ibm_cloud_api_key
WATSONX_PROJECT_ID=your_watsonx_project_id
WATSONX_URL=https://us-south.ml.cloud.ibm.com
FLASK_SECRET_KEY=any-random-secure-string
```

### 4. Run the application

```bash
python app.py
```

Open your browser at **http://localhost:5000**

> **Demo Mode**: If API credentials are not configured, the app runs in demo mode with sample responses — perfect for UI testing.

---

## 🔑 IBM Watsonx Setup

### Step 1: Create IBM Cloud account
1. Go to [cloud.ibm.com](https://cloud.ibm.com) and sign up (free tier available)
2. Navigate to **Manage → Access (IAM) → API Keys**
3. Click **Create an IBM Cloud API key** and copy it

### Step 2: Create Watsonx.ai project
1. Go to [dataplatform.cloud.ibm.com](https://dataplatform.cloud.ibm.com)
2. Click **New Project → Create an empty project**
3. Copy the **Project ID** from project settings

### Step 3: Enable Watsonx.ai service
1. In your IBM Cloud account, go to **Catalog → AI / Machine Learning**
2. Add **Watson Machine Learning** service to your project
3. Ensure your region matches `WATSONX_URL` in `.env`

### Available Granite Models

| Model ID | Best For |
|---|---|
| `ibm/granite-3-8b-instruct` | Best quality (recommended) |
| `ibm/granite-3-2b-instruct` | Faster responses |
| `ibm/granite-13b-instruct-v2` | Older, widely available |

Change the model in `.env`:
```env
WATSONX_MODEL_ID=ibm/granite-3-8b-instruct
```

---

## 🎛️ Customising the Agent

All agent behaviour is controlled by the `AGENT_INSTRUCTIONS` dictionary at the **top of `app.py`** (lines 21–91). No AI knowledge required!

```python
AGENT_INSTRUCTIONS = {
    # ── Change the bot's name ────────────────────────────────────
    "name": "NutriBot",          # ← Change to "HealthGuru", "DietCoach", etc.

    # ── Set personality ─────────────────────────────────────────
    "persona": "You are NutriBot, a warm...",

    # ── Change default diet type ─────────────────────────────────
    "default_diet_type": "balanced",
    # Options: balanced | vegetarian | vegan | keto | weight_loss

    # ── Toggle Indian food focus ─────────────────────────────────
    "emphasise_indian_foods": True,   # Set False for global foods

    # ── Customise Indian food context ────────────────────────────
    "indian_food_context": "Prioritise dal, roti, sabzi...",

    # ── Communication tone ───────────────────────────────────────
    "tone": "friendly_professional",
    "use_emojis": True,

    # ── Safety rules ─────────────────────────────────────────────
    "safety_rules": [
        "Always recommend consulting a dietitian...",
        # Add your own rules here
    ],
}
```

### Common Customisations

**Make it a keto specialist:**
```python
"default_diet_type": "keto",
"persona": "You are KetoBot, an expert in ketogenic nutrition...",
"emphasise_indian_foods": False,
```

**Add a safety rule:**
```python
"safety_rules": [
    ...existing rules...,
    "Always recommend at least 30 minutes of daily exercise.",
]
```

**Change to a clinical tone:**
```python
"tone": "clinical",
"use_emojis": False,
"language_style": "Use precise medical terminology with clear explanations.",
```

---

## 📡 API Reference

All endpoints accept/return JSON.

### `POST /api/chat`
Chat with the AI nutrition agent.

**Request:**
```json
{
  "message": "What should I eat for breakfast?",
  "history": [{"role": "user", "content": "..."}, ...],
  "profile": {
    "name": "Priya", "age": 28, "gender": "female",
    "weight": 65, "height": 162, "activity": "moderate",
    "diet_type": "vegetarian", "goals": "weight loss"
  }
}
```

**Response:**
```json
{
  "response": "For a healthy vegetarian breakfast...",
  "mode": "watsonx",
  "timestamp": "2025-01-15T10:30:00",
  "model": "ibm/granite-3-8b-instruct"
}
```

---

### `POST /api/bmi`
Calculate BMI.

**Request:** `{ "weight": 70, "height": 170 }`

**Response:** `{ "bmi": 24.2, "category": "Normal weight", "advice": "..." }`

---

### `POST /api/tdee`
Calculate TDEE, BMR, and macro targets.

**Request:**
```json
{ "weight": 70, "height": 170, "age": 28, "gender": "female",
  "activity": "moderate", "diet_type": "balanced" }
```

**Response:**
```json
{
  "bmr": 1556, "tdee": 2411, "weight_loss": 1911, "weight_gain": 2911,
  "macros": { "carbs_g": 301, "protein_g": 120, "fat_g": 80 }
}
```

---

### `POST /api/meal-plan`
Generate AI meal plan.

**Request:** `{ "days": 7, "goal": "weight loss", "profile": {...} }`

---

### `POST /api/family-nutrition`
Get family nutrition recommendations.

**Request:** `{ "members": [{"name": "Dad", "age": 50, "gender": "male", "diet": "balanced", "goals": "heart health"}, ...] }`

---

### `GET /api/health`
Check API and Watsonx connection status.

---

## 🚢 Deployment

### Option 1: Local (Development)

```bash
python app.py
```

### Option 2: Gunicorn (Production)

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### Option 3: Docker

Create `Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "app:app"]
```

Build and run:
```bash
docker build -t nutribot .
docker run -p 5000:5000 --env-file .env nutribot
```

### Option 4: IBM Code Engine

```bash
# Install IBM Cloud CLI + Code Engine plugin first
ibmcloud ce project create --name nutribot-project
ibmcloud ce app create \
  --name nutribot \
  --image your-registry/nutribot:latest \
  --env-from-secret nutribot-secrets \
  --port 5000
```

### Option 5: Railway / Render / Fly.io

Set environment variables in the platform dashboard:
- `IBM_API_KEY`
- `WATSONX_PROJECT_ID`
- `WATSONX_URL`
- `FLASK_SECRET_KEY`

---

## 🔒 Security Best Practices

1. **Never commit `.env`** — add it to `.gitignore`
2. Use **environment variables** in all production platforms
3. Set `FLASK_DEBUG=False` in production
4. Use a **strong, random** `FLASK_SECRET_KEY`
5. Consider adding **rate limiting** (`flask-limiter`) for public deployments

Create `.gitignore`:
```
.env
__pycache__/
*.pyc
venv/
.venv/
*.egg-info/
dist/
.DS_Store
```

---

## 🛠️ Troubleshooting

| Issue | Solution |
|---|---|
| `IBM_API_KEY not set` | Copy `.env.example` to `.env` and fill in credentials |
| `401 Unauthorized` | Verify your IBM API Key is valid and active |
| `404 model not found` | Check `WATSONX_MODEL_ID` — use exact model ID from IBM catalog |
| `Import error: ibm_watsonx_ai` | Run `pip install ibm-watsonx-ai==1.1.2` |
| Charts not loading | Ensure internet access for CDN (Chart.js, Bootstrap) |
| Dark mode not saving | Enable localStorage in browser settings |

---

## 📝 License

MIT License — free for personal and commercial use.

---

*Built with ❤️ using IBM Watsonx.ai, Granite Models, Python Flask, and Bootstrap 5*
