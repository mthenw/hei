"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Priority } from "@/todos/todos";

const LABELS: Record<Priority, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

export function PrioritySelect({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: Priority;
  onChange: (priority: Priority) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Priority)}>
      <SelectTrigger id={id} aria-label="Priority" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {(Object.keys(LABELS) as Priority[]).map((priority) => (
            <SelectItem key={priority} value={priority}>
              {LABELS[priority]}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
