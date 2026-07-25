import katex from "katex";

export default function Formula({
  children,
  block = true,
}: {
  children: string;
  block?: boolean;
}) {
  const html = katex.renderToString(children, {
    displayMode: block,
    throwOnError: false,
    strict: false,
  });
  return (
    <span
      className={block ? "formula formula-block" : "formula"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
