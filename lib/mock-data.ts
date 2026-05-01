import { AgentJob, IdeaCard, TaskCard } from "@/lib/types";

const now = new Date().toISOString();

export const initialTasks: TaskCard[] = [
  {
    id: "task-1",
    title: "Review Chase subscription charges",
    context: "Look for anything that has not been used in 30+ days and draft cancel steps.",
    area: "personal",
    category: "finance",
    complexity: "research",
    status: "queued",
    sourceCaptureId: "seed-1",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "task-2",
    title: "Follow up with Sam on utilities split",
    context: "Draft a direct nudge that includes the amount and due date.",
    area: "personal",
    category: "splitcheck",
    complexity: "quick",
    status: "triaged",
    sourceCaptureId: "seed-2",
    createdAt: now,
    updatedAt: now,
  },
];

export const initialJobs: AgentJob[] = [
  {
    id: "job-1",
    taskCardId: "task-1",
    provider: "heuristic",
    agent: "claude-api",
    status: "waiting-on-user",
    followUpQuestions: ["Should I prioritize cancellations or just flag subscriptions first?"],
    output: "Initial scan ready. I can return a cancellation shortlist after you confirm the goal.",
    startedAt: now,
  },
];

export const initialIdeas: IdeaCard[] = [
  {
    id: "idea-1",
    title: "Subscription review reminder",
    prompt: "You have a finance review in queue. Convert this into a recurring monthly check?",
    category: "finance",
  },
  {
    id: "idea-2",
    title: "SplitCheck follow-up",
    prompt: "Someone still owes you money. Draft a one-tap reminder and queue it for approval.",
    category: "splitcheck",
  },
  {
    id: "idea-3",
    title: "Weekly reset",
    prompt: "Your queue is light. Kick off a weekly reset and choose the next top three priorities.",
    category: "admin",
  },
];
