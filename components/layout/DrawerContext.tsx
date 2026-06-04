'use client';

import { createContext, useContext } from 'react';

interface DrawerCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const DrawerContext = createContext<DrawerCtx>({ open: false, setOpen: () => {} });

export const useDrawer = () => useContext(DrawerContext);
