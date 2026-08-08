const RESET_CONFIRMATION_SENTENCE = "I understand this will permanently remove all selected app data and restore the app to a clean state.";
const RESET_CONFIRMATION_CODE = "DRAGONFLY-RESET-2026";

const RESET_CATEGORY_OPTIONS = [
  {
    key: "all_data",
    label: "All app data",
    description: "Wipe the app back to an empty, freshly seeded state including menu, orders, feedback, tables, inventory, and settings.",
  },
  {
    key: "foods",
    label: "Foods in the menu",
    description: "Remove all food items and their linked menu data so the food section is empty.",
  },
  {
    key: "drinks",
    label: "Drinks in the menu",
    description: "Remove all drink items and their linked menu data so the drinks section is empty.",
  },
  {
    key: "food_images",
    label: "Food images",
    description: "Clear all uploaded food images from the menu without deleting the food items themselves.",
  },
  {
    key: "drink_images",
    label: "Drink images",
    description: "Clear all uploaded drink images from the menu without deleting the drink items themselves.",
  },
  {
    key: "menu_images",
    label: "Menu images",
    description: "Clear all menu item images from the system.",
  },
  {
    key: "feedbacks",
    label: "Feedback entries",
    description: "Remove all feedback submissions, analysis runs, and related records.",
  },
  {
    key: "feedback_images",
    label: "Feedback images",
    description: "Remove feedback-uploaded images while leaving the feedback entries intact.",
  },
];

const normalizeResetCategoryKey = (value) => {
  if (typeof value !== "string") return "all_data";
  const normalized = value.trim().toLowerCase();
  return normalized || "all_data";
};

const getResetCategoryOptions = () => RESET_CATEGORY_OPTIONS.map((item) => ({ ...item }));

const getResetCategoryByKey = (value) => {
  const normalized = normalizeResetCategoryKey(value);
  return RESET_CATEGORY_OPTIONS.find((item) => item.key === normalized) || RESET_CATEGORY_OPTIONS[0];
};

module.exports = {
  RESET_CONFIRMATION_SENTENCE,
  RESET_CONFIRMATION_CODE,
  RESET_CATEGORY_OPTIONS,
  getResetCategoryOptions,
  getResetCategoryByKey,
  normalizeResetCategoryKey,
};
