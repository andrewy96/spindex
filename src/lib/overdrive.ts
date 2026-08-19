export const OVERDRIVE_SIGNUP_POINTS = 1000;
export const OVERDRIVE_REFERRAL_POINTS = 50;
export const OVERDRIVE_DAILY_LOGIN_POINTS = 20;
export const OVERDRIVE_DAILY_BATTLE_POINTS = 20;

export const BATTLE_WAGER_MIN = 10;
export const BATTLE_WAGER_MAX = 100;

export const OVERDRIVE_POINT_TO_DIAMOND_COST = 10000;
export const OVERDRIVE_DIAMOND_TO_GOLD_COST = 10;

export const OVERDRIVE_REWARDS = [
  {
    key: "diamond",
    cost: `${OVERDRIVE_POINT_TO_DIAMOND_COST.toLocaleString("en-MY")} pts`,
  },
  {
    key: "gold_bar",
    cost: `${OVERDRIVE_DIAMOND_TO_GOLD_COST} diamonds`,
  },
  {
    key: "ux20",
    cost: "5 diamonds",
  },
  {
    key: "ux00",
    cost: "10 diamonds",
  },
] as const;

export type OverdriveRewardKey = (typeof OVERDRIVE_REWARDS)[number]["key"];
