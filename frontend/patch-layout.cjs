const fs = require('fs');

let cv = fs.readFileSync('src/components/garden/CustomerView.tsx', 'utf8');

// 1. Replace the outer wrapper
const outerWrapperSearch = '<div className="relative min-h-screen bg-background text-foreground animate-fade-in pb-24 md:pb-0" dir={i18n.dir()}>';
const outerWrapperReplace = `<div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground animate-fade-in" dir={i18n.dir()}>
      <aside className="w-[28%] sm:w-1/4 md:w-1/5 lg:w-[11%] h-full border-e border-border/60 bg-card/30 flex flex-col pt-6 overflow-y-auto shrink-0 pb-10 shadow-[var(--shadow-soft)] z-50 no-scrollbar">
        <nav className="flex flex-col gap-3 px-2">
          {([
            { id: "home", label: t("customer.home"), icon: Home },
            { id: "menu", label: t("customer.menu"), icon: UtensilsCrossed },
            { id: "orders", label: t("customer.orders"), icon: Receipt },
          ] as const).map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const badge = id === "orders" ? orders.filter(o => o.status === "ready" && !celebratedIds.has(o.id)).length : 0;
            return (
              <button
                key={id}
                onClick={() => {
                  switchTab(id);
                  if (id === "menu") scrollToMenu();
                  if (id === "home" || id === "orders") document.getElementById("main-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={\`relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 px-1 text-[0.65rem] font-semibold transition-all \${
                  active ? "bg-primary text-primary-foreground shadow-md scale-[1.02]" : "text-foreground/50 hover:bg-muted/50 hover:text-foreground/80"
                }\`}
              >
                <span className="relative grid place-items-center">
                  <Icon className={\`relative h-[1.35rem] w-[1.35rem] transition-transform duration-300 \${active ? "scale-110" : ""}\`} strokeWidth={active ? 2.4 : 2} />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1 grid h-4 w-4 place-items-center rounded-full bg-berry text-[0.55rem] font-bold text-berry-foreground shadow-sm animate-pulse-soft">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="leading-tight tracking-wide text-center">{label}</span>
              </button>
            );
          })}

          <button
            onClick={async () => {
              if (!tableInfo) return;
              try {
                await callStaff(tableInfo.id);
                notify("success", t("customer.staffNotified"));
              } catch (e) {
                notify("error", t("customer.failedNotifyStaff"));
              }
            }}
            className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 px-1 text-[0.65rem] font-semibold transition-all text-accent hover:bg-accent/10 active:scale-95 mt-2"
          >
            <span className="relative grid place-items-center bg-accent text-accent-foreground p-1.5 rounded-xl shadow-sm">
              <Smile className="relative h-4 w-4" strokeWidth={2.4} />
            </span>
            <span className="leading-tight tracking-wide text-center">{t("customer.callStaff")}</span>
          </button>
        </nav>

        {tab !== "orders" && (
          <div className="mt-8 flex flex-col gap-2 px-2 animate-fade-in">
            <div className="w-8 h-[2px] bg-border/60 mx-auto mb-3 rounded-full" />
            
            {["All", ...Array.from(new Set(menu.map(i => i.category_name)))].map((c) => {
              const Icon = CAT_ICON[c] || UtensilsCrossed;
              const active = c === category;
              const cLabel = c === "All" ? t("customer.catAll") :
                             c === "Mains" ? t("customer.catMains") :
                             c === "Small Bites" ? t("customer.catSmallBites") :
                             c === "Enzyme Drinks" ? t("customer.catEnzymeDrinks") :
                             c === "Beverages" ? t("customer.catBeverages") :
                             c === "Pre-Order Specials" ? t("customer.catPreOrderSpecials") :
                             c === "Herbal Tea" ? t("customer.catHerbalTea") : c;
                             
              return (
                <button
                  key={c}
                  onClick={() => {
                    setCategory(c);
                    switchTab("menu");
                    scrollToMenu();
                  }}
                  className={\`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-2 px-1 text-[0.65rem] transition-all \${
                    active ? "bg-accent/15 text-accent font-bold ring-1 ring-accent/30" : "text-foreground/60 hover:bg-muted/50 font-medium"
                  }\`}
                >
                  <div className={\`grid place-items-center rounded-xl p-1.5 \${active ? 'bg-accent text-accent-foreground shadow-sm scale-110 transition-transform' : 'bg-muted/50 text-foreground/50'}\`}>
                    <Icon className="h-[1.1rem] w-[1.1rem]" strokeWidth={active ? 2.5 : 2} />
                  </div>
                  <span className="leading-tight text-center truncate w-full px-1">{cLabel}</span>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <div className="flex-1 h-full relative flex flex-col bg-background/50">
        <main id="main-scroll" className="flex-1 overflow-y-auto relative pb-8 no-scrollbar">`;

cv = cv.replace(outerWrapperSearch, outerWrapperReplace);

// 2. Remove horizontal category bar
const catBarStart = '{/* Sticky category icons (Grab-style, moved from top of page) */}';
const catBarEnd = '</div>\n        </div>';

let catBarStartIndex = cv.indexOf(catBarStart);
if (catBarStartIndex !== -1) {
  let catBarEndIndex = cv.indexOf(catBarEnd, catBarStartIndex);
  if (catBarEndIndex !== -1) {
    cv = cv.substring(0, catBarStartIndex) + cv.substring(catBarEndIndex + catBarEnd.length);
  }
}

// 3. Remove bottom nav completely
const bottomNavStart = '{/* ============ BOTTOM NAV (mobile-app feel) ============ */}';
const bottomNavEnd = '</nav>';

let bottomNavStartIndex = cv.indexOf(bottomNavStart);
if (bottomNavStartIndex !== -1) {
  let bottomNavEndIndex = cv.indexOf(bottomNavEnd, bottomNavStartIndex);
  if (bottomNavEndIndex !== -1) {
    cv = cv.substring(0, bottomNavStartIndex) + cv.substring(bottomNavEndIndex + bottomNavEnd.length);
  }
}

// 4. Update floating cart button positioning to be absolute within the new column
const floatingCartSearch = 'className="fixed bottom-20 left-4 right-4 z-40 mx-auto flex max-w-sm animate-bounce-soft items-center justify-between rounded-full px-5 py-3.5 text-primary-foreground shadow-[var(--shadow-deep)] md:bottom-6"';
const floatingCartReplace = 'className="absolute bottom-6 left-4 right-4 z-40 mx-auto flex max-w-sm animate-bounce-soft items-center justify-between rounded-full px-5 py-3.5 text-primary-foreground shadow-[var(--shadow-deep)]"';
cv = cv.replace(floatingCartSearch, floatingCartReplace);

// 5. At the very end, we need to close the `<main>` and `<div className="flex-1">` wrapper
// Right before the final `</div>` of CustomerView return
const finalDivSearch = '\n    </div>\n  );\n};';
const finalDivReplace = '\n        </main>\n      </div>\n    </div>\n  );\n};';
cv = cv.substring(0, cv.lastIndexOf('\n    </div>\n  );\n};')) + finalDivReplace;

fs.writeFileSync('src/components/garden/CustomerView.tsx', cv);
console.log('CustomerView layout heavily patched!');
