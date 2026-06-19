"use client";

/**
 * StateCitySelect — Cascading state → city picker for Indian addresses.
 *
 * Renders two <Field>+<SelectInput> pairs inside a <FormRow>. Choosing a
 * state populates the city list. City resets to empty if the current value
 * isn't in the newly-selected state's list.
 *
 * Used everywhere we capture an address: Companies, Vendors, Customers,
 * Contractors, Projects, Locations, etc. — so switching from free-text to
 * structured state/city stays consistent across the app.
 */

import { useEffect, useMemo } from "react";
import { FormRow, Field, SelectInput } from "./FormDrawer";
import {
  INDIAN_STATES, citiesForState, isCityInState, defaultPincodeFor,
} from "@/lib/data/india-geo";

interface Props {
  state: string;
  city: string;
  onStateChange: (v: string) => void;
  onCityChange: (v: string) => void;
  stateLabel?: string;
  cityLabel?: string;
  required?: boolean;
  stateError?: string;
  cityError?: string;
  /** Hide the fields inside a FormRow wrapper — useful when caller owns the layout. */
  unwrapped?: boolean;
  /**
   * Optional PIN-code integration. If `onPincodeChange` is passed, picking a
   * city will auto-fill the default PIN code for that city via this callback.
   * Pass `pincode` so we don't overwrite a user-typed value (we only fill
   * when the current PIN is empty, or when it equals the previous city's
   * default). The PIN field itself remains the caller's responsibility to
   * render, so each form keeps its own layout.
   */
  pincode?: string;
  onPincodeChange?: (v: string) => void;
}

const STATE_OPTIONS = INDIAN_STATES.map(s => ({ value: s.name, label: s.name }));

export function StateCitySelect({
  state, city, onStateChange, onCityChange,
  stateLabel = "State", cityLabel = "City",
  required, stateError, cityError, unwrapped,
  pincode, onPincodeChange,
}: Props) {
  // If the selected state changes and the current city isn't in the new state's
  // list, wipe the city value so the form can't submit a mismatched pair.
  useEffect(() => {
    if (state && city && !isCityInState(state, city)) {
      onCityChange("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const cityOptions = useMemo(
    () => citiesForState(state).map(c => ({ value: c, label: c })),
    [state],
  );

  // Picking a city → push the default PIN code if:
  //   1) caller opted into PIN integration (onPincodeChange present), and
  //   2) we have a default for this city, and
  //   3) the current PIN is empty OR matches some previously-suggested default
  //      (i.e. the user hasn't typed a custom value — don't clobber user input).
  const handleCityChange = (nextCity: string) => {
    onCityChange(nextCity);
    if (!onPincodeChange || !nextCity) return;
    const suggested = defaultPincodeFor(state, nextCity);
    if (!suggested) return;
    // Always overwrite an empty PIN. For a non-empty PIN, only overwrite if
    // the value looks like another city's default (i.e. exists in our map
    // for this state) — meaning it was previously auto-filled. A user-typed
    // custom PIN is preserved.
    const currentIsAutoFilled = !pincode || citiesForState(state).some(
      c => defaultPincodeFor(state, c) === pincode,
    );
    if (currentIsAutoFilled) onPincodeChange(suggested);
  };

  const stateField = (
    <Field label={stateLabel} required={required} error={stateError}>
      <SelectInput
        value={state}
        onChange={onStateChange}
        options={STATE_OPTIONS}
        placeholder="Select state"
        invalid={!!stateError}
      />
    </Field>
  );

  const cityField = (
    <Field
      label={cityLabel}
      required={required}
      error={cityError}
      hint={!state ? "Select a state first" : undefined}
    >
      <SelectInput
        value={city}
        onChange={handleCityChange}
        options={cityOptions}
        placeholder={state ? "Select city" : "Select state first"}
        disabled={!state}
        invalid={!!cityError}
      />
    </Field>
  );

  if (unwrapped) {
    return (
      <>
        {stateField}
        {cityField}
      </>
    );
  }

  return (
    <FormRow>
      {stateField}
      {cityField}
    </FormRow>
  );
}
