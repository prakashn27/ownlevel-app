import { BookingPage } from "./booking";

export default async function Page({ params }: { params: Promise<{ clientSlug: string; calendarSlug: string }> }) {
  const { clientSlug, calendarSlug } = await params;
  return <BookingPage clientSlug={clientSlug} calendarSlug={calendarSlug} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />;
}
