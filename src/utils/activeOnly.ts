type SoftDeletable = { archived_at: string | null };

export function activeOnly<T extends SoftDeletable>(rows: T[]): T[] {
  return rows.filter((r) => r.archived_at === null);
}
