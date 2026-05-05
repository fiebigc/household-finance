import { createContext, useContext } from "react";

export type OpenCsvImportFn = (presetAccountId: string | null) => void;

export const OpenCsvImportContext = createContext<OpenCsvImportFn | null>(null);

export function useOpenCsvImport(): OpenCsvImportFn {
  const v = useContext(OpenCsvImportContext);
  if (!v) throw new Error("CSV import requires OpenCsvImportContext — wrap the tab with the provider.");
  return v;
}
