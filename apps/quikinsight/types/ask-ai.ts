export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  chart?: {
    labels: string[];
    data: number[];
    label: string;
  };
  suggestions?: string[];
}
