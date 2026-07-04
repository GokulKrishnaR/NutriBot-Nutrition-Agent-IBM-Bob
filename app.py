"""
=============================================================================
  NutriAgent — IBM Watsonx.ai Powered Nutrition Assistant
  Backend: Flask + ibm-watsonx-ai SDK (Granite models)
=============================================================================
"""

import os
import json
import re
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from ibm_watsonx_ai import Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

# ─────────────────────────────────────────────────────────────────────────────
#  AGENT INSTRUCTIONS — Customise everything here
# ─────────────────────────────────────────────────────────────────────────────
AGENT_INSTRUCTIONS = {
    # ── Identity ─────────────────────────────────────────────────────────────
    "name": "NutriBot",
    "persona": (
        "You are NutriBot, a warm, knowledgeable, and encouraging AI nutrition "
        "coach. You speak in a friendly yet professional tone. You always motivate "
        "users to make healthier choices without being preachy or judgmental."
    ),

    # ── Diet Specialisation ───────────────────────────────────────────────────
    # Options: "balanced", "vegetarian", "vegan", "keto", "mediterranean",
    #          "indian_traditional", "diabetic_friendly", "weight_loss"
    "default_diet_type": "balanced",
    "emphasise_indian_foods": True,   # Set False to use global food database

    # ── Indian Food Preferences ───────────────────────────────────────────────
    "indian_food_context": (
        "Prioritise traditional Indian foods such as dal, sabzi, roti, rice, "
        "idli, dosa, poha, upma, khichdi, curd, paneer, sprouts, seasonal "
        "vegetables, and regional staples. Suggest spices like turmeric, cumin, "
        "coriander, and ginger for their health benefits. Include both North and "
        "South Indian options. Suggest street-food healthier alternatives when "
        "relevant (e.g., baked samosa, grilled tikka). Respect vegetarian and "
        "Jain dietary constraints when specified."
    ),

    # ── Tone & Communication Style ────────────────────────────────────────────
    "tone": "friendly_professional",  # friendly_professional | clinical | motivational
    "use_emojis": True,
    "language_style": (
        "Use simple, clear language. Avoid excessive medical jargon. "
        "When technical terms are needed, briefly explain them. "
        "Keep responses concise but thorough. Use bullet points for lists."
    ),

    # ── Safety & Disclaimers ──────────────────────────────────────────────────
    "safety_rules": [
        "Always recommend consulting a registered dietitian or doctor before "
        "making major dietary changes, especially for medical conditions.",
        "Never diagnose medical conditions or prescribe medication.",
        "For users with diabetes, hypertension, kidney disease, or pregnancy, "
        "always add a caution to consult their healthcare provider.",
        "Do not provide advice that could lead to unhealthy extreme restriction "
        "(below 1200 kcal/day for women, 1500 kcal/day for men).",
        "If a user mentions eating disorders, redirect them compassionately to "
        "professional help rather than providing diet plans.",
    ],

    # ── Response Structure ────────────────────────────────────────────────────
    "response_format": (
        "Structure your responses clearly. Use headings with ** for sections. "
        "For meal plans, use a table or numbered list format. "
        "Always end nutrition advice with a brief motivational note."
    ),

    # ── Capabilities ──────────────────────────────────────────────────────────
    "capabilities": [
        "Personalised daily nutrition plans",
        "Calorie and macro-nutrient analysis",
        "Healthy meal suggestions (Indian & global)",
        "Family diet recommendations",
        "Weight management guidance",
        "BMI interpretation and advice",
        "Hydration and supplement tips",
        "Grocery shopping lists",
        "Meal prep suggestions",
        "Festive / seasonal diet tips",
    ],
}
# ─────────────────────────────────────────────────────────────────────────────
#  END AGENT INSTRUCTIONS
# ─────────────────────────────────────────────────────────────────────────────

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "nutriagent-dev-secret")
CORS(app)

# ── Watsonx client initialisation ────────────────────────────────────────────
_watsonx_model: ModelInference | None = None

def get_watsonx_model() -> ModelInference | None:
    """Lazy-initialise and return the Watsonx ModelInference instance."""
    global _watsonx_model
    if _watsonx_model is not None:
        return _watsonx_model

    api_key    = os.getenv("IBM_API_KEY")
    project_id = os.getenv("WATSONX_PROJECT_ID")
    url        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").rstrip("/")
    model_id   = os.getenv("WATSONX_MODEL_ID", "meta-llama/llama-3-3-70b-instruct")

    if not api_key or not project_id:
        app.logger.warning(
            "IBM_API_KEY or WATSONX_PROJECT_ID not set — running in demo mode."
        )
        return None

    try:
        credentials = Credentials(url=url, api_key=api_key)
        params = {
            GenParams.MAX_NEW_TOKENS: int(os.getenv("MAX_NEW_TOKENS", 1024)),
            GenParams.TEMPERATURE:    float(os.getenv("TEMPERATURE", 0.7)),
            GenParams.TOP_P:          float(os.getenv("TOP_P", 0.9)),
            GenParams.STOP_SEQUENCES: ["Human:", "User:"],
        }
        _watsonx_model = ModelInference(
            model_id=model_id,
            params=params,
            credentials=credentials,
            project_id=project_id,
        )
        app.logger.info(f"Watsonx model '{model_id}' initialised successfully.")
    except Exception as exc:
        app.logger.error(f"Failed to initialise Watsonx model: {exc}")
        _watsonx_model = None

    return _watsonx_model


