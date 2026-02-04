import { getVersionString } from "./version.js";

export type ResultArtifact = {
  type: string;
  path: string;
  mime: string;
};

export type NextStep = {
  label: string;
  argv: string[];
};

export type ResultError = {
  code: string;
  message: string;
  details: string[];
};

export type ResultEnvelope<TData = unknown> = {
  ok: boolean;
  version: string;
  command: { name: string; argv: string[] };
  session: string;
  platform: "ios" | "android" | null;
  timing: { started_at: string; duration_ms: number };
  run_dir: string | null;
  target: {
    device: { platform: "ios" | "android"; id: string; name?: string | null } | null;
    app: { app_id?: string | null; app_path?: string | null } | null;
  };
  artifacts: ResultArtifact[];
  data: TData;
  error: ResultError | null;
  next_steps: NextStep[];
};

export function createEnvelope<TData>({
  ok,
  command_name,
  command_argv,
  session,
  platform,
  started_at,
  duration_ms,
  run_dir,
  target,
  artifacts,
  data,
  error,
  next_steps,
}: {
  ok: boolean;
  command_name: string;
  command_argv: string[];
  session: string;
  platform: "ios" | "android" | null;
  started_at: string;
  duration_ms: number;
  run_dir: string | null;
  target?: ResultEnvelope["target"];
  artifacts?: ResultArtifact[];
  data: TData;
  error: ResultError | null;
  next_steps?: NextStep[];
}): ResultEnvelope<TData> {
  return {
    ok,
    version: getVersionString(),
    command: { name: command_name, argv: command_argv },
    session,
    platform,
    timing: { started_at, duration_ms },
    run_dir,
    target: target ?? { device: null, app: null },
    artifacts: artifacts ?? [],
    data,
    error,
    next_steps: next_steps ?? [],
  };
}
