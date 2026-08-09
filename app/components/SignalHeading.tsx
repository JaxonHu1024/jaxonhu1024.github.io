import type { ReactNode } from "react";

type SignalHeadingProps = {
  as?: "div" | "h2" | "p";
  children: ReactNode;
  className?: string;
  id?: string;
};

export function SignalHeading({
  as: Tag = "p",
  children,
  className = "",
  id,
}: SignalHeadingProps) {
  const classes = ["signal-heading", className].filter(Boolean).join(" ");

  return (
    <Tag className={classes} id={id}>
      <span className="signal-heading__label">{children}</span>
      <span className="signal-heading__rule" aria-hidden="true" />
      <span className="signal-heading__end" aria-hidden="true" />
    </Tag>
  );
}
