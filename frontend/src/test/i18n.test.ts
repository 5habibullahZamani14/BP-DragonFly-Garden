import { afterEach, describe, expect, it } from "vitest";
import i18n from "@/i18n";

const originalLanguage = i18n.language;

afterEach(async () => {
  await i18n.changeLanguage(originalLanguage);
});

describe("document language metadata", () => {
  it("updates the document language and text direction when the locale changes", async () => {
    await i18n.changeLanguage("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");

    await i18n.changeLanguage("zh");
    expect(document.documentElement.lang).toBe("zh");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
