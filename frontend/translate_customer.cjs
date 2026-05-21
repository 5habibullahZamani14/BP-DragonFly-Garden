const fs = require('fs');
const path = 'src/components/garden/CustomerView.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacements = {
  // Attributes
  'placeholder="Search the farm menu..."': 'placeholder={t("customer.searchMenu")}',
  'aria-label="Clear search"': 'aria-label={t("customer.clearSearch")}',
  'placeholder="Any notes?"': 'placeholder={t("customer.anyNotes")}',
  'aria-label="Add"': 'aria-label={t("customer.add")}',
  
  // Expressions
  '${searchResults.length} result${searchResults.length === 1 ? "" : "s"} for "${query}"': '${searchResults.length} ${t("customer.resultsFor")} "${query}"',
  'No matches for "${query}"': '${t("customer.noMatchesFor")} "${query}"',

  // UI Text between tags
  ">Sorry, that's not on the farm menu today.<": ">{t(\"customer.notOnMenu\")}<",
  ">Try a different dish or browse the full menu below.<": ">{t(\"customer.tryDifferent\")}<",
  "> Order\n": "> {t(\"customer.order\")}\n",
  "> Farm-to-table\n": "> {t(\"customer.farmToTable\")}\n",
  ">Goodness of<": ">{t(\"customer.goodnessOf\")}<",
  ">nature<": ">{t(\"customer.nature\")}<",
  ">, served fresh.<": ">{t(\"customer.servedFresh\")}<",
  ">\n          Browse the farm menu, order from your table — your dish, growing to life.\n        <": ">\n          {t(\"customer.browseSub\")}\n        <",
  ">\n          Explore menu ": ">\n          {t(\"customer.exploreMenu\")} ",
  ">This week<": ">{t(\"customer.thisWeek\")}<",
  ">Chef's favourite<": ">{t(\"customer.chefsFav\")}<",
  ">\n              Add <": ">\n              {t(\"customer.add\")} <",
  "> Popular\n": "> {t(\"customer.popular\")}\n",
  ">Today's offers<": ">{t(\"customer.todayOffers\")}<",
  ">Hot deals 🔥<": ">{t(\"customer.hotDeals\")}<",
  ">From<": ">{t(\"customer.from\")}<",
  ">Picked for you<": ">{t(\"customer.pickedForYou\")}<",
  ">Recommended<": ">{t(\"customer.recommended\")}<",
  ">View all <": ">{t(\"customer.viewAll\")} <",
  "> Top\n": "> {t(\"customer.top\")}\n",
  ">Farm menu<": ">{t(\"customer.farmMenu\")}<",
  ">All goodness<": ">{t(\"customer.allGoodness\")}<",
  ">No matches<": ">{t(\"customer.noMatches\")}<",
  ">Try a different search or category.<": ">{t(\"customer.tryDifferentSearch\")}<",
  ">New<": ">{t(\"customer.new\")}<",
  ">Add<": ">{t(\"customer.add\")}<",
  ">— end of the garden —<": ">{t(\"customer.endOfGarden\")}<",
  ">Live tracking<": ">{t(\"customer.liveTracking\")}<",
  ">Your<": ">{t(\"customer.your\")}<",
  ">orders<": ">{t(\"customer.orders\")}<",
  ">Follow each plate from the kitchen all the way to your table.<": ">{t(\"customer.followPlate\")}<",
  ">No orders yet<": ">{t(\"customer.noOrdersYet\")}<",
  ">Once you send something to the kitchen, you'll see it growing here in real time.<": ">{t(\"customer.growingHere\")}<",
  ">Browse the menu<": ">{t(\"customer.browseMenu\")}<",
  ">In progress<": ">{t(\"customer.inProgress\")}<",
  ">Ticket<": ">{t(\"customer.ticket\")}<",
  ">Subtotal<": ">{t(\"customer.subtotal\")}<",
  ">SST (6%)<": ">{t(\"customer.sst\")} (6%)<",
  ">Service Charge (10%)<": ">{t(\"customer.serviceCharge\")} (10%)<",
  ">Rounding<": ">{t(\"customer.rounding\")}<",
  ">Total<": ">{t(\"customer.total\")}<",
  ">Archived tickets<": ">{t(\"customer.archivedTickets\")}<",
  ">History<": ">{t(\"customer.history\")}<",
  ">— end of orders —<": ">{t(\"customer.endOfOrders\")}<",
  ">View cart<": ">{t(\"customer.viewCart\")}<",
  ">Call Staff<": ">{t(\"customer.callStaff\")}<",
  ">Checkout<": ">{t(\"customer.checkout\")}<",
  ">Your cart<": ">{t(\"customer.yourCart\")}<",
  ">Empty cart<": ">{t(\"customer.emptyCart\")}<",
  ">Go add some fresh bites!<": ">{t(\"customer.freshBites\")}<",
  ">Your basket is feeling light today.<": ">{t(\"customer.basketLight\")}<",
  ">Any special requests?<": ">{t(\"customer.specialRequests\")}<",
  ">Order total<": ">{t(\"customer.orderTotal\")}<",
  ">Send Order to Kitchen<": ">{t(\"customer.sendOrderToKitchen\")}<",
  ">Perfect Pairings<": ">{t(\"customer.perfectPairings\")}<",
  ">Popular choices<": ">{t(\"customer.popularChoices\")}<",
  ">Often bought together<": ">{t(\"customer.oftenBoughtTogether\")}<",
};

code = code.replace(/\{tab === "home" \? "Home" : tab === "menu" \? "Menu" : "Orders"\}/g, '{tab === "home" ? t("customer.home") : tab === "menu" ? t("customer.menu") : t("customer.ordersTitle")}');
code = code.replace(/> Home\n/g, '> {t("customer.home")}\n');
code = code.replace(/> Menu\n/g, '> {t("customer.menu")}\n');
code = code.replace(/> Orders\n/g, '> {t("customer.ordersTitle")}\n');
code = code.replace(/>Home</g, '>{t("customer.home")}<');
code = code.replace(/>Menu</g, '>{t("customer.menu")}<');
code = code.replace(/>Orders</g, '>{t("customer.ordersTitle")}<');

for (const [search, replace] of Object.entries(replacements)) {
  code = code.split(search).join(replace);
}

fs.writeFileSync(path, code);
console.log("CustomerView replaced!");
