const RESET_CONFIRMATION_SENTENCE = "I understand this will permanently remove all selected app data and restore the app to a clean state.";

const RESET_CATEGORY_OPTIONS = [
  {
    key: "all_data",
    label: "Reset everything",
    description: "Permanently remove restaurant data, uploaded menu/feedback photos, and activity history. Manager credentials, printer/tax/working-hour settings, the Counter Order system route, and backup archives are kept so the app remains functional and recoverable.",
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
    description: "Clear menu-item photos, remove pattern and repository image assets, and keep the menu items themselves.",
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
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const getResetCategoryOptions = () => RESET_CATEGORY_OPTIONS.map((item) => ({ ...item }));

const getResetCategoryByKey = (value) => {
  const normalized = normalizeResetCategoryKey(value);
  if (!normalized) return null;
  return RESET_CATEGORY_OPTIONS.find((item) => item.key === normalized) || null;
};

module.exports = {
  RESET_CONFIRMATION_SENTENCE,
  RESET_CATEGORY_OPTIONS,
  getResetCategoryOptions,
  getResetCategoryByKey,
  normalizeResetCategoryKey,
};
