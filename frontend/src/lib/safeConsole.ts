const isDev = import.meta.env.DEV;

const extractMessage = (error: unknown): string | undefined => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean") return String(error);
  if (error && typeof error === "object") {
    if ("message" in error && typeof (error as any).message === "string") {
      return (error as any).message;
    }
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  }
  return undefined;
};

export const safeConsoleError = (message: string, error?: unknown) => {
  if (!isDev) return;
  const extracted = extractMessage(error);
  if (extracted !== undefined) {
    console.error(message, extracted);
  } else {
    console.error(message);
  }
};

export const safeConsoleWarn = (message: string, warning?: unknown) => {
  if (!isDev) return;
  const extracted = extractMessage(warning);
  if (extracted !== undefined) {
    console.warn(message, extracted);
  } else {
    console.warn(message);
  }
};
