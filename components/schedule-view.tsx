"use client";

import { useState } from "react";
import { TaskCard } from "@/lib/types";

interface ScheduleViewProps {
  tasks: TaskCard[];
  onUpdate: (taskId: string, patch: Partial<TaskCard>) => void;
}

const HOUR_SLOTS = Array.from({ length: 15 }, (_, i) => i + 7); // 7..21

function fmtHour(h: number) {
  if (h === 12) return "12 pm";
  if (h < 12) return `${h} am`;
  return `${h - 12} pm`;
}

function fmtHalf(h: number, half: 0 | 1) {
  const display = h === 12 ? "12" : h < 12 ? String(h) : String(h - 12);
  const suffix = h < 12 ? " am" : " pm";
  return half === 0 ? `${display}:00${suffix}` : `${display}:30${suffix}`;
}

function toKey(h: number, half: 0 | 1 = 0) {
  return `${String(h).padStart(2, "0")}:${half === 0 ? "00" : "30"}`;
}

export default function ScheduleView({ tasks, onUpdate }: ScheduleViewProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null);

  const unscheduled = tasks.filter((t) => !t.scheduledTime);
  const scheduled = tasks.filter((t) => t.scheduledTime);

  function assignSlot(timeKey: string) {
    if (!selectedTaskId) return;
    onUpdate(selectedTaskId, { scheduledTime: timeKey });
    setSelectedTaskId(null);
    setExpandedSlot(null);
  }

  function unscheduleTask(taskId: string) {
    onUpdate(taskId, { scheduledTime: undefined });
  }

  function taskAtSlot(timeKey: string) {
    return scheduled.find((t) => t.scheduledTime === timeKey);
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="schedule-view">
      {/* Unscheduled task tray */}
      <div className="schedule-tray">
        {unscheduled.length === 0 ? (
          <span className="schedule-tray-empty">All tasks scheduled</span>
        ) : (
          unscheduled.map((task) => (
            <button
              key={task.id}
              className={`schedule-chip${selectedTaskId === task.id ? " selected" : ""}`}
              onClick={() =>
                setSelectedTaskId(selectedTaskId === task.id ? null : task.id)
              }
            >
              {task.title.length > 28 ? task.title.slice(0, 27) + "…" : task.title}
            </button>
          ))
        )}
      </div>

      {selectedTask && (
        <div className="schedule-hint">
          Tap a slot to schedule &ldquo;
          {selectedTask.title.length > 22
            ? selectedTask.title.slice(0, 21) + "…"
            : selectedTask.title}
          &rdquo;
        </div>
      )}

      {/* Vertical timeline */}
      <div className="schedule-timeline">
        {HOUR_SLOTS.map((h) => {
          const key = toKey(h);
          const keyHalf = toKey(h, 1);
          const isExpanded = expandedSlot === h;
          const blockFull = taskAtSlot(key);
          const blockHalf = taskAtSlot(keyHalf);
          const isOccupied = !!blockFull;

          return (
            <div key={h} className="schedule-slot-group">
              {/* Hour slot */}
              <div
                className={`schedule-slot${isOccupied ? " occupied" : ""}${!isOccupied && selectedTaskId ? " droppable" : ""}`}
                onClick={() => {
                  if (isOccupied) {
                    unscheduleTask(blockFull.id);
                  } else if (selectedTaskId) {
                    assignSlot(key);
                  } else {
                    setExpandedSlot(isExpanded ? null : h);
                  }
                }}
              >
                <span className="slot-label">{fmtHour(h)}</span>
                {isOccupied ? (
                  <span className="slot-task-block">
                    <span className="slot-task-title">
                      {blockFull.title.length > 30
                        ? blockFull.title.slice(0, 29) + "…"
                        : blockFull.title}
                    </span>
                    <span className="slot-remove">✕</span>
                  </span>
                ) : (
                  <span className="slot-expand-hint">
                    {selectedTaskId ? "Assign here" : isExpanded ? "▲" : "▾"}
                  </span>
                )}
              </div>

              {/* 30-min sub-slots (expanded, no task assigned at the hour) */}
              {isExpanded && !isOccupied && (
                <>
                  <div
                    className={`schedule-slot sub-slot${selectedTaskId ? " droppable" : ""}`}
                    onClick={() => selectedTaskId && assignSlot(key)}
                  >
                    <span className="slot-label sub">{fmtHalf(h, 0)}</span>
                    <span className="slot-expand-hint">
                      {selectedTaskId ? "Assign here" : ""}
                    </span>
                  </div>
                  <div
                    className={`schedule-slot sub-slot${blockHalf ? " occupied" : ""}${!blockHalf && selectedTaskId ? " droppable" : ""}`}
                    onClick={() => {
                      if (blockHalf) {
                        unscheduleTask(blockHalf.id);
                      } else if (selectedTaskId) {
                        assignSlot(keyHalf);
                      }
                    }}
                  >
                    <span className="slot-label sub">{fmtHalf(h, 1)}</span>
                    {blockHalf ? (
                      <span className="slot-task-block">
                        <span className="slot-task-title">
                          {blockHalf.title.length > 30
                            ? blockHalf.title.slice(0, 29) + "…"
                            : blockHalf.title}
                        </span>
                        <span className="slot-remove">✕</span>
                      </span>
                    ) : (
                      <span className="slot-expand-hint">
                        {selectedTaskId ? "Assign here" : ""}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
