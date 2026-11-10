"use client";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

const axis = { stroke: "rgb(var(--muted))", fontSize: 12, tickLine: false, axisLine: false } as const;
const tip = { contentStyle: { background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8, fontSize: 13 } };

export function TrendChart({ data, unit, label }: { data: { label: string; value: number }[]; unit: string; label: string }) {
  return (
    <div role="img" aria-label={label} className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="label" {...axis} /><YAxis {...axis} domain={["auto", "auto"]} />
          <Tooltip {...tip} formatter={(v: number) => [`${v} ${unit}`, ""]} separator="" />
          <Line type="monotone" dataKey="value" stroke="rgb(var(--accent))" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyBars({ data, series, label }: { data: Record<string, number | string>[]; series: { key: string; label: string; color: string }[]; label: string }) {
  return (
    <div role="img" aria-label={label} className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
          <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
          <XAxis dataKey="label" {...axis} /><YAxis {...axis} />
          <Tooltip {...tip} formatter={(v: number) => `${v.toFixed(2).replace(".", ",")} zł`} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
