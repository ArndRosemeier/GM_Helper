import Markdown from "react-markdown";

export function MarkdownText({ markdown }: { markdown: string }) {
  if (markdown.trim().length === 0) {
    return <p className="muted">No text yet.</p>;
  }
  return (
    <div className="card-markdown">
      <Markdown>{markdown}</Markdown>
    </div>
  );
}
