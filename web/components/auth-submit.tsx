"use client";
import { useFormStatus } from "react-dom";

export function AuthSubmit({
  children,
  pendingLabel,
  disabled = false,
  className = "button",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
