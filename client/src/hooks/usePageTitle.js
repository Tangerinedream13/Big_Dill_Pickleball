import { useEffect } from "react";

export default function usePageTitle(title) {
  useEffect(() => {
    const suffix = " | Big Dill";
    document.title = title ? `${title}${suffix}` : `Big Dill${suffix}`;
  }, [title]);
}

