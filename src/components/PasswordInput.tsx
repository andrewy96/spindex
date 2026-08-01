"use client";

import { InputHTMLAttributes, useState } from "react";
import { Dict } from "@/i18n";

/**
 * Password box with a show/hide toggle — on a phone keypad a mistyped password
 * is otherwise invisible until the login fails.
 */
export default function PasswordInput({
  dict,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { dict: Dict }) {
  const [visible, setVisible] = useState(false);
  const label = visible ? dict.auth.passwordHide : dict.auth.passwordShow;

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-16`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-[11px] font-semibold text-ink-dim transition hover:text-accent"
      >
        {label}
      </button>
    </div>
  );
}
