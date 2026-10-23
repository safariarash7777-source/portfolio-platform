import React from "react";

export default function Field({ label, value, onChange, multiline = false, type = "text", maxLength = 4000 }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: "text" | "date"; maxLength?: number;
}) {
  return <label className="block min-w-0 space-y-1 text-sm"><span>{label}</span>{multiline
    ? <textarea className="input min-h-24 w-full min-w-0" rows={3} value={value} maxLength={maxLength} onChange={event => onChange(event.target.value)} />
    : <input className="input min-h-11 w-full min-w-0" type={type} value={value} maxLength={maxLength} onChange={event => onChange(event.target.value)} />}</label>;
}
