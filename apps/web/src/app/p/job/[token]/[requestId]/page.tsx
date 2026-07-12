import { getData } from "@/lib/data";
import { PulseTopBar } from "@/components/pulse/shell";
import { JobLive } from "./job-live";

export const dynamic = "force-dynamic";

/** The shared Job Screen (Product Strategy v8 §4.2): one live object, four
 * honest projections. The server resolves the viewer from the token; the
 * client keeps it live. */
export default async function JobPage({
  params,
}: {
  params: Promise<{ token: string; requestId: string }>;
}) {
  const { token, requestId } = await params;
  const job = await (await getData()).getJobProjection(token, requestId);

  if (!job) {
    return (
      <>
        <PulseTopBar back="/p" />
        <div className="mt-16 text-center">
          <h1 className="font-serif text-2xl font-semibold">Job not found</h1>
          <p className="mt-2 text-sm text-white/50">This link can&apos;t see that job.</p>
        </div>
      </>
    );
  }

  const back =
    job.viewer === "tradie" ? `/p/trade/${token}` : job.viewer === "pm" ? `/p/deck/${token}` : `/p/fix/${token}`;

  return (
    <>
      <PulseTopBar back={back} title="Live job" />
      <JobLive token={token} initial={job} />
    </>
  );
}
