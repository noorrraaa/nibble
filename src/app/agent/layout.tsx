import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nibble | Agent API",
  description:
    "window.nibble: the pixel art API an AI agent can drive. Permissions, limits and the full reference.",
};

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
