'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/types/api';
import type { TaskStatus } from '@/types/task';

/**
 * Chart components.
 *
 * Colours reference the CSS theme variables so charts stay legible in dark mode
 * instead of shipping recharts' default palette. `ResponsiveContainer` handles
 * resizing, so every chart fills whatever box its parent provides.
 *
 * Sizes must be numeric: recharts and jsdom both fail on `width="100%"`, which
 * is why every chart is wrapped in a fixed-height container.
 */

const AXIS_PROPS = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '0.5rem',
    fontSize: '12px',
    color: 'hsl(var(--popover-foreground))',
  },
  labelStyle: { color: 'hsl(var(--muted-foreground))', fontSize: '11px' },
} as const;

/** Formats an ISO day bucket as a short axis label. */
function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ActivityTrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) return <ChartEmpty />;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} {...AXIS_PROPS} minTickGap={24} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} width={36} />
          <Tooltip
            {...TOOLTIP_STYLE}
            labelFormatter={(label) => shortDate(String(label))}
            formatter={(value, name) => [value, name === 'created' ? 'Created' : 'Completed']}
          />
          <Legend
            verticalAlign="top"
            height={28}
            formatter={(value) => (value === 'created' ? 'Created' : 'Completed')}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="created"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#createdFill)"
          />
          <Area
            type="monotone"
            dataKey="completed"
            stroke="hsl(var(--success))"
            strokeWidth={2}
            fill="url(#completedFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  TODO: 'hsl(var(--muted-foreground))',
  IN_PROGRESS: 'hsl(var(--primary))',
  BLOCKED: 'hsl(var(--destructive))',
  COMPLETED: 'hsl(var(--success))',
  CANCELLED: 'hsl(var(--border))',
};

export function TaskStatusChart({ data }: { data: { status: string; count: number }[] }) {
  const withCounts = data.filter((entry) => entry.count > 0);
  if (withCounts.length === 0) return <ChartEmpty />;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={withCounts}
            dataKey="count"
            nameKey="status"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={2}
          >
            {withCounts.map((entry) => (
              <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? 'hsl(var(--muted))'} />
            ))}
          </Pie>
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value, name) => [
              value,
              STATUS_LABELS[name as TaskStatus] ?? String(name),
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={32}
            formatter={(value) => STATUS_LABELS[value as TaskStatus] ?? value}
            wrapperStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverdueByAssigneeChart({
  data,
}: {
  data: { assigneeId: string | null; name: string; count: number }[];
}) {
  const rows = data.filter((entry) => entry.count > 0).slice(0, 6);
  if (rows.length === 0) return <ChartEmpty />;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS_PROPS} />
          <YAxis type="category" dataKey="name" width={96} {...AXIS_PROPS} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [value, 'Overdue tasks']} />
          <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TeamPerformanceChart({
  data,
}: {
  data: { userId: string; name: string; completed: number; open: number; overdue: number }[];
}) {
  if (data.length === 0) return <ChartEmpty />;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="name" {...AXIS_PROPS} minTickGap={8} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} width={36} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend
            verticalAlign="top"
            height={28}
            formatter={(value) =>
              value === 'completed' ? 'Completed' : value === 'open' ? 'Open' : 'Overdue'
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="completed" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="open" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="overdue" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-64 items-center justify-center rounded-md border border-dashed">
      <p className="text-sm text-muted-foreground">No data for this period yet.</p>
    </div>
  );
}
