import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { INDIA_PLAYERS, NZ_PLAYERS, ALL_PLAYERS, SIXES_RANGES, WICKET_OVERS, POWERPLAY_RANGES, INDIVIDUAL_RANGES } from "@/lib/constants";

// ──────────────────────────────────────────────────────────
// WhatsApp Prediction Bot — Twilio Webhook
//
// Conversational flow:
//   1. User sends "hi" or "predict" → Bot asks for name
//   2. User sends name → Bot asks: Who wins?
//   3. User sends IND/NZ → Bot asks: Top scorer?
//   4. User sends player name → Bot asks: Total sixes?
//   5. ...continues through all prediction categories
//   6. Final confirmation → Saved to Supabase
//
// Setup: Point Twilio Sandbox webhook to:
//   POST https://your-app.vercel.app/api/whatsapp
// ──────────────────────────────────────────────────────────

// In-memory session store (resets on cold start — fine for a single match)
const sessions = new Map();

const STEPS = [
  { key: "name", question: "🏏 *IND vs NZ T20 WC 2026 Final!*\n\nWelcome to the Prediction Game!\n\nWhat's your name?" },
  { key: "match_winner", question: "🏆 *Who wins the match?*\n\nReply:\n• *IND* for India 🇮🇳\n• *NZ* for New Zealand 🇳🇿" },
  { key: "top_scorer", question: "🔥 *Who'll be the top scorer?*\n\nReply with a player name.\n\n🇮🇳 India: SKY, Abhishek, Tilak, Samson, Dube, Ishan, Hardik, Arshdeep, Bumrah, Siraj, Varun, Kuldeep, Axar, Washy, Rinku\n\n🇳🇿 NZ: Santner, Allen, Chapman, Conway, Duffy, Ferguson, Henry, Jamieson, Mitchell, Neesham, Phillips, Ravindra, Seifert, Sodhi, McConchie" },
  { key: "player_of_match", question: "⭐ *Player of the Match?*\n\nReply with a player name." },
  { key: "total_sixes", question: "6️⃣ *Total sixes in the match?*\n\nReply with one:\n• 0-5\n• 6-10\n• 11-15\n• 16-20\n• 21+" },
  { key: "first_wicket_over", question: "🎳 *First wicket falls in which over?*\n\nReply with one:\n• 1, 2, 3, 4, 5\n• 6-10\n• 11-15\n• 16-20" },
  { key: "powerplay_score", question: "⚡ *Powerplay score (1st innings)?*\n\nReply with one:\n• Below 30\n• 30-45\n• 46-55\n• 56-70\n• Above 70" },
  { key: "highest_individual", question: "💯 *Highest individual score?*\n\nReply with one:\n• Below 30\n• 30-49\n• 50-74\n• 75-99\n• 100+" },
];