# ── Prompt builder ───────────────────────────────────────────────────────────
def build_system_prompt(user_profile: dict | None = None) -> str:
    ai = AGENT_INSTRUCTIONS
    safety = "\n".join(f"- {r}" for r in ai["safety_rules"])
    capabilities = "\n".join(f"- {c}" for c in ai["capabilities"])

    indian_section = ""
    if ai.get("emphasise_indian_foods"):
        indian_section = f"\n\n**Indian Food Context:**\n{ai['indian_food_context']}"

    profile_section = ""
    if user_profile:
        profile_section = f"""
\n**Current User Profile:**
- Name: {user_profile.get('name', 'User')}
- Age: {user_profile.get('age', 'N/A')}
- Gender: {user_profile.get('gender', 'N/A')}
- Weight: {user_profile.get('weight', 'N/A')} kg
- Height: {user_profile.get('height', 'N/A')} cm
- Activity Level: {user_profile.get('activity', 'N/A')}
- Diet Type: {user_profile.get('diet_type', ai['default_diet_type'])}
- Health Goals: {user_profile.get('goals', 'general wellness')}
- Medical Conditions: {user_profile.get('conditions', 'none')}
- Allergies: {user_profile.get('allergies', 'none')}
"""

    return f"""You are {ai['name']}.

{ai['persona']}

**Communication Style:**
{ai['language_style']}

**Response Format:**
{ai['response_format']}

**Your Capabilities:**
{capabilities}

**Safety Rules (always follow):**
{safety}
{indian_section}
{profile_section}
Respond as {ai['name']} directly. Do not include "AI:" or "Assistant:" prefixes."""


def build_prompt(user_message: str, chat_history: list, user_profile: dict | None) -> str:
    system = build_system_prompt(user_profile)
    history_text = ""
    for msg in chat_history[-6:]:   # last 3 exchanges for context
        role    = "User"    if msg["role"] == "user"      else AGENT_INSTRUCTIONS["name"]
        history_text += f"{role}: {msg['content']}\n"

    return (
        f"{system}\n\n"
        f"Conversation so far:\n{history_text}"
        f"User: {user_message}\n"
        f"{AGENT_INSTRUCTIONS['name']}:"
    )


# ── Demo-mode fallback ───────────────────────────────────────────────────────
DEMO_RESPONSES = [
    (
        "**Welcome to NutriBot! 🥗**\n\n"
        "I'm running in **demo mode** (no IBM API key configured).\n\n"
        "To enable full AI responses:\n"
        "1. Copy `.env.example` to `.env`\n"
        "2. Add your `IBM_API_KEY` and `WATSONX_PROJECT_ID`\n"
        "3. Restart the server\n\n"
        "Meanwhile, ask me anything about nutrition and I'll give you a sample response!"
    ),
    (
        "**Sample Balanced Meal Plan 🍽️**\n\n"
        "**Breakfast:** Poha with vegetables + 1 glass warm water with lemon\n"
        "**Mid-morning:** 1 banana + 5 soaked almonds\n"
        "**Lunch:** 2 rotis + dal + sabzi + curd + salad\n"
        "**Evening:** Green tea + roasted chana\n"
        "**Dinner:** Khichdi or vegetable soup + 1 roti\n\n"
        "*~1800 kcal | Protein: 65g | Carbs: 240g | Fat: 45g*\n\n"
        "💪 Small consistent steps lead to big healthy changes!"
    ),
]
_demo_idx = 0

def demo_response() -> str:
    global _demo_idx
    resp = DEMO_RESPONSES[_demo_idx % len(DEMO_RESPONSES)]
    _demo_idx += 1
    return resp


# ── Nutrition utilities ───────────────────────────────────────────────────────
def calculate_bmi(weight_kg: float, height_cm: float) -> dict:
    height_m = height_cm / 100
    bmi      = round(weight_kg / (height_m ** 2), 1)
    if bmi < 18.5:
        category, advice = "Underweight", "Consider increasing calorie intake with nutrient-dense foods."
    elif bmi < 25:
        category, advice = "Normal weight", "Great! Maintain your balanced diet and active lifestyle."
    elif bmi < 30:
        category, advice = "Overweight", "Focus on portion control and increasing physical activity."
    else:
        category, advice = "Obese", "Consult a healthcare provider for a personalised weight-loss plan."
    return {"bmi": bmi, "category": category, "advice": advice}


