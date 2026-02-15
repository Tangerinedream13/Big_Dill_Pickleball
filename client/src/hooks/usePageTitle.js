import { useEffect } from "react";

export default function usePageTitle(title) {
  useEffect(() => {
    const base = "Big Dill";
    document.title = title ? `${title} | ${base}` : base;
  }, [title]);
}