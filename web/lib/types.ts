export type ReportStyle = {
  length: "brief" | "standard" | "detailed";
  tone: "formal" | "casual" | "analytical";
  writerPersonality?: "neutral" | "expressive";
};

export type Handoff = {
  id: string;
  fromId: string;
  toId: string;
  message: string;
  at: Date;
};
