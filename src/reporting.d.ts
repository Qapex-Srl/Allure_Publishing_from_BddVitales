export interface ReportOptions {
  username?: string;
  password?: string;
  executionName?: string;
  executionFrom?: string;
  executionType?: string;
  baseURL?: string;
  publicBaseURL?: string;
  projectId?: string;
  resultsDir?: string;
  clean?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  batchBytes?: number;
  maxFileBytes?: number;
}
export interface ReportSummary {
  projectId: string; files: number; results: number; bytes: number;
  dryRun: boolean; reportURL?: string;
}
export function reportOptionsFromEnv(env?: Record<string, string | undefined>): ReportOptions;
export function publishReport(options: ReportOptions, execution?: {
  fetchImpl?: typeof fetch; dryRun?: boolean;
}): Promise<ReportSummary>;
