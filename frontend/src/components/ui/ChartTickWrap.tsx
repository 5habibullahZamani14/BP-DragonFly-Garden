import React from "react";

type TickProps = {
  x?: number;
  y?: number;
  payload?: { value: string } | any;
  wordsPerLine?: number;
  fontSize?: number;
  textAnchor?: 'start' | 'middle' | 'end';
};

const ChartTickWrap = ({ x = 0, y = 0, payload, wordsPerLine = 4, fontSize = 12, textAnchor = 'end' }: TickProps) => {
  const raw = payload?.value ?? '';
  const text = String(raw);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(' '));
  }

  const lineHeightPx = Math.round(fontSize * 1.2);
  const rotation = -35;

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
      <text x={0} y={0} fontSize={fontSize} textAnchor={textAnchor} fill="currentColor" dominantBaseline="hanging">
        {lines.map((line, idx) => (
          <tspan key={idx} x={0} dy={idx === 0 ? 0 : lineHeightPx}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

export default ChartTickWrap;
