import React from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { safeConsoleError } from "@/lib/safeConsole";

type ChartExportProps = {
  targetId: string;
  data?: object[];
  fileName?: string;
  className?: string;
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

async function svgToPng(svg: SVGElement, scale = 2) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const svg64 = btoa(unescape(encodeURIComponent(svgString)));
  const imgSrc = `data:image/svg+xml;base64,${svg64}`;

  const img = new Image();
  img.src = imgSrc;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((res) => canvas.toBlob(blob => res(blob), "image/png"));
}

async function svgToJpeg(svg: SVGElement, scale = 2) {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const svg64 = btoa(unescape(encodeURIComponent(svgString)));
  const imgSrc = `data:image/svg+xml;base64,${svg64}`;

  const img = new Image();
  img.src = imgSrc;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((res) => canvas.toBlob(blob => res(blob), "image/jpeg", 0.92));
}

export const ChartExport: React.FC<ChartExportProps> = ({ targetId, data, fileName = "chart", className }) => {
  const { t } = useTranslation();
  const exportPng = async () => {
    const container = document.getElementById(targetId);
    if (!container) return toast.error(t("ui.chartExport.containerNotFound"));
    const svg = container.querySelector('svg') as SVGElement | null;
    if (!svg) return toast.error(t("ui.chartExport.svgNotFound"));
    try {
      const blob = await svgToPng(svg);
      if (blob) downloadBlob(blob, `${fileName}.png`);
    } catch (err) {
      safeConsoleError("Chart export failed", err);
      toast.error(t("ui.chartExport.failedPng"));
    }
  };

  const exportJpeg = async () => {
    const container = document.getElementById(targetId);
    if (!container) return toast.error(t("ui.chartExport.containerNotFound"));
    const svg = container.querySelector('svg') as SVGElement | null;
    if (!svg) return toast.error(t("ui.chartExport.svgNotFound"));
    try {
      const blob = await svgToJpeg(svg);
      if (blob) downloadBlob(blob, `${fileName}.jpg`);
    } catch (err) {
      safeConsoleError("Chart export failed", err);
      toast.error(t("ui.chartExport.failedJpg"));
    }
  };

  const exportPdf = async () => {
    // Fallback PDF: open PNG in new window and call print (user can Save as PDF)
    const container = document.getElementById(targetId);
    if (!container) return toast.error(t("ui.chartExport.containerNotFound"));
    const svg = container.querySelector('svg') as SVGElement | null;
    if (!svg) return toast.error(t("ui.chartExport.svgNotFound"));
    try {
      const blob = await svgToPng(svg, 2);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) {
        w.onload = () => { w.print(); };
      }
    } catch (err) {
      safeConsoleError("Chart export failed", err);
      toast.error(t("ui.chartExport.failedPdf"));
    }
  };

  const exportCsv = () => {
    if (!data || !data.length) return toast.error(t("ui.chartExport.noCsvData"));
    const keys = Object.keys(data[0]);
    const rows = [keys.join(',')].concat(data.map(row =>
      keys.map(key => `"${String(Reflect.get(row, key) ?? '')}"`).join(',')
    ));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${fileName}.csv`);
  };

  const exportWord = () => {
    // Simple HTML document saved as .doc which Word can open
    const container = document.getElementById(targetId);
    const content = container ? container.innerHTML : '<div></div>';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${fileName}</title></head><body>${content}</body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    downloadBlob(blob, `${fileName}.doc`);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="text-sm text-gray-600 mr-2">{t("ui.exportLabel")}:</div>
      <button onClick={exportPng} className="px-2.5 py-1 bg-white border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors shadow-sm">PNG</button>
      <button onClick={exportJpeg} className="px-2.5 py-1 bg-white border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors shadow-sm">JPG</button>
      <button onClick={exportPdf} className="px-2.5 py-1 bg-white border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors shadow-sm">PDF</button>
      <button onClick={exportWord} className="px-2.5 py-1 bg-white border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors shadow-sm">Word</button>
      <button onClick={exportCsv} className="px-2.5 py-1 bg-white border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" disabled={!data}>CSV</button>
    </div>
  );
};

export default ChartExport;
