// ── Points awarded for each correct prediction ──
export const POINTS = {
  matchWinner: 50,
  topScorer: 40,
  playerOfMatch: 40,
  totalSixes: 30,
  firstWicketOver: 30,
  powerplayScore: 25,
  highestIndividual: 25,
  overPrediction: 10,
};

// ── Squads (Official ICC T20 World Cup 2026) ──
export const INDIA_PLAYERS = [
  "Suryakumar Yadav",
  "Abhishek Sharma",
  "Tilak Varma",
  "Sanju Samson",
  "Shivam Dube",
  "Ishan Kishan",
  "Hardik Pandya",
  "Arshdeep Singh",
  "Jasprit Bumrah",
  "Mohammed Siraj",
  "Varun Chakaravarthy",
  "Kuldeep Yadav",
  "Axar Patel",
  "Washington Sundar",
  "Rinku Singh",
];

export const NZ_PLAYERS = [
  "Mitchell Santner",
  "Finn Allen",
  "Mark Chapman",
  "Devon Conway",
  "Jacob Duffy",
  "Lockie Ferguson",
  "Matt Henry",
  "Kyle Jamieson",
  "Daryl Mitchell",
  "James Neesham",
  "Glenn Phillips",
  "Rachin Ravindra",
  "Tim Seifert",
  "Ish Sodhi",
  "Cole McConchie",
];

export const ALL_PLAYERS = [...INDIA_PLAYERS, ...NZ_PLAYERS];

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
    ["top_scorer", POINTS.topScorer],
    ["player_of_match", POINTS.playerOfMatch],
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

  // Over-by-over
  const overResults = results.over_results || {};
  const overPreds = predictions.over_predictions || {};
  for (const ov of Object.keys(overResults)) {
    if (overPreds[ov] && overPreds[ov] === overResults[ov]) {
      score += POINTS.overPrediction;
    }
  }

  return score;
}

export const MAX_POSSIBLE =
  Object.values(POINTS).reduce((a, b) => a + b, 0) +
  POINTS.overPrediction * 19; // 20 overs minus one already counted
