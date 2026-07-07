/** Pure formatter — turns retrieved memory chunks into prose for the system prompt. */
export interface MemoryChunkLike {
  content: string;
}

export function formatMemoryContext(chunks: readonly MemoryChunkLike[]): string | undefined {
  if (chunks.length === 0) return undefined;
  return chunks.map((c) => `- ${c.content}`).join("\n");
}
