"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

type DrawerContextValue = {
  isOpen: boolean;
  content: ReactNode | null;
  open: (content: ReactNode) => void;
  close: () => void;
};

const DrawerContext = createContext<DrawerContextValue>({
  isOpen: false,
  content: null,
  open: () => {},
  close: () => {},
});

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);

  const open = useCallback((c: ReactNode) => {
    setContent(c);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // keep content mounted so close animation plays fully
    setTimeout(() => setContent(null), 300);
  }, []);

  return (
    <DrawerContext.Provider value={{ isOpen, content, open, close }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer() {
  return useContext(DrawerContext);
}
