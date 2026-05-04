"use client";

import { useState } from "react";

type CandidateStatus =
  | "queued"
  | "reviewing"
  | "approved"
  | "rejected"
  | "seeded"
  | "archived";

type Props = {
  candidateId: string;
  ownerUserId: string;
  currentStatus: CandidateStatus;
  onUpdated?: () => void;
};

const ACTIONS: CandidateStatus[] = [
  "queued",
  "reviewing",
  "approved",
  "rejected",
  "seeded",
  "archived",
];

export default function GraphExpansionStatusButtons({
  candidateId,
  ownerUserId,
  currentStatus,
  onUpdated,
}: Props) {
  const [submittingStatus, setSubmittingStatus] = useState<CandidateStatus | null>(
    null
  );
  const [seedRunning, setSeedRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function updateStatus(nextStatus: CandidateStatus) {
    setSubmittingStatus(nextStatus);
    setMessage("");

    try {
      const res = await fetch(
        `/api/my-network/graph-expansion-candidates/${candidateId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerUserId,
            status: nextStatus,
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setMessage(json?.error ?? "Status update failed.");
        return;
      }

      setMessage(`Updated: ${json.previousStatus} → ${json.nextStatus}`);
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown update error");
    } finally {
      setSubmittingStatus(null);
    }
  }

  async function runSeed() {
    setSeedRunning(true);
    setMessage("");

    try {
      const res = await fetch(
        `/api/my-network/graph-expansion-candidates/${candidateId}/seed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ownerUserId,
          }),
        }
      );

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setMessage(json?.error ?? "Seed execution failed.");
        return;
      }

      const bridgePid =
        typeof json?.result?.bridgePid === "string"
          ? json.result.bridgePid
          : "(unknown bridge pid)";

      setMessage(`Seed completed: ${bridgePid} → ${json.result?.targetPid}`);
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown seed error");
    } finally {
      setSeedRunning(false);
    }
  }

  return (
    <div className="min-w-[320px] space-y-3">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((status) => {
          const isCurrent = currentStatus === status;
          const isLoading = submittingStatus === status;

          return (
            <button
              key={status}
              type="button"
              className={`rounded-lg border px-3 py-2 text-xs ${
                isCurrent ? "font-bold" : ""
              }`}
              onClick={() => updateStatus(status)}
              disabled={Boolean(submittingStatus) || seedRunning}
            >
              {isLoading ? `Saving ${status}...` : status}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-xs font-semibold"
          onClick={runSeed}
          disabled={Boolean(submittingStatus) || seedRunning}
        >
          {seedRunning ? "Running Seed..." : "Run Seed"}
        </button>
      </div>

      <p className="text-xs text-gray-600">
        current: <strong>{currentStatus}</strong>
      </p>

      {message ? <p className="text-xs text-gray-700">{message}</p> : null}
    </div>
  );
}