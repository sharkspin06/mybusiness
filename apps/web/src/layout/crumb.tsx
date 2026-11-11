import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Lets a detail page put its own name in the top bar breadcrumb ("Customers / Tan Wei Ming").
const CrumbContext = createContext<{ crumb: string | null; setCrumb: (c: string | null) => void }>({
  crumb: null,
  setCrumb: () => {},
});

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [crumb, setCrumb] = useState<string | null>(null);
  return <CrumbContext.Provider value={{ crumb, setCrumb }}>{children}</CrumbContext.Provider>;
}

export const useCrumbValue = () => useContext(CrumbContext).crumb;

export function useCrumb(label: string | null | undefined) {
  const { setCrumb } = useContext(CrumbContext);
  useEffect(() => {
    setCrumb(label ?? null);
    return () => setCrumb(null);
  }, [label, setCrumb]);
}
