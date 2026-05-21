const fs = require('fs');
const path = 'src/components/garden/LandingView.tsx';
let code = fs.readFileSync(path, 'utf8');

const replacements = {
  ">Welcome to the farm<": ">{t(\"landing.welcome\")}<",
  ">Scan your table<": ">{t(\"landing.scan\")}<",
  ">Point your camera at the QR code on your table to view our menu and start ordering.<": ">{t(\"landing.pointCamera\")}<",
  ">Or wave to a farm crew member — we'll come to you.<": ">{t(\"landing.orWave\")}<",
  ">Est. in the heart of the garden<": ">{t(\"landing.est\")}<"
};

for (const [search, replace] of Object.entries(replacements)) {
  code = code.split(search).join(replace);
}

if (!code.includes('useTranslation')) {
  code = code.replace('import { Camera } from "lucide-react";', 'import { Camera } from "lucide-react";\nimport { useTranslation } from "react-i18next";');
  code = code.replace('export const LandingView = () => {', 'export const LandingView = () => {\n  const { t } = useTranslation();');
}

fs.writeFileSync(path, code);
console.log("LandingView replaced!");
