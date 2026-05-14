export type ReportStyle = {
  length: "brief" | "standard" | "detailed";
  tone: "formal" | "casual" | "analytical";
};

export type Handoff = {
  id: string;
  fromId: string;
  toId: string;
  message: string;
  at: Date;
};
