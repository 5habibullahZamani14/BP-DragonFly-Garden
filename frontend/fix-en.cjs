const fs = require('fs');

const englishFixes = {
  'clearSearch': 'Clear Search',
  'resultsFor': 'Results for',
  'noMatchesFor': 'No matches for',
  'order': 'Order',
  'todayOffers': "Today's Offers",
  'hotDeals': 'Hot Deals',
  'from': 'from',
  'pickedForYou': 'Picked For You',
  'recommended': 'Recommended',
  'viewAll': 'View All',
  'top': 'Top',
  'farmMenu': 'Farm Menu',
  'allGoodness': 'All the goodness',
  'noMatches': 'No matches found',
  'tryDifferentSearch': 'Try a different search term',
  'new': 'New',
  'endOfGarden': 'End of the garden',
  'noOrdersYet': 'No orders yet',
  'inProgress': 'In Progress',
  'ticket': 'Ticket',
  'rounding': 'Rounding',
  'archivedTickets': 'Archived Tickets',
  'history': 'History',
  'endOfOrders': 'End of orders',
  'viewCart': 'View Cart',
  'checkout': 'Checkout',
  'yourCart': 'Your Cart',
  'anyNotes': 'Any notes?',
  'perfectPairings': 'Perfect Pairings',
  'popularChoices': 'Popular Choices'
};

let en = fs.readFileSync('src/locales/en.ts', 'utf8');

for (const [key, val] of Object.entries(englishFixes)) {
  en = en.replace('\"customer.' + key + '\": \"' + key + '\"', '\"customer.' + key + '\": \"' + val + '\"');
}

fs.writeFileSync('src/locales/en.ts', en);
console.log('Fixed English strings');
