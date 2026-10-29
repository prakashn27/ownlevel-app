"use client";
/** Datalist of IANA timezones for `<input list="timezones">`; the API validates the value. */
export function TimezoneOptions() {
  return (
    <datalist id="timezones">
      {Intl.supportedValuesOf("timeZone").map((tz) => <option key={tz} value={tz} />)}
    </datalist>
  );
}
