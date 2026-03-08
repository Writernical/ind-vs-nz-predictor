# 🏏 IND vs NZ — T20 World Cup 2026 Final Predictor

A real-time cricket prediction game for the T20 WC 2026 Final. Share the link with friends, make predictions, and watch the leaderboard update live!

**Stack:** Next.js + Supabase + CricketData.org API  
**Cost:** Completely free to deploy and run  
**Setup time:** ~10 minutes (nothing to self-host)

---

## 🚀 Deployment Guide (All Free, Nothing to Self-Host)

You need to set up 3 things — each takes ~3 minutes:

### Step 1: Get a Free Cricket API Key (~2 minutes)

We use **CricketData.org** — a free hosted API. No server to manage.

1. Go to [cricketdata.org/signup.aspx](https://cricketdata.org/signup.aspx)
2. Sign up (free, no credit card)
3. Go to your **Member Area** and copy your **API Key**

**Free tier:** 100 API calls/day. That's plenty for a T20 match — the app caches results and polls every 30 seconds, so one match uses ~60–100 calls.

Save your API key — you'll need it in Step 3.

---

### Step 2: Set Up Supabase Database (Free Tier)

1. Go to [supabase.com](https://supabase.com) → Sign up (GitHub login works)
2. Click **New Project** → Name it `cricket-predictor` → Set a DB password → Choose a region close to you
3. Wait for the project to be created (~2 minutes)
4. Go to **SQL Editor** (left sidebar)
5. Paste the entire contents of `supabase-schema.sql` from this project
6. Click **Run** — you should see "Success" for all statements
7. Go to **Settings** → **API** and copy:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public key** (a long string starting with `eyJ...`)

Save both — you'll need them in Step 3.

---

### Step 3: Deploy This App (Free on Vercel)

1. Push this project to your GitHub:
   ```bash
   cd ind-vs-nz-predictor
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create ind-vs-nz-predictor --public --push
   # Or create a repo on github.com and push manually
   ```

2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import `ind-vs-nz-predictor`

3. Before deploying, add **Environment Variables**:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
   | `CRICKETDATA_API_KEY` | Your CricketData.org API key |
   | `CRON_SECRET` | Any random string (protects the cron endpoint) |
   | `NEXT_PUBLIC_ADMIN_PIN` | `2026` (or change to your own) |

4. Click **Deploy**. Done! Share the URL with your friends.

---

## 🎮 How It Works

### For Players
- Visit the app URL → Enter your name → Make predictions
- Categories: Match winner, top scorer, player of match, total sixes, first wicket over, powerplay score, highest individual score, and over-by-over predictions
- Points are awarded for correct predictions (harder ones = more points)

### Auto-Sync (Fully Automated)
The app runs a **cron job every 3 minutes** that:
1. Fetches the live scorecard from CricketData.org
2. Auto-extracts: match winner, top scorer, total sixes, highest individual score, first wicket over
3. Maps raw numbers to prediction range categories (e.g., 14 sixes → "11-15")
4. Updates the results in Supabase
5. Recalculates every player's score
6. Pushes leaderboard updates to everyone in real-time via Supabase Realtime

**What gets auto-filled:**
| Field | Auto? | Notes |
|---|---|---|
| Match winner | ✅ | Extracted from match status when game ends |
| Top scorer | ✅ | Highest runs from batting scorecard |
| Highest individual score | ✅ | Same data, mapped to range |
| Total sixes | ✅ | Summed from all batting "6s" columns |
| First wicket over | ✅ | From fall-of-wickets data (if available) |
| Player of the match | ⚠️ | Auto if API provides it, otherwise manual |
| Powerplay score | ⚠️ | Auto if scorecard includes powerplay data |
| Over-by-over | ⚠️ | Auto if ball-by-ball data is in the free tier |

### Admin Override (Optional)
- Go to `/admin` → Enter PIN → Manually fill or correct any field
- Your edits take priority — auto-sync never overwrites admin entries
- Use this for fields the API can't extract (like Player of the Match)

### Live Scores
- The cron job caches live scores in Supabase every 3 minutes
- The frontend reads from Supabase via real-time subscription — zero external API calls from the browser
- This keeps you well within the 100 calls/day free tier

---

## 📊 Points System

| Prediction | Points |
|---|---|
| Match Winner | 50 |
| Top Scorer | 40 |
| Player of the Match | 40 |
| Total Sixes (range) | 30 |
| First Wicket Over | 30 |
| Powerplay Score (range) | 25 |
| Highest Individual (range) | 25 |
| Each correct Over prediction | 10 |

**Maximum possible:** 440 points

---

## 🔧 Local Development

```bash
# Clone and install
git clone <your-repo-url>
cd ind-vs-nz-predictor
npm install

# Create .env.local from template
cp .env.example .env.local
# Fill in your Supabase and Cricket API values

# Run locally
npm run dev
# Open http://localhost:3000
```

---

## 📁 Project Structure

```
├── app/
│   ├── layout.jsx          # Root layout with header and nav
│   ├── page.jsx            # Home — prediction form
│   ├── globals.css         # Tailwind + custom styles
│   ├── leaderboard/
│   │   └── page.jsx        # Live leaderboard
│   ├── admin/
│   │   └── page.jsx        # Manual override panel
│   └── api/
│       ├── cricket-score/
│       │   └── route.js    # CricketData.org API integration
│       └── auto-sync/
│           └── route.js    # ⭐ Cron job: auto-extract results & update scores
├── components/
│   ├── ui.jsx              # Reusable components
│   └── LiveScore.jsx       # Live score (reads from Supabase, not API)
├── lib/
│   ├── supabase.js         # Supabase client (browser)
│   ├── supabase-server.js  # Supabase client (server/cron)
│   └── constants.js        # Players, points, score calculator
├── vercel.json             # Cron job config (every 3 min)
├── supabase-schema.sql     # Database setup script
├── .env.example            # Environment variables template
└── README.md               # This file
```

---

## ⚡ Match Day Checklist

1. Make sure all env vars are set in Vercel (API key, Supabase creds, cron secret)
2. Share the app URL with your group
3. **Sit back and enjoy the match!** Auto-sync handles the rest:
   - Live scores appear once the match starts
   - Results auto-fill as data becomes available
   - Leaderboard recalculates every 3 minutes
4. (Optional) Go to `/admin` only if you need to manually fill Player of the Match or fix something

---

## 📡 API Budget (Free Tier: 100 calls/day)

The auto-sync cron runs every 3 minutes and makes **2 API calls per run** (currentMatches + scorecard). Here's the math for a T20 match (~3.5 hours):

| Duration | Calls per run | Runs | Total API calls |
|---|---|---|---|
| 3.5 hours | 2 | ~70 | ~140 |

That's slightly over the 100/day free limit. Options:

1. **Change cron to every 5 min** (edit `vercel.json`: `*/5 * * * *`) → ~84 calls. Fits in free tier.
2. **Upgrade to $5.99/month** S plan → 2,000 calls/day. More than enough.
3. **Disable scorecard fetch** — use only `currentMatches` (1 call per run) → ~70 calls. You'll still get scores but lose detailed batting stats.

The frontend makes **zero external API calls** — it reads everything from Supabase.

---

## 🏗 Updating the Squad

Edit `lib/constants.js` to change the player lists if the playing XI differs from the pre-filled squads.

---

Built with ❤️ for cricket fans. Enjoy the final! 🇮🇳🏏🇳🇿
