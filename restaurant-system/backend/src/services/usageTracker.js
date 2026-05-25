const usage = {
  requestsToday: 0,
  requestsThisMinute: 0,
  minuteStart: Date.now(),
  dayStart: new Date().setHours(0, 0, 0, 0),
  MAX_PER_MINUTE: 30,
  MAX_PER_DAY: 14400,
};

const trackRequest = () => {
  const now = Date.now();

  if (now - usage.minuteStart > 60000) {
    usage.requestsThisMinute = 0;
    usage.minuteStart = now;
  }

  const todayStart = new Date().setHours(0, 0, 0, 0);
  if (todayStart !== usage.dayStart) {
    usage.requestsToday = 0;
    usage.dayStart = todayStart;
  }

  usage.requestsToday++;
  usage.requestsThisMinute++;
};

const getUsage = () => ({
  requests_today: usage.requestsToday,
  max_per_day: usage.MAX_PER_DAY,
  requests_this_minute: usage.requestsThisMinute,
  max_per_minute: usage.MAX_PER_MINUTE,
  minute_reset_at: usage.minuteStart + 60000,
  day_reset_at: usage.dayStart + 86400000,
});

module.exports = { trackRequest, getUsage };
