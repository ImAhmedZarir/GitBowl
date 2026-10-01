import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

export function TopProgressBar() {
  const isLoading = useRouterState({
    select: (s) => s.status === "pending",
  });
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      setVisible(true);
      setProgress(25);
      timer = setTimeout(() => {
        setProgress(70);
      }, 100);
    } else {
      setProgress(100);
      timer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 250);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 top-0 z-50 h-[2.5px] w-full pointer-events-none bg-transparent"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--color-primary)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
