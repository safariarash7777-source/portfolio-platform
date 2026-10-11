interface SavedAssessment {
  id: string;
  total_score: number;
  risk_category: string;
  created_at: string;
  answers_json?: Record<string, number>;
}

/** Only a returned, persisted row confirms success. Never log private answers. */
export async function saveRiskAssessment(
  insert: () => PromiseLike<{ data: SavedAssessment | null; error: unknown }>,
): Promise<SavedAssessment | null> {
  try {
    const { data, error } = await insert();
    if (error || !data?.id || !data.created_at) return null;
    return data;
  } catch {
    return null;
  }
}