// Twilio sends POST with form data
export async function POST(request) {
  const formData = await request.formData();
  const from = formData.get("From") || "";        // whatsapp:+91xxxxxxxxxx
  const body = (formData.get("Body") || "").trim();

  const reply = await handleMessage(from, body);
  
  // Twilio expects TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(reply)}</Message></Response>`;
  
  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

async function handleMessage(from, body) {
  const lower = body.toLowerCase();

  // ── Reset commands ──
  if (lower === "reset" || lower === "restart" || lower === "start over") {
    sessions.delete(from);
    return "🔄 Reset! Send *predict* to start fresh.";
  }

  // ── Check leaderboard ──
  if (lower === "leaderboard" || lower === "score" || lower === "scores") {
    return await getLeaderboard();
  }

  // ── Help ──
  if (lower === "help") {
    return "🏏 *Cricket Predictor Bot*\n\n• *predict* — Start making predictions\n• *leaderboard* — See current standings\n• *reset* — Start over\n• *help* — This message";
  }

  // ── Start prediction flow ──
  if (!sessions.has(from)) {
    if (lower === "hi" || lower === "hello" || lower === "hey" || lower === "predict" || lower === "start" || lower === "play") {
      sessions.set(from, { step: 0, data: {} });
      return STEPS[0].question;
    }
    return "🏏 *IND vs NZ T20 WC Final Predictor!*\n\nSend *predict* to start!\nSend *leaderboard* to see scores.";
  }

  // ── Continue prediction flow ──
  const session = sessions.get(from);
  const currentStep = STEPS[session.step];

  // Validate and save the answer
  const validation = validateAnswer(currentStep.key, body);
  if (!validation.valid) {
    return `❌ ${validation.error}\n\n${currentStep.question}`;
  }

  session.data[currentStep.key] = validation.value;
  session.step++;

  // ── All steps complete → Save ──
  if (session.step >= STEPS.length) {
    const saved = await savePrediction(from, session.data);
    sessions.delete(from);

    if (!saved) return "❌ Error saving. Send *predict* to try again.";

    return `✅ *Predictions locked!* 🎉\n\n` +
      `👤 Name: ${session.data.name}\n` +
      `🏆 Winner: ${session.data.match_winner}\n` +
      `🔥 Top Scorer: ${session.data.top_scorer}\n` +
      `⭐ PotM: ${session.data.player_of_match}\n` +
      `6️⃣ Sixes: ${session.data.total_sixes}\n` +
      `🎳 1st Wicket: Over ${session.data.first_wicket_over}\n` +
      `⚡ PP Score: ${session.data.powerplay_score}\n` +
      `💯 Highest: ${session.data.highest_individual}\n\n` +
      `Send *leaderboard* to check standings!`;
  }

  // ── Ask next question ──
  const nextStep = STEPS[session.step];
  const confirmPrev = getConfirmation(currentStep.key, validation.value);
  return `${confirmPrev}\n\n${nextStep.question}`;
}

function getConfirmation(key, value) {
  const confirmations = {
    name: `👋 Hey *${value}*! Let's go!`,
    match_winner: value === "India" ? "🇮🇳 India locked! 💪" : "🇳🇿 New Zealand locked! 🖤",
    top_scorer: `🔥 *${value}* — great pick!`,
    player_of_match: `⭐ *${value}* for PotM — bold!`,
    total_sixes: `6️⃣ *${value}* sixes — locked!`,
    first_wicket_over: `🎳 Over *${value}* — noted!`,
    powerplay_score: `⚡ PP: *${value}* — locked!`,
    highest_individual: `💯 *${value}* — saved!`,
  };
  return confirmations[key] || `✅ *${value}* saved!`;
}

function validateAnswer(key, body) {
  const b = body.trim();
  const lower = b.toLowerCase();

  switch (key) {
    case "name":
      if (b.length < 2) return { valid: false, error: "Name must be at least 2 characters." };
      if (b.length > 30) return { valid: false, error: "Keep it under 30 characters." };
      return { valid: true, value: b };

    case "match_winner":
      if (lower.includes("ind") || lower.includes("india") || lower === "🇮🇳") return { valid: true, value: "India" };
      if (lower.includes("nz") || lower.includes("new zealand") || lower.includes("zealand") || lower.includes("black caps") || lower === "🇳🇿") return { valid: true, value: "New Zealand" };
      return { valid: false, error: "Reply *IND* or *NZ*." };

    case "top_scorer":
    case "player_of_match":
      const matched = findPlayer(b);
      if (!matched) return { valid: false, error: `Couldn't find "${b}". Try the full or last name.` };
      return { valid: true, value: matched };

    case "total_sixes":
      const sixMatch = SIXES_RANGES.find(r => r === b || lower === r.toLowerCase());
      if (!sixMatch) return { valid: false, error: "Reply with: 0-5, 6-10, 11-15, 16-20, or 21+" };
      return { valid: true, value: sixMatch };

    case "first_wicket_over":
      const wicketMatch = WICKET_OVERS.find(r => r === b || lower === r.toLowerCase());
      if (!wicketMatch) return { valid: false, error: "Reply with: 1, 2, 3, 4, 5, 6-10, 11-15, or 16-20" };
      return { valid: true, value: wicketMatch };

    case "powerplay_score":
      const ppMatch = POWERPLAY_RANGES.find(r => lower === r.toLowerCase() || lower.replace(/ /g, '') === r.replace(/ /g, '').toLowerCase());
      if (!ppMatch) return { valid: false, error: "Reply with: Below 30, 30-45, 46-55, 56-70, or Above 70" };
      return { valid: true, value: ppMatch };

    case "highest_individual":
      const hiMatch = INDIVIDUAL_RANGES.find(r => lower === r.toLowerCase() || lower.replace(/ /g, '') === r.replace(/ /g, '').toLowerCase());
      if (!hiMatch) return { valid: false, error: "Reply with: Below 30, 30-49, 50-74, 75-99, or 100+" };
      return { valid: true, value: hiMatch };

    default:
      return { valid: true, value: b };
  }
}

// Fuzzy player name matching
function findPlayer(input) {
  const lower = input.toLowerCase().trim();
  
  // Exact match first
  const exact = ALL_PLAYERS.find(p => p.toLowerCase() === lower);
  if (exact) return exact;

  // Last name match
  const lastNameMatch = ALL_PLAYERS.find(p => {
    const parts = p.toLowerCase().split(" ");
    return parts.some(part => part === lower || lower.includes(part));
  });
  if (lastNameMatch) return lastNameMatch;

  // Nickname mapping
  const nicknames = {
    // India
    "sky": "Suryakumar Yadav", "surya": "Suryakumar Yadav", "suryakumar": "Suryakumar Yadav",
    "abhishek": "Abhishek Sharma",
    "tilak": "Tilak Varma", "varma": "Tilak Varma",
    "sanju": "Sanju Samson", "samson": "Sanju Samson",
    "dube": "Shivam Dube", "shivam": "Shivam Dube",
    "ishan": "Ishan Kishan", "kishan": "Ishan Kishan",
    "hardik": "Hardik Pandya", "pandya": "Hardik Pandya",
    "arshdeep": "Arshdeep Singh",
    "bumrah": "Jasprit Bumrah", "boom": "Jasprit Bumrah", "jasprit": "Jasprit Bumrah",
    "siraj": "Mohammed Siraj",
    "varun": "Varun Chakaravarthy", "chakra": "Varun Chakaravarthy", "chakaravarthy": "Varun Chakaravarthy",
    "kuldeep": "Kuldeep Yadav",
    "axar": "Axar Patel",
    "washy": "Washington Sundar", "washington": "Washington Sundar", "sundar": "Washington Sundar", "washi": "Washington Sundar",
    "rinku": "Rinku Singh",
    // New Zealand
    "santner": "Mitchell Santner",
    "finn": "Finn Allen", "allen": "Finn Allen",
    "chapman": "Mark Chapman",
    "conway": "Devon Conway", "devon": "Devon Conway",
    "duffy": "Jacob Duffy",
    "lockie": "Lockie Ferguson", "ferguson": "Lockie Ferguson",
    "henry": "Matt Henry", "matt": "Matt Henry",
    "jamieson": "Kyle Jamieson", "kyle": "Kyle Jamieson",
    "daryl": "Daryl Mitchell", "mitchell": "Daryl Mitchell",
    "neesham": "James Neesham", "jimmy": "James Neesham",
    "glenn": "Glenn Phillips", "phillips": "Glenn Phillips",
    "rachin": "Rachin Ravindra", "ravindra": "Rachin Ravindra",
    "seifert": "Tim Seifert",
    "sodhi": "Ish Sodhi",
    "mcconchie": "Cole McConchie", "cole": "Cole McConchie",
  };

  return nicknames[lower] || null;
}

async function savePrediction(from, data) {
  try {
    const supabase = getServerSupabase();
    const row = {
      player_name: data.name,
      match_winner: data.match_winner,
      top_scorer: data.top_scorer,
      player_of_match: data.player_of_match,
      total_sixes: data.total_sixes,
      first_wicket_over: data.first_wicket_over,
      powerplay_score: data.powerplay_score,
      highest_individual: data.highest_individual,
      over_predictions: {},
      score: 0,
    };

    const { error } = await supabase
      .from("predictions")
      .upsert(row, { onConflict: "player_name" });

    return !error;
  } catch {
    return false;
  }
}

async function getLeaderboard() {
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from("predictions")
      .select("player_name, score, match_winner")
      .order("score", { ascending: false })
      .limit(10);

    if (!data || data.length === 0) return "🏆 *Leaderboard*\n\nNo predictions yet! Send *predict* to be first.";

    let board = "🏆 *LEADERBOARD*\n\n";
    data.forEach((e, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      const flag = e.match_winner === "India" ? "🇮🇳" : "🇳🇿";
      board += `${medal} *${e.player_name}* ${flag} — ${e.score} pts\n`;
    });

    board += `\n_Send *predict* to join!_`;
    return board;
  } catch {
    return "Error loading leaderboard. Try again.";
  }
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
