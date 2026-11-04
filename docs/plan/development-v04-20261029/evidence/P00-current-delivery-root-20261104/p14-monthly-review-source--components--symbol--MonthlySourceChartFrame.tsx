import React, { useState } from "react";

const isSource = (target: EventTarget | null) => target instanceof Element
  && target.closest("[data-monthly-point-source], [data-chart-point-source]") !== null;

/** Recharts 3 keeps click and keyboard selection separately. A click selection
 * wins over keyboard selection, so keyboard navigation must use the hover lane.
 * Do not populate the hover lane with pointer events: those would win over the
 * keyboard selection too. Pointer selection is deliberate click/tap only.
 */
export default function MonthlySourceChartFrame({ enabled, children, height = 280, width }: {
  enabled: boolean;
  height?: number;
  width?: React.CSSProperties["width"];
  children: (trigger: "click" | "hover" | undefined, portal?: HTMLDivElement | null) => React.ReactNode;
}) {
  const [trigger, setTrigger] = useState<"click" | "hover">("click");
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const chartStyle = { ...(width === undefined ? {} : { width }), height };
  if (!enabled) return <div style={chartStyle} dir="ltr">{children(undefined)}</div>;
  return <>
    <p className="mb-2 text-xs leading-5" dir="rtl">
      برای دیدن منبع، روی نقطه کلیک یا لمس کنید. جزئیات زیر نمودار نمایش داده می‌شوند. با صفحه‌کلید، نمودار را انتخاب کنید و از کلیدهای چپ و راست استفاده کنید؛ با Tab به پیوند منبع بروید. Escape جزئیات را می‌بندد.
    </p>
    <div dir="ltr"
      onPointerDownCapture={event => { if (!isSource(event.target)) setTrigger("click"); }}
      onMouseOverCapture={event => event.stopPropagation()}
      onMouseMoveCapture={event => event.stopPropagation()}
      onTouchMoveCapture={event => event.stopPropagation()}
      onKeyDownCapture={event => {
        if (isSource(event.target)) return;
        if (["ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) setTrigger("hover");
      }}
      onBlurCapture={event => {
        // Focusing the link is still part of this chart's keyboard interaction.
        if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget as Node)
          && (isSource(event.relatedTarget) || isSource(event.target))) event.stopPropagation();
      }}
    >
      <div style={chartStyle}>{children(trigger, portal)}</div>
      {/* Recharts' default portal precedes its SVG. This host follows the chart
          in DOM order, so native Tab reaches the link; no scripted focus. With
          an explicit portal Recharts uses normal flow, preventing chart overlap. */}
      <div ref={setPortal} data-monthly-source-portal="" dir="rtl" />
    </div>
  </>;
}
