export type ReportStyle = {
  length: string;
  tone: string;
  writerPersonality?: "neutral" | "expressive";
  primaryColor?: string;
};

export type Handoff = {
  id: string;
  fromId: string;
  toId: string;
  message: string;
  at: Date;
};