def calculate_tdee(weight: float, height: float, age: int, gender: str, activity: str) -> dict:
    """Harris-Benedict BMR → TDEE"""
    if gender.lower() in ("male", "m"):
        bmr = 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age)
    else:
        bmr = 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age)

    multipliers = {
        "sedentary":   1.2,
        "light":       1.375,
        "moderate":    1.55,
        "active":      1.725,
        "very_active": 1.9,
    }
    multiplier = multipliers.get(activity.lower(), 1.55)
    tdee = round(bmr * multiplier)
    return {
        "bmr":            round(bmr),
        "tdee":           tdee,
        "weight_loss":    tdee - 500,
        "weight_gain":    tdee + 500,
        "maintenance":    tdee,
    }


def macro_split(calories: int, diet_type: str = "balanced") -> dict:
    splits = {
        "balanced":    (0.50, 0.20, 0.30),
        "keto":        (0.05, 0.30, 0.65),
        "vegetarian":  (0.55, 0.20, 0.25),
        "vegan":       (0.60, 0.18, 0.22),
        "weight_loss": (0.45, 0.30, 0.25),
    }
    c_pct, p_pct, f_pct = splits.get(diet_type, splits["balanced"])
    return {
        "carbs_g":   round((calories * c_pct) / 4),
        "protein_g": round((calories * p_pct) / 4),
        "fat_g":     round((calories * f_pct) / 9),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Flask Routes
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html", agent_name=AGENT_INSTRUCTIONS["name"])


# ── Chat endpoint ─────────────────────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    data         = request.get_json(force=True)
    user_message = data.get("message", "").strip()
    chat_history = data.get("history", [])
    user_profile = data.get("profile")

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    model = get_watsonx_model()
    if model is None:
        return jsonify({
            "response": demo_response(),
            "mode":     "demo",
            "timestamp": datetime.now().isoformat(),
        })

    try:
        prompt   = build_prompt(user_message, chat_history, user_profile)
        result   = model.generate_text(prompt=prompt)
        response = result.strip() if isinstance(result, str) else str(result)
    except Exception as exc:
        app.logger.error(f"Watsonx generation error: {exc}")
        return jsonify({"error": f"Model error: {str(exc)}"}), 500

    return jsonify({
        "response":  response,
        "mode":      "watsonx",
        "timestamp": datetime.now().isoformat(),
        "model":     os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-8b-instruct"),
    })


# ── BMI endpoint ──────────────────────────────────────────────────────────────
@app.route("/api/bmi", methods=["POST"])
def bmi():
    data = request.get_json(force=True)
    try:
        weight = float(data["weight"])
        height = float(data["height"])
    except (KeyError, ValueError):
        return jsonify({"error": "Provide valid weight (kg) and height (cm)"}), 400

    result = calculate_bmi(weight, height)
    return jsonify(result)


# ── TDEE / Calorie endpoint ───────────────────────────────────────────────────
@app.route("/api/tdee", methods=["POST"])
def tdee():
    data = request.get_json(force=True)
    try:
        weight   = float(data["weight"])
        height   = float(data["height"])
        age      = int(data["age"])
        gender   = data["gender"]
        activity = data.get("activity", "moderate")
        diet_type = data.get("diet_type", AGENT_INSTRUCTIONS["default_diet_type"])
    except (KeyError, ValueError):
        return jsonify({"error": "Provide weight, height, age, gender, activity"}), 400

    calorie_data = calculate_tdee(weight, height, age, gender, activity)
    macros       = macro_split(calorie_data["tdee"], diet_type)
    return jsonify({**calorie_data, "macros": macros, "diet_type": diet_type})


# ── Meal plan endpoint ────────────────────────────────────────────────────────
@app.route("/api/meal-plan", methods=["POST"])
def meal_plan():
    data         = request.get_json(force=True)
    user_profile = data.get("profile", {})
    goal         = data.get("goal", "balanced nutrition")
    days         = min(int(data.get("days", 1)), 7)

    ai = AGENT_INSTRUCTIONS

    # Build a compact profile line to keep the prompt short
    profile_line = ""
    if user_profile and user_profile.get("name"):
        profile_line = (
            f"User: {user_profile.get('name')}, "
            f"age {user_profile.get('age','?')}, "
            f"{user_profile.get('gender','?')}, "
            f"diet: {user_profile.get('diet_type', ai['default_diet_type'])}, "
            f"goal: {user_profile.get('goals', goal)}. "
        )

    indian_hint = (
        "Prioritise traditional Indian foods (dal, roti, rice, idli, sabzi, curd, paneer, sprouts)."
        if ai.get("emphasise_indian_foods") else ""
    )

    # Keep the prompt concise to avoid context-window overflow on multi-day plans
    prompt_text = (
        f"You are {ai['name']}, a friendly AI nutrition coach. "
        f"{profile_line}"
        f"Create a detailed {days}-day Indian meal plan for the goal: {goal}. "
        f"{indian_hint} "
        f"For each day include: Breakfast, Mid-morning snack, Lunch, Evening snack, Dinner. "
        f"Show approximate calories per meal and a daily total. "
        f"Format clearly with Day headings.\n\n"
        f"{ai['name']}:"
    )

    model = get_watsonx_model()
    if model is None:
        sample = (
            "**7-Day Sample Meal Plan 🗓️**\n\n"
            "**Day 1**\n"
            "- 🌅 Breakfast: Idli (3) + Sambar + Coconut Chutney (~320 kcal)\n"
            "- 🍎 Mid-morning: 1 Apple + 5 Walnuts (~180 kcal)\n"
            "- 🍛 Lunch: Brown rice + Rajma curry + Salad + Curd (~550 kcal)\n"
            "- ☕ Evening: Masala chai + Roasted chana (~120 kcal)\n"
            "- 🌙 Dinner: 2 Rotis + Palak paneer + Raita (~480 kcal)\n"
            "- **Daily Total: ~1650 kcal**\n\n"
            "_Configure IBM API key for a fully personalised AI-generated plan._"
        )
        return jsonify({"plan": sample, "mode": "demo"})

    try:
        plan = model.generate_text(prompt=prompt_text)
        plan = plan.strip() if isinstance(plan, str) else ""
        if not plan:
            return jsonify({"error": "The model returned an empty response. Please try again."}), 500
        return jsonify({"plan": plan, "mode": "watsonx"})
    except Exception as exc:
        app.logger.error(f"Meal plan generation error: {exc}")
        return jsonify({"error": str(exc)}), 500


# ── Family profile nutrition endpoint ─────────────────────────────────────────
@app.route("/api/family-nutrition", methods=["POST"])
def family_nutrition():
    data    = request.get_json(force=True)
    members = data.get("members", [])

    if not members:
        return jsonify({"error": "Provide at least one family member"}), 400

    ai = AGENT_INSTRUCTIONS
    members_text = "\n".join(
        f"- {m.get('name', 'Member')}: Age {m.get('age', '?')}, "
        f"Gender {m.get('gender', '?')}, "
        f"Diet {m.get('diet', ai['default_diet_type'])}, "
        f"Goals: {m.get('goals', 'general health')}"
        for m in members
    )

    indian_hint = (
        "Use Indian foods and regional staples." if ai.get("emphasise_indian_foods") else ""
    )

    prompt_text = (
        f"{build_system_prompt()}\n\n"
        f"Create a family nutrition recommendation for the following family members:\n"
        f"{members_text}\n\n"
        f"Provide individual recommendations for each member AND a common family meal "
        f"that can satisfy most members' needs. {indian_hint}\n"
        f"{ai['name']}:"
    )

    model = get_watsonx_model()
    if model is None:
        return jsonify({
            "recommendations": (
                "**Family Nutrition Overview 👨‍👩‍👧‍👦**\n\n"
                "Configure your IBM Watsonx API key to get personalised family nutrition plans!\n\n"
                "**Quick Tips for Family Health:**\n"
                "- Cook with less oil; prefer steaming, grilling, or air-frying\n"
                "- Include one dal/legume dish daily for protein\n"
                "- Ensure children get adequate calcium (milk, curd, paneer)\n"
                "- Keep elders' sodium intake low\n"
                "- Family evening walk is great for all!"
            ),
            "mode": "demo",
        })

    try:
        result = model.generate_text(prompt=prompt_text)
        return jsonify({"recommendations": result.strip(), "mode": "watsonx"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ── Health check ──────────────────────────────────────────────────────────────
@app.route("/api/health")
def health():
    model  = get_watsonx_model()
    status = "connected" if model else "demo_mode"
    return jsonify({
        "status":    "ok",
        "watsonx":   status,
        "agent":     AGENT_INSTRUCTIONS["name"],
        "timestamp": datetime.now().isoformat(),
    })


# ── Agent info endpoint ───────────────────────────────────────────────────────
@app.route("/api/agent-info")
def agent_info():
    """Return non-sensitive agent configuration to the frontend."""
    ai = AGENT_INSTRUCTIONS
    return jsonify({
        "name":         ai["name"],
        "capabilities": ai["capabilities"],
        "diet_type":    ai["default_diet_type"],
        "indian_foods": ai["emphasise_indian_foods"],
        "tone":         ai["tone"],
    })


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port  = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
