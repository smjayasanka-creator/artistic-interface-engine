import { createContext, useContext, useState, type ReactNode } from "react";

type Ctx = {
  openRepay: (opts?: { loanId?: string }) => void;
  openNewClient: () => void;
  repay: { open: boolean; loanId?: string };
  newClient: { open: boolean };
  close: () => void;
};

const ModalCtx = createContext<Ctx | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [repay, setRepay] = useState<{ open: boolean; loanId?: string }>({ open: false });
  const [newClient, setNewClient] = useState({ open: false });
  return (
    <ModalCtx.Provider
      value={{
        repay,
        newClient,
        openRepay: (opts) => setRepay({ open: true, loanId: opts?.loanId }),
        openNewClient: () => setNewClient({ open: true }),
        close: () => {
          setRepay({ open: false });
          setNewClient({ open: false });
        },
      }}
    >
      {children}
    </ModalCtx.Provider>
  );
}

export function useModals() {
  const c = useContext(ModalCtx);
  if (!c) throw new Error("useModals outside provider");
  return c;
}
