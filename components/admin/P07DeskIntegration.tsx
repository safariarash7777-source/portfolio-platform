'use client';
import ResearchWorkbook from './ResearchWorkbook';
import P07ManualDesk, { type P07ResearchRendererProps } from './P07ManualDesk';

export function p07RenderResearch({ initialWorkbook, transport, onWorkbookChange, preparationGate }: P07ResearchRendererProps) {
  return <><p role="status" className="card p-4">{preparationGate ?? 'چک‌لیست آماده‌سازی کامل است؛ صحت منبع و تأیید انسانی هنوز باید بررسی شود.'}</p><ResearchWorkbook initialWorkbook={initialWorkbook} transport={transport} onWorkbookChange={onWorkbookChange}/></>;
}
export default function P07DeskIntegration() { return <P07ManualDesk renderResearch={p07RenderResearch}/>; }
