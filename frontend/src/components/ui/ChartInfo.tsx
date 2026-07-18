import React from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';

export const ChartInfo = ({ textKey, className }: { textKey: string; className?: string }) => {
  const { t } = useTranslation();

  // Check if textKey is a translation key or actual text content
  const content = textKey.startsWith("m.") ? t(textKey) : textKey;

  return (
    <details className={cn("group", className)}>
      <summary className="flex items-center gap-2 cursor-pointer select-none list-none outline-none">
        <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors shadow-sm">
          <Info className="h-3.5 w-3.5" />
          <span>{t("m.info")}</span>
        </span>
      </summary>
      <div className="mt-3 p-6 bg-gradient-to-br from-blue-50 via-white to-indigo-50 rounded-xl border border-blue-100 shadow-md text-sm leading-relaxed text-gray-800 break-words">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Info className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-gray-900 text-base mb-4">About this chart</h4>
            <div className="text-gray-700 prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-headings:mt-4 prose-headings:mb-2 prose-h2:text-lg prose-h3:text-base prose-p:text-gray-700 prose-p:my-3 prose-p:leading-relaxed prose-strong:text-gray-900 prose-ul:my-4 prose-li:my-2 prose-li:text-gray-700 prose-hr:my-5 prose-hr:border-gray-300 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline">
              <ReactMarkdown
                components={{
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold text-gray-900 mt-4 mb-2" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-base font-bold text-gray-900 mt-3 mb-2" {...props} />,
                  p: ({node, ...props}) => <p className="text-gray-700 my-3 leading-relaxed" {...props} />,
                  ul: ({node, ...props}) => <ul className="my-4 space-y-2" {...props} />,
                  li: ({node, ...props}) => <li className="text-gray-700 my-1" {...props} />,
                  hr: ({node, ...props}) => <hr className="my-5 border-gray-300" {...props} />,
                  strong: ({node, ...props}) => <strong className="text-gray-900" {...props} />,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
};

export default ChartInfo;
