// In-memory fallback for Vercel serverless (read-only FS → EROFS)
// Data persists within a warm instance but resets on cold start.
// Client-side localStorage is the real source of truth for balance/debt.

const store = new Map<string, string>();

export async function storeRead(filePath: string): Promise<string | null> {
  // Try real FS first (works in dev / self-hosted)
  try {
    const { readFile, existsSync } = await import('fs/promises');
    if (existsSync(filePath)) {
      return await readFile(filePath, 'utf-8');
    }
  } catch (e: any) {
    if (e?.code !== 'ENOENT' && e?.code !== 'EROFS' && e?.code !== 'EACCES') {
      console.warn(`[memory-store] FS read error: ${e.code}`);
    }
  }
  // Fallback to memory
  return store.get(filePath) ?? null;
}

export async function storeWrite(filePath: string, data: string): Promise<void> {
  // Always save to memory
  store.set(filePath, data);
  // Try real FS (works in dev / self-hosted)
  try {
    const { writeFile } = await import('fs/promises');
    await writeFile(filePath, data, 'utf-8');
  } catch (e: any) {
    if (e?.code === 'EROFS' || e?.code === 'EACCES') {
      // Expected on Vercel — memory store is the fallback
      console.log(`[memory-store] FS write skipped (${e.code}), using memory`);
    } else {
      console.warn(`[memory-store] FS write error: ${e.code}`);
    }
  }
}

export function storeDelete(filePath: string): void {
  store.delete(filePath);
}