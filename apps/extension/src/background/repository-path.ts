export function safeRepositorySegment(value: string): string {
  return value
    .trim()
    .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

export function joinRepositoryPath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.split("/"))
    .map(safeRepositorySegment)
    .filter(Boolean)
    .join("/");
}
