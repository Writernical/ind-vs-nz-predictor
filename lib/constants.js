// ── Points ──
export const POINTS = {
  matchWinner: 50,
  topScorerIndia: 25,
  topScorerNz: 25,
  topWicketIndia: 25,
  topWicketNz: 25,
  mostCatches: 30,
  totalSixes: 30,
  firstWicketOver: 30,
  powerplayScore: 25,
  highestIndividual: 25,
  overPrediction: 10,
};

// ── India Squad by Role ──
export const INDIA_BATTERS = [
  "Suryakumar Yadav", "Abhishek Sharma", "Tilak Varma",
  "Sanju Samson", "Ishan Kishan", "Rinku Singh",
];
export const INDIA_ALLROUNDERS = [
  "Hardik Pandya", "Axar Patel", "Shivam Dube", "Washington Sundar",
];
export const INDIA_BOWLERS = [
  "Jasprit Bumrah", "Mohammed Siraj", "Arshdeep Singh",
  "Varun Chakaravarthy", "Kuldeep Yadav",
];

// ── NZ Squad by Role ──
export const NZ_BATTERS = [
  "Finn Allen", "Devon Conway", "Daryl Mitchell",
  "Glenn Phillips", "Tim Seifert", "Mark Chapman",
];
export const NZ_ALLROUNDERS = [
  "Mitchell Santner", "James Neesham", "Rachin Ravindra", "Cole McConchie",
];
export const NZ_BOWLERS = [
  "Jacob Duffy", "Lockie Ferguson", "Matt Henry",
  "Kyle Jamieson", "Ish Sodhi",
];

// ── Combined lists ──
export const INDIA_PLAYERS = [...INDIA_BATTERS, ...INDIA_ALLROUNDERS, ...INDIA_BOWLERS];
export const NZ_PLAYERS = [...NZ_BATTERS, ...NZ_ALLROUNDERS, ...NZ_BOWLERS];
export const ALL_PLAYERS = [...INDIA_PLAYERS, ...NZ_PLAYERS];

// ── For Top Scorer: Batters + All-rounders ──
export const INDIA_SCORING = [...INDIA_BATTERS, ...INDIA_ALLROUNDERS];
export const NZ_SCORING = [...NZ_BATTERS, ...NZ_ALLROUNDERS];

// ── For Top Wicket Taker: Bowlers + All-rounders ──
export const INDIA_BOWLING = [...INDIA_BOWLERS, ...INDIA_ALLROUNDERS];
export const NZ_BOWLING = [...NZ_BOWLERS, ...NZ_ALLROUNDERS];

// ── Prediction range options ──
export const OVER_RANGES = ["0-4", "5-8", "9-12", "13-16", "17+"];
export const POWERPLAY_RANGES = ["Below 30", "30-45", "46-55", "56-70", "Above 70"];
export const SIXES_RANGES = ["0-5", "6-10", "11-15", "16-20", "21+"];
export const INDIVIDUAL_RANGES = ["Below 30", "30-49", "50-74", "75-99", "100+"];
export const WICKET_OVERS = ["1", "2", "3", "4", "5", "6-10", "11-15", "16-20"];

// ── Score calculator ──
export function calculateScore(predictions, results) {
  if (!results || !predictions) return 0;
  let score = 0;
  const fields = [
    ["match_winner", POINTS.matchWinner],
    ["top_scorer_india", POINTS.topScorerIndia],
    ["top_scorer_nz", POINTS.topScorerNz],
    ["top_wicket_india", POINTS.topWicketIndia],
    ["top_wicket_nz", POINTS.topWicketNz],
    ["most_catches", POINTS.mostCatches],
    ["total_sixes", POINTS.totalSixes],
    ["first_wicket_over", POINTS.firstWicketOver],
    ["powerplay_score", POINTS.powerplayScore],
    ["highest_individual", POINTS.highestIndividual],
  ];
  for (const [field, pts] of fields) {
    if (results[field] && predictions[field] === results[field]) {
      score += pts;
    }
  }
  const overRe
