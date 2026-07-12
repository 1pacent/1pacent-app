import { getData } from "@/lib/data";
import { PulseTopBar } from "@/components/pulse/shell";
import { FixFlow } from "./fix-flow";

export const dynamic = "force-dynamic";

export default async function FixPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getData();
  // Accept either demand-side seat: renter guest pass or owner seat.
  const intake = await data.getIntakeContext(token);
  const owner = intake ? null : await data.getOwnerPortalContext(token);
  const address = intake
    ? `${intake.property.address}, ${intake.property.suburb}`
    : owner?.properties[0]
      ? `${owner.properties[0].address}, ${owner.properties[0].suburb}`
      : null;

  if (!address) {
    return (
      <>
        <PulseTopBar />
        <div className="mt-16 text-center">
          <h1 className="font-serif text-2xl font-semibold">This link isn&apos;t active</h1>
          <p className="mt-2 text-sm text-white/50">Ask for a fresh one, or start from the front door.</p>
        </div>
      </>
    );
  }

  const recent = await data.getRequestStatusForContact(token).catch(() => []);
  const openJobs = (recent ?? [])
    .filter((r) => !["closed", "cancelled", "declined"].includes(r.state))
    .slice(0, 3)
    .map((r) => ({ id: r.id, title: r.title, state: r.state }));

  return (
    <>
      <PulseTopBar back="/p" />
      <FixFlow token={token} address={address} openJobs={openJobs} />
    </>
  );
}
